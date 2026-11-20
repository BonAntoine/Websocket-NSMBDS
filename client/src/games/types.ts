import type { Container, Ticker } from 'pixi.js';

/** Zone d'affichage fournie à un mini-jeu : deux "écrans" empilés façon DS. */
export interface GameView {
  seed: number;
  /** Écran du haut (infos : cible, consignes…). */
  top: Container;
  topSize: { width: number; height: number };
  /** Écran du bas (zone tactile). */
  bottom: Container;
  bottomSize: { width: number; height: number };
  ticker: Ticker;
}

export interface MiniGame {
  /** Prépare la manche (affichée pendant le compte à rebours). */
  create(view: GameView): {
    /** Lancé au "Go" local. Résout avec le temps de réaction (ms), ou null si échec. */
    play(): Promise<number | null>;
  };
}
