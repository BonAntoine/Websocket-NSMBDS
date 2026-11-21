import type { Container, Ticker } from 'pixi.js';

/** Taille d'un écran virtuel, en pixels "DS". Le runner le met à l'échelle de l'appareil. */
export const SCREEN_W = 256;
export const SCREEN_H = 192;

/** Ce que reçoit un mini-jeu pour un niveau : deux "écrans" empilés façon DS. */
export interface GameView {
  round: number;
  seed: number;
  /** Chrono global restant au début du niveau. */
  timeLeftMs: number;
  /** Écran du haut (infos), coordonnées 0..SCREEN_W × 0..SCREEN_H. */
  top: Container;
  /** Écran du bas (zone tactile), mêmes coordonnées. */
  bottom: Container;
  ticker: Ticker;
  /** Résolution à donner aux textes pour qu'ils restent nets une fois l'écran agrandi. */
  textResolution: number;
  /** À appeler à chaque mauvais toucher (-1 point). */
  onMiss(): void;
}

export interface RoundOutcome {
  winnerName: string | null;
  winnerTimeMs: number | null;
  isMe: boolean;
}

export interface RoundInstance {
  /** Intro puis jeu. Résout avec le temps depuis le "Go" local si trouvé, null à l'échéance. */
  play(): Promise<number | null>;
  /** Un joueur a trouvé en `ms` : on joue jusqu'à ce temps-là sur notre propre chrono. */
  setDeadline(ms: number): void;
  /** Animation de fin de niveau, une fois le gagnant connu. */
  finish(outcome: RoundOutcome): void;
  destroy(): void;
}

export interface MiniGame {
  create(view: GameView): RoundInstance;
}
