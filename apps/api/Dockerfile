# Stage 1: deps — prune monorepo to only what api needs
FROM node:20-alpine AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

# Install turbo globally for pruning
RUN pnpm add -g turbo

# Copy full monorepo source
COPY . .

# Prune to only what api needs (produces out/json and out/full)
RUN turbo prune api --docker

# ---

# Stage 2: build — compile TypeScript
FROM node:20-alpine AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app

# Copy pruned package manifests and lockfile for layer caching
COPY --from=deps /app/out/json/ .
COPY --from=deps /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy pruned source files
COPY --from=deps /app/out/full/ .

# Explicitly copy root tsconfig (turbo prune may omit it)
COPY tsconfig.base.json ./

# Build the api app
RUN pnpm --filter api build

# ---

# Stage 3: runtime — minimal production image
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

# Create non-root user
RUN addgroup -S smithy && adduser -S smithy -G smithy

WORKDIR /app

# Copy pruned package manifests for production install
COPY --from=deps /app/out/json/ .
COPY --from=deps /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

# Copy compiled output from build stage
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Switch to non-root user
USER smithy

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "apps/api/dist/main.js"]
