import type { RoomState, RoundEnd, RoundStart } from '@nsmb/shared';
import { roomCodeStore, socket } from './net';

export const store = $state({
  room: null as RoomState | null,
  /** Dernière manche reçue, consommée par l'écran de jeu. */
  roundStart: null as RoundStart | null,
  lastRound: null as RoundEnd | null,
});

socket.on('room:state', (s) => {
  store.room = s;
  roomCodeStore.set(s.code);
});
socket.on('round:start', (r) => (store.roundStart = r));
socket.on('round:end', (r) => {
  store.roundStart = null;
  store.lastRound = r;
});

export function leaveRoom() {
  socket.emit('room:leave');
  roomCodeStore.clear();
  store.room = null;
  store.roundStart = null;
  store.lastRound = null;
}

export const playerName = (id: string | null) =>
  store.room?.players.find((p) => p.id === id)?.name ?? '?';
