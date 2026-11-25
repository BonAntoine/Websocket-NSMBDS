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

/** URL d'image d'une clé du manifeste, pour l'afficher hors du canvas (menus HTML). */
export function assetUrl(key: string): string {
  const def = manifest[key];
  if (!def) throw new Error(`Asset inconnu : ${key}`);
  if ('file' in def) return BASE + def.file;
  if ('shape' in def) return drawShape(def.shape, def.color, def.letter).toDataURL();
  throw new Error(`Asset ${key} : une icône de menu doit être un fichier ou une forme, pas une spritesheet.`);
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
  if (shape === 'pattern') {
    pattern(ctx, color);
    return canvas;
  }
  const c = SIZE / 2;
  const r = SIZE / 2 - 6;

  ctx.beginPath();
  if (shape === 'ghost') ghost(ctx, c, r);
  else if (shape === 'circle') ctx.arc(c, c, r, 0, Math.PI * 2);
  else if (shape === 'square') ctx.roundRect(c - r * 0.9, c - r * 0.9, r * 1.8, r * 1.8, 16);
  else polygon(ctx, shape === 'star' ? 10 : shape === 'triangle' ? 3 : 4, c, r, shape === 'star' ? 0.5 : 1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1d1b2f';
  ctx.stroke();

  if (shape === 'ghost') {
    // Yeux.
    ctx.fillStyle = '#1d1b2f';
    for (const dx of [-0.3, 0.3]) {
      ctx.beginPath();
      ctx.ellipse(c + dx * r, c - 0.15 * r, 0.11 * r, 0.2 * r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

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

/** Motif plein et moucheté (taches claires et sombres), raccordé sur ses bords pour être répété. */
function pattern(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  let h = 0x2545f491;
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296;
  for (let i = 0; i < 70; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const r = 2 + rand() * 7;
    ctx.fillStyle = i % 2 ? 'rgba(29, 27, 47, 0.13)' : 'rgba(255, 255, 255, 0.35)';
    for (const dx of [-SIZE, 0, SIZE])
      for (const dy of [-SIZE, 0, SIZE]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
  }
}

/** Fantôme générique : dôme, corps droit, bas ondulé (3 pointes). */
function ghost(ctx: CanvasRenderingContext2D, c: number, r: number) {
  const left = c - r * 0.85;
  const right = c + r * 0.85;
  const bottom = c + r * 0.95;
  ctx.arc(c, c - r * 0.1, r * 0.85, Math.PI, 0);
  ctx.lineTo(right, bottom);
  const w = (right - left) / 3;
  for (let i = 0; i < 3; i++) {
    const x = right - i * w;
    ctx.quadraticCurveTo(x - w / 4, bottom - r * 0.3, x - w / 2, bottom - r * 0.1);
    ctx.quadraticCurveTo(x - (3 * w) / 4, bottom - r * 0.3, x - w, bottom);
  }
}

/** Polygone régulier (ou étoile si innerRatio < 1, un sommet sur deux rentré). */
function polygon(ctx: CanvasRenderingContext2D, points: number, c: number, r: number, innerRatio: number) {
  for (let i = 0; i < points; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / points;
    const rr = i % 2 === 1 ? r * innerRatio : r;
    ctx.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
  }
}
