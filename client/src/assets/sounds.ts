import { sounds, type SoundDef } from './manifest';

const BASE = `${import.meta.env.BASE_URL}assets/`;
const VOLUME = 0.3;
const buffers = new Map<string, AudioBuffer>();
let ctx: AudioContext | null = null;

const audio = () => (ctx ??= new AudioContext());

// Les navigateurs mobiles n'autorisent le son qu'après un geste de l'utilisateur.
window.addEventListener('pointerdown', () => void audio().resume(), { capture: true });

/** Charge les sons fichiers du manifeste (les sons synthétisés n'ont rien à charger). */
export async function loadSounds(): Promise<void> {
  await Promise.all(
    Object.entries(sounds).map(async ([key, def]) => {
      if (!('file' in def) || buffers.has(key)) return;
      const data = await fetch(BASE + def.file).then((r) => r.arrayBuffer());
      buffers.set(key, await audio().decodeAudioData(data));
    }),
  );
}

/** Joue un son par clé. pan : -1 (gauche) à 1 (droite). rate : vitesse/hauteur. */
export function playSound(key: string, { pan = 0, rate = 1 } = {}): void {
  const def = sounds[key];
  if (!def) throw new Error(`Son inconnu : ${key}`);
  const ac = audio();
  if (ac.state !== 'running') return;

  const gain = ac.createGain();
  gain.gain.value = VOLUME * (def.volume ?? 1);
  const panner = ac.createStereoPanner();
  panner.pan.value = pan;
  gain.connect(panner).connect(ac.destination);

  if ('file' in def) {
    const buffer = buffers.get(key);
    if (!buffer) return;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.connect(gain);
    src.start();
  } else {
    synth(ac, def, gain, rate);
  }
}

function synth(ac: AudioContext, def: Extract<SoundDef, { synth: unknown }>, out: GainNode, rate: number) {
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = def.synth;
  osc.connect(env).connect(out);

  let t = ac.currentTime;
  osc.frequency.setValueAtTime(def.notes[0][0] * rate || 1, t);
  for (const [freq, ms] of def.notes) {
    const end = t + ms / 1000 / rate;
    if (def.slide) osc.frequency.linearRampToValueAtTime(freq * rate, end);
    else osc.frequency.setValueAtTime(freq * rate || 1, t);
    env.gain.setValueAtTime(freq ? 1 : 0, t);
    t = end;
  }
  env.gain.setValueAtTime(1, t);
  env.gain.linearRampToValueAtTime(0, t + 0.03); // évite le clic final
  osc.start();
  osc.stop(t + 0.05);
}
