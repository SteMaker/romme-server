require('dotenv').config();

(function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Fehlende Umgebungsvariablen: ${missing.join(', ')}`);
    process.exit(1);
  }
}('JWT_SECRET', 'NEXTCLOUD_URL'));

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { authenticateSocket } = require('./auth/middleware');
const { LobbyManager } = require('./lobby/lobbyManager');
const { setupGameHandlers } = require('./game/handlers');
const { initDatabase } = require('./db');

const app = express();
const httpServer = createServer(app);

const SOCKET_PATH = process.env.SOCKET_PATH || '/socket.io';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const io = new Server(httpServer, {
  path: SOCKET_PATH,
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// Datenbank initialisieren
const db = initDatabase();

// Health-Check Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Auth-Middleware für Socket.IO
io.use(authenticateSocket);

// Lobby-Manager erstellt und verwaltet Spielräume
const lobbyManager = new LobbyManager(io);

io.on('connection', (socket) => {
  const user = socket.user;
  console.log(`Spieler verbunden: ${user.displayName} (${user.id})`);
  socket.emit('auth:user', { id: user.id, displayName: user.displayName });

  // Lobby-Events
  socket.on('lobby:create', (options, callback) => {
    const room = lobbyManager.createRoom(user, options);
    socket.join(room.id);
    callback({ ok: true, room: room.toJSON() });
    io.emit('lobby:rooms', lobbyManager.listRooms());
  });

  socket.on('lobby:join', (roomId, callback) => {
    const result = lobbyManager.joinRoom(roomId, user, socket);
    if (result.ok) {
      socket.join(roomId);
      io.to(roomId).emit('room:updated', result.room.toJSON());
      callback({ ok: true, room: result.room.toJSON() });
    } else {
      callback({ ok: false, error: result.error });
    }
    io.emit('lobby:rooms', lobbyManager.listRooms());
  });

  socket.on('lobby:leave', (roomId, callback) => {
    lobbyManager.leaveRoom(roomId, user.id);
    socket.leave(roomId);
    const updatedRoom = lobbyManager.getRoom(roomId);
    if (updatedRoom) io.to(roomId).emit('room:updated', updatedRoom.toJSON());
    if (callback) callback({ ok: true });
    io.emit('lobby:rooms', lobbyManager.listRooms());
  });

  socket.on('lobby:list', (callback) => {
    callback(lobbyManager.listRooms());
  });

  // Spiel-Events
  socket.on('game:start', (roomId, callback) => {
    const room = lobbyManager.getRoom(roomId);
    if (!room) return callback({ ok: false, error: 'Raum nicht gefunden' });
    if (room.hostId !== user.id) return callback({ ok: false, error: 'Nur der Host kann das Spiel starten' });
    if (room.players.length < 2) return callback({ ok: false, error: 'Mindestens 2 Spieler benötigt' });

    const game = room.startGame();
    if (!game) return callback({ ok: false, error: 'Spiel läuft bereits' });

    // Jedem Spieler seine Hand senden und Game-Handler registrieren
    for (const player of room.players) {
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (playerSocket) {
        setupGameHandlers(io, playerSocket, room, game, lobbyManager);
        playerSocket.emit('game:started', game.getStateForPlayer(player.id));
      }
    }
    callback({ ok: true });
  });

  socket.on('disconnect', () => {
    console.log(`Spieler getrennt: ${user.displayName}`);
    lobbyManager.removePlayer(user.id);
    io.emit('lobby:rooms', lobbyManager.listRooms());
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Rommé-Server läuft auf Port ${PORT}`);
  console.log(`Socket.IO Pfad: ${SOCKET_PATH}`);
  console.log(`CORS Origin: ${CORS_ORIGIN}`);
});
