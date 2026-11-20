import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, HandshakeAuth, ServerToClient } from '@nsmb/shared';

// Pas de crypto.randomUUID : indisponible en HTTP hors localhost (téléphone en dev).
function loadPlayerId(): string {
  let id = localStorage.getItem('playerId');
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('playerId', id);
  }
  return id;
}

export const playerId = loadPlayerId();

export const roomCodeStore = {
  get: () => localStorage.getItem('roomCode') ?? undefined,
  set: (code: string) => localStorage.setItem('roomCode', code),
  clear: () => localStorage.removeItem('roomCode'),
};

// L'auth est réévaluée à chaque (re)connexion : le serveur nous replace dans notre room.
export const socket: Socket<ServerToClient, ClientToServer> = io({
  auth: (cb) => cb({ playerId, code: roomCodeStore.get() } satisfies HandshakeAuth),
});
