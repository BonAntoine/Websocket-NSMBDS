import { Container, Graphics, Text, type Application } from 'pixi.js';
import type { PlayerInfo } from '@nsmb/shared';
import { SCORE_BAR_H, SCREEN_H, SCREEN_W, type GameView, type MiniGame, type RoundInstance } from '../games/types';

/** Écart entre les deux écrans (la charnière de la DS). */
const GAP = 8;

export interface RoundHandle extends RoundInstance {
  /** Met à jour la barre des scores, en bas de l'écran du haut. */
  setScores(players: PlayerInfo[], meId: string): void;
}

/**
 * Prépare la scène d'un niveau : deux écrans virtuels de SCREEN_W × SCREEN_H, mis à l'échelle
 * pour tenir dans le canvas sans déformation, empilés ou côte à côte (voir layout). Les jeux raisonnent en pixels "DS" : même
 * sensation sur tous les appareils (tailles, vitesses, zones de toucher proportionnelles).
 */
export function createRound(
  app: Application,
  game: MiniGame,
  params: Pick<GameView, 'round' | 'seed' | 'timeLeftMs' | 'onMiss'>,
): RoundHandle {
  clearStage(app);
  const root = new Container();
  const top = maskedScreen();
  const bottom = maskedScreen();
  root.addChild(top, bottom);
  app.stage.addChild(root);
  const relayout = () => layout(root, bottom, app.screen.width, app.screen.height);
  relayout();
  // Netteté des textes calculée pour la taille de départ : un redimensionnement en cours de niveau
  // peut les rendre un peu flous jusqu'au niveau suivant.
  const textResolution = root.scale.x * app.renderer.resolution;
  app.renderer.on('resize', relayout);

  const instance = game.create({ ...params, top, bottom, ticker: app.ticker, textResolution });

  const scores = new Container();
  scores.y = SCREEN_H - SCORE_BAR_H;
  top.addChild(scores); // ajoutée après le jeu : toujours au premier plan

  return {
    ...instance,
    setScores: (players, meId) => drawScores(scores, players, meId, textResolution),
    destroy: () => {
      app.renderer.off('resize', relayout);
      instance.destroy();
      clearStage(app);
    },
  };
}

/**
 * Place les deux écrans : empilés (portrait, façon DS) ou côte à côte (paysage, écran tactile à droite),
 * selon la disposition qui les affiche le plus grand. Recalculé à chaque redimensionnement.
 */
function layout(root: Container, bottom: Container, width: number, height: number) {
  const stacked = Math.min(width / SCREEN_W, height / (SCREEN_H * 2 + GAP));
  const sideBySide = Math.min(width / (SCREEN_W * 2 + GAP), height / SCREEN_H);
  const side = sideBySide > stacked;
  const scale = Math.max(stacked, sideBySide);
  bottom.position.set(side ? SCREEN_W + GAP : 0, side ? 0 : SCREEN_H + GAP);
  const totalW = side ? SCREEN_W * 2 + GAP : SCREEN_W;
  const totalH = side ? SCREEN_H : SCREEN_H * 2 + GAP;
  root.scale.set(scale);
  root.position.set((width - totalW * scale) / 2, (height - totalH * scale) / 2);
}

/** Jusqu'à 4 joueurs sur une ligne, 5 à 8 sur deux lignes de 4. */
function drawScores(bar: Container, players: PlayerInfo[], meId: string, resolution: number) {
  for (const child of bar.removeChildren()) child.destroy();
  bar.addChild(new Graphics().rect(0, 0, SCREEN_W, SCORE_BAR_H).fill(0x1d1b2f));

  const cols = Math.min(4, players.length);
  const rows = Math.ceil(players.length / 4);
  const maxChars = cols === 4 ? 6 : 10;
  players.forEach((p, i) => {
    const name = p.name.length > maxChars ? `${p.name.slice(0, maxChars - 1)}…` : p.name;
    const t = new Text({
      text: `${name} ${p.score}`,
      resolution,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 'bold',
        fontSize: rows > 1 ? 9 : 11,
        fill: p.id === meId ? 0xffbf3c : 0xf4f1ea,
      },
    });
    t.anchor.set(0.5);
    t.alpha = p.connected ? 1 : 0.4;
    t.position.set((SCREEN_W / cols) * ((i % cols) + 0.5), (SCORE_BAR_H / rows) * (Math.floor(i / cols) + 0.5));
    bar.addChild(t);
  });
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
