// Logique pure de Cache-cache fantômes, en pixels DS et en images à 60 i/s.
// Mécanique reprise du cache-cache de SM64DS (source décompilée : ../sm64ds-decomp/src/minigames/d_s_mg_teresa.cpp) :
// les fantômes se montrent, la lumière s'éteint, ils se cachent dans le noir et on frotte l'écran pour les débusquer.
import { mulberry32, randInt } from '@nsmb/shared';

export const W = 256;
export const H = 192;
/** Angle complet en unités DS (16 bits). */
const TURN = 0x10000;

/**
 * Niveaux 1 à 15, puis tirage parmi les modèles 11 à 14 (sans répéter le précédent), comme l'original.
 * count : nombre de fantômes ; kind : vitesse une fois caché (0 = immobile, 8 = lent, k = de plus en plus rapide) ;
 * burst : tous partent du même point en étoile au lieu d'être dispersés.
 * [DEVINÉ] sTeresaSpawnCounts / Kinds / Burst sont absentes du dépôt de décompilation (pas de ROM).
 */
export const PATTERNS: { count: number; kind: number; burst: boolean }[] = [
  { count: 1, kind: 0, burst: false },
  { count: 2, kind: 0, burst: false },
  { count: 2, kind: 1, burst: false },
  { count: 3, kind: 0, burst: true },
  { count: 3, kind: 1, burst: false },
  { count: 3, kind: 2, burst: true },
  { count: 4, kind: 1, burst: false },
  { count: 4, kind: 8, burst: true },
  { count: 4, kind: 2, burst: false },
  { count: 5, kind: 1, burst: true },
  { count: 5, kind: 2, burst: false },
  { count: 5, kind: 3, burst: true },
  { count: 6, kind: 2, burst: false },
  { count: 6, kind: 3, burst: true },
  { count: 7, kind: 2, burst: true },
];

/** Points testés autour du centre d'un fantôme pour savoir s'il est éclairé. [DEVINÉ] sTeresaBooTouchOffsets. */
const TOUCH_POINTS = [
  [0, 0],
  [4, 4],
  [-4, 4],
  [4, -4],
  [-4, -4],
];

/** Pinceau du frottement : disque de 8 px (l'original tamponne un motif 8 × 8, [DEVINÉ] sTeresaPaintMask). */
const BRUSH = 8;
const BRUSH_MASK: [number, number][] = [];
for (let j = 0; j < BRUSH; j++)
  for (let i = 0; i < BRUSH; i++)
    if ((i - 3.5) ** 2 + (j - 3.5) ** 2 <= 16) BRUSH_MASK.push([i - BRUSH / 2, j - BRUSH / 2]);

export type GhostState = 'fly' | 'fadeOut' | 'hidden' | 'found' | 'fadeIn' | 'fadeAway' | 'gone';

export interface Ghost {
  x: number;
  y: number;
  /** Direction, 0..0xffff (0 = droite, 0x4000 = bas). */
  heading: number;
  /** px par image. */
  speed: number;
  kind: number;
  state: GhostState;
  /** Opacité 0..16 pendant les fondus. */
  fade: number;
  timer: number;
  /** Fuite finale : images avant demi-tour. */
  turn: number;
  /** Ordre de découverte (0, 1, 2…), -1 si pas trouvé. */
  foundOrder: number;
}

/** Modèle du niveau : 0..14 dans l'ordre, puis tirage parmi 10..13 sans répéter le précédent. */
export function patternFor(seed: number, round: number): number {
  const level = round - 1;
  if (level < PATTERNS.length) return level;
  const rng = mulberry32(seed ^ 0x5bd1e995);
  let prev = PATTERNS.length - 1;
  for (let l = PATTERNS.length; l <= level; l++) {
    let k = randInt(rng, 0, 3);
    if (k + 10 === prev) k = (k + randInt(rng, 1, 3)) % 4;
    prev = k + 10;
  }
  return prev;
}

/** Les fantômes du niveau, à leur point de départ (SpawnBoos + Boo_StateAppear). */
export function makeGhosts(seed: number, round: number): Ghost[] {
  const { count, kind, burst } = PATTERNS[patternFor(seed, round)];
  const rng = mulberry32((seed ^ Math.imul(round, 0x85ebca6b)) >>> 0);
  const rand = (n: number) => randInt(rng, 0, n - 1);
  const phase = rand(16) << 12;
  const bx = rand(8) * 8 + 0x60;
  const by = rand(8) * 8 + 0x60;
  const speed = kind === 8 ? 0.625 : 0.75 + Math.max(0, kind - 1) * 0.125;

  return Array.from({ length: count }, (_, i): Ghost => {
    const scattered = !burst;
    return {
      x: scattered ? rand(15) * 16 + 16 : bx,
      y: scattered ? rand(11) * 16 + 16 : by,
      heading: scattered ? rand(32) << 11 : (Math.floor(TURN / count) * i + phase) & 0xffff,
      speed,
      kind,
      state: 'fly',
      fade: 16,
      timer: 0,
      turn: 0,
      foundOrder: -1,
    };
  });
}

const angle = (heading: number) => ((heading >> 4) * Math.PI * 2) / 4096;
export const facesRight = (g: Ghost) => Math.cos(angle(g.heading)) >= 0;

function move(g: Ghost) {
  const a = angle(g.heading);
  g.x += Math.cos(a) * g.speed;
  g.y += Math.sin(a) * g.speed;
  // Rebond sur les bords (BounceBooOffWalls).
  const x = Math.floor(g.x);
  const y = Math.floor(g.y);
  if (x + 8 > 254) [g.heading, g.x] = [(0x8000 - g.heading) & 0xffff, 246];
  else if (x - 8 < 2) [g.heading, g.x] = [(0x8000 - g.heading) & 0xffff, 10];
  if (y + 8 > 190) [g.heading, g.y] = [-g.heading & 0xffff, 182];
  else if (y - 8 < 2) [g.heading, g.y] = [-g.heading & 0xffff, 10];
}

/** Le noir de l'écran du bas : 1 = obscur, 0 = frotté. Ne se rallume jamais pendant le niveau. */
export class Darkness {
  readonly dark = new Uint8Array(W * H).fill(1);
  dirty = true;

  lit(x: number, y: number): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    return x >= 0 && x < W && y >= 0 && y < H && this.dark[y * W + x] === 0;
  }

  /** Trait de frottement (Mg_DrawLine) : le pinceau tamponné à chaque pixel du segment. */
  rub(x0: number, y0: number, x1: number, y1: number) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const cx = Math.round(x0 + ((x1 - x0) * s) / steps);
      const cy = Math.round(y0 + ((y1 - y0) * s) / steps);
      for (const [dx, dy] of BRUSH_MASK) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < W && y >= 0 && y < H) this.dark[y * W + x] = 0;
      }
    }
    this.dirty = true;
  }
}

/** Débusqué si le centre est éclairé et au moins 2 des 5 points testés (TouchTestBoo). */
function isUncovered(g: Ghost, d: Darkness): boolean {
  if (!d.lit(g.x, g.y)) return false;
  return TOUCH_POINTS.filter(([dx, dy]) => d.lit(g.x - dx, g.y - dy)).length >= 2;
}

/** Un fantôme mobile pris dans la lumière fait demi-tour (CountRubbedTiles). */
function touchesLight(g: Ghost, d: Darkness): boolean {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (d.lit(g.x - 4 + x, g.y - 4 + y)) return true;
  return false;
}

/** Fondus de fin de niveau, raccourcis pour tenir dans l'écran de fin (original : 4 images par pas, 128 de fuite). */
const FADE_STEP = 2;
const ESCAPE_TURN = 64;

/**
 * Avance un fantôme d'une image. Renvoie true s'il vient d'être débusqué.
 * `foundSoFar` sert à numéroter l'ordre de découverte.
 */
export function stepGhost(g: Ghost, d: Darkness, foundSoFar: number): boolean {
  switch (g.state) {
    case 'fly':
      move(g);
      return false;
    case 'fadeOut':
      // La lumière vient de s'éteindre : il disparaît en 16 pas de 4 images, toujours en mouvement.
      move(g);
      if (++g.timer >= 4) {
        g.timer = 0;
        if (--g.fade <= 0) g.state = 'hidden';
      }
      return false;
    case 'hidden':
      if (g.kind !== 0) move(g);
      if (g.kind !== 0 && touchesLight(g, d)) g.heading = (g.heading + 0x8000) & 0xffff;
      if (!isUncovered(g, d)) return false;
      g.state = 'found';
      g.fade = 16;
      g.foundOrder = foundSoFar;
      return true;
    case 'fadeIn':
      // Fin de niveau : les fantômes restants réapparaissent par-dessus le noir…
      move(g);
      if (++g.timer >= FADE_STEP) {
        g.timer = 0;
        if (++g.fade >= 16) [g.state, g.turn] = ['fadeAway', ESCAPE_TURN];
      }
      return false;
    case 'fadeAway':
      // … filent un moment, font demi-tour et s'effacent.
      move(g);
      if (g.turn > 0) {
        if (--g.turn === 0) g.heading = (g.heading + 0x8000) & 0xffff;
        return false;
      }
      if (++g.timer >= FADE_STEP) {
        g.timer = 0;
        if (--g.fade <= 0) g.state = 'gone';
      }
      return false;
    default:
      return false;
  }
}
