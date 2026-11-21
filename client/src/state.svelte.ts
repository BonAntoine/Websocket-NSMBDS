import type { RoomState, RoundDeadline, RoundEnd, RoundStart } from '@nsmb/shared';
import { roomCodeStore, socket } from './net';

export const store = $state({
  room: null as RoomState | null,
  /** Niveau reçu, consommé par l'écran de jeu. */
  roundStart: null as RoundStart | null,
  deadline: null as RoundDeadline | null,
  lastRound: null as RoundEnd | null,
});

socket.on('room:state', (s) => {
  store.room = s;
  roomCodeStore.set(s.code);
  if (s.phase !== 'playing') store.roundStart = null;
});
socket.on('round:start', (r) => {
  store.roundStart = r;
  store.deadline = null;
});
socket.on('round:deadline', (d) => (store.deadline = d));
socket.on('round:end', (r) => (store.lastRound = r));

export function leaveRoom() {
  socket.emit('room:leave');
  roomCodeStore.clear();
  store.room = null;
  store.roundStart = null;
  store.deadline = null;
  store.lastRound = null;
}

export const playerName = (id: string | null) =>
  store.room?.players.find((p) => p.id === id)?.name ?? '?';
