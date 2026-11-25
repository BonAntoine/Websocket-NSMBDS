import { randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  GAME_IDS,
  MATCH_TIME_MS,
  MAX_PLAYERS,
  MAX_ROUND_POINTS,
  MIN_PLAYERS,
  NAME_MAX_LENGTH,
  RESULT_GRACE_MS,
  ROUND_END_MS,
  ROUND_INTRO_MAX_MS,
  normalizeCode,
  type ClientToServer,
  type GameId,
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
  game: GameId;
  players: Map<string, Player>;
  /** Seed de la partie (constant d'un niveau à l'autre). */
  seed: number;
  round: number;
  roundOpen: boolean;
  /** Chrono global restant au début du niveau en cours. */
  timeLeftMs: number;
  /** Meilleur temps reçu pour ce niveau : les autres jouent jusqu'à ce temps. */
  deadlineMs: number | null;
  /** Date.now() à l'envoi de round:start, pour le filet de sécurité. */
  roundStartedAt: number;
  /** Joueurs connectés au départ du niveau : on attend leur résultat. */
  participants: string[];
  results: Map<string, { timeMs: number | null; points: number }>;
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
      game: room.game,
      round: room.round,
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
    room.deadlineMs = null;
    room.roundStartedAt = Date.now();
    room.participants = connectedIds(room);
    room.results = new Map();
    broadcast(room);
    io.to(room.code).emit('round:start', {
      round: room.round,
      game: room.game,
      seed: room.seed,
      timeLeftMs: room.timeLeftMs,
    });
    // Filet de sécurité si un joueur ne répond jamais (page gelée, réseau coupé…).
    armSafetyTimer(room, room.timeLeftMs);
  }

  /** Clôt le niveau si des résultats manquent encore, une fois que chacun a eu `playMs` de jeu (+ intro et marge). */
  function armSafetyTimer(room: Room, playMs: number) {
    clearTimeout(room.timer);
    const delay = room.roundStartedAt + ROUND_INTRO_MAX_MS + playMs + RESULT_GRACE_MS - Date.now();
    room.timer = setTimeout(() => endRound(room), Math.max(0, delay));
  }

  function checkRoundComplete(room: Room) {
    // On attend TOUS les participants encore connectés : le premier message reçu n'est pas forcément le plus rapide.
    const waiting = room.participants.some((id) => !room.results.has(id) && room.players.get(id)?.socketId);
    if (!waiting) endRound(room);
  }

  function endRound(room: Room) {
    if (!room.roundOpen) return;
    room.roundOpen = false;
    clearTimeout(room.timer);

    const times: Record<string, number | null> = {};
    let winnerId: string | null = null;
    for (const id of room.participants) {
      const r = room.results.get(id);
      const t = r?.timeMs ?? null;
      times[id] = t;
      if (t !== null && (winnerId === null || t < times[winnerId]!)) winnerId = id;
      // Fantômes : chaque fantôme débusqué rapporte 1 point, qu'on ait tout trouvé ou non.
      const player = room.players.get(id);
      if (player && room.game === 'ghosts') player.score += r?.points ?? 0;
    }
    const winner = winnerId ? room.players.get(winnerId) : undefined;
    // Wanted! : +1 au plus rapide.
    if (winner && room.game === 'wanted') winner.score++;
    // Le chrono global a défilé jusqu'à la trouvaille (ou jusqu'au bout si personne n'a trouvé).
    room.timeLeftMs = winnerId ? Math.max(0, room.timeLeftMs - times[winnerId]!) : 0;

    io.to(room.code).emit('round:end', { round: room.round, winnerId, times });
    broadcast(room);

    room.timer = setTimeout(() => {
      if (room.timeLeftMs <= 0) {
        room.phase = 'results';
        broadcast(room);
      } else {
        startRound(room);
      }
    }, ROUND_END_MS);
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
      // Revenu en plein niveau sans l'avoir terminé : il reprendra au suivant, on ne l'attend pas.
      if (r.roundOpen && !r.results.has(p.id)) {
        r.participants = r.participants.filter((id) => id !== p.id);
        checkRoundComplete(r);
      }
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
        game: 'wanted',
        players: new Map(),
        seed: 0,
        round: 0,
        roundOpen: false,
        timeLeftMs: 0,
        deadlineMs: null,
        roundStartedAt: 0,
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

    socket.on('room:game', (p) => {
      if (!room || room.hostId !== playerId || room.phase === 'playing') return;
      if (!GAME_IDS.includes(p?.game)) return;
      room.game = p.game;
      broadcast(room);
    });

    socket.on('game:start', () => {
      if (!room || room.hostId !== playerId || room.phase === 'playing') return;
      if (connectedIds(room).length < MIN_PLAYERS) return;
      for (const p of room.players.values()) p.score = 0;
      room.round = 0;
      room.seed = randomInt(2 ** 31);
      room.timeLeftMs = MATCH_TIME_MS[room.game];
      room.phase = 'playing';
      startRound(room);
    });

    socket.on('round:result', (p) => {
      if (!room?.roundOpen || p?.round !== room.round) return;
      if (!room.participants.includes(playerId) || room.results.has(playerId)) return;
      const t = p.timeMs;
      const valid = typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= room.timeLeftMs;
      const pts = Number(p.points);
      const points = Number.isInteger(pts) ? Math.min(MAX_ROUND_POINTS, Math.max(0, pts)) : 0;
      room.results.set(playerId, { timeMs: valid ? t : null, points });
      // Premier (ou meilleur) temps : les autres jouent jusqu'à ce temps sur leur propre chrono, puis répondent.
      if (valid && (room.deadlineMs === null || t < room.deadlineMs)) {
        room.deadlineMs = t;
        io.to(room.code).emit('round:deadline', { round: room.round, timeMs: t });
        // Inutile d'attendre au-delà de ce temps : on raccourcit le filet de sécurité.
        armSafetyTimer(room, t);
      }
      checkRoundComplete(room);
    });

    socket.on('round:miss', (p) => {
      if (!room?.roundOpen || p?.round !== room.round || !room.participants.includes(playerId)) return;
      const player = room.players.get(playerId);
      if (!player) return;
      player.score--;
      broadcast(room);
    });

    socket.on('disconnect', () => {
      const r = room;
      const player = r?.players.get(playerId);
      if (!r || !player || player.socketId !== socket.id) return;
      player.socketId = null;
      player.leaveTimer = setTimeout(() => removePlayer(r, playerId), RECONNECT_GRACE_MS);
      if (r.roundOpen) checkRoundComplete(r);
      broadcast(r);
    });
  });
}
