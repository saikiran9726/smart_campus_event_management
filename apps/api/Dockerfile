# Multi-stage Dockerfile for Eventora API (Node 22 Slim)

# Stage 1: Build & Dependencies
FROM node:22-slim AS builder

WORKDIR /app

# Enable pnpm via Corepack
ENV COREPACK_DEFAULT_TO_LATEST=0
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy monorepo configuration and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Fetch and install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package first, then API
RUN pnpm --filter @eventora/shared build
RUN pnpm --filter @eventora/api build

# Prune to production deployment
RUN pnpm --filter @eventora/api --prod deploy /prod/api

# Stage 2: Runtime Image
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install curl for container health check
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy pruned production deployment from builder
COPY --from=builder /prod/api /app

# Run as non-root user for container security
USER node

# Healthcheck hitting /health liveness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

EXPOSE 4000

# Run migrations first using PostgreSQL advisory lock, then start server
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
