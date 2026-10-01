# syntax=docker/dockerfile:1
# One image: NestJS API + the built Angular app, served from the same origin.

# ---- 1. Angular build ----
FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build --configuration production

# ---- 2. API build ----
FROM node:22-alpine AS api
RUN apk add --no-cache openssl
WORKDIR /src/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN npx prisma generate && npx nest build \
 && npm prune --omit=dev --no-audit --no-fund \
 && npx prisma generate

# ---- 3. Runtime ----
FROM node:22-alpine
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production PORT=3000 NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY --from=api --chown=node:node /src/backend/package.json ./
COPY --from=api --chown=node:node /src/backend/node_modules ./node_modules
COPY --from=api --chown=node:node /src/backend/prisma ./prisma
COPY --from=api --chown=node:node /src/backend/dist ./dist
COPY --from=web --chown=node:node /src/frontend/dist/frontend/browser ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
# Apply pending migrations, then start. Safe to run on every boot.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main"]
