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

async function validateNextcloudAppPassword(username, password) {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  const response = await axios.get(`${NEXTCLOUD_URL}/ocs/v2.php/cloud/user`, {
    headers: {
      Authorization: `Basic ${credentials}`,
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
 * 2. Nextcloud-Benutzername + App-Passwort (für neuen Login)
 */
async function authenticateSocket(socket, next) {
  try {
    const { token, nextcloudUsername, nextcloudPassword } = socket.handshake.auth;

    if (token) {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.user = new User(payload.userId, payload.displayName, payload.nextcloudId);
      socket.user.socketId = socket.id;
      return next();
    }

    if (nextcloudUsername && nextcloudPassword) {
      const ncUser = await validateNextcloudAppPassword(nextcloudUsername, nextcloudPassword);

      const db = getDb();
      db.prepare(`
        INSERT INTO users (id, nextcloud_id, display_name, last_login)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(nextcloud_id) DO UPDATE SET
          display_name = excluded.display_name,
          last_login = CURRENT_TIMESTAMP
      `).run(ncUser.nextcloudId, ncUser.nextcloudId, ncUser.displayName);

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

      socket.emit('auth:token', { token: jwtToken });

      return next();
    }

    return next(new Error('Authentifizierung erforderlich'));
  } catch (err) {
    console.error('Auth-Fehler:', err.message);
    return next(new Error('Authentifizierung fehlgeschlagen'));
  }
}

module.exports = { authenticateSocket, User, validateNextcloudAppPassword };
