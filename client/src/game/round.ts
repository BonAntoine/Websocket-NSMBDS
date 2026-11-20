import { Container, Graphics, Text, type Application } from 'pixi.js';
import { COUNTDOWN_MS } from '@nsmb/shared';
import type { MiniGame } from '../games/types';

/** Part de la hauteur donnée à l'écran du haut. */
const TOP_RATIO = 0.33;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Joue une manche : compte à rebours local, "Go", puis le mini-jeu. Renvoie le temps de réaction. */
export async function playRound(app: Application, game: MiniGame, seed: number): Promise<number | null> {
  const { width, height } = app.screen;
  const topSize = { width, height: Math.round(height * TOP_RATIO) };
  const bottomSize = { width, height: height - topSize.height };

  const bg = new Graphics()
    .rect(0, 0, width, topSize.height)
    .fill(0x2b2945)
    .rect(0, topSize.height, width, bottomSize.height)
    .fill(0xf4f1ea)
    .rect(0, topSize.height - 2, width, 4)
    .fill(0x1d1b2f);
  const top = maskedScreen(topSize);
  const bottom = maskedScreen(bottomSize);
  bottom.y = topSize.height;
  app.stage.addChild(bg, top, bottom);

  try {
    const instance = game.create({ seed, top, topSize, bottom, bottomSize, ticker: app.ticker });

    const label = new Text({ text: '', style: { fill: 0x1d1b2f, fontSize: 96, fontWeight: 'bold' } });
    label.anchor.set(0.5);
    label.position.set(width / 2, topSize.height + bottomSize.height / 2);
    app.stage.addChild(label);
    for (let n = 3; n > 0; n--) {
      label.text = String(n);
      await sleep(COUNTDOWN_MS / 3);
    }
    label.destroy();

    const time = await instance.play(); // le chrono démarre ici : "Go" local
    await sleep(1200); // laisse voir le résultat
    return time;
  } finally {
    for (const child of app.stage.removeChildren()) child.destroy({ children: true });
  }
}

/** Conteneur masqué à sa zone : rien ne déborde sur l'autre écran. */
function maskedScreen(size: { width: number; height: number }): Container {
  const c = new Container();
  const mask = new Graphics().rect(0, 0, size.width, size.height).fill(0xffffff);
  c.addChild(mask);
  c.mask = mask;
  return c;
}
