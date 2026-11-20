import { randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  BETWEEN_ROUNDS_MS,
  CODE_ALPHABET,
  CODE_LENGTH,
  COUNTDOWN_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NAME_MAX_LENGTH,
  RESULT_GRACE_MS,
  ROUND_LIMIT_MS,
  ROUNDS_PER_MATCH,
  normalizeCode,
  type ClientToServer,
  type HandshakeAuth,
  type JoinAck,
  type Phase,
  type RoomState,
  type ServerToClient,
} from '@nsmb/shared';

type IO = Server<ClientToServer, ServerToClient>;
type ClientSocket = Socket<ClientToServer, ServerToClient>;

/** Délai pour revenir après une déconnexion (téléphone en veille…) avant d'être retiré. */
const RECONNECT_GRACE_MS = 2 * 60_000;

interface Player {
  id: string;
  name: string;
  score: number;
  socketId: string | null;
  leaveTimer?: NodeJS.Timeout;
}

interface Room {
  code: string;
  hostId: string;
  phase: Phase;
  players: Map<string, Player>;
  round: number;
  roundOpen: boolean;
  /** Joueurs connectés au départ de la manche : on attend leur résultat. */
  participants: string[];
  results: Map<string, number | null>;
  timer?: NodeJS.Timeout;
}

const rooms = new Map<string, Room>();

const cleanName = (name: unknown) => String(name ?? '').trim().slice(0, NAME_MAX_LENGTH) || 'Joueur';

function newCode(): string {
  let code: string;
  do {
    code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  } while (rooms.has(code));
  return code;
}

const connectedIds = (room: Room) => [...room.players.values()].filter((p) => p.socketId).map((p) => p.id);

export function registerRooms(io: IO) {
  function toState(room: Room): RoomState {
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      round: room.round,
      totalRounds: ROUNDS_PER_MATCH,
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.socketId !== null,
      })),
    };
  }

  const broadcast = (room: Room) => io.to(room.code).emit('room:state', toState(room));

  function removePlayer(room: Room, id: string) {
    const player = room.players.get(id);
    if (!player) return;
    clearTimeout(player.leaveTimer);
    room.players.delete(id);

    if (room.players.size === 0) {
      clearTimeout(room.timer);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === id) room.hostId = room.players.keys().next().value!;
    if (room.phase === 'playing' && room.players.size < MIN_PLAYERS) {
      clearTimeout(room.timer);
      room.roundOpen = false;
      room.phase = 'results';
    } else if (room.roundOpen) {
      checkRoundComplete(room);
    }
    broadcast(room);
  }

  function startRound(room: Room) {
    room.round++;
    room.roundOpen = true;
    room.participants = connectedIds(room);
    room.results = new Map();
    broadcast(room);
    io.to(room.code).emit('round:start', { round: room.round, game: 'wanted', seed: randomInt(2 ** 31) });
    // Filet de sécurité si un joueur ne répond jamais (déconnexion).
    room.timer = setTimeout(() => endRound(room), COUNTDOWN_MS + ROUND_LIMIT_MS + RESULT_GRACE_MS);
  }

  function checkRoundComplete(room: Room) {
    // On attend TOUS les participants : le premier message reçu n'est pas forcément le plus rapide.
    if (room.participants.every((id) => room.results.has(id) || !room.players.has(id))) endRound(room);
  }

  function endRound(room: Room) {
    if (!room.roundOpen) return;
    room.roundOpen = false;
    clearTimeout(room.timer);

    const times: Record<string, number | null> = {};
    let winnerId: string | null = null;
    for (const id of room.participants) {
      const t = room.results.get(id) ?? null;
      times[id] = t;
      if (t !== null && (winnerId === null || t < times[winnerId]!)) winnerId = id;
    }
    const winner = winnerId ? room.players.get(winnerId) : undefined;
    if (winner) winner.score++;

    io.to(room.code).emit('round:end', { round: room.round, winnerId, times });
    broadcast(room);

    room.timer = setTimeout(() => {
      if (room.round >= ROUNDS_PER_MATCH) {
        room.phase = 'results';
        broadcast(room);
      } else {
        startRound(room);
      }
    }, BETWEEN_ROUNDS_MS);
  }

  io.on('connection', (socket: ClientSocket) => {
    const auth = socket.handshake.auth as Partial<HandshakeAuth>;
    const playerId = typeof auth.playerId === 'string' ? auth.playerId.slice(0, 64) : '';
    if (!playerId) return void socket.disconnect(true);

    let room: Room | undefined;

    function attach(r: Room, p: Player) {
      // Même joueur ouvert ailleurs (ancien onglet) : on coupe l'ancienne connexion.
      const oldSocketId = p.socketId;
      clearTimeout(p.leaveTimer);
      p.socketId = socket.id;
      if (oldSocketId && oldSocketId !== socket.id) io.sockets.sockets.get(oldSocketId)?.disconnect(true);
      room = r;
      socket.join(r.code);
      broadcast(r);
    }

    function leaveCurrent() {
      if (!room) return;
      socket.leave(room.code);
      removePlayer(room, playerId);
      room = undefined;
    }

    // Reconnexion : le client renvoie playerId + code de room dans le handshake.
    const previous = auth.code ? rooms.get(normalizeCode(auth.code)) : undefined;
    const known = previous?.players.get(playerId);
    if (previous && known) attach(previous, known);

    socket.on('room:create', (p, ack: JoinAck) => {
      leaveCurrent();
      const r: Room = {
        code: newCode(),
        hostId: playerId,
        phase: 'lobby',
        players: new Map(),
        round: 0,
        roundOpen: false,
        participants: [],
        results: new Map(),
      };
      const player: Player = { id: playerId, name: cleanName(p?.name), score: 0, socketId: null };
      r.players.set(playerId, player);
      rooms.set(r.code, r);
      attach(r, player);
      ack?.({ ok: true });
    });

    socket.on('room:join', (p, ack: JoinAck) => {
      const r = rooms.get(normalizeCode(String(p?.code ?? '')));
      if (!r) return ack?.({ ok: false, error: 'Room introuvable.' });

      let player = r.players.get(playerId);
      if (!player) {
        if (r.phase === 'playing') return ack?.({ ok: false, error: 'Partie en cours, attends la fin.' });
        if (r.players.size >= MAX_PLAYERS) return ack?.({ ok: false, error: 'Room pleine.' });
        player = { id: playerId, name: '', score: 0, socketId: null };
      }
      if (room !== r) leaveCurrent();
      player.name = cleanName(p?.name);
      r.players.set(playerId, player);
      attach(r, player);
      ack?.({ ok: true });
    });

    socket.on('room:leave', leaveCurrent);

    socket.on('game:start', () => {
      if (!room || room.hostId !== playerId || room.phase === 'playing') return;
      if (connectedIds(room).length < MIN_PLAYERS) return;
      for (const p of room.players.values()) p.score = 0;
      room.round = 0;
      room.phase = 'playing';
      startRound(room);
    });

    socket.on('round:result', (p) => {
      if (!room?.roundOpen || p?.round !== room.round) return;
      if (!room.participants.includes(playerId) || room.results.has(playerId)) return;
      const t = p.timeMs;
      room.results.set(playerId, typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t : null);
      checkRoundComplete(room);
    });

    socket.on('disconnect', () => {
      const r = room;
      const player = r?.players.get(playerId);
      if (!r || !player || player.socketId !== socket.id) return;
      player.socketId = null;
      player.leaveTimer = setTimeout(() => removePlayer(r, playerId), RECONNECT_GRACE_MS);
      broadcast(r);
    });
  });
}
