import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { mulberry32 } from '@nsmb/shared';
import { texture } from '../../assets/assets';
import { playSound } from '../../assets/sounds';
import { SCREEN_H, SCREEN_W, type MiniGame, type RoundResult } from '../types';
import { MAX_SPEED, MIN_SIZE, newBall, progressOf, speedOf, stepFinished, stepMelt, stepRace } from './ball';
import {
  BOTTOM_VIEW_OFFSET,
  COURSE_H,
  GOAL_Y,
  START_Y,
  T,
  buildCourse,
  solidIn,
  tileAt,
  type Course,
} from './course';
import { SphereView, textureData } from './sphere';

// Le jeu avance par images fixes de 60 i/s, comme l'original.
const FRAME = 1000 / 60;
/** Compte à rebours d'origine : 241 images, départ quand il atteint 60 (3, 2, 1 puis "Partez !"). */
const GO_FRAME = 181;
/** Position envoyée aux autres toutes les 4 images (15 fois par seconde). */
const SEND_EVERY = 4;
/** Les autres sont affichés avec ce retard, interpolés entre deux positions reçues. */
const INTERP_DELAY_MS = 100;

// Chocs entre boules : la boule de derrière détecte le contact, ralentit, et pousse celle de devant.
// [DEVINÉ] réglages à ajuster après essai.
const BUMP_PUSH = 1; // la boule de devant reçoit cette part de la vitesse de celle de derrière
const BUMP_SLOW = 0.5; // la boule de derrière garde cette part de sa vitesse
const BUMP_SHRINK = 1; // px de rayon perdus par chacune
const BUMP_COOLDOWN = 20; // images avant un nouveau choc entre les deux mêmes boules

// Grille de départ : 4 par ligne, une place libre de chaque côté (couloir de départ : x 40..216).
const GRID_SPACING = 176 / 6;
const GRID_ROW_GAP = 24;

const CHUNK = 512; // le circuit est pré-dessiné en bandes de 512 px
const ROLL_SOUND_PX = 48;
const FLAKES = 40;

type Phase = 'count' | 'race' | 'finished' | 'melt' | 'over';
type Msg =
  | { k: 's'; t: number; x: number; y: number; r: number; f: number | null }
  | { k: 'b'; vx: number; vy: number };

interface Sample {
  t: number;
  x: number;
  y: number;
  r: number;
}

interface Remote {
  id: string;
  name: string;
  samples: Sample[];
  lastT: number;
  lastAt: number;
  finishMs: number | null;
  x: number;
  y: number;
  r: number;
  sphere: SphereView;
  sprites: Sprite[];
  labels: Text[];
  cooldown: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);
const fmt = (ms: number) => {
  const cs = Math.max(0, Math.floor(ms / 10));
  return `${Math.floor(cs / 100)}.${String(cs % 100).padStart(2, '0')}`;
};

/** Place de départ du joueur `i` sur `n` : lignes de 4, centrées. */
function gridPos(i: number, n: number) {
  const row = Math.floor(i / 4);
  const inRow = Math.min(4, n - row * 4);
  const col = i % 4;
  return { x: 128 + (col - (inRow - 1) / 2) * GRID_SPACING, y: START_Y + row * GRID_ROW_GAP };
}

export const snowball: MiniGame = {
  scoreBar: false, // une seule course, points donnés à l'arrivée : la place s'affiche à la place
  create(view) {
    const { top, bottom, ticker } = view;
    const course = buildCourse(view.seed);
    const myIndex = Math.max(0, view.players.findIndex((p) => p.id === view.meId));
    const start = gridPos(myIndex, view.players.length);
    const me = newBall(start.x, start.y);
    const ballTex = textureData('snowball.ball');
    const mySphere = new SphereView(ballTex);

    // --- Outils ------------------------------------------------------------------------------
    const text = (s: string, size: number, fill = 0xffffff, outline = true) => {
      const t = new Text({
        text: s,
        resolution: view.textResolution,
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontWeight: '900',
          fontSize: size,
          fill,
          ...(outline ? { stroke: { color: 0x1d1b2f, width: 3 } } : {}),
        },
      });
      t.anchor.set(0.5);
      return t;
    };

    // --- Le monde, vu deux fois : écran du haut (suite du parcours) et du bas (la boule) ----------
    const chunkTextures = drawCourse(course);
    const worlds = [new Container(), new Container()];
    const fx = [new Graphics(), new Graphics()];
    const myBalls: Sprite[] = [];
    const chunkSprites: Sprite[][] = [];
    for (const [w, world] of worlds.entries()) {
      chunkSprites.push(
        chunkTextures.map((tex, k) => {
          const s = new Sprite(tex);
          s.y = k * CHUNK;
          world.addChild(s);
          return s;
        }),
      );
      const ball = new Sprite(mySphere.texture);
      ball.anchor.set(0.5);
      myBalls.push(ball);
      world.addChild(fx[w]);
      (w === 0 ? top : bottom).addChild(world);
    }

    // Les autres joueurs : boule + nom, sur les deux écrans.
    const remotes = new Map<string, Remote>();
    for (const [i, p] of view.players.entries()) {
      if (p.id === view.meId) continue;
      const pos = gridPos(i, view.players.length);
      const sphere = new SphereView(ballTex);
      const r: Remote = {
        id: p.id,
        name: p.name,
        samples: [],
        lastT: 0,
        lastAt: performance.now(),
        finishMs: null,
        x: pos.x,
        y: pos.y,
        r: MIN_SIZE,
        sphere,
        sprites: [],
        labels: [],
        cooldown: 0,
      };
      for (const world of worlds) {
        const s = new Sprite(sphere.texture);
        s.anchor.set(0.5);
        const label = text(p.name, 7, 0xf4f1ea);
        world.addChild(s, label);
        r.sprites.push(s);
        r.labels.push(label);
      }
      remotes.set(p.id, r);
    }
    for (const [w, world] of worlds.entries()) world.addChild(myBalls[w]); // ma boule par-dessus

    // --- Interface ----------------------------------------------------------------------------
    const timeLabel = text('TEMPS', 8, 0x1d1b2f, false);
    timeLabel.position.set(128, 7);
    const timeValue = text(fmt(view.timeLeftMs), 16);
    timeValue.position.set(128, 22);
    const meter = new Graphics();
    top.addChild(timeLabel, timeValue, meter);

    const rankText = text('', 16, 0xffbf3c);
    rankText.anchor.set(0, 0.5);
    rankText.position.set(8, 14);
    const countdown = text('', 40);
    countdown.position.set(128, 80);
    const status = text('', 14);
    status.position.set(128, 40);
    bottom.addChild(rankText, countdown, status);

    // --- Glissé du doigt sur l'écran du bas ----------------------------------------------------
    let touch: { x: number; y: number } | null = null;
    let lastTouch: { x: number; y: number } | null = null;
    bottom.eventMode = 'static';
    bottom.hitArea = new Rectangle(0, 0, SCREEN_W, SCREEN_H);
    const toLocal = (e: { getLocalPosition: (c: Container) => { x: number; y: number } }) => {
      const p = e.getLocalPosition(bottom);
      return { x: Math.floor(p.x), y: Math.floor(p.y) };
    };
    bottom.on('pointerdown', (e) => (touch = toLocal(e)));
    bottom.on('pointermove', (e) => touch && (touch = toLocal(e)));
    const release = () => (touch = null);
    bottom.on('pointerup', release);
    bottom.on('pointerupoutside', release);

    // --- Effets : flocons (décor) et gerbes de neige ------------------------------------------
    const fxRng = mulberry32(view.seed ^ 0x51ed27);
    const flakes = Array.from({ length: FLAKES }, () => ({
      x: fxRng() * 256,
      y: me.scrollY - 40 + fxRng() * 520,
      vy: 0.3 + fxRng() * 0.5,
      phase: fxRng() * 6.28,
    }));
    const sprays: Particle[] = [];
    const spray = (x: number, y: number, n: number, power: number) => {
      for (let i = 0; i < n; i++) {
        const a = fxRng() * Math.PI * 2;
        const s = (0.5 + fxRng()) * power;
        sprays.push({ x, y, z: 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 1 + fxRng() * 2, life: 40 });
      }
    };

    // --- Déroulé ----------------------------------------------------------------------------
    const t0 = performance.now();
    let frame = 0;
    let phase: Phase = 'count';
    let meltFrame = 0;
    let deadline = view.timeLeftMs;
    let finishMs: number | null = null;
    let rolled = 0;
    let resolvePlay: (r: RoundResult) => void = () => {};
    let ended = false;
    let lastSecond = -1;
    let drawX = me.x;
    let drawY = me.y;

    const playTime = (f: number) => (f - GO_FRAME) * FRAME;
    const progress = () => (finishMs !== null ? 1 : progressOf(me.y, me.size, START_Y));
    const end = (timeMs: number | null) => {
      if (ended) return;
      ended = true;
      resolvePlay({ timeMs, distance: timeMs !== null ? 1 : progress() });
    };

    function tick(f: number) {
      for (const r of remotes.values()) if (r.cooldown > 0) r.cooldown--;
      updateEffects();

      if (f < GO_FRAME) {
        // 3, 2, 1
        const timer = 241 - f;
        if (timer === 0xf0 || timer === 0xb4 || timer === 0x78) playSound('snowball.count');
        countdown.text = timer <= 240 && timer > 60 ? String(Math.min(3, Math.floor(timer / 60))) : '';
        return;
      }
      if (f === GO_FRAME) {
        phase = 'race';
        countdown.text = 'Partez !';
        playSound('snowball.go');
      }
      if (f === GO_FRAME + 60) countdown.text = '';
      const t = playTime(f);

      if (phase === 'race') {
        if (t >= deadline) {
          phase = 'melt';
          status.text = 'Temps écoulé !';
          end(null);
        } else {
          let drag: { dx: number; dy: number } | null = null;
          if (touch && lastTouch) drag = { dx: touch.x - lastTouch.x, dy: touch.y - lastTouch.y };
          lastTouch = touch ? { ...touch } : null;
          const before = { x: me.x, y: me.y };
          const ev = stepRace(me, course, drag);
          if (ev.wall) playSound('snowball.wall', { pan: (ev.hitX - 128) / 160 });
          if (ev.obstacle) {
            playSound('snowball.hit', { pan: (ev.hitX - 128) / 160 });
            spray(ev.hitX, ev.hitY, 10, 1.5);
          }
          rolled += Math.hypot(me.x - before.x, me.y - before.y);
          if (rolled >= ROLL_SOUND_PX) {
            rolled = 0;
            playSound('snowball.roll', { rate: me.size < 16 ? 1.4 : me.size < 32 ? 1 : 0.7 });
          }
          bump();
          if (ev.finished) {
            phase = 'finished';
            finishMs = t + FRAME;
            status.text = `Arrivé ! ${fmt(finishMs)} s`;
            playSound('snowball.finish');
            end(finishMs);
          }
        }
      } else if (phase === 'finished') {
        stepFinished(me, course);
      } else if (phase === 'melt') {
        if (stepMelt(me, meltFrame++)) {
          phase = 'over';
          spray(me.x, me.y, 16, 1.2);
          playSound('snowball.melt');
        }
      }

      if ((f - GO_FRAME) % SEND_EVERY === 0) {
        const msg: Msg = { k: 's', t, x: round1(me.x), y: round1(me.y), r: round1(me.size), f: finishMs };
        view.relay(msg, { lossy: true });
      }

      // Chrono : dernières secondes marquées.
      if (phase === 'race') {
        const left = Math.ceil((view.timeLeftMs - t) / 1000);
        if (left !== lastSecond && left <= 10 && left > 0) playSound('snowball.tick');
        lastSecond = left;
      }
    }

    /** Ma boule rattrape celle de devant : je ralentis, elle est projetée (chez elle, via le serveur). */
    function bump() {
      for (const r of remotes.values()) {
        if (r.cooldown > 0 || r.r <= 0) continue;
        const dx = r.x - me.x;
        const dy = r.y - me.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0 || dist >= me.size + r.r) continue;
        if (r.y >= me.y) continue; // seule la boule de derrière détecte le choc
        if (me.vx * dx + me.vy * dy <= 0) continue; // on doit aller vers elle
        const msg: Msg = { k: 'b', vx: me.vx * BUMP_PUSH, vy: Math.min(0, me.vy) * BUMP_PUSH };
        view.relay(msg, { to: r.id });
        me.vx *= BUMP_SLOW;
        me.vy *= BUMP_SLOW;
        me.size = Math.max(MIN_SIZE, me.size - BUMP_SHRINK);
        const overlap = me.size + r.r - dist;
        if (overlap > 0) {
          me.x -= (dx / dist) * overlap;
          me.y -= (dy / dist) * overlap;
        }
        r.cooldown = BUMP_COOLDOWN;
        playSound('snowball.bump', { pan: (me.x - 128) / 160 });
      }
    }

    function updateEffects() {
      const viewTop = me.scrollY;
      for (const fl of flakes) {
        fl.y += fl.vy;
        fl.phase += 0.03;
        fl.x += Math.sin(fl.phase) * 0.3;
        if (fl.y > viewTop + 480 || fl.y < viewTop - 60) {
          fl.y = viewTop - 10 - fxRng() * 40;
          fl.x = fxRng() * 256;
        }
      }
      for (const p of sprays) {
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.vz -= 0.125;
        p.life--;
      }
      for (let i = sprays.length - 1; i >= 0; i--) if (sprays[i].life <= 0 || sprays[i].z < 0) sprays.splice(i, 1);
    }

    /** Position affichée d'un autre joueur : interpolée entre ses deux messages qui encadrent l'instant visé. */
    function updateRemote(r: Remote, now: number) {
      if (!r.samples.length) return;
      const target = r.lastT + (now - r.lastAt) - INTERP_DELAY_MS;
      const s = r.samples;
      let a = s[0];
      let b = s[s.length - 1];
      if (target <= a.t) b = a;
      else if (target >= b.t) a = b;
      else
        for (let i = 1; i < s.length; i++)
          if (s[i].t >= target) {
            [a, b] = [s[i - 1], s[i]];
            break;
          }
      const k = b.t === a.t ? 1 : (target - a.t) / (b.t - a.t);
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k;
      r.sphere.roll(x - r.x, y - r.y, r.r);
      r.x = x;
      r.y = y;
      r.r = a.r + (b.r - a.r) * k;
    }

    function render() {
      const now = performance.now();
      const scrollY = me.scrollY;
      const offsets = [scrollY, scrollY + BOTTOM_VIEW_OFFSET];
      for (const [w, world] of worlds.entries()) {
        world.y = -offsets[w];
        for (const [k, s] of chunkSprites[w].entries())
          s.visible = k * CHUNK < offsets[w] + SCREEN_H && (k + 1) * CHUNK > offsets[w];
      }

      // Ma boule.
      mySphere.roll(me.x - drawX, me.y - drawY, me.size);
      [drawX, drawY] = [me.x, me.y];
      mySphere.draw();
      for (const s of myBalls) {
        s.visible = me.size > 0;
        s.position.set(me.x, me.y);
        s.setSize(me.size * 2);
      }

      // Les autres.
      for (const r of remotes.values()) {
        updateRemote(r, now);
        r.sphere.draw();
        for (const [w, s] of r.sprites.entries()) {
          s.visible = r.r > 0;
          s.position.set(r.x, r.y);
          s.setSize(Math.max(0.01, r.r * 2));
          r.labels[w].visible = r.r > 0;
          r.labels[w].position.set(r.x, r.y - r.r - 6);
        }
      }

      // Flocons et gerbes.
      for (const g of fx) {
        g.clear();
        for (const fl of flakes) g.circle(fl.x, fl.y, 1.2).fill({ color: 0xffffff, alpha: 0.85 });
        for (const p of sprays) g.circle(p.x, p.y - p.z, 1.6).fill({ color: 0xf4f8ff, alpha: Math.min(1, p.life / 20) });
      }

      // Chrono, jauge de progression (un repère par joueur), place.
      const t = playTime(frame);
      const frozen = phase === 'melt' || phase === 'over';
      if (!frozen) timeValue.text = fmt(Math.max(0, view.timeLeftMs - Math.max(0, t)));
      const entries = [
        { me: true, finish: finishMs, p: progress() },
        ...[...remotes.values()].map((r) => ({ me: false, finish: r.finishMs, p: progressOf(r.y, r.r, START_Y) })),
      ];
      meter.clear().roundRect(243, 30, 6, 132, 3).fill({ color: 0x1d1b2f, alpha: 0.5 });
      for (const e of entries)
        if (!e.me) meter.circle(246, 158 - e.p * 124, 3).fill(0xf4f1ea).stroke({ color: 0x1d1b2f, width: 1 });
      meter.circle(246, 158 - entries[0].p * 124, 4).fill(0xffbf3c).stroke({ color: 0x1d1b2f, width: 1 });
      entries.sort((a, b) =>
        a.finish !== null || b.finish !== null ? (a.finish ?? Infinity) - (b.finish ?? Infinity) : b.p - a.p,
      );
      if (remotes.size) rankText.text = ordinal(entries.findIndex((e) => e.me) + 1);
    }

    function update() {
      // Rattrape les images manquées (écran lent, onglet revenu au premier plan), avec une limite.
      const target = Math.floor((performance.now() - t0) / FRAME);
      for (let n = 0; frame < target && n < 600; n++) tick(frame++);
      render();
    }

    ticker.add(update);
    update();

    return {
      play: () => new Promise<RoundResult>((r) => (resolvePlay = r)),

      setDeadline(ms) {
        deadline = Math.min(deadline, ms);
      },

      onRelay(from, data) {
        const msg = data as Msg;
        if (msg?.k === 's') {
          const r = remotes.get(from);
          if (!r || typeof msg.t !== 'number') return;
          r.samples.push({ t: msg.t, x: msg.x, y: msg.y, r: msg.r });
          r.samples.sort((a, b) => a.t - b.t);
          if (r.samples.length > 6) r.samples.shift();
          r.lastT = Math.max(r.lastT, msg.t);
          r.lastAt = performance.now();
          r.finishMs = msg.f;
        } else if (msg?.k === 'b' && (phase === 'race' || phase === 'finished')) {
          // Une boule de derrière m'a heurté : projection vers l'avant (la taille n'y change rien).
          me.vx += msg.vx;
          me.vy += msg.vy;
          if (speedOf(me) > MAX_SPEED) {
            const s = speedOf(me);
            me.vx = (me.vx / s) * MAX_SPEED;
            me.vy = (me.vy / s) * MAX_SPEED;
          }
          me.size = Math.max(MIN_SIZE, me.size - BUMP_SHRINK);
          playSound('snowball.bump', { pan: (me.x - 128) / 160 });
        }
      },

      currentResult: () => ({ timeMs: finishMs, distance: progress() }),

      finish() {
        status.text = 'Course terminée !';
      },

      destroy() {
        ticker.remove(update);
        bottom.removeAllListeners();
        for (const tex of chunkTextures) tex.destroy(true);
        mySphere.destroy();
        for (const r of remotes.values()) r.sphere.destroy();
      },
    };
  },
};

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Pré-dessine le circuit en bandes : sol, ligne de but, roche (selon la forme exacte de chaque tuile), décors. */
function drawCourse(course: Course): Texture[] {
  const img = (key: string) => texture(key).source.resource as CanvasImageSource;
  const canvas = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const textures: Texture[] = [];
  for (let y0 = 0; y0 < COURSE_H; y0 += CHUNK) {
    const h = Math.min(CHUNK, COURSE_H - y0);
    const out = canvas(256, h);
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = ctx.createPattern(img('snowball.ground'), 'repeat')!;
    ctx.fillRect(0, 0, 256, h);
    if (GOAL_Y - 16 < y0 + h && GOAL_Y + 16 > y0) {
      ctx.fillStyle = ctx.createPattern(img('snowball.goal'), 'repeat')!;
      ctx.fillRect(0, GOAL_Y - 16 - y0, 256, 32);
    }

    // Roche : motif découpé par un masque pixel à pixel (mêmes formes que les collisions).
    const wall = canvas(256, h);
    const wctx = wall.getContext('2d')!;
    wctx.fillStyle = wctx.createPattern(img('snowball.wall'), 'repeat')!;
    wctx.fillRect(0, 0, 256, h);
    const mask = new ImageData(256, h);
    for (let py = 0; py < h; py++) {
      const y = y0 + py;
      for (let px = 0; px < 256; px++) {
        const tile = tileAt(course, px >> 4, y >> 4);
        if (tile >= T.DECO || solidIn(tile, px & 15, y & 15)) mask.data[(py * 256 + px) * 4 + 3] = 255;
      }
    }
    const maskCanvas = canvas(256, h);
    maskCanvas.getContext('2d')!.putImageData(mask, 0, 0);
    wctx.globalCompositeOperation = 'destination-in';
    wctx.drawImage(maskCanvas, 0, 0);
    ctx.drawImage(wall, 0, 0);

    // Décors posés sur la roche, décors hors piste, obstacles.
    const draw = (key: string, x: number, y: number, w: number, hh = w) => {
      if (y + hh < y0 || y - hh > y0 + h) return;
      ctx.drawImage(img(key), x - w / 2, y - y0 - hh / 2, w, hh);
    };
    for (let row = y0 >> 4; row < (y0 + h) >> 4; row++)
      for (let lane = 0; lane < 16; lane++) {
        const tile = tileAt(course, lane, row);
        if (tile >= T.DECO) draw('snowball.deco', lane * 16 + 8, row * 16 + 8, 6 + (tile - T.DECO) * 2);
      }
    for (const p of course.props) draw(p.kind === 3 ? 'snowball.prop' : 'snowball.tree', p.x, p.y, p.kind === 3 ? 14 : 20);
    for (const o of course.obstacles) draw('snowball.obstacle', o.x, o.y, 26, 18);
    textures.push(Texture.from(out));
  }
  return textures;
}
