import http from 'node:http';
import { Server } from 'socket.io';
import { env } from './env.js';
import { createApp } from './app.js';
import { registerSocketAuth } from './socket.js';

const httpServer = http.createServer(createApp());
const io = new Server(httpServer, {
  cors: {
    origin: env.clientOrigins,
    credentials: true,
  },
});
io.on('connection', (socket) => registerSocketAuth(socket));
httpServer.listen(env.port, process.env.API_HOST ?? '0.0.0.0', () => console.log(`Nuvik Vet API listening on ${process.env.API_HOST ?? '0.0.0.0'}:${env.port}`));
