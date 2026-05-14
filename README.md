# Rommé — Game Server

A real-time multiplayer [Rommé](https://en.wikipedia.org/wiki/Rummy) (German Rummy) server built with Node.js and Socket.IO. Players connect via an Android app and authenticate through their own Nextcloud instance — no third-party accounts or cloud services required.

> **Free and open.** This project is free to use; the server needs to be self-hosted. There are no advertisements, no tracking, and no accounts beyond the Nextcloud login - which needs to be your own instance.

---

## What this is

- A game server you run yourself, on your own hardware or VPS
- Validates all game moves server-side (card melding, joker rules, scoring)
- Supports multiple simultaneous rooms and players
- Authenticates players via Nextcloud OAuth2 — anyone with an account on your Nextcloud can play

## What you also need

The Android app is a separate repository that also needs to be installed on players' devices. It connects to this server and handles the game UI.

> **→ Android app:** [romme-android](https://github.com/stemaker/romme-android)

---

## Quick start

The recommended way to run the server is Docker:

```bash
cp .env.example .env   # fill in JWT_SECRET and NEXTCLOUD_URL
docker build -t romme-server .
docker run -d --name romme --env-file .env -p 3001:3001 -v romme-data:/data --restart unless-stopped romme-server
```

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full step-by-step guide covering:

1. Nextcloud OAuth2 app setup
2. Server installation (Docker or Node.js directly)
3. Apache reverse proxy configuration
4. Running the server with systemd or pm2
5. Configuring the Android app

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Deployment | Docker (recommended) or Node.js ≥ 18 |
| Real-time transport | Socket.IO |
| Authentication | Nextcloud OAuth2 + JWT |
| Database | SQLite (via better-sqlite3) |
| Tests | Jest |

---

## Development

```bash
npm install
npm run dev      # starts server with auto-reload (nodemon)
npm test         # runs the Jest test suite
```

The server reads configuration from a `.env` file. Copy `.env.example` to `.env` and fill in the required values before starting.

---

## License

MIT
