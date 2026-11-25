// Boule « 3D » sans moteur 3D : une texture équirectangulaire projetée sur un disque éclairé, qui tourne
// comme une vraie sphère qui roule. Calculé pixel par pixel dans un petit canvas (≈ 2 300 pixels), puis
// affiché comme une texture Pixi : fonctionne sur tous les renderers, sans shader.
import { Texture } from 'pixi.js';
import { texture } from '../../assets/assets';

const RES = 48;
/** Lumière venant du haut-gauche, vers l'écran. */
const LIGHT = (() => {
  const l = [-0.45, -0.55, 0.7];
  const n = Math.hypot(...l);
  return l.map((v) => v / n);
})();

export interface TextureData {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

/** Pixels d'une texture du manifeste, redimensionnée à w × h. */
export function textureData(key: string, w = 64, h = 32): TextureData {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(texture(key).source.resource as CanvasImageSource, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

// Normale et éclairage de chaque pixel du disque, calculés une fois.
const NORMALS: { i: number; n: [number, number, number]; light: number; alpha: number }[] = [];
for (let py = 0; py < RES; py++) {
  for (let px = 0; px < RES; px++) {
    const u = ((px + 0.5) / RES) * 2 - 1;
    const v = ((py + 0.5) / RES) * 2 - 1;
    const r = Math.hypot(u, v);
    const alpha = Math.min(1, Math.max(0, (1 - r) * (RES / 2) + 0.5)); // bord adouci
    if (alpha <= 0) continue;
    const z = Math.sqrt(Math.max(0, 1 - Math.min(1, r) ** 2));
    const n: [number, number, number] = [u, v, z];
    const d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
    NORMALS.push({ i: (py * RES + px) * 4, n, light: 0.5 + 0.55 * Math.max(0, d), alpha });
  }
}

export class SphereView {
  readonly texture: Texture;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pixels: ImageData;
  /** Orientation (objet → écran), matrice 3 × 3 en lignes. */
  private m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private dirty = true;
  private updates = 0;

  constructor(private readonly tex: TextureData) {
    this.canvas.width = this.canvas.height = RES;
    this.ctx = this.canvas.getContext('2d')!;
    this.pixels = this.ctx.createImageData(RES, RES);
    this.texture = Texture.from(this.canvas);
  }

  /**
   * Fait rouler la boule d'un déplacement (dx, dy) à l'écran, pour un rayon `radius` :
   * rotation de dist / radius autour de l'axe perpendiculaire au déplacement (le haut de la boule avance avec elle).
   */
  roll(dx: number, dy: number, radius: number) {
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4 || radius <= 0) return;
    const [kx, ky] = [-dy / dist, dx / dist];
    const a = dist / radius;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const t = 1 - c;
    // Rotation d'axe (kx, ky, 0) (Rodrigues), appliquée à gauche.
    const r = [c + kx * kx * t, kx * ky * t, ky * s, kx * ky * t, c + ky * ky * t, -kx * s, -ky * s, kx * s, c];
    const m = this.m;
    const out = new Array<number>(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) out[i * 3 + j] = r[i * 3] * m[j] + r[i * 3 + 1] * m[3 + j] + r[i * 3 + 2] * m[6 + j];
    this.m = ++this.updates % 120 === 0 ? orthonormalize(out) : out;
    this.dirty = true;
  }

  /** Redessine la boule si elle a tourné. */
  draw() {
    if (!this.dirty) return;
    this.dirty = false;
    const { m } = this;
    const { data, w, h } = this.tex;
    const out = this.pixels.data;
    for (const { i, n, light, alpha } of NORMALS) {
      // Point de la sphère dans le repère de la boule : transposée de m × normale à l'écran.
      const ox = m[0] * n[0] + m[3] * n[1] + m[6] * n[2];
      const oy = m[1] * n[0] + m[4] * n[1] + m[7] * n[2];
      const oz = m[2] * n[0] + m[5] * n[1] + m[8] * n[2];
      const tu = Math.floor((Math.atan2(ox, oz) / (Math.PI * 2) + 0.5) * w) % w;
      const tv = Math.min(h - 1, Math.floor((Math.asin(Math.max(-1, Math.min(1, oy))) / Math.PI + 0.5) * h));
      const ti = (tv * w + tu) * 4;
      out[i] = Math.min(255, data[ti] * light);
      out[i + 1] = Math.min(255, data[ti + 1] * light);
      out[i + 2] = Math.min(255, data[ti + 2] * light);
      out[i + 3] = 255 * alpha;
    }
    this.ctx.putImageData(this.pixels, 0, 0);
    this.texture.source.update();
  }

  destroy() {
    this.texture.destroy(true);
  }
}

function orthonormalize(m: number[]): number[] {
  const a = [m[0], m[1], m[2]];
  const la = Math.hypot(...a);
  const x = a.map((v) => v / la);
  const b = [m[3], m[4], m[5]];
  const d = b[0] * x[0] + b[1] * x[1] + b[2] * x[2];
  const yb = b.map((v, i) => v - d * x[i]);
  const lb = Math.hypot(...yb);
  const y = yb.map((v) => v / lb);
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return [...x, ...y, ...z];
}
