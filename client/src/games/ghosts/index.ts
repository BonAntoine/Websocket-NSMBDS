import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { texture } from '../../assets/assets';
import { playSound } from '../../assets/sounds';
import { SCREEN_H, SCREEN_W, type MiniGame, type RoundOutcome } from '../types';
import { Darkness, H, W, facesRight, makeGhosts, stepGhost, type Ghost } from './level';

// Le jeu avance par images fixes de 60 i/s (comme l'original), quel que soit le rafraîchissement de l'écran.
const FRAME = 1000 / 60;
/** Lumière allumée : on voit les fantômes voler. */
const LIGHTS_OUT_FRAME = 150;
/** Fin du fondu des fantômes dans le noir (16 pas de 4 images) : "Go", on peut frotter. */
const GO_FRAME = LIGHTS_OUT_FRAME + 64;
const EXCLAIM_FRAMES = 96;
const NUMBER_STAGGER_MS = 12 * FRAME; // original : 60 images, raccourci pour l'écran de fin
const ROOM_COLOR = 0x4a4270;
const DARK_RGB = [8, 6, 16];
const GHOST_SIZE = 16;

interface LiveGhost {
  g: Ghost;
  sprite: Sprite;
}

export const ghosts: MiniGame = {
  create(view) {
    const { top, bottom, ticker } = view;
    const list: LiveGhost[] = makeGhosts(view.seed, view.round).map((g) => {
      const sprite = new Sprite(texture('ghosts.ghost'));
      sprite.anchor.set(0.5);
      fit(sprite, GHOST_SIZE);
      return { g, sprite };
    });
    const total = list.length;

    // --- Outils, nettoyés par destroy() ---------------------------------------------------
    const tickFns: (() => void)[] = [];
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const every = (fn: () => void) => (ticker.add(fn), tickFns.push(fn));
    const wait = (ms: number) => new Promise<void>((r) => timeouts.push(setTimeout(r, ms)));
    const tween = (ms: number, fn: (k: number) => void) =>
      new Promise<void>((resolve) => {
        const t0 = performance.now();
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / ms);
          fn(k);
          if (k >= 1) {
            ticker.remove(step);
            resolve();
          }
        };
        every(step);
        step();
      });
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

    // --- Écran du haut : chrono global + fantômes débusqués ---------------------------------
    // Le bas de l'écran (SCORE_BAR_H) est réservé aux scores, dessinés par le runner.
    const levelLabel = text(`NIVEAU ${view.round}`, 9, 0xa7a3c2, false);
    levelLabel.anchor.set(0, 0.5);
    levelLabel.position.set(8, 9);
    const timeLabel = text('TEMPS', 9, 0xa7a3c2, false);
    timeLabel.position.set(128, 8);
    const timeValue = text(String(Math.ceil(view.timeLeftMs / 1000)), 20);
    timeValue.position.set(128, 25);
    const bigGhost = new Sprite(texture('ghosts.ghost'));
    bigGhost.anchor.set(0.5);
    fit(bigGhost, 56);
    bigGhost.position.set(96, 100);
    const counter = text(`0 / ${total}`, 22);
    counter.anchor.set(0, 0.5);
    counter.position.set(136, 92);
    const mineLabel = text('à toi : 0', 11, 0xffbf3c, false);
    mineLabel.anchor.set(0, 0.5);
    mineLabel.position.set(138, 114);
    top.addChild(
      new Graphics().rect(0, 0, SCREEN_W, SCREEN_H).fill(0x2b2945),
      levelLabel,
      timeLabel,
      timeValue,
      bigGhost,
      counter,
      mineLabel,
    );

    // --- Écran du bas : la pièce, les fantômes cachés, le noir, puis ce qui passe devant ------
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const pixels = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) pixels.data.set(DARK_RGB, i * 4);
    const darkTexture = Texture.from(canvas);
    darkTexture.source.scaleMode = 'nearest'; // bords du frottement nets, façon pixels DS
    const darkSprite = new Sprite(darkTexture);
    darkSprite.visible = false;
    const darkness = new Darkness();

    const behind = new Container(); // fantômes cachés : visibles seulement là où on a frotté
    const front = new Container(); // fantômes qui volent, se fondent, débusqués
    const effects = new Container();
    const room = new Graphics()
      .rect(0, 0, SCREEN_W, SCREEN_H)
      .fill(ROOM_COLOR)
      .rect(0, 150, SCREEN_W, 42)
      .fill(0x3a335c);
    bottom.addChild(room, behind, darkSprite, front, effects);
    for (const l of list) front.addChild(l.sprite);

    const banner = text(`NIVEAU ${view.round}`, 24);
    banner.position.set(128, 88);
    effects.addChild(banner);
    const status = text('', 14);
    status.position.set(128, 16);
    effects.addChild(status);

    // --- Frottement --------------------------------------------------------------------------
    let touch: { x: number; y: number } | null = null;
    let rubFrom: { x: number; y: number } | null = null;
    let lastRubSound = 0;
    const toLocal = (e: { getLocalPosition: (c: Container) => { x: number; y: number } }) => {
      const p = e.getLocalPosition(bottom);
      return { x: Math.floor(p.x), y: Math.floor(p.y) };
    };
    bottom.eventMode = 'static';
    bottom.hitArea = new Rectangle(0, 0, SCREEN_W, SCREEN_H);
    bottom.on('pointerdown', (e) => (touch = toLocal(e)));
    bottom.on('pointermove', (e) => touch && (touch = toLocal(e)));
    const release = () => (touch = null);
    bottom.on('pointerup', release);
    bottom.on('pointerupoutside', release);

    /** UpdateRubbing : un trait depuis le dernier point, seulement si le doigt a bougé de plus de 3 px. */
    function rub() {
      if (!touch) return void (rubFrom = null);
      if (!rubFrom) return void (rubFrom = { ...touch });
      if (Math.hypot(touch.x - rubFrom.x, touch.y - rubFrom.y) <= 3) return;
      darkness.rub(rubFrom.x, rubFrom.y, touch.x, touch.y);
      rubFrom = { ...touch };
      const now = performance.now();
      if (now - lastRubSound > 80) {
        lastRubSound = now;
        playSound('ghosts.rub', { pan: (touch.x - 128) / 160 });
      }
    }

    // --- Déroulé ---------------------------------------------------------------------------
    const t0 = performance.now();
    let frame = 0;
    let playing = false;
    let done = false;
    let found = 0; // trouvés sur mon écran (en attente d'attribution ou non)
    let taken = 0; // attribués par le serveur, à moi ou aux autres
    let mine = 0;
    let lastTakenMs = 0;
    let deadline = view.timeLeftMs;
    let shownSeconds = Math.ceil(view.timeLeftMs / 1000);
    let resolveGo: () => void = () => {};
    let resolvePlay: (time: number | null) => void = () => {};
    const exclaims: { t: Text; until: number }[] = [];
    /** Nom du joueur à qui chaque fantôme a été attribué, affiché au-dessus. */
    const owners: (Text | null)[] = list.map(() => null);
    const mineItems = new Set<number>();

    /** Temps de jeu depuis le "Go", en ms, au début de l'image `f`. */
    const playTime = (f: number) => (f - GO_FRAME) * FRAME;

    function tick(f: number) {
      if (f === LIGHTS_OUT_FRAME) {
        // Lumière éteinte : le noir tombe, les fantômes s'y fondent.
        banner.destroy();
        darkSprite.visible = true;
        for (const { g } of list) g.state = 'fadeOut';
        playSound('ghosts.lightsOut');
      }
      if (f === GO_FRAME) {
        playing = true;
        resolveGo();
      }

      if (playing && !done) {
        const t = playTime(f);
        const seconds = Math.ceil(Math.max(0, view.timeLeftMs - t) / 1000);
        if (seconds !== shownSeconds) {
          shownSeconds = seconds;
          timeValue.text = String(seconds);
          playSound(seconds <= 2 ? 'ghosts.tick.urgent' : 'ghosts.tick');
        }
        if (t >= deadline) return stop(null);
        rub();
      }

      for (const [i, l] of list.entries()) {
        const wasFound = stepGhost(l.g, darkness, found);
        if (!wasFound) continue;
        found++;
        // Annoncé au serveur, qui l'attribuera au plus rapide de tous les joueurs.
        view.claim(i, playTime(f), total);
        playSound('ghosts.found', { pan: (l.g.x - 128) / 160 });
        const mark = text('!', 16, 0xffbf3c);
        mark.position.set(l.g.x, Math.max(8, l.g.y - 24));
        effects.addChild(mark);
        exclaims.push({ t: mark, until: f + EXCLAIM_FRAMES });
      }
      for (const e of exclaims) if (f >= e.until && !e.t.destroyed) e.t.destroy();
    }

    function render() {
      for (const [i, { g, sprite }] of list.entries()) {
        const visibleState = g.state !== 'gone' && g.state !== 'hidden';
        sprite.visible = g.state !== 'gone';
        const layer = visibleState ? front : behind;
        if (sprite.parent !== layer) layer.addChild(sprite);
        sprite.alpha = g.state === 'hidden' ? 1 : g.fade / 16;
        sprite.scale.x = Math.abs(sprite.scale.x) * (facesRight(g) ? 1 : -1);
        // Petit flottement, purement visuel.
        sprite.position.set(g.x, g.y + Math.sin(frame / 7 + i * 2));
        const owner = owners[i];
        if (owner && !owner.destroyed) owner.position.set(g.x, Math.max(6, sprite.y - 13));
      }
      if (darkness.dirty) {
        darkness.dirty = false;
        const { dark } = darkness;
        for (let i = 0; i < dark.length; i++) pixels.data[i * 4 + 3] = dark[i] ? 255 : 0;
        ctx.putImageData(pixels, 0, 0);
        darkTexture.source.update();
      }
    }

    function update() {
      // Rattrape les images manquées (écran lent, onglet revenu au premier plan), avec une limite.
      const target = Math.floor((performance.now() - t0) / FRAME);
      for (let n = 0; frame < target && n < 600; n++) tick(frame++);
      render();
    }

    function stop(time: number | null) {
      if (done) return;
      done = true;
      touch = rubFrom = null;
      status.text = taken === total ? 'Tous débusqués !' : deadline < view.timeLeftMs ? 'Trop tard…' : '';
      resolvePlay(time);
    }

    every(update);
    update();

    return {
      async play() {
        await new Promise<void>((r) => (resolveGo = r));
        // Les points sont comptés par le serveur à chaque attribution : on signale seulement la fin du jeu local.
        return { timeMs: await new Promise<number | null>((r) => (resolvePlay = r)) };
      },

      taken(item, by, timeMs) {
        const l = list[item];
        if (!l || owners[item]) return;
        // Trouvé par un autre : il apparaît chez moi, par-dessus le noir.
        if (l.g.state !== 'found') {
          l.g.state = 'found';
          l.g.fade = 16;
          l.g.foundOrder = found++;
          playSound('ghosts.found', { pan: (l.g.x - 128) / 160 });
        }
        const owner = text(by.name, 9, by.isMe ? 0xffbf3c : 0xf4f1ea);
        effects.addChild(owner);
        owners[item] = owner;
        taken++;
        lastTakenMs = Math.max(lastTakenMs, timeMs);
        if (by.isMe) {
          mineItems.add(item);
          mineLabel.text = `à toi : ${++mine}`;
        }
        counter.text = `${taken} / ${total}`;
        if (taken === total && !done) {
          playSound('ghosts.allFound');
          stop(null);
        }
      },

      setDeadline(ms) {
        deadline = Math.min(deadline, ms);
      },

      finish(o: RoundOutcome) {
        stop(null);
        const all = taken === total;
        if (all) timeValue.text = String(Math.ceil((view.timeLeftMs - lastTakenMs) / 1000));
        const headline = all ? 'Tous débusqués !' : 'Temps écoulé !';
        status.text = mine ? `${headline} +${mine}` : headline;

        // Les fantômes restants réapparaissent et s'enfuient.
        const left = list.filter((l) => l.g.state === 'hidden');
        for (const { g } of left) [g.state, g.fade, g.timer] = ['fadeIn', 0, 0];
        if (left.length) playSound('ghosts.escape');

        // Mes fantômes comptent mes points (1, 2, 3…), puis tous les débusqués disparaissent dans un nuage.
        const caught = list.filter((l) => l.g.state === 'found');
        const mineCaught = caught.filter((l) => mineItems.has(list.indexOf(l))).sort((a, b) => a.g.foundOrder - b.g.foundOrder);
        void (async () => {
          for (const [i, l] of mineCaught.entries()) {
            await wait(i === 0 ? 300 : NUMBER_STAGGER_MS);
            const n = text(String(i + 1), 14, 0xffbf3c);
            n.position.set(l.g.x, Math.max(8, l.g.y - 16));
            effects.addChild(n);
            playSound('ghosts.point');
            const y0 = n.y;
            void tween(16 * FRAME, (k) => (n.y = Math.max(8, y0 - 6 * k - 6 * k * k)));
          }
          await wait(700);
          for (const l of caught) {
            l.g.state = 'gone';
            const owner = owners[list.indexOf(l)];
            if (owner && !owner.destroyed) owner.destroy();
            const puff = new Graphics();
            effects.addChild(puff);
            void tween(20 * FRAME, (k) => {
              puff.clear().circle(l.g.x, l.g.y, 4 + 10 * k).fill({ color: 0xf4f1ea, alpha: 0.7 * (1 - k) });
            });
          }
        })();
      },

      destroy() {
        for (const fn of tickFns) ticker.remove(fn);
        for (const t of timeouts) clearTimeout(t);
        bottom.removeAllListeners();
        darkTexture.destroy(true);
      },
    };
  },
};

/** Met le sprite à l'échelle pour tenir dans un carré de `size` px, sans le déformer. */
function fit(sprite: Sprite, size: number) {
  sprite.scale.set(size / Math.max(sprite.texture.width, sprite.texture.height));
}
