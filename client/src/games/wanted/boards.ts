// Données des plateaux, d'après le Wanted! de SM64DS (sm64ds-decomp, d_s_mg_luigi.cpp).
// Unités : pixels "DS" (écran 256 × 192) et pixels par image à 60 images/s.
//
// [ROM]   valeur lue dans le code ou les données décompilées.
// [DEVINÉ] table absente du dépôt (pas de ROM) : valeur déduite de la logique du jeu.

export type Mover = 'stop' | 'column' | 'byCharacter' | 'sway' | 'bounce';

/**
 * Disposition :
 * - 'scatter' : grille de 13 × 9 cases de 20 px, une case par personnage, ±2 px de décalage
 * - 'quad'    : 2 × 2 au centre, les 4 personnages tous différents
 * - 'grid4'   : 4 × 4 au centre, jointifs
 * - 'grid8'   : 8 × 6 plein écran, jointifs
 * - 'peek'    : ligne de 8 au ras du haut (seul le bas dépasse), 3 personnages seulement
 */
export type Layout = 'scatter' | 'quad' | 'grid4' | 'grid8' | 'peek';

export interface Board {
  layout: Layout; // [DEVINÉ] sLuigiBoardModes
  mover: Mover; // [ROM] sLuigiBoardMovers
  /** Nombre de personnages, cible comprise ('scatter' seulement). [DEVINÉ] sLuigiPlaceLimits */
  count?: number;
  /** Cible placée devant la foule (sinon derrière). [DEVINÉ] sLuigiBoardFlags */
  targetInFront?: boolean;
}

// Indices = niveau - 1 pour les niveaux 1 à 20 ; ensuite tirage parmi 10..19.
// Raisonnement pour les dispositions devinées :
// - 'peek' n'utilise que les personnages 0..2, or le plateau 9 force le recherché à 1 → plateau 9.
// - Le défilement par colonne a 8 directions et celui par ligne 6 : la grille 8 × 6 → plateau 5.
// - Les plateaux 14, 16, 17, 19 ont du code spécial dans le chemin 'scatter' → 'scatter'.
// - Début facile (2 × 2 puis 4 × 4), densité croissante ensuite.
export const BOARDS: Board[] = [
  /*  0 */ { layout: 'quad', mover: 'stop' },
  /*  1 */ { layout: 'grid4', mover: 'stop' },
  /*  2 */ { layout: 'scatter', mover: 'stop', count: 12, targetInFront: true },
  /*  3 */ { layout: 'scatter', mover: 'stop', count: 20, targetInFront: true },
  /*  4 */ { layout: 'grid8', mover: 'stop' },
  /*  5 */ { layout: 'grid8', mover: 'column' },
  /*  6 */ { layout: 'scatter', mover: 'stop', count: 30, targetInFront: true },
  /*  7 */ { layout: 'scatter', mover: 'stop', count: 40, targetInFront: false },
  /*  8 */ { layout: 'scatter', mover: 'stop', count: 50, targetInFront: false },
  /*  9 */ { layout: 'peek', mover: 'stop' },
  /* 10 */ { layout: 'scatter', mover: 'byCharacter', count: 30, targetInFront: true },
  /* 11 */ { layout: 'scatter', mover: 'sway', count: 30, targetInFront: true },
  /* 12 */ { layout: 'scatter', mover: 'stop', count: 70, targetInFront: false },
  /* 13 */ { layout: 'scatter', mover: 'bounce', count: 24, targetInFront: true },
  /* 14 */ { layout: 'scatter', mover: 'stop', count: 60, targetInFront: false },
  /* 15 */ { layout: 'scatter', mover: 'byCharacter', count: 50, targetInFront: false },
  /* 16 */ { layout: 'scatter', mover: 'stop', count: 80, targetInFront: false },
  /* 17 */ { layout: 'scatter', mover: 'stop', count: 100, targetInFront: false },
  /* 18 */ { layout: 'scatter', mover: 'sway', count: 50, targetInFront: false },
  /* 19 */ { layout: 'scatter', mover: 'stop', count: 117, targetInFront: false },
];

/** [ROM] Plateaux où un personnage est posé 20 px au-dessus de la cible, et où le recherché n'est jamais le n°3. */
export const COVERED_TARGET_BOARDS = [14, 16, 17, 19];
/** [ROM] Plateau où le recherché est imposé. */
export const FORCED_WANTED: Record<number, number> = { 9: 1 };

/**
 * [DEVINÉ] sLuigiWantedPicks : 10 tirages par palier de chrono restant (< 10 s, 10–19 s, ≥ 20 s).
 * Quasi uniforme ; les deux cases en plus favorisent les personnages lents quand le temps presse.
 */
export const WANTED_PICKS = [
  [0, 1, 2, 3, 0, 1, 2, 3, 2, 1], // < 10 s : plus de 2 (le plus lent) et 1
  [0, 1, 2, 3, 0, 1, 2, 3, 1, 3], // 10–19 s
  [0, 1, 2, 3, 0, 1, 2, 3, 0, 3], // ≥ 20 s
];

// [ROM] Vitesses par personnage (index = personnage), en px/image.
export const DRIFT_SPEED = [3.5, 2.5, 1.5, 3]; // rebonds et défilement par personnage
export const COLUMN_SPEED = [3.5, 3.5, 3.5, 3.5];
export const SWAY_MAX_VX = [1, 0.75, 0.5, 0.875];
export const SWAY_ACCEL = [0.046875, 0.03125, 0.015625, 0.0390625];
export const SWAY_VY = [-3.5, 2.5, 2, 3]; // le personnage 0 monte, les autres descendent
