import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { mulberry32 } from '@nsmb/shared';
import { texture } from '../../assets/assets';
import { playSound } from '../../assets/sounds';
import { SCREEN_H, SCREEN_W, type MiniGame, type RoundOutcome } from '../types';
import { FACES, POSTER_FACES, makeLevel, positionAt, restartFrom, type Picture } from './level';

// Durées d'origine en images à 60 i/s, converties en ms.
const FRAME = 1000 / 60;
const HIT = 16; // demi-côté de la zone de toucher, px DS (sprites de 32 px)
const FLASH_MS = 64 * FRAME; // clignotement + arrêt du personnage touché par erreur
const BLINK_MS = 4 * FRAME;
const MARK_FALL_FRAMES = 16;
const MARK_HOLD_MS = 64 * FRAME;
const IRIS_FROM = 64;
const IRIS_TO = 160; // demi-diagonale de l'écran : tout est découvert
const IRIS_MS = ((IRIS_TO - IRIS_FROM) / 2) * FRAME; // +2 px par image
const VOICES = ['wanted.voice.a', 'wanted.voice.b', 'wanted.voice.c', 'wanted.voice.d'];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fmt = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

interface LivePicture {
  origin: Picture;
  /** Instant (ms depuis le Go) où `origin` a pris effet. */
  since: number;
  /** Début du clignotement, -1 si aucun. */
  flashFrom: number;
  sprite: Sprite;
}

export const wanted: MiniGame = {
  create(view) {
    const { top, bottom, ticker } = view;
    const level = makeLevel(view.seed, view.round, view.timeLeftMs);
    const firstOfSet = (view.round - 1) % 5 === 0; // palier de 5 niveaux
    const voiceRate = view.round > 10 ? 1.25 : view.round > 5 ? 1.12 : 1;

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
          fontWeight: 'bold',
          fontSize: size,
          fill,
          ...(outline ? { stroke: { color: 0x1d1b2f, width: Math.ceil(size / 5) } } : {}),
        },
      });
      t.anchor.set(0.5);
      return t;
    };

    // --- Écran du haut : chrono + avis de recherche derrière des rideaux --------------------
    // Le bas de l'écran (SCORE_BAR_H) est réservé aux scores, dessinés par le runner.
    const levelLabel = text(`NIVEAU ${view.round}`, 9, 0xa7a3c2, false);
    levelLabel.anchor.set(0, 0.5);
    levelLabel.position.set(8, 9);
    const timeLabel = text('TEMPS', 9, 0xa7a3c2, false);
    timeLabel.position.set(128, 8);
    const timeValue = text(String(Math.ceil(view.timeLeftMs / 1000)), 20);
    timeValue.position.set(128, 25);
    const poster = new Graphics().roundRect(78, 40, 100, 122, 6).fill(0xf4e3c1).stroke({ color: 0x1d1b2f, width: 3 });
    const title = text('RECHERCHÉ', 12, 0x8b2e16, false);
    title.position.set(128, 54);
    const face = new Sprite(texture(POSTER_FACES[level.wanted]));
    face.anchor.set(0.5);
    fit(face, 60);
    face.position.set(128, 108);

    const curtains = new Container();
    const curtainMask = new Graphics().rect(78, 40, 100, 122).fill(0xffffff);
    const curtainL = new Graphics().rect(-50, 0, 50, 122).fill(0xa4161a).rect(-5, 0, 5, 122).fill(0x6a040f);
    const curtainR = new Graphics().rect(0, 0, 50, 122).fill(0xa4161a).rect(0, 0, 5, 122).fill(0x6a040f);
    curtainL.y = curtainR.y = 40;
    curtains.addChild(curtainMask, curtainL, curtainR);
    curtains.mask = curtainMask;
    /** 0 = fermés, 1 = ouverts. */
    const setCurtains = (open: number) => {
      curtainL.x = 128 - 50 * open;
      curtainR.x = 128 + 50 * open;
    };
    setCurtains(0);
    top.addChild(new Graphics().rect(0, 0, SCREEN_W, SCREEN_H).fill(0x2b2945), levelLabel, timeLabel, timeValue, poster, title, face, curtains);

    // --- Écran du bas : la foule -----------------------------------------------------------
    const crowd = new Container();
    const effects = new Container();
    crowd.visible = false;
    bottom.addChild(new Graphics().rect(0, 0, SCREEN_W, SCREEN_H).fill(0x000000), crowd, effects);

    const pics: LivePicture[] = level.pictures.map((p) => {
      const sprite = new Sprite(texture(FACES[p.character]));
      sprite.anchor.set(0.5);
      fit(sprite, 32);
      sprite.position.set(p.x, p.y);
      return { origin: p, since: 0, flashFrom: -1, sprite };
    });
    // L'index 0 est devant (comme l'ordre OAM de la DS) : on empile à l'envers.
    for (let i = pics.length - 1; i >= 0; i--) crowd.addChild(pics[i].sprite);
    const target = pics[level.target];
    const restartRng = mulberry32((view.seed ^ (view.round * 7919)) >>> 0);

    // --- Déroulé ---------------------------------------------------------------------------
    let start = 0;
    let playing = false;
    let done = false;
    let deadline = view.timeLeftMs;
    let shownSeconds = Math.ceil(view.timeLeftMs / 1000);
    let resolvePlay: (time: number | null) => void = () => {};
    const status = text('', 14);
    status.position.set(128, 16);
    effects.addChild(status);

    const elapsed = () => performance.now() - start;

    function update() {
      const t = elapsed();
      for (const p of pics) {
        if (p.flashFrom >= 0) {
          const f = t - p.flashFrom;
          if (f < FLASH_MS) {
            p.sprite.visible = Math.floor(f / BLINK_MS) % 2 === 0;
            continue; // immobile pendant le clignotement
          }
          p.origin = restartFrom(p.origin, { x: p.sprite.x, y: p.sprite.y }, restartRng);
          p.since = t;
          p.flashFrom = -1;
          p.sprite.visible = true;
        }
        const pos = positionAt(p.origin, (t - p.since) / 1000);
        p.sprite.position.set(pos.x, pos.y);
      }

      const seconds = Math.ceil(Math.max(0, view.timeLeftMs - t) / 1000);
      if (seconds !== shownSeconds) {
        shownSeconds = seconds;
        timeValue.text = String(seconds);
        playSound(seconds <= 2 ? 'wanted.tick.urgent' : 'wanted.tick');
      }
      if (t >= deadline) stop(null);
    }

    function stop(time: number | null) {
      if (done) return;
      done = true;
      ticker.remove(update);
      status.text = time !== null ? `Trouvé ! ${fmt(time)}` : deadline < view.timeLeftMs ? 'Trop tard…' : '';
      resolvePlay(time);
    }

    async function dropMark(x: number, y: number) {
      const mark = text('-1', 14, 0xef5b5b);
      mark.position.set(clamp(x, 16, 224), clamp(y, 8, 184));
      effects.addChild(mark);
      const y0 = mark.y;
      await tween(MARK_FALL_FRAMES * FRAME, (k) => {
        const f = k * MARK_FALL_FRAMES;
        mark.y = y0 + 4.25 * f + (0.0625 * f * f) / 2;
      });
      await wait(MARK_HOLD_MS);
      if (!mark.destroyed) mark.destroy();
    }

    // Zone de toucher : la cible est testée en premier, même recouverte. Puis les autres, de l'avant vers l'arrière.
    bottom.eventMode = 'static';
    bottom.hitArea = new Rectangle(0, 0, SCREEN_W, SCREEN_H);
    bottom.on('pointerdown', (e) => {
      if (!playing || done) return;
      const { x, y } = e.getLocalPosition(bottom);
      const hit = (p: LivePicture) => Math.abs(x - p.sprite.x) <= HIT && Math.abs(y - p.sprite.y) <= HIT;
      if (hit(target)) return stop(elapsed());

      const wrong = pics.find((p) => p !== target && p.flashFrom < 0 && hit(p));
      if (!wrong) return;
      wrong.flashFrom = elapsed();
      view.onMiss();
      void dropMark(wrong.sprite.x, wrong.sprite.y);
      // Indice : la voix du recherché, placée en stéréo du côté de la cible.
      playSound('wanted.fail');
      playSound(VOICES[level.wanted], { pan: clamp(((target.sprite.x - 128) * 48) / 128, -48, 48) / 64, rate: voiceRate });
    });

    async function intro() {
      const banner = text(`NIVEAU ${view.round}`, 24);
      banner.position.set(128, 88);
      effects.addChild(banner);
      if (firstOfSet && view.round > 1) {
        const sub = text(`Palier ${Math.floor(view.round / 5) + 1}`, 13, 0xffbf3c);
        sub.position.set(128, 116);
        effects.addChild(sub);
        playSound('wanted.clear');
        timeouts.push(setTimeout(() => sub.destroy(), 2400));
      }
      if (firstOfSet) {
        // Début de palier : rideaux rapides qui rebondissent.
        await wait(900);
        playSound('wanted.curtain');
        await tween(350, (k) => setCurtains(easeInOut(k)));
        await tween(250, (k) => setCurtains(1 - 0.4 * Math.sin(k * Math.PI)));
        await wait(1100);
      } else {
        await wait(300);
        playSound('wanted.curtain');
        await tween(800, (k) => setCurtains(easeInOut(k)));
        await wait(500);
      }
      banner.destroy();
    }

    return {
      async play() {
        await intro();
        const result = new Promise<number | null>((r) => (resolvePlay = r));
        start = performance.now();
        crowd.visible = true;
        playing = true;
        every(update);
        update();
        return { timeMs: await result };
      },

      setDeadline(ms) {
        deadline = Math.min(deadline, ms);
      },

      finish(o: RoundOutcome) {
        stop(null);
        if (o.winnerTimeMs !== null) timeValue.text = String(Math.ceil((view.timeLeftMs - o.winnerTimeMs) / 1000));
        status.text = o.isMe ? 'Bravo ! +1' : o.winnerName ? `${o.winnerName} a trouvé ! ${fmt(o.winnerTimeMs!)}` : 'Temps écoulé !';

        // Tous disparaissent sauf la cible ; un cercle de lumière s'ouvre depuis le centre.
        for (const p of pics) p.sprite.visible = false;
        const spotlight = new Graphics();
        target.sprite.visible = true;
        effects.addChildAt(spotlight, 0);
        effects.addChildAt(target.sprite, 1);
        void tween(IRIS_MS, (k) =>
          spotlight.clear().circle(128, 96, IRIS_FROM + (IRIS_TO - IRIS_FROM) * k).fill(0x2b2945),
        );

        playSound(o.winnerName ? 'wanted.found' : 'wanted.fail');
        playSound(VOICES[level.wanted], { rate: voiceRate });

        if (o.winnerName) {
          // "+1" qui s'élève au-dessus de la cible.
          const reward = text('+1', 16, 0xffbf3c);
          reward.position.set(clamp(target.sprite.x, 8, 240), clamp(target.sprite.y, 8, 184));
          effects.addChild(reward);
          const y0 = reward.y;
          void tween(16 * FRAME, (k) => {
            const f = k * 16;
            reward.y = Math.max(8, y0 - 0.9375 * f - (0.0625 * f * f) / 2);
          }).then(() => wait(64 * FRAME).then(() => !reward.destroyed && reward.destroy()));
        }
      },

      destroy() {
        for (const fn of tickFns) ticker.remove(fn);
        for (const t of timeouts) clearTimeout(t);
        bottom.removeAllListeners();
      },
    };
  },
};

/** Met le sprite à l'échelle pour tenir dans un carré de `size` px, sans le déformer. */
function fit(sprite: Sprite, size: number) {
  sprite.scale.set(size / Math.max(sprite.texture.width, sprite.texture.height));
}
