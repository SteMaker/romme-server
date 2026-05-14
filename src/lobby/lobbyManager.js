const { v4: uuidv4 } = require('uuid');
const { RommeGame } = require('../game/rommeGame');

class Room {
  constructor(host, options = {}) {
    this.id = uuidv4();
    this.name = options.name || `${host.displayName}s Tisch`;
    this.hostId = host.id;
    this.maxPlayers = Math.min(Math.max(options.maxPlayers || 4, 2), 6);
    this.players = [host];
    this.game = null;
    this.createdAt = Date.now();
  }

  get isFull() {
    return this.players.length >= this.maxPlayers;
  }

  get isPlaying() {
    return this.game !== null && !this.game.isFinished;
  }

  addPlayer(user) {
    if (this.isFull) return false;
    if (this.players.find((p) => p.id === user.id)) return false;
    this.players.push(user);
    return true;
  }

  removePlayer(userId) {
    this.players = this.players.filter((p) => p.id !== userId);
    // Neuen Host bestimmen wenn der alte geht
    if (this.hostId === userId && this.players.length > 0) {
      this.hostId = this.players[0].id;
    }
  }

  startGame() {
    if (this.isPlaying) return null;
    const playerIds = this.players.map((p) => p.id);
    this.game = new RommeGame(playerIds);
    this.game.start();
    return this.game;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      hostId: this.hostId,
      maxPlayers: this.maxPlayers,
      players: this.players.map((p) => p.toJSON()),
      isPlaying: this.isPlaying,
      playerCount: this.players.length,
    };
  }
}

class LobbyManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
  }

  createRoom(host, options) {
    const room = new Room(host, options);
    this.rooms.set(room.id, room);
    return room;
  }

  joinRoom(roomId, user, socket) {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Raum nicht gefunden' };
    if (room.isPlaying) return { ok: false, error: 'Spiel läuft bereits' };
    if (room.isFull) return { ok: false, error: 'Raum ist voll' };

    user.socketId = socket.id;
    const added = room.addPlayer(user);
    if (!added) return { ok: false, error: 'Beitritt fehlgeschlagen' };

    return { ok: true, room };
  }

  leaveRoom(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.removePlayer(userId);

    // Leere Räume entfernen
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
    }
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  removePlayer(userId) {
    for (const [roomId, room] of this.rooms) {
      room.removePlayer(userId);
      if (room.players.length === 0) {
        this.rooms.delete(roomId);
      }
    }
  }

  listRooms() {
    return Array.from(this.rooms.values())
      .filter((r) => !r.isPlaying)
      .map((r) => r.toJSON());
  }
}

module.exports = { LobbyManager, Room };
