const Database = require('better-sqlite3');
const path = require('path');

let db;

function initDatabase() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'romme.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nextcloud_id TEXT UNIQUE,
      display_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS game_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      ended_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      rounds_played INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS player_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES game_results(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      score INTEGER NOT NULL,
      won BOOLEAN DEFAULT 0
    );
  `);

  return db;
}

function getDb() {
  return db;
}

module.exports = { initDatabase, getDb };
