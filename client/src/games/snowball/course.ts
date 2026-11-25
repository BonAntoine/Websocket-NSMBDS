// Circuit de la descente : portage de dScMgSnowball_c::BuildCourse / HitsWall / HitsBreakable
// (../sm64ds-decomp/src/minigames/d_s_mg_snowball.cpp), variante courte du solo, en pixels DS.
import { mulberry32, randInt } from '@nsmb/shared';

export const LANES = 16;
export const TILE = 16;
/** Rangées de 16 px (mScrollLimit, variante courte). */
export const ROWS = 0x178;
export const COURSE_H = ROWS * TILE;
/** Départ et ligne de but (mStartY, mGoalY). La course va vers les y décroissants. */
export const START_Y = 0x1740;
export const GOAL_Y = 0x190;
/** La boule passe la ligne quand son bord avant franchit cette ordonnée. */
export const FINISH_Y = GOAL_Y + 16;
/** Écran du bas = vue décalée de 0x110 px : 80 px restent cachés entre les deux écrans, comme sur DS. */
export const BOTTOM_VIEW_OFFSET = 0x110;
/** La boule est maintenue à 400 px sous le haut de la vue (sur l'écran du bas). */
export const BALL_VIEW_Y = 0x190;
/** Bas de la zone jouable, sous le haut de la vue : on ne peut pas redescendre hors de l'écran du bas. */
export const VIEW_BOTTOM = 0x1d0;
export const SCROLL_MAX = COURSE_H - VIEW_BOTTOM;

export const T = {
  FLOOR: 0,
  SOLID: 1,
  OBSTACLE: 12,
  GOAL: 13,
  /** Décors posés sur la roche (0x1d..0x20). */
  DECO: 0x1d,
} as const;

export interface Course {
  /** tiles[lane * ROWS + row] */
  tiles: Uint8Array;
  /** Obstacles qui font perdre de la neige (mArray1), centre en px. */
  obstacles: { x: number; y: number }[];
  /** Décors hors piste (mArray2), purement visuels. kind 3 : décor de bord, orienté selon le côté. */
  props: { x: number; y: number; kind: number }[];
}

export const tileAt = (c: Course, lane: number, row: number) => c.tiles[lane * ROWS + row];

export function buildCourse(seed: number): Course {
  const rng = mulberry32((seed ^ 0x3c6ef372) >>> 0);
  const R = (n: number) => randInt(rng, 0, n - 1); // MgRandom(n)
  const tiles = new Uint8Array(LANES * ROWS);
  const set = (lane: number, row: number, t: number) => (tiles[lane * ROWS + row] = t);
  const obstacles: Course['obstacles'] = [];
  const props: Course['props'] = [];

  const narrow = 0xa;
  const wide = 0xd;
  const margin = 7;
  const goalRow = GOAL_Y / 16;
  let leftKind = 0;
  let rightKind = 0;
  let left = 2;
  let right = 0xd;
  let cooldown = 0x12;

  // Le couloir est creusé du départ (bas) vers le but (haut) ; ses bords avancent d'une colonne à la fois.
  // kind : 0 tout droit, 1 resserre, 2 élargit.
  for (let row = ROWS - 1; row >= 0; row--) {
    const prevLeft = leftKind;
    const prevRight = rightKind;
    leftKind = R(3);
    rightKind = R(3);

    if (row >= ROWS - 8) leftKind = rightKind = 0;
    else if (row <= goalRow) leftKind = rightKind = 0;
    else if (right - left <= narrow) {
      if (leftKind === 1) leftKind = 0;
      if (rightKind === 1) rightKind = 0;
    } else if (right - left === narrow + 1 && leftKind === 1 && rightKind === 1) leftKind = rightKind = 0;
    else if (right - left >= wide) {
      if (leftKind === 2) leftKind = 0;
      if (rightKind === 2) rightKind = 0;
    } else if (right - left === wide - 1 && leftKind === 2 && rightKind === 2) leftKind = rightKind = 0;

    if (leftKind === 1) {
      if (prevLeft === 2) leftKind = 0;
      else if (left >= margin) {
        if (prevLeft === 0) {
          leftKind = 2;
          left--;
        } else leftKind = 0;
      }
    } else if (leftKind === 2) {
      if (prevLeft === 1) leftKind = 0;
      else if (left < 1) leftKind = prevLeft === 0 ? 1 : 0;
      else left--;
    }

    if (rightKind === 1) {
      if (prevRight === 2) rightKind = 0;
      else if (right <= 0x10 - margin) {
        if (prevRight === 0) {
          rightKind = 2;
          right++;
        } else rightKind = 0;
      }
    } else if (rightKind === 2) {
      if (prevRight === 1) rightKind = 0;
      else if (right >= 0xf) rightKind = prevRight === 0 ? 1 : 0;
      else right++;
    }

    for (let k = 0; k < left; k++) set(k, row, T.SOLID);
    if (leftKind === 0) [tiles[left * ROWS + row], tiles[(left + 1) * ROWS + row]] = [2, 0];
    else if (leftKind === 1) [tiles[left * ROWS + row], tiles[(left + 1) * ROWS + row]] = [3, 4];
    else [tiles[left * ROWS + row], tiles[(left + 1) * ROWS + row]] = [5, 6];
    for (let i = left + 2; i < right - 1; i++) set(i, row, T.FLOOR);
    if (rightKind === 0) [tiles[(right - 1) * ROWS + row], tiles[right * ROWS + row]] = [0, 7];
    else if (rightKind === 1) [tiles[(right - 1) * ROWS + row], tiles[right * ROWS + row]] = [8, 9];
    else [tiles[(right - 1) * ROWS + row], tiles[right * ROWS + row]] = [10, 11];
    for (let i = right + 1; i < 16; i++) set(i, row, T.SOLID);

    if (leftKind === 1) left++;
    if (rightKind === 1) right--;

    // Obstacles, espacés d'au moins 16 rangées (cooldown).
    if (row > goalRow + 0x11) {
      if (cooldown > 0) cooldown--;
      else {
        let lane = -1;
        if (right - left >= 0xd) {
          if (R(16) === 0) lane = left + R(right - left - 3) + 2;
        } else if (right - left >= 0xa) {
          if (R(16) === 0) lane = R(2) === 0 ? left + 2 : right - 2;
        }
        if (lane >= 0) {
          set(lane, row, T.OBSTACLE);
          cooldown = 0x10;
          if (obstacles.length < 128) obstacles.push({ x: lane * 16 + 8, y: row * 16 + 8 });
        }
      }
    }
  }

  // Les deux rangées du but.
  for (let row = goalRow - 1; row <= goalRow; row++) {
    for (let lane = 0; lane < 16; lane++) {
      const t = tileAt({ tiles, obstacles, props }, lane, row);
      if (t === 0) set(lane, row, T.GOAL);
      else if (t === 2) set(lane, row, 14);
      else if (t === 7) set(lane, row, 15);
    }
  }

  // Décors sur la roche.
  for (let row = ROWS - 1; row >= 0; row--) {
    for (let lane = 0; lane < 16; lane++) {
      if (tiles[lane * ROWS + row] !== T.SOLID) continue;
      const roll = R(16);
      if (roll < 4) set(lane, row, T.DECO + roll);
      else if (roll === 4 && props.length < 128) props.push({ x: lane * 16 + 8, y: row * 16 + 8, kind: R(4) });
    }
  }

  return { tiles, obstacles, props };
}

/** Partie pleine d'une tuile (HitsWall), lx/ly : position dans la tuile 0..15. */
export function solidIn(tile: number, lx: number, ly: number): boolean {
  const sum = lx + ly;
  const diff = lx - ly;
  switch (tile) {
    case 1:
      return true;
    case 2:
    case 14:
      return (lx & 8) === 0;
    case 3:
      return sum < 0x18;
    case 4:
      return sum < 8;
    case 5:
      return diff < 8;
    case 6:
      return diff < -8;
    case 7:
    case 15:
      return (lx & 8) !== 0;
    case 8:
      return diff >= 8;
    case 9:
      return diff >= -8;
    case 10:
      return sum >= 0x18;
    case 11:
      return sum >= 8;
    default:
      return false; // sol, obstacle (testé à part), but, et même les décors (comme l'original)
  }
}

/** Le point (x, y) touche-t-il un mur ? scrollY : haut de la vue du joueur (on ne peut pas redescendre en dessous). */
export function hitsWall(c: Course, x: number, y: number, scrollY: number): boolean {
  if (y < -2 || y >= COURSE_H || y >= scrollY + VIEW_BOTTOM) return true;
  if (x < 0 || x >= 256) return true;
  const px = Math.floor(x);
  const py = Math.floor(y);
  const tile = tileAt(c, px >> 4, py < 0 ? 0 : py >> 4);
  return solidIn(tile, px & 15, py & 15);
}

/** Le point (x, y) touche-t-il un obstacle ? (ellipse de 16 × 8 px autour de son centre) */
export function hitsObstacle(c: Course, x: number, y: number): boolean {
  for (const o of c.obstacles) {
    if (x >= o.x + 16 || x < o.x - 16 || y >= o.y + 8 || y < o.y - 8) continue;
    const dx = o.x - x;
    const dy = o.y - y;
    if (dx * dx + (dy * dy) / 4 > 256) continue;
    return true;
  }
  return false;
}
