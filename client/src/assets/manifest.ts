// Manifeste unique des graphismes. Le code de jeu ne demande que des clés.
// Pour remplacer un visuel : déposer le fichier dans client/public/assets/ et changer l'entrée ici.
//   { file: 'perso-rouge.png' }                        → image PNG/SVG
//   { sheet: 'persos.json', frame: 'rouge.png' }       → frame d'une spritesheet (format Pixi/TexturePacker)
//   { shape: 'circle', color: '#e63946', letter: 'A' } → forme générée (prototype)

export type Shape = 'circle' | 'square' | 'triangle' | 'star' | 'diamond';

export type AssetDef =
  | { shape: Shape; color: string; letter?: string }
  | { file: string }
  | { sheet: string; frame: string };

export const manifest: Record<string, AssetDef> = {
  'wanted.face.a': { shape: 'circle', color: '#e63946', letter: 'A' },
  'wanted.face.b': { shape: 'square', color: '#2a9d8f', letter: 'B' },
  'wanted.face.c': { shape: 'triangle', color: '#f4a261', letter: 'C' },
  'wanted.face.d': { shape: 'star', color: '#7b61ff', letter: 'D' },
};
