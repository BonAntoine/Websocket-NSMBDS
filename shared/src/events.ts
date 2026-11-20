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
  round: number;
  totalRounds: number;
}

export interface RoundStart {
  round: number;
  game: GameId;
  seed: number;
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
  'round:result': (p: { round: number; timeMs: number | null }) => void;
}

export interface ServerToClient {
  'room:state': (s: RoomState) => void;
  'round:start': (r: RoundStart) => void;
  'round:end': (r: RoundEnd) => void;
}
