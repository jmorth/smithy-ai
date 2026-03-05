# Smithy AI

Workflow orchestration platform for containerized AI workers. Define workers, chain them into assembly lines, submit data packages, and track everything in real time.

## How It Works

1. **Workers** — Containerized AI services that perform a specific task (summarize, extract, classify, etc.)
2. **Assembly Lines** — Multi-step pipelines that chain workers together
3. **Packages** — Data submitted to an assembly line, processed step by step
4. **Job Executions** — Tracked runs with logs, status, and real-time updates

## Tech Stack

| Layer | Stack |
|-------|-------|
| **API** | NestJS, TypeScript, Drizzle ORM, PostgreSQL |
| **Frontend** | React, Vite, TanStack Query, Zustand, Tailwind + shadcn/ui |
| **Worker SDK** | TypeScript, Vercel AI SDK (Claude, GPT, Gemini) |
| **Infrastructure** | Docker, Redis, RabbitMQ, MinIO (S3-compatible storage) |
| **CLI** | Bun |
| **Monorepo** | pnpm workspaces + Turborepo |

## Project Structure

```
apps/
  api/          NestJS backend (REST + WebSocket)
  web/          React frontend
  cli/          Developer CLI
packages/
  shared/       Shared types and constants
  worker-sdk/   Framework for building AI workers
workers/
  examples/     Example worker implementations
docker/         Docker Compose stack
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Docker & Docker Compose

### Setup

```bash
# Install dependencies
pnpm install

# Start infrastructure (Postgres, Redis, RabbitMQ, MinIO)
docker compose -f docker/docker-compose.yml up -d

# Copy environment config
cp docker/.env.example docker/.env

# Run database migrations
pnpm --filter api db:migrate

# Start development servers
pnpm dev
```

The API runs on `http://localhost:3000` and the frontend on `http://localhost:5173`.

## License

MIT
