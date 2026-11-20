// Logique pure de Wanted! : tout l'état est une fonction de (seed, temps écoulé depuis le Go).
import { mulberry32, pick, randInt } from '@nsmb/shared';

export const FACES = ['wanted.face.a', 'wanted.face.b', 'wanted.face.c', 'wanted.face.d'];

export type Motion = 'still' | 'drift' | 'bounce';

export interface Character {
  face: number;
  /** Position de départ et vitesse, en coordonnées normalisées [0, 1] (vitesse par seconde). */
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Level {
  wanted: number;
  motion: Motion;
  /** Grille (still/drift) ; pour bounce, sert seulement à dimensionner les personnages. */
  cols: number;
  rows: number;
  characters: Character[];
}

export function makeLevel(seed: number): Level {
  const rng = mulberry32(seed);
  const wanted = randInt(rng, 0, FACES.length - 1);
  const others = FACES.map((_, i) => i).filter((i) => i !== wanted);
  const motion = pick(rng, ['still', 'drift', 'bounce'] as const);
  const cols = randInt(rng, 4, 6);
  const rows = randInt(rng, 4, 7);
  const count = cols * rows;
  const wantedIndex = randInt(rng, 0, count - 1);

  const angle = rng() * Math.PI * 2;
  const speed = 0.06 + rng() * 0.1;

  const characters: Character[] = [];
  for (let i = 0; i < count; i++) {
    const face = i === wantedIndex ? wanted : pick(rng, others);
    if (motion === 'bounce') {
      const a = rng() * Math.PI * 2;
      const s = 0.1 + rng() * 0.2;
      characters.push({ face, x: rng(), y: rng(), vx: Math.cos(a) * s, vy: Math.sin(a) * s });
    } else {
      const jitter = motion === 'still' ? 0.25 : 0;
      characters.push({
        face,
        x: ((i % cols) + 0.5 + (rng() - 0.5) * jitter) / cols,
        y: (Math.floor(i / cols) + 0.5 + (rng() - 0.5) * jitter) / rows,
        vx: motion === 'drift' ? Math.cos(angle) * speed : 0,
        vy: motion === 'drift' ? Math.sin(angle) * speed : 0,
      });
    }
  }

  // Ordre d'affichage mélangé (le recherché n'est pas toujours au-dessus).
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return { wanted, motion, cols, rows, characters };
}

const wrap = (v: number) => v - Math.floor(v);
/** Aller-retour entre 0 et 1 (rebond sur les bords). */
const reflect = (v: number) => {
  const m = v - Math.floor(v / 2) * 2;
  return m > 1 ? 2 - m : m;
};

/** Position normalisée d'un personnage à l'instant t (secondes depuis le Go). */
export function positionAt(c: Character, motion: Motion, t: number): { x: number; y: number } {
  if (motion === 'drift') return { x: wrap(c.x + c.vx * t), y: wrap(c.y + c.vy * t) };
  if (motion === 'bounce') return { x: reflect(c.x + c.vx * t), y: reflect(c.y + c.vy * t) };
  return { x: c.x, y: c.y };
}
