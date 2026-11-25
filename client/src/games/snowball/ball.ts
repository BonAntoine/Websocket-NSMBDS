// Physique de la boule : portage de dScMgSnowball_c::Behavior (état 1 « course », 2-3 « arrivée », 4 « fonte »)
// et UpdateSnowball (anneau de 32 sondes), en pixels DS et en images à 60 i/s.
import {
  BALL_VIEW_Y,
  FINISH_Y,
  SCROLL_MAX,
  hitsObstacle,
  hitsWall,
  type Course,
} from './course';

/** Vitesse max (0x8000) en px/image. */
export const MAX_SPEED = 8;
/** Rayon de départ et minimum (0x4000), maximum (0x37000), en px. */
export const MIN_SIZE = 4;
export const MAX_SIZE = 55;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rayon, px. */
  size: number;
  /** Haut de la vue du joueur ; ne fait que remonter. */
  scrollY: number;
  /** Remontée à « rembourser » avant de regrossir en descente (mUphillDebt). */
  debt: number;
}

export interface StepEvents {
  /** Choc rapide contre un mur. */
  wall: boolean;
  /** Obstacle touché à plus de 0,5 px/image : gerbe de neige à (hitX, hitY). */
  obstacle: boolean;
  hitX: number;
  hitY: number;
  finished: boolean;
}

export const speedOf = (b: { vx: number; vy: number }) => Math.hypot(b.vx, b.vy);

export function newBall(x: number, y: number): Ball {
  return { x, y, vx: 0, vy: 0, size: MIN_SIZE, scrollY: Math.min(SCROLL_MAX, y - BALL_VIEW_Y), debt: 0 };
}

/** Ramène la vitesse à `len` en gardant sa direction. */
function setSpeed(b: Ball, len: number) {
  const s = speedOf(b);
  if (s === 0) return;
  b.vx = (b.vx / s) * len;
  b.vy = (b.vy / s) * len;
}

/**
 * Glissé du doigt sur l'écran tactile depuis l'image précédente (px DS).
 * La composante perpendiculaire à la trajectoire compte ×4 ; on ne peut pas tirer la boule en arrière.
 */
export function steer(b: Ball, dx: number, dy: number) {
  let sx = dx / 296;
  let sy = dy / 296;
  if (Math.hypot(sx, sy) >= 0.25) return; // saut du doigt : ignoré
  const h = b.vx === 0 && b.vy === 0 ? 0 : Math.atan2(b.vy, b.vx);
  const c = Math.cos(h);
  const s = Math.sin(h);
  // Dans le repère de la trajectoire (x = vers l'avant), on amplifie le latéral.
  const fx = c * sx + s * sy;
  const fy = (-s * sx + c * sy) * 4;
  sx = c * fx - s * fy;
  sy = s * fx + c * fy;
  if (b.vy >= 0 && sy > 0) sy = 0;
  if (sy > 0 && sy >= -b.vy) {
    b.vy = 0;
    sy = 0;
  }
  b.vx += sx;
  b.vy += sy;
}

/** UpdateSnowball : sondes autour de la boule, sortie des murs, perte de neige sur les obstacles, rebond. */
function collide(b: Ball, c: Course, ev: StepEvents) {
  const push = new Uint8Array(32);
  const speed = speedOf(b);
  let obstacle = false;
  for (let pass = 0; pass < 33; pass++) {
    const hit = new Uint8Array(32);
    let any = false;
    for (let j = 0; j < 32; j++) {
      const a = (j * Math.PI * 2) / 32;
      const sx = b.x - Math.sin(a) * b.size;
      const sy = b.y + Math.cos(a) * b.size;
      if (hitsWall(c, sx, sy, b.scrollY)) {
        if (speed >= 0.5) ev.wall = true;
      } else if (hitsObstacle(c, sx, sy)) {
        obstacle = true;
      } else continue;
      hit[j] = push[j] = 1;
      any = true;
      [ev.hitX, ev.hitY] = [sx, sy];
    }
    if (!any) break;
    // Sortie : à l'opposé de la moyenne des sondes touchées, au plus 0,5 px (ou la vitesse si plus lente).
    let rx = 0;
    let ry = 0;
    for (let j = 0; j < 32; j++) {
      if (!hit[j]) continue;
      const a = (j * Math.PI * 2) / 32;
      rx -= Math.sin(a);
      ry += Math.cos(a);
    }
    const rl = Math.hypot(rx, ry);
    if (rl > 0) {
      const len = Math.min(speed, 0.5);
      b.x -= (rx / rl) * len;
      b.y -= (ry / rl) * len;
    }
  }

  if (obstacle) {
    // Perte de neige proportionnelle à la vitesse.
    b.size = Math.max(MIN_SIZE, b.size - speed);
    if (speed >= 0.5) ev.obstacle = true;
    ev.wall = false;
  }

  // Rebond sur la normale moyenne des contacts.
  let nx = 0;
  let ny = 0;
  for (let k = 0; k < 32; k++) {
    if (!push[k]) continue;
    const a = (k * Math.PI * 2) / 32;
    nx += Math.sin(a);
    ny -= Math.cos(a);
  }
  const nl = Math.hypot(nx, ny);
  if (nl === 0) return;
  nx /= nl;
  ny /= nl;
  let normal = b.vx * nx + b.vy * ny;
  if (obstacle) {
    normal *= 1.5;
    b.vx -= normal * nx;
    b.vy -= normal * ny;
    // Freinage marqué (et léger recul si on allait tout droit vers le but).
    const s = speedOf(b);
    const sinH = s === 0 ? 0 : b.vy / s;
    b.vx = b.vx / 8 + (b.vx * sinH) / 4;
    b.vy = b.vy / 8 + (b.vy * sinH) / 4;
  } else {
    normal *= 1.125;
    b.vx -= normal * nx;
    b.vy -= normal * ny;
  }
}

/** La vue suit la boule vers le but, sans jamais redescendre. */
function scroll(b: Ball) {
  const target = b.y - BALL_VIEW_Y;
  b.scrollY = Math.max(0, Math.min(SCROLL_MAX, Math.min(b.scrollY, target)));
}

/** Une image de course (état 1). drag : glissé du doigt depuis l'image précédente, null sans glissé. */
export function stepRace(b: Ball, c: Course, drag: { dx: number; dy: number } | null): StepEvents {
  const ev: StepEvents = { wall: false, obstacle: false, hitX: 0, hitY: 0, finished: false };
  const prevY = b.y;
  if (drag) steer(b, drag.dx, drag.dy);
  if (speedOf(b) >= MAX_SPEED) setSpeed(b, MAX_SPEED);
  collide(b, c, ev);
  b.x += b.vx;
  b.y += b.vy;

  // Grossit en descendant (1 px de rayon tous les 128 px), sauf sur la partie déjà remontée.
  const dy = b.y - prevY;
  if (dy >= 0) b.debt += dy;
  else if (b.debt > 0) {
    b.debt += dy;
    if (b.debt < 0) {
      b.size += -b.debt / 128;
      b.debt = 0;
    }
  } else b.size += -dy / 128;
  b.size = Math.min(MAX_SIZE, b.size);

  scroll(b);
  ev.finished = b.y - b.size < FINISH_Y;
  return ev;
}

/** Après la ligne (états 2-3) : plus de contrôle, la boule ralentit une fois en haut du circuit. */
export function stepFinished(b: Ball, c: Course): StepEvents {
  const ev: StepEvents = { wall: false, obstacle: false, hitX: 0, hitY: 0, finished: true };
  collide(b, c, ev);
  let s = speedOf(b);
  if (s > 0) {
    if (b.y < 192) s -= 1 / 32;
    if (s < 0) b.vx = b.vy = 0;
    else setSpeed(b, s);
  }
  b.x += b.vx;
  b.y += b.vy;
  scroll(b);
  return ev;
}

/** Temps écoulé (état 4) : la boule s'arrête, puis fond d'1 px par image après 60 images. Renvoie true une fois fondue. */
export function stepMelt(b: Ball, frame: number): boolean {
  b.vx = b.vy = 0;
  if (frame < 60) return false;
  b.size = Math.max(0, b.size - 1);
  return b.size === 0;
}

/** Part du parcours effectuée (0..1), mesurée au bord avant de la boule. */
export function progressOf(y: number, size: number, startY: number): number {
  return Math.min(1, Math.max(0, (startY - (y - size)) / (startY - FINISH_Y)));
}
