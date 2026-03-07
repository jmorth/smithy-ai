# Smithy AI

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2020-339933?logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)

> An AI-powered factory floor for building, chaining, and running intelligent workers.

## What is Smithy AI?

Smithy AI is a self-hosted platform for orchestrating AI workers through configurable pipelines. Define workers that process data using LLMs, chain them into assembly lines for multi-step workflows, and manage execution through worker pools — all with real-time monitoring via a web dashboard or CLI.

## Architecture Overview

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   Web (UI)  │   │  CLI Tool   │   │  Worker SDK │
│  React/Vite │   │    Bun      │   │  TypeScript │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                  │
       └────────┬────────┘                  │
                │ HTTP / WebSocket          │
                ▼                           │
        ┌───────────────┐                   │
        │   API Server  │◄──────────────────┘
        │    NestJS     │   Worker Execution
        └───┬───┬───┬───┘
            │   │   │
     ┌──────┘   │   └──────┐
     ▼          ▼          ▼
┌─────────┐ ┌───────┐ ┌─────────┐
│PostgreSQL│ │ Redis │ │RabbitMQ │
│  (data)  │ │(cache)│ │(events) │
└─────────┘ └───────┘ └─────────┘
                          │
                    ┌─────┘
                    ▼
              ┌──────────┐
              │  MinIO   │
              │(storage) │
              └──────────┘
```

- **API** (NestJS) — Core backend handling packages, workers, jobs, and orchestration
- **Web** (React + Vite) — Dashboard for managing workers, assembly lines, and monitoring jobs
- **CLI** (Bun) — Command-line interface for worker development and job submission
- **Worker SDK** — TypeScript SDK for building custom AI workers with provider abstraction

## Monorepo Structure

```
smithy-ai/
├── apps/
│   ├── api/                 # NestJS backend API
│   ├── web/                 # React + Vite frontend
│   └── cli/                 # Bun-based CLI tool
├── packages/
│   ├── shared/              # Common types, interfaces, and constants
│   ├── worker-sdk/          # SDK for building AI workers
│   └── eslint-config/       # Shared ESLint configuration
├── workers/
│   └── examples/            # Example worker implementations
│       ├── code-reviewer/   # AI code review worker
│       ├── spec-writer/     # Specification generation worker
│       └── summarizer/      # Document summarization worker
├── docker/                  # Docker Compose configs and env templates
│   ├── docker-compose.yml   # Development infrastructure
│   └── docker-compose.prod.yml  # Production overrides
└── docs/                    # Documentation
```

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 10.28.0
- **Docker** and **Docker Compose**

## Quick Start

```bash
# Clone the repository
git clone <repo-url> && cd smithy-ai

# Set up environment variables
cp docker/.env.example docker/.env

# Start infrastructure services (PostgreSQL, Redis, RabbitMQ, MinIO)
docker compose -f docker/docker-compose.yml up -d

# Install dependencies
pnpm install

# Start all services in development mode
pnpm dev
```

The API will be available at `http://localhost:3000` and the web UI at `http://localhost:5173`.

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/api-reference.md) | REST endpoints and WebSocket events |
| [Worker SDK Guide](docs/worker-sdk-guide.md) | Building custom AI workers |
| [Deployment Guide](docs/deployment.md) | Docker Compose setup for dev and production |

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | NestJS, Drizzle ORM, PostgreSQL 16, Redis 7, RabbitMQ 3, Socket.IO, Pino |
| **Frontend** | React 18, Vite, Tailwind CSS, Radix UI, Zustand, TanStack Query, Phaser |
| **CLI** | Bun, Commander.js, Inquirer.js |
| **Worker SDK** | Vercel AI SDK (OpenAI, Anthropic, Google) |
| **DevOps** | Turbo, Docker, Nginx, GitHub Actions |
| **Storage** | MinIO (S3-compatible) |

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
