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

// Sons, même principe :
//   { file: 'voix-a.mp3' }                                   → fichier audio de client/public/assets/
//   { synth: 'square', notes: [[523, 70], [784, 110]] }      → bip synthétisé : [fréquence Hz (0 = silence), durée ms]
//   slide: true                                              → glissando d'une note à la suivante
export type SoundDef =
  | { file: string; volume?: number }
  | { synth: OscillatorType; notes: [number, number][]; slide?: boolean; volume?: number };

export const sounds: Record<string, SoundDef> = {
  'wanted.voice.a': { synth: 'square', notes: [[523, 70], [784, 120]] },
  'wanted.voice.b': { synth: 'triangle', notes: [[392, 80], [587, 130]], volume: 0.5 },
  'wanted.voice.c': { synth: 'sawtooth', notes: [[330, 60], [440, 60], [660, 110]] },
  'wanted.voice.d': { synth: 'square', notes: [[880, 60], [660, 60], [990, 120]] },
  'wanted.tick': { synth: 'square', notes: [[1200, 30]], volume: 0.12 },
  'wanted.tick.urgent': { synth: 'square', notes: [[1600, 40], [0, 40], [1600, 40]], volume: 0.15 },
  'wanted.found': { synth: 'triangle', notes: [[784, 80], [988, 80], [1175, 80], [1568, 220]], volume: 0.5 },
  'wanted.fail': { synth: 'sawtooth', notes: [[220, 120], [165, 240]] },
  'wanted.curtain': { synth: 'triangle', notes: [[200, 10], [900, 350]], slide: true, volume: 0.35 },
  'wanted.clear': { synth: 'square', notes: [[523, 100], [659, 100], [784, 100], [1047, 260]] },
};
