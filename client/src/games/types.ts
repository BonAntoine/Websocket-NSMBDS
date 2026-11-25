import type { Container, Ticker } from 'pixi.js';

/** Taille d'un écran virtuel, en pixels "DS". Le runner le met à l'échelle de l'appareil. */
export const SCREEN_W = 256;
export const SCREEN_H = 192;
/** Bas de l'écran du haut réservé aux scores des joueurs (dessinés par le runner, pas par le jeu). */
export const SCORE_BAR_H = 26;

/** Ce que reçoit un mini-jeu pour un niveau : deux "écrans" empilés façon DS. */
export interface GameView {
  round: number;
  seed: number;
  /** Chrono global restant au début du niveau. */
  timeLeftMs: number;
  /** Écran du haut (infos), coordonnées 0..SCREEN_W × 0..SCREEN_H, dont SCORE_BAR_H en bas pour les scores. */
  top: Container;
  /** Écran du bas (zone tactile), mêmes coordonnées. */
  bottom: Container;
  ticker: Ticker;
  /** Résolution à donner aux textes pour qu'ils restent nets une fois l'écran agrandi. */
  textResolution: number;
  /** À appeler à chaque mauvais toucher (-1 point), pour les jeux qui en pénalisent. */
  onMiss(): void;
  /**
   * Jeux à objets partagés (cache-cache) : j'ai trouvé l'objet `item` à `timeMs` depuis le "Go".
   * Le serveur l'attribue au plus rapide et le signale à tous via RoundInstance.taken.
   */
  claim(item: number, timeMs: number, total: number): void;
}

export interface RoundOutcome {
  winnerName: string | null;
  winnerTimeMs: number | null;
  isMe: boolean;
}

/** Résultat d'un niveau, envoyé au serveur. */
export interface RoundResult {
  /** Temps depuis le "Go" local si l'objectif est atteint, null à l'échéance. */
  timeMs: number | null;
}

export interface RoundInstance {
  /** Intro puis jeu. Résout une fois l'objectif atteint ou l'échéance passée. */
  play(): Promise<RoundResult>;
  /** Un joueur a atteint l'objectif en `ms` : on joue jusqu'à ce temps-là sur notre propre chrono. */
  setDeadline(ms: number): void;
  /** Jeux à objets partagés : l'objet `item` est attribué à un joueur (moi ou un autre). */
  taken?(item: number, by: { name: string; isMe: boolean }, timeMs: number): void;
  /** Animation de fin de niveau, une fois le gagnant connu. */
  finish(outcome: RoundOutcome): void;
  destroy(): void;
}

export interface MiniGame {
  create(view: GameView): RoundInstance;
}
