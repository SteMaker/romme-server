# Rommé Server — Deployment Guide

## Prerequisites

- Node.js ≥ 18
- A Nextcloud instance (any version with OAuth2 app support — enabled by default since NC 16)
- A reverse proxy (Apache or nginx) with TLS termination

---

## 1. Nextcloud OAuth2 app setup

The Android app authenticates players via your Nextcloud instance. You need to register it as an OAuth2 client there.

1. Log into Nextcloud as admin
2. Go to **Settings → Security → OAuth 2.0 clients**
3. Click **Add client**, fill in:
   - **Name:** Rommé
   - **Redirection URI:** `com.romme://oauth` (or the redirect URI configured in the Android app)
4. Note the generated **Client ID** and **Client Secret** — these go into the Android app, not the server

The server only needs the Nextcloud base URL to validate access tokens. It never sees the client secret.

---

## 2. Server installation

```bash
git clone <repo-url>
cd romme/server

# Install production dependencies only
npm install --omit=dev

# Create your environment file
cp .env.example .env
```

Edit `.env`:

```bash
# Generate a strong JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste the output as JWT_SECRET in .env

# Set your Nextcloud URL
NEXTCLOUD_URL=https://your-nextcloud.example.com
```

Adjust `PORT`, `SOCKET_PATH`, and `DB_PATH` as needed.

---

## 3. Apache reverse proxy

Enable the required modules if not already active:

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite
sudo systemctl reload apache2
```

Paste the following inside the `<VirtualHost *:443>` block of your SSL config (typically `/etc/apache2/sites-enabled/000-default-ssl.conf`). Adjust the path prefix (`/romme/`) and port (`3001`) to match your `SOCKET_PATH` and `PORT` settings:

```apache
# --- Rommé Game Server ---
# WebSocket connections
RewriteEngine On
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/romme/socket\.io/(.*) ws://127.0.0.1:3001/romme/socket.io/$1 [P,L]

# HTTP (health check, Socket.IO polling fallback)
ProxyPass /romme/ http://127.0.0.1:3001/
ProxyPassReverse /romme/ http://127.0.0.1:3001/
```

---

## 4. Running the server

### systemd (recommended)

Create `/etc/systemd/system/romme.service`:

```ini
[Unit]
Description=Rommé Game Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/romme/server
EnvironmentFile=/path/to/romme/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now romme
sudo journalctl -u romme -f   # follow logs
```

### pm2 (alternative)

```bash
npm install -g pm2
pm2 start src/index.js --name romme
pm2 save
pm2 startup   # follow the printed command to enable autostart
```

---

## 5. Android app configuration

In the app login screen the player enters:

| Field | Value |
|-------|-------|
| Server URL | `https://your-domain.example.com` |
| Nextcloud URL | `https://your-nextcloud.example.com` |
| OAuth2 Client ID | The Client ID from step 1 |
| OAuth2 Client Secret | The Client Secret from step 1 |

The player then taps **Login with Nextcloud** and is redirected to Nextcloud's login page. After authenticating there, they are returned to the app automatically.

---

## 6. Health check

```bash
curl https://your-domain.example.com/romme/health
# {"status":"ok","version":"0.1.0"}
```
