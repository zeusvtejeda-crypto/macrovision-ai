# ─── Stage 1: Dependencies ────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat python3 make g++

COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Genera cliente con el schema de producción (PostgreSQL)
RUN npm ci --only=production && \
    npx prisma generate --schema=prisma/prod/schema.prisma && \
    cp -r node_modules /app/node_modules_prod

RUN npm ci

# ─── Stage 2: Builder ─────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/prisma ./prisma

RUN npm run build

# ─── Stage 3: Production ──────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat dumb-init

# Usuario no-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Solo lo necesario
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=deps    --chown=nestjs:nodejs /app/node_modules_prod ./node_modules
COPY --chown=nestjs:nodejs package.json ./
COPY --chown=nestjs:nodejs docker-entrypoint.sh ./

RUN mkdir -p logs && chown nestjs:nodejs logs && \
    chmod +x docker-entrypoint.sh

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
