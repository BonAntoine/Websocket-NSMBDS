import { Assets, Texture, type Spritesheet } from 'pixi.js';
import { manifest, type AssetDef, type Shape } from './manifest';

const SIZE = 128;
const BASE = `${import.meta.env.BASE_URL}assets/`;
const cache = new Map<string, Texture>();

/** Charge toutes les textures du manifeste (une seule fois). */
export async function loadAssets(): Promise<void> {
  await Promise.all(
    Object.entries(manifest).map(async ([key, def]) => {
      if (!cache.has(key)) cache.set(key, await load(def));
    }),
  );
}

/** Texture associée à une clé du manifeste. */
export function texture(key: string): Texture {
  const t = cache.get(key);
  if (!t) throw new Error(`Asset inconnu ou non chargé : ${key}`);
  return t;
}

async function load(def: AssetDef): Promise<Texture> {
  if ('shape' in def) return Texture.from(drawShape(def.shape, def.color, def.letter));
  if ('file' in def) return Assets.load<Texture>(BASE + def.file);
  const sheet = await Assets.load<Spritesheet>(BASE + def.sheet);
  return sheet.textures[def.frame];
}

// Dessin en Canvas 2D : la texture ne dépend d'aucun renderer Pixi, réutilisable partout.
function drawShape(shape: Shape, color: string, letter?: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const c = SIZE / 2;
  const r = SIZE / 2 - 6;

  ctx.beginPath();
  if (shape === 'circle') ctx.arc(c, c, r, 0, Math.PI * 2);
  else if (shape === 'square') ctx.roundRect(c - r * 0.9, c - r * 0.9, r * 1.8, r * 1.8, 16);
  else polygon(ctx, shape === 'star' ? 10 : shape === 'triangle' ? 3 : 4, c, r, shape === 'star' ? 0.5 : 1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1d1b2f';
  ctx.stroke();

  if (letter) {
    ctx.font = `bold ${SIZE * 0.42}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeText(letter, c, c + (shape === 'triangle' ? r * 0.25 : 4));
    ctx.fillStyle = '#fff';
    ctx.fillText(letter, c, c + (shape === 'triangle' ? r * 0.25 : 4));
  }
  return canvas;
}

/** Polygone régulier (ou étoile si innerRatio < 1, un sommet sur deux rentré). */
function polygon(ctx: CanvasRenderingContext2D, points: number, c: number, r: number, innerRatio: number) {
  for (let i = 0; i < points; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / points;
    const rr = i % 2 === 1 ? r * innerRatio : r;
    ctx.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
  }
}
