# =============================================================================
# FRITZ!Portal — Home Assistant Add-on
# =============================================================================

ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest

# ── Stage 1: Frontend-Build ──────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /build

# Dependency-Dateien zuerst
COPY package.json tsconfig.json vite.config.ts index.html ./
COPY src/ ./src/
RUN npm install --include=dev
RUN npm run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Server-Abhängigkeiten installieren
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

# Cable-Modell-Patch für @lukesthl/fritzbox anwenden
COPY patch-fritzbox.mjs /tmp/patch-fritzbox.mjs
RUN node /tmp/patch-fritzbox.mjs && rm /tmp/patch-fritzbox.mjs

# Server-Quellcode kopieren
COPY server/index.js ./server/

# Kompiliertes Frontend aus Stage 1 übernehmen
COPY --from=builder /build/dist ./dist

# Startskript
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
