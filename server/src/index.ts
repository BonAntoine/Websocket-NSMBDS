import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import { Server } from 'socket.io';
import type { ClientToServer, ServerToClient } from '@nsmb/shared';
import { registerRooms } from './rooms';

const PORT = Number(process.env.PORT) || 3000;
const DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

// Sert le client buildé (prod). En dev, c'est Vite qui sert le client.
const serveStatic = existsSync(DIST) ? sirv(DIST, { single: true }) : null;

const http = createServer((req, res) => {
  const notFound = () => {
    res.statusCode = 404;
    res.end(serveStatic ? 'Not found' : 'Client non buildé : lancer "pnpm build".');
  };
  if (serveStatic) serveStatic(req, res, notFound);
  else notFound();
});

// socket.io intercepte /socket.io/ sur le même serveur HTTP → même origine, pas de CORS.
const io = new Server<ClientToServer, ServerToClient>(http);
registerRooms(io);

http.listen(PORT, () => console.log(`Serveur sur http://localhost:${PORT}`));
