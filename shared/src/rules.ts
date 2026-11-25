import type { GameId } from './events';

// Pas de 0/O, 1/I/L : 31 caractères → 31^4 ≈ 920 000 codes.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const NAME_MAX_LENGTH = 12;

/** Chrono global de la partie, par mini-jeu. Il ne défile que pendant le jeu et n'est jamais rechargé. */
export const MATCH_TIME_MS: Record<GameId, number> = { wanted: 60_000, ghosts: 45_000 };
/** Plafond des points annoncés par un client pour un niveau (16 fantômes max). */
export const MAX_ROUND_POINTS = 16;
/** Durée max de l'intro d'un niveau côté client (bannière, rideaux), pour le timeout serveur. */
export const ROUND_INTRO_MAX_MS = 4000;
/** Marge accordée aux clients (latence, déconnexion) avant de clore un niveau. */
export const RESULT_GRACE_MS = 5000;
/** Animation de fin de niveau (révélation de la cible) avant le niveau suivant. */
export const ROUND_END_MS = 3800;

export const normalizeCode = (raw: string) =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
