import { Container, Graphics, type Application } from 'pixi.js';
import { SCREEN_H, SCREEN_W, type GameView, type MiniGame, type RoundInstance } from '../games/types';

/** Écart entre les deux écrans (la charnière de la DS). */
const GAP = 8;

/**
 * Prépare la scène d'un niveau : deux écrans virtuels de SCREEN_W × SCREEN_H, mis à l'échelle
 * pour tenir dans le canvas sans déformation. Les jeux raisonnent en pixels "DS" : même
 * sensation sur tous les appareils (tailles, vitesses, zones de toucher proportionnelles).
 */
export function createRound(
  app: Application,
  game: MiniGame,
  params: Pick<GameView, 'round' | 'seed' | 'timeLeftMs' | 'onMiss'>,
): RoundInstance {
  clearStage(app);
  const { width, height } = app.screen;
  const totalH = SCREEN_H * 2 + GAP;
  const scale = Math.min(width / SCREEN_W, height / totalH);

  const root = new Container();
  root.scale.set(scale);
  root.position.set((width - SCREEN_W * scale) / 2, (height - totalH * scale) / 2);
  const top = maskedScreen();
  const bottom = maskedScreen();
  bottom.y = SCREEN_H + GAP;
  root.addChild(top, bottom);
  app.stage.addChild(root);

  const instance = game.create({
    ...params,
    top,
    bottom,
    ticker: app.ticker,
    textResolution: scale * app.renderer.resolution,
  });
  return {
    ...instance,
    destroy: () => {
      instance.destroy();
      clearStage(app);
    },
  };
}

function clearStage(app: Application) {
  for (const child of app.stage.removeChildren()) child.destroy({ children: true });
}

/** Conteneur masqué à sa zone : rien ne déborde sur l'autre écran. */
function maskedScreen(): Container {
  const c = new Container();
  const mask = new Graphics().rect(0, 0, SCREEN_W, SCREEN_H).fill(0xffffff);
  c.addChild(mask);
  c.mask = mask;
  return c;
}
