// Logique pure de Wanted! : un niveau est une fonction de (seed, niveau, chrono restant),
// et la position d'un personnage une fonction du temps écoulé depuis son point de départ.
import { mulberry32, randInt, type Rng } from '@nsmb/shared';
import {
  BOARDS,
  COLUMN_SPEED,
  COVERED_TARGET_BOARDS,
  DRIFT_SPEED,
  FORCED_WANTED,
  SWAY_ACCEL,
  SWAY_MAX_VX,
  SWAY_VY,
  WANTED_PICKS,
  type Board,
  type Mover,
} from './boards';

export const FACES = ['wanted.face.a', 'wanted.face.b', 'wanted.face.c', 'wanted.face.d'];
const FPS = 60;

/** Un personnage : point de départ (centre, px DS) et mouvement. */
export interface Picture {
  character: number;
  x: number;
  y: number;
  mover: Mover;
  /** Direction en radians (0 = droite, π/2 = bas). */
  angle: number;
}

export interface Level {
  board: number;
  wanted: number;
  /** Index de la cible dans `pictures`. L'index 0 est dessiné devant. */
  target: number;
  pictures: Picture[];
}

/** Une des 16 directions de la DS. */
const randomAngle = (rng: Rng) => (randInt(rng, 0, 15) * Math.PI) / 8;

/** Plateau du niveau : 1 à 20 dans l'ordre, puis tirage parmi 10..19 sans répéter le précédent. */
export function boardFor(seed: number, round: number): number {
  if (round <= BOARDS.length) return round - 1;
  const rng = mulberry32(seed);
  let board = BOARDS.length - 1;
  for (let r = BOARDS.length + 1; r <= round; r++) {
    let pick = randInt(rng, 0, 9);
    if (pick + 10 === board) pick = (pick + randInt(rng, 1, 9)) % 10;
    board = pick + 10;
  }
  return board;
}

function chooseWanted(rng: Rng, board: number, timeLeftMs: number): number {
  const seconds = Math.floor(timeLeftMs / 1000);
  const picks = WANTED_PICKS[seconds >= 20 ? 2 : seconds >= 10 ? 1 : 0];
  let wanted = picks[randInt(rng, 0, picks.length - 1)];
  if (board in FORCED_WANTED) wanted = FORCED_WANTED[board];
  if (COVERED_TARGET_BOARDS.includes(board) && wanted === 3) wanted = randInt(rng, 0, 2);
  return wanted;
}

/** Un autre personnage que le recherché, parmi les `kinds` premiers. */
function decoy(rng: Rng, wanted: number, kinds = 4): number {
  const c = randInt(rng, 0, kinds - 1);
  return c === wanted ? (c + randInt(rng, 1, kinds - 1)) % kinds : c;
}

export function makeLevel(seed: number, round: number, timeLeftMs: number): Level {
  const board = boardFor(seed, round);
  const def = BOARDS[board];
  const rng = mulberry32((seed ^ Math.imul(round, 0x9e3779b1)) >>> 0);
  const wanted = chooseWanted(rng, board, timeLeftMs);

  const { cells, target } = place(rng, def, board, wanted);

  // Directions partagées : une par colonne (haut/bas), une par personnage.
  const columnDown = Array.from({ length: 8 }, () => randInt(rng, 0, 1) === 1);
  const characterAngle = Array.from({ length: 4 }, () => randomAngle(rng));

  const pictures = cells.map((c, i): Picture => {
    let angle = 0;
    if (def.mover === 'column') angle = columnDown[i % 8] ? Math.PI / 2 : -Math.PI / 2;
    else if (def.mover === 'byCharacter') angle = characterAngle[c.character];
    else if (def.mover === 'bounce') angle = randomAngle(rng);
    return { ...c, mover: def.mover, angle };
  });
  return { board, wanted, target, pictures };
}

type Cell = { character: number; x: number; y: number };

function place(rng: Rng, def: Board, board: number, wanted: number): { cells: Cell[]; target: number } {
  const grid = (cols: number, rows: number, x0: number, y0: number, kinds = 4) => {
    const target = randInt(rng, 0, cols * rows - 1);
    const cells: Cell[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = cells.length;
        cells.push({ character: i === target ? wanted : decoy(rng, wanted, kinds), x: x0 + c * 32, y: y0 + r * 32 });
      }
    return { cells, target };
  };

  switch (def.layout) {
    case 'quad': {
      const first = randInt(rng, 0, 3);
      const cells = [0, 1, 2, 3].map((i) => ({
        character: (first + i) & 3,
        x: 112 + (i % 2) * 32,
        y: 80 + Math.floor(i / 2) * 32,
      }));
      return { cells, target: cells.findIndex((c) => c.character === wanted) };
    }
    case 'grid4':
      return grid(4, 4, 80, 48);
    case 'grid8':
      return grid(8, 6, 16, 16);
    case 'peek':
      return grid(8, 1, 16, -5, 3);
    case 'scatter':
      return scatter(rng, def, board, wanted);
  }
}

/** Dispersion sur une grille de 13 × 9 cases de 20 px : les sprites de 32 px se chevauchent. */
function scatter(rng: Rng, def: Board, board: number, wanted: number): { cells: Cell[]; target: number } {
  const used = new Set<number>();
  const jitter = () => randInt(rng, 0, 4) - 2;
  const at = (col: number, row: number, j: boolean) => ({
    x: col * 20 + 8 + (j ? jitter() : 0),
    y: row * 20 + 16 + (j ? jitter() : 0),
  });

  // La cible évite la zone colonnes 6–10 × lignes 4–8.
  let col: number, row: number;
  do {
    col = randInt(rng, 0, 12);
    row = randInt(rng, 0, 8);
  } while (col >= 6 && col <= 10 && row >= 4 && row <= 8);
  used.add(col * 9 + row);
  const targetCell: Cell = { character: wanted, ...at(col, row, !!def.targetInFront) };

  const others: Cell[] = [];
  for (let n = 1; n < (def.count ?? 2); n++) {
    let cell = -1;
    for (let attempt = 0; attempt < 100 && cell < 0; attempt++) {
      const c = randInt(rng, 0, 12) * 9 + randInt(rng, 0, 8);
      if (!used.has(c)) cell = c;
    }
    if (cell < 0) cell = [...Array(13 * 9).keys()].find((c) => !used.has(c)) ?? 0;
    used.add(cell);
    others.push({ character: decoy(rng, wanted), ...at(Math.floor(cell / 9), cell % 9, true) });
  }

  // Plateaux "couverts" : le dernier posé masque le haut de la cible.
  if (COVERED_TARGET_BOARDS.includes(board) && others.length) {
    Object.assign(others[others.length - 1], { x: targetCell.x, y: targetCell.y - 20 });
  }
  return def.targetInFront
    ? { cells: [targetCell, ...others], target: 0 }
    : { cells: [...others, targetCell], target: others.length };
}

// --- Mouvements -----------------------------------------------------------------------------

/** Ramène v dans [lo, hi[ en bouclant (sortie d'un côté, retour de l'autre). */
const wrap = (v: number, lo: number, hi: number) => lo + (((v - lo) % (hi - lo)) + (hi - lo)) % (hi - lo);
/** Rebond entre lo et hi. */
const reflect = (v: number, lo: number, hi: number) => {
  const span = hi - lo;
  const m = (((v - lo) % (2 * span)) + 2 * span) % (2 * span);
  return lo + (m > span ? 2 * span - m : m);
};
const wrapX = (x: number) => wrap(x, -16, 272);
const wrapY = (y: number) => wrap(y, -16, 208);

/**
 * Décalage horizontal du balancement après f images : la vitesse oscille en triangle entre
 * +max et -max (accélération constante). Chaque demi-période revient au point de départ.
 */
function swayOffset(character: number, f: number): number {
  const max = SWAY_MAX_VX[character];
  const accel = SWAY_ACCEL[character];
  const half = (2 * max) / accel;
  const k = Math.floor(f / half);
  const s = f - k * half;
  const sign = (k % 2 === 0 ? 1 : -1) * (character === 0 ? 1 : -1);
  return sign * (max * s - (accel * s * s) / 2);
}

/** Position d'un personnage `seconds` après son point de départ. */
export function positionAt(p: Picture, seconds: number): { x: number; y: number } {
  const f = seconds * FPS;
  switch (p.mover) {
    case 'stop':
      return { x: p.x, y: p.y };
    case 'sway':
      return { x: wrapX(p.x + swayOffset(p.character, f)), y: wrapY(p.y + SWAY_VY[p.character] * f) };
    case 'bounce': {
      const v = DRIFT_SPEED[p.character] * f;
      return { x: reflect(p.x + Math.cos(p.angle) * v, 8, 248), y: reflect(p.y + Math.sin(p.angle) * v, 8, 184) };
    }
    default: {
      const v = (p.mover === 'column' ? COLUMN_SPEED : DRIFT_SPEED)[p.character] * f;
      return { x: wrapX(p.x + Math.cos(p.angle) * v), y: wrapY(p.y + Math.sin(p.angle) * v) };
    }
  }
}

/** Après son clignotement, un personnage repart d'où il est (en rebond : dans une nouvelle direction). */
export function restartFrom(p: Picture, pos: { x: number; y: number }, rng: Rng): Picture {
  return { ...p, ...pos, angle: p.mover === 'bounce' ? randomAngle(rng) : p.angle };
}
