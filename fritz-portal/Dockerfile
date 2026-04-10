# syntax=docker/dockerfile:1

# ── Stage 1: Frontend bauen ──
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package.json tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm install
RUN npm run build

# ── Stage 2: Server Dependencies ──
FROM node:20-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json ./
RUN npm install --omit=dev

# ── Stage 3: Runtime (HA Base Image oder node:20-alpine als Fallback) ──
ARG BUILD_FROM=node:20-alpine
FROM ${BUILD_FROM}

WORKDIR /app

# Node.js installieren (nur nötig wenn HA Base Image ohne Node kommt)
RUN apk add --no-cache nodejs npm 2>/dev/null || true

# Frontend (built)
COPY --from=frontend /app/dist ./dist

# Server code + dependencies
COPY server/index.js ./server/index.js
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/package.json

COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 3003

CMD ["/run.sh"]
