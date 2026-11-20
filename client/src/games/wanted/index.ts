import { Sprite, Text } from 'pixi.js';
import { ROUND_LIMIT_MS } from '@nsmb/shared';
import { texture } from '../../assets/assets';
import type { MiniGame } from '../types';
import { FACES, makeLevel, positionAt } from './level';

const WRONG_TAP_PENALTY_MS = 1000;

export const wanted: MiniGame = {
  create({ seed, top, topSize, bottom, bottomSize, ticker }) {
    const level = makeLevel(seed);
    const { width: w, height: h } = bottomSize;

    // Écran du haut : l'avis de recherche.
    const title = new Text({
      text: 'RECHERCHÉ',
      style: { fill: 0xffbf3c, fontSize: Math.round(topSize.height * 0.12), fontWeight: 'bold', letterSpacing: 4 },
    });
    title.anchor.set(0.5, 0);
    title.position.set(topSize.width / 2, topSize.height * 0.08);
    const poster = new Sprite(texture(FACES[level.wanted]));
    poster.anchor.set(0.5);
    poster.setSize(topSize.height * 0.55);
    poster.position.set(topSize.width / 2, topSize.height * 0.6);
    top.addChild(title, poster);

    const size =
      level.motion === 'bounce'
        ? Math.sqrt((w * h) / level.characters.length) * 0.85
        : Math.min(w / level.cols, h / level.rows) * 0.88;

    // Coordonnées normalisées → pixels. En drift, la zone déborde d'un demi-sprite pour boucler sans saut.
    const toPixels = (x: number, y: number) =>
      level.motion === 'drift'
        ? { x: -size / 2 + x * (w + size), y: -size / 2 + y * (h + size) }
        : level.motion === 'bounce'
          ? { x: size / 2 + x * (w - size), y: size / 2 + y * (h - size) }
          : { x: x * w, y: y * h };

    return {
      play: () =>
        new Promise((resolve) => {
          const start = performance.now();
          let penalty = 0;
          let done = false;

          const sprites = level.characters.map((c) => {
            const s = new Sprite(texture(FACES[c.face]));
            s.anchor.set(0.5);
            s.setSize(size);
            s.eventMode = 'static';
            bottom.addChild(s);
            return s;
          });

          const place = () => {
            const t = (performance.now() - start) / 1000;
            level.characters.forEach((c, i) => {
              const n = positionAt(c, level.motion, t);
              const p = toPixels(n.x, n.y);
              sprites[i].position.set(p.x, p.y);
            });
          };
          place();
          ticker.add(place);

          const finish = (time: number | null) => {
            if (done) return;
            done = true;
            ticker.remove(place);
            clearTimeout(timeout);
            resolve(time);
          };
          const timeout = setTimeout(() => finish(null), ROUND_LIMIT_MS);

          sprites.forEach((s, i) =>
            s.on('pointerdown', () => {
              if (done) return;
              if (level.characters[i].face === level.wanted) {
                const time = performance.now() - start + penalty;
                finish(time);
                sprites.forEach((o) => (o.alpha = o === s ? 1 : 0.15));
                bottom.addChild(s); // au premier plan
                s.setSize(size * 1.6);
              } else {
                penalty += WRONG_TAP_PENALTY_MS;
                s.tint = 0xff4444;
                setTimeout(() => !s.destroyed && (s.tint = 0xffffff), 300);
              }
            }),
          );
        }),
    };
  },
};
