// Pas de 0/O, 1/I/L : 31 caractères → 31^4 ≈ 920 000 codes.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const NAME_MAX_LENGTH = 12;

export const ROUNDS_PER_MATCH = 5;
/** Compte à rebours local avant le "Go". */
export const COUNTDOWN_MS = 3000;
/** Temps max pour jouer après le "Go". */
export const ROUND_LIMIT_MS = 10_000;
/** Marge accordée aux clients (latence, déconnexion) avant de clore la manche. */
export const RESULT_GRACE_MS = 5000;
/** Pause d'affichage du résultat entre deux manches. */
export const BETWEEN_ROUNDS_MS = 3500;

export const normalizeCode = (raw: string) =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
