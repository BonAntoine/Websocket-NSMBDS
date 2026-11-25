// Manifeste unique des graphismes. Le code de jeu ne demande que des clés.
// Pour remplacer un visuel : déposer le fichier dans client/public/assets/ et changer l'entrée ici.
//   { file: 'perso-rouge.png' }                        → image PNG/SVG
//   { sheet: 'persos.json', frame: 'rouge.png' }       → frame d'une spritesheet (format Pixi/TexturePacker)
//   { shape: 'circle', color: '#e63946', letter: 'A' } → forme générée (prototype)

export type Shape = 'circle' | 'square' | 'triangle' | 'star' | 'diamond' | 'ghost';

export type AssetDef =
  | { shape: Shape; color: string; letter?: string }
  | { file: string }
  | { sheet: string; frame: string };

export const manifest: Record<string, AssetDef> = {
  'wanted.face.a': { file: 'icon_face_a.png' },
  'wanted.face.b': { file: 'icon_face_b.png' },
  'wanted.face.c': { file: 'icon_face_c.png' },
  'wanted.face.d': { file: 'icon_face_d.png' },
  // Version grand format, affichée sur l'avis de recherche (écran du haut).
  'wanted.poster.a': { file: 'face_a.png' },
  'wanted.poster.b': { file: 'face_b.png' },
  'wanted.poster.c': { file: 'face_c.png' },
  'wanted.poster.d': { file: 'face_d.png' },

  'ghosts.ghost': { shape: 'ghost', color: '#f4f1ea' },

  // Icônes du menu de choix du mini-jeu (lobby).
  'menu.wanted': { file: 'face_a.png' },
  'menu.ghosts': { shape: 'ghost', color: '#f4f1ea' },
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

  'ghosts.lightsOut': { synth: 'sawtooth', notes: [[600, 10], [120, 300]], slide: true, volume: 0.35 },
  'ghosts.rub': { synth: 'triangle', notes: [[180, 35]], volume: 0.12 },
  'ghosts.found': { synth: 'square', notes: [[988, 50], [1319, 90]], volume: 0.4 },
  'ghosts.allFound': { synth: 'triangle', notes: [[784, 80], [988, 80], [1175, 80], [1568, 220]], volume: 0.5 },
  'ghosts.escape': { synth: 'sine', notes: [[700, 10], [300, 500]], slide: true, volume: 0.4 },
  'ghosts.tick': { synth: 'square', notes: [[1200, 30]], volume: 0.12 },
  'ghosts.tick.urgent': { synth: 'square', notes: [[1600, 40], [0, 40], [1600, 40]], volume: 0.15 },
  'ghosts.point': { synth: 'square', notes: [[1047, 40]], volume: 0.2 },
};
