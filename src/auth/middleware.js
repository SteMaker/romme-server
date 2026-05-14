const jwt = require('jsonwebtoken');
const axios = require('axios');
const { getDb } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL;

class User {
  constructor(id, displayName, nextcloudId = null) {
    this.id = id;
    this.displayName = displayName;
    this.nextcloudId = nextcloudId;
    this.socketId = null;
  }

  toJSON() {
    return {
      id: this.id,
      displayName: this.displayName,
    };
  }
}

/**
 * Validiert ein Nextcloud OAuth2 Access-Token und gibt Nutzerinfos zurück.
 */
async function validateNextcloudToken(accessToken) {
  const response = await axios.get(`${NEXTCLOUD_URL}/ocs/v2.php/cloud/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'OCS-APIREQUEST': 'true',
      Accept: 'application/json',
    },
  });

  const userData = response.data.ocs.data;
  return {
    nextcloudId: userData.id,
    displayName: userData['display-name'] || userData.id,
  };
}

/**
 * Socket.IO Middleware: Authentifiziert eingehende Verbindungen.
 *
 * Akzeptiert entweder:
 * 1. Ein JWT (für bestehende Sessions)
 * 2. Ein Nextcloud OAuth2 Access-Token (für neuen Login)
 */
async function authenticateSocket(socket, next) {
  try {
    const { token, nextcloudToken } = socket.handshake.auth;

    // Variante 1: Bestehendes JWT
    if (token) {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.user = new User(payload.userId, payload.displayName, payload.nextcloudId);
      socket.user.socketId = socket.id;
      return next();
    }

    // Variante 2: Nextcloud OAuth2 Token
    if (nextcloudToken) {
      const ncUser = await validateNextcloudToken(nextcloudToken);

      // Nutzer in DB anlegen/aktualisieren
      const db = getDb();
      db.prepare(`
        INSERT INTO users (id, nextcloud_id, display_name, last_login)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(nextcloud_id) DO UPDATE SET
          display_name = excluded.display_name,
          last_login = CURRENT_TIMESTAMP
      `).run(ncUser.nextcloudId, ncUser.nextcloudId, ncUser.displayName);

      // JWT für zukünftige Verbindungen erstellen
      const jwtToken = jwt.sign(
        {
          userId: ncUser.nextcloudId,
          displayName: ncUser.displayName,
          nextcloudId: ncUser.nextcloudId,
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      socket.user = new User(ncUser.nextcloudId, ncUser.displayName, ncUser.nextcloudId);
      socket.user.socketId = socket.id;

      // JWT an Client senden damit er es speichern kann
      socket.emit('auth:token', { token: jwtToken });

      return next();
    }

    return next(new Error('Authentifizierung erforderlich'));
  } catch (err) {
    console.error('Auth-Fehler:', err.message);
    return next(new Error('Authentifizierung fehlgeschlagen'));
  }
}

module.exports = { authenticateSocket, User, validateNextcloudToken };
