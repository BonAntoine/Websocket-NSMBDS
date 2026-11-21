export type GameId = 'wanted';
export type Phase = 'lobby' | 'playing' | 'results';

export interface PlayerInfo {
  id: string;
  name: string;
  score: number;
  connected: boolean;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  players: PlayerInfo[];
  /** Niveau en cours (1, 2, 3…). */
  round: number;
}

export interface RoundStart {
  round: number;
  game: GameId;
  /** Seed de la partie : avec le numéro de niveau, il détermine tout le niveau. */
  seed: number;
  /** Chrono global restant au début du niveau. */
  timeLeftMs: number;
}

/** Un joueur a trouvé en `timeMs` : les autres jouent jusqu'à ce temps sur leur propre chrono. */
export interface RoundDeadline {
  round: number;
  timeMs: number;
}

export interface RoundEnd {
  round: number;
  winnerId: string | null;
  /** Temps de réaction (ms) par joueur, null = pas trouvé / pas de réponse. */
  times: Record<string, number | null>;
}

export type JoinAck = (res: { ok: true } | { ok: false; error: string }) => void;

/** Envoyé dans le handshake socket.io (auth) : permet la reconnexion automatique. */
export interface HandshakeAuth {
  playerId: string;
  code?: string;
}

export interface ClientToServer {
  'room:create': (p: { name: string }, ack: JoinAck) => void;
  'room:join': (p: { name: string; code: string }, ack: JoinAck) => void;
  'room:leave': () => void;
  'game:start': () => void;
  /** Temps depuis le "Go" local si trouvé, null si l'échéance est atteinte sans trouver. */
  'round:result': (p: { round: number; timeMs: number | null }) => void;
  /** Mauvais personnage touché : -1 point. */
  'round:miss': (p: { round: number }) => void;
}

export interface ServerToClient {
  'room:state': (s: RoomState) => void;
  'round:start': (r: RoundStart) => void;
  'round:deadline': (d: RoundDeadline) => void;
  'round:end': (r: RoundEnd) => void;
}
