/**
 * Socket.IO Event-Handler für das laufende Spiel.
 * Wird pro Raum aufgesetzt sobald ein Spiel startet.
 */

function setupGameHandlers(io, socket, room, game, lobbyManager) {
  // Remove stale listeners from any previous game on this socket
  socket.removeAllListeners('game:drawDeck');
  socket.removeAllListeners('game:drawDiscard');
  socket.removeAllListeners('game:meld');
  socket.removeAllListeners('game:append');
  socket.removeAllListeners('game:replaceJoker');
  socket.removeAllListeners('game:discard');
  socket.removeAllListeners('game:abandon');

  const userId = socket.user.id;
  const roomId = room.id;

  function broadcastState() {
    for (const player of room.players) {
      const ps = io.sockets.sockets.get(player.socketId);
      if (ps) {
        ps.emit('game:state', game.getStateForPlayer(player.id));
      }
    }
  }

  function broadcastAction(action, data) {
    io.to(roomId).emit('game:action', { action, ...data });
  }

  socket.on('game:drawDeck', (callback) => {
    const result = game.drawFromDeck(userId);
    if (result.ok) {
      broadcastAction('draw', {
        playerId: userId,
        source: 'deck',
        deckCount: game.deck.cards.length,
      });
      // Nur dem ziehenden Spieler die Karte zeigen
      callback({ ok: true, card: result.card });
      // Allen den neuen State senden
      broadcastState();
    } else {
      callback(result);
    }
  });

  socket.on('game:drawDiscard', (callback) => {
    const result = game.drawFromDiscard(userId);
    if (result.ok) {
      broadcastAction('draw', {
        playerId: userId,
        source: 'discard',
        card: result.card,
      });
      callback({ ok: true, card: result.card });
      broadcastState();
    } else {
      callback(result);
    }
  });

  socket.on('game:meld', (cardIds, callback) => {
    const result = game.layDownMeld(userId, cardIds);
    if (result.ok) {
      broadcastAction('meld', { playerId: userId, meldId: result.meldId, type: result.type });
      broadcastState();
      if (game.isFinished) {
        broadcastRoundEnd();
      }
    }
    callback(result);
  });

  socket.on('game:append', ({ cardId, meldId, side = 'right' }, callback) => {
    const result = game.appendToMeld(userId, cardId, meldId, side);
    if (result.ok) {
      broadcastAction('append', { playerId: userId, meldId });
      broadcastState();
      if (game.isFinished) {
        broadcastRoundEnd();
      }
    }
    callback(result);
  });

  socket.on('game:replaceJoker', ({ meldId, jokerId }, callback) => {
    const result = game.replaceJoker(userId, meldId, jokerId);
    if (result.ok) {
      broadcastAction('replaceJoker', { playerId: userId, meldId, jokerId, replacedWith: result.replacedWith });
      broadcastState();
      if (game.isFinished) broadcastRoundEnd();
    }
    callback(result);
  });

  socket.on('game:discard', (cardId, callback) => {
    const result = game.discard(userId, cardId);
    if (result.ok) {
      broadcastAction('discard', {
        playerId: userId,
        card: result.card,
      });
      broadcastState();
      if (result.roundEnd) {
        broadcastRoundEnd();
      }
    }
    callback(result);
  });

  function broadcastAbandoned(abandoningPlayerId) {
    if (game.isFinished) return; // guard against double-fire on disconnect + explicit abandon
    game.isFinished = true;
    io.to(roomId).emit('game:abandoned', { playerId: abandoningPlayerId });
    lobbyManager.rooms.delete(roomId);
    for (const player of room.players) {
      const ps = io.sockets.sockets.get(player.socketId);
      if (ps) ps.leave(roomId);
    }
    io.emit('lobby:rooms', lobbyManager.listRooms());
  }

  socket.on('game:abandon', (callback) => {
    broadcastAbandoned(userId);
    if (callback) callback({ ok: true });
  });

  socket.on('disconnect', () => {
    broadcastAbandoned(userId);
  });

  function broadcastRoundEnd() {
    const scores = {};
    for (const [id, player] of game.players) {
      scores[id] = player.score;
    }
    io.to(roomId).emit('game:roundEnd', {
      winner: game.winner,
      scores,
    });

    // Remove the finished room from the lobby and notify all clients
    lobbyManager.rooms.delete(roomId);
    for (const player of room.players) {
      const ps = io.sockets.sockets.get(player.socketId);
      if (ps) ps.leave(roomId);
    }
    io.emit('lobby:rooms', lobbyManager.listRooms());
  }
}

module.exports = { setupGameHandlers };
