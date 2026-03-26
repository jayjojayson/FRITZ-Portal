# =============================================================================
# FRITZ!Portal — Home Assistant Add-on
#
# Build-Kontext: ha-addon/fritz-portal/   ← dieser Ordner ist selbst-enthalten
# Lokal bauen (aus dem ha-addon/fritz-portal/ Verzeichnis):
#   docker build -t fritz-portal-addon .
# =============================================================================

ARG BUILD_FROM=node:20-alpine

# ── Stage 1: Frontend-Build ──────────────────────────────────────────────────
# Immer auf amd64-Builder; Ergebnis ist plattformunabhängiges JS/CSS
FROM node:20-alpine AS builder
WORKDIR /build

# Nur Dependency-Dateien zuerst → besseres Layer-Caching
COPY package.json tsconfig.json vite.config.ts index.html ./
COPY src/ ./src/
RUN npm install --include=dev
RUN npm run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
# BUILD_FROM wird von HA Supervisor pro Architektur gesetzt (via build.yaml)
FROM $BUILD_FROM
WORKDIR /app

# Server-Abhängigkeiten installieren
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

# Cable-Modell-Patch für @lukesthl/fritzbox anwenden
COPY patch-fritzbox.mjs /tmp/patch-fritzbox.mjs
RUN node /tmp/patch-fritzbox.mjs && rm /tmp/patch-fritzbox.mjs

# Server-Quellcode kopieren (nach npm install, damit node_modules erhalten bleiben)
COPY server/index.js ./server/

# Kompiliertes Frontend aus Stage 1 übernehmen
COPY --from=builder /build/dist ./dist

# Startskript
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
