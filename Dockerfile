FROM node:20-slim AS builder

# Build tools needed for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# --- Final image ---
FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Non-root user for security
RUN useradd -r -s /bin/false romme \
    && mkdir -p /data \
    && chown romme /data

USER romme

ENV NODE_ENV=production
# Database is stored in the /data volume so it survives container restarts
ENV DB_PATH=/data/romme.db

EXPOSE 3001

CMD ["node", "src/index.js"]
