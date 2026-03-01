# Smithy — Implementation Plan

## Technology Decisions

| Category | Technology | Rationale |
|---|---|---|
| **Monorepo** | Turborepo + pnpm | Fast incremental builds via content-hash caching; pnpm workspaces enforce strict dependency isolation and reduce disk usage via symlinks |
| **Backend** | NestJS + REST | Provides DI container, module system, guards, interceptors, and pipes — strong architectural opinions reduce bikeshedding; native support for WebSocket gateways and scheduled tasks |
| **ORM** | Drizzle | TypeScript-first with SQL-like query builder; lightweight with no runtime overhead from query generation; excellent migration tooling via `drizzle-kit`; avoids Prisma's engine binary and schema DSL lock-in |
| **Database** | PostgreSQL | JSONB for flexible Package metadata; strong indexing for workflow state queries; proven at scale for event-driven systems |
| **File Storage** | S3-compatible (MinIO local) | Package file blobs stored in S3; MinIO provides local S3-compatible API for Docker Compose development; production uses real S3 or equivalent |
| **Message Bus** | RabbitMQ | Mature routing topologies (direct, topic, fanout) map naturally to Assembly Line step queues and Worker Pool routing; dead letter exchanges for error handling; management UI for debugging |
| **Cache / Sessions** | Redis | Socket.IO adapter for horizontal WebSocket scaling; HTTP session storage; rate limiting via sliding window counters; caching for frequently-accessed workflow state |
| **Real-time** | Socket.IO + Redis adapter | Bidirectional WebSocket with auto-reconnection, rooms (per Assembly Line / Pool), namespaces; Redis adapter enables multi-process scaling without sticky sessions |
| **AI SDK** | Vercel AI SDK (`ai`) | Provider-agnostic from day one — supports Anthropic, OpenAI, Google, Mistral, Cohere, and 10+ others via unified interface; streaming support; tool calling abstraction |
| **Frontend** | Vite + React SPA | Single app serves both managerial dashboard and Phaser factory view; Vite provides fast HMR and optimized builds; no SSR needed since NestJS handles API |
| **UI Components** | shadcn/ui + Tailwind CSS | Copy-paste components with zero dependency lock-in; full design control; Tailwind utility classes enable rapid iteration; dark mode support built-in |
| **State Management** | TanStack Query + Zustand | TanStack Query handles server-state caching, background refetching, and optimistic updates; Zustand provides minimal client-state store for UI state and Phaser↔React bridge |
| **Game Engine** | Phaser 3 | Isometric 2.5D factory floor visualization; mature plugin ecosystem; WebGL renderer with Canvas fallback; scene management for different Assembly Lines |
| **CLI** | Bun-based (workspace pkg) | Fast startup time; built-in TypeScript support eliminates compilation step; workspace package shares types with backend |
| **Container Runtime** | Docker Compose sidecar | Ephemeral per-job Worker containers managed via Docker Compose CLI; avoids Docker socket security concerns; compose profiles for Worker image management |
| **Testing** | Vitest + Supertest + Playwright | Vitest for unit/integration (Jest-compatible, faster); Supertest for NestJS API integration tests; Playwright for E2E across both UI views |
| **Email** | Resend | Modern email API with React Email template support; webhook delivery tracking; simple integration |
| **Logging** | Pino (structured JSON) | High-performance structured logging; native NestJS integration via `nestjs-pino`; JSON output for log aggregation |
| **Deployment** | Docker Compose (local/on-prem) + Railway (cloud) | Docker Compose provides full local stack; Railway offers simple container-based cloud deployment with managed Postgres/Redis |
| **License** | MIT | Fully open-source; maximum adoption; no usage restrictions |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         Frontend (Vite + React)                  │
│  ┌─────────────────────┐    ┌──────────────────────────────────┐ │
│  │  Managerial Dashboard│    │  Phaser Factory Floor (Isometric)│ │
│  │  (shadcn/ui)         │    │  (Phaser 3 in React component)  │ │
│  └──────────┬──────────┘    └──────────────┬───────────────────┘ │
│             │         Socket.IO            │                     │
│             └──────────────┬───────────────┘                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │ REST + WebSocket
┌────────────────────────────┼─────────────────────────────────────┐
│                    NestJS Backend                                 │
│  ┌───────────┐ ┌──────────┐ ┌────────────┐ ┌──────────────────┐ │
│  │ REST API  │ │ WS Gate- │ │ Assembly   │ │ Worker Pool      │ │
│  │ Controllers│ │ way      │ │ Line Engine│ │ Engine           │ │
│  └─────┬─────┘ └────┬─────┘ └─────┬──────┘ └───────┬──────────┘ │
│        │             │             │                │             │
│  ┌─────┴─────────────┴─────────────┴────────────────┴──────────┐ │
│  │                    Service Layer                             │ │
│  │  PackageService │ WorkerService │ WorkflowService │ ...      │ │
│  └─────┬───────────────────────┬────────────────────────┬──────┘ │
│        │                       │                        │        │
│  ┌─────┴──────┐  ┌─────────────┴──────┐  ┌─────────────┴──────┐ │
│  │ Drizzle    │  │ RabbitMQ           │  │ Docker Compose     │ │
│  │ (Postgres) │  │ (Event Bus)        │  │ (Container Mgr)    │ │
│  └────────────┘  └────────────────────┘  └────────────────────┘ │
│        │                                         │               │
│  ┌─────┴──────┐                    ┌─────────────┴──────────┐   │
│  │ S3 / MinIO │                    │ Ephemeral Worker       │   │
│  │ (File Blobs)│                   │ Containers             │   │
│  └────────────┘                    │ (per-job lifecycle)    │   │
│                                    └────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Worker State Machine

```
  ┌─────────┐   Package    ┌─────────┐
  │ WAITING │──received───▸│ WORKING │
  └─────────┘              └────┬────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
              ▼                 ▼                  ▼
        ┌──────────┐     ┌──────────┐      ┌───────────┐
        │   DONE   │     │  STUCK   │      │   ERROR   │
        │(output   │     │(needs    │      │(user must │
        │ Package) │     │ input)   │      │ decide    │
        └──────────┘     └────┬─────┘      │ retry     │
                              │            │ strategy) │
                    user      │            └─────┬─────┘
                    responds  │                  │
                              ▼            user issues
                         ┌─────────┐      retry strategy
                         │ WORKING │◂─────────┘
                         └─────────┘
```

---

## Monorepo Structure

```
smithy-ai/
├── apps/
│   ├── api/                    # NestJS backend application
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── packages/   # Package CRUD, lifecycle, retention
│   │   │   │   ├── workers/    # Worker management, versions, state
│   │   │   │   ├── workflows/  # Assembly Lines + Worker Pools
│   │   │   │   ├── events/     # RabbitMQ producers/consumers
│   │   │   │   ├── containers/ # Docker container lifecycle
│   │   │   │   ├── storage/    # S3/MinIO file operations
│   │   │   │   ├── realtime/   # Socket.IO gateway
│   │   │   │   ├── notifications/ # Email, in-app, webhooks
│   │   │   │   └── logs/       # Log ingestion + viewer API
│   │   │   ├── common/         # Guards, interceptors, filters, pipes
│   │   │   ├── config/         # Configuration module
│   │   │   ├── database/       # Drizzle schema, migrations
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── test/               # E2E/integration tests
│   │   ├── drizzle.config.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── web/                    # Vite + React frontend
│   │   ├── src/
│   │   │   ├── components/     # Shared React components
│   │   │   ├── layouts/        # Page layouts (shell, sidebar)
│   │   │   ├── pages/          # Route pages
│   │   │   │   ├── dashboard/
│   │   │   │   ├── assembly-lines/
│   │   │   │   ├── worker-pools/
│   │   │   │   ├── packages/
│   │   │   │   ├── workers/
│   │   │   │   ├── logs/
│   │   │   │   └── factory/    # Phaser view entry point
│   │   │   ├── phaser/         # Phaser game code
│   │   │   │   ├── scenes/     # Phaser scenes
│   │   │   │   ├── objects/    # Game objects (Workers, Packages, belts)
│   │   │   │   ├── systems/    # Isometric grid, camera, depth sort
│   │   │   │   ├── assets/     # Sprite sheets, tilesets
│   │   │   │   └── bridge.ts   # Zustand ↔ Phaser event bridge
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── api/            # TanStack Query hooks + API client
│   │   │   ├── lib/            # Utilities
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── index.html
│   │   └── package.json
│   │
│   └── cli/                    # Bun-based CLI tool
│       ├── src/
│       │   ├── commands/       # Command implementations
│       │   │   ├── dev/        # scaffold, test, lint
│       │   │   └── ops/        # submit, status, logs, config
│       │   ├── lib/            # API client, formatters
│       │   └── index.ts
│       └── package.json
│
├── packages/
│   ├── shared/                 # Shared types and constants
│   │   ├── src/
│   │   │   ├── types/          # Package, Worker, Workflow types
│   │   │   ├── events/         # Event type definitions
│   │   │   ├── constants/      # Shared constants, enums
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── worker-sdk/             # SDK for building Workers
│   │   ├── src/
│   │   │   ├── base-worker.ts  # Abstract base class
│   │   │   ├── decorators.ts   # Lifecycle decorators
│   │   │   ├── context.ts      # Worker execution context
│   │   │   ├── ai.ts           # AI SDK wrapper
│   │   │   └── index.ts
│   │   ├── Dockerfile.base     # Base Worker Docker image
│   │   └── package.json
│   │
│   └── eslint-config/          # Shared ESLint configuration
│       └── package.json
│
├── workers/                    # Drop-in Worker directory (MVP extensibility)
│   └── examples/
│       ├── summarizer/         # Example: text summarization Worker
│       │   ├── worker.yaml
│       │   ├── worker.ts
│       │   └── Dockerfile
│       └── code-reviewer/      # Example: code review Worker
│           ├── worker.yaml
│           ├── worker.ts
│           └── Dockerfile
│
├── docker/
│   ├── docker-compose.yml      # Full local development stack
│   ├── docker-compose.prod.yml # Production overrides
│   └── .env.example
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .gitignore
├── LICENSE (MIT)
└── README.md
```

---

## Phase 1: Foundation & Infrastructure

### Task 1.1: Monorepo Scaffold

**Goal:** Initialize the Turborepo + pnpm workspace with all packages and apps defined, build pipeline configured, and shared tooling in place.

**Design considerations:**
- `turbo.json` must define the build dependency graph: `shared` builds first, then `worker-sdk`, then `api`/`web`/`cli` in parallel
- Use `tsconfig.base.json` at root with path aliases; each package extends it
- pnpm workspace protocol (`workspace:*`) for inter-package dependencies
- Shared ESLint config package avoids config duplication

**Folder/file locations:**
- `/turbo.json` — pipeline config (build, lint, test, typecheck)
- `/pnpm-workspace.yaml` — workspace definition (`apps/*`, `packages/*`)
- `/tsconfig.base.json` — shared compiler options (strict, ESNext, paths)
- `/packages/eslint-config/` — shared ESLint flat config
- `/packages/shared/` — shared types package (initially empty exports)

**Todos:**
- [ ] Initialize pnpm workspace with `pnpm init` at root
- [ ] Create `pnpm-workspace.yaml` listing `apps/*`, `packages/*`, `workers/*`
- [ ] Create `turbo.json` with `build`, `lint`, `test`, `typecheck`, `dev` pipelines
- [ ] Create `tsconfig.base.json` with strict TypeScript config and path aliases
- [ ] Scaffold `packages/shared/` with `package.json`, `tsconfig.json`, empty `src/index.ts`
- [ ] Scaffold `packages/eslint-config/` with shared flat config (TypeScript + Prettier)
- [ ] Scaffold `packages/worker-sdk/` with `package.json`, `tsconfig.json`, empty `src/index.ts`
- [ ] Scaffold `apps/api/` with `package.json`, `tsconfig.json`
- [ ] Scaffold `apps/web/` with `package.json`, `tsconfig.json`
- [ ] Scaffold `apps/cli/` with `package.json`, `tsconfig.json`
- [ ] Create root `package.json` with shared dev scripts
- [ ] Create `.gitignore` (node_modules, dist, .env, coverage)
- [ ] Create `LICENSE` (MIT)
- [ ] Verify `pnpm install` and `pnpm turbo build` succeed across all packages

---

### Task 1.2: Docker Compose Infrastructure

**Goal:** Define the full local development stack: PostgreSQL, Redis, RabbitMQ, MinIO, and the Smithy API — all orchestrated via Docker Compose.

**Design considerations:**
- Use named volumes for database persistence across container restarts
- MinIO needs an init container or health-check to create the default bucket
- RabbitMQ management plugin enabled for debugging (port 15672)
- `.env.example` provides all required environment variables with safe defaults
- API container mounts source for hot-reload during development (or runs outside Docker via `pnpm dev`)
- Separate `docker-compose.prod.yml` for production overrides (no source mounts, resource limits)

**Folder/file locations:**
- `/docker/docker-compose.yml` — development stack
- `/docker/docker-compose.prod.yml` — production overrides
- `/docker/.env.example` — environment variable template

**Todos:**
- [ ] Create `docker/docker-compose.yml` with services: `postgres`, `redis`, `rabbitmq`, `minio`, `api`
- [ ] Configure PostgreSQL service: image `postgres:16-alpine`, port 5432, named volume, health check
- [ ] Configure Redis service: image `redis:7-alpine`, port 6379, health check
- [ ] Configure RabbitMQ service: image `rabbitmq:3-management-alpine`, ports 5672 + 15672, health check
- [ ] Configure MinIO service: image `minio/minio`, port 9000 + 9001 (console), named volume, default bucket creation
- [ ] Configure API service: build from `apps/api/Dockerfile`, depends_on all infra services, env_file
- [ ] Create `docker/.env.example` with all required variables (DB URL, Redis URL, RabbitMQ URL, MinIO keys, AI provider keys)
- [ ] Create `docker/docker-compose.prod.yml` with resource limits, no source mounts, restart policies
- [ ] Verify `docker compose up` brings up all services and they pass health checks

---

### Task 1.3: Database Schema & Drizzle Setup

**Goal:** Define the complete Drizzle schema for all core entities and set up the migration workflow.

**Design considerations:**
- Schema organized by domain in separate files under `apps/api/src/database/schema/`
- Use `uuid` primary keys (native Postgres `gen_random_uuid()`) for all entities
- `created_at` and `updated_at` timestamps on all tables (with `updated_at` trigger)
- Package metadata stored as JSONB column for flexibility (convention-based types)
- Worker versions are immutable rows — new version = new row with incremented version number
- Assembly Line steps reference Worker versions (not Workers) for immutability
- Soft delete (`deleted_at` timestamp) on Packages for retention system

**Schema tables:**
- `packages` — id, type (string label), status, metadata (JSONB), assembly_line_id, current_step, created_by, deleted_at, created_at, updated_at
- `package_files` — id, package_id (FK), file_key (S3 key), filename, mime_type, size_bytes, created_at
- `workers` — id, name, slug (unique), description, created_at, updated_at
- `worker_versions` — id, worker_id (FK), version (int), yaml_config (JSONB), dockerfile_hash, status (active/deprecated), created_at
- `assembly_lines` — id, name, slug (unique), description, status (active/paused/archived), created_at, updated_at
- `assembly_line_steps` — id, assembly_line_id (FK), step_number (int), worker_version_id (FK), config_overrides (JSONB)
- `worker_pools` — id, name, slug (unique), description, status, max_concurrency, created_at, updated_at
- `worker_pool_members` — id, pool_id (FK), worker_version_id (FK), priority (int)
- `job_executions` — id, package_id (FK), worker_version_id (FK), status (enum), container_id, started_at, completed_at, error_message, retry_count, logs (JSONB)
- `notifications` — id, type (email/in_app/webhook), recipient, payload (JSONB), status, sent_at, created_at
- `webhook_endpoints` — id, url, secret, events (text[]), active, created_at

**Folder/file locations:**
- `/apps/api/src/database/schema/packages.ts`
- `/apps/api/src/database/schema/workers.ts`
- `/apps/api/src/database/schema/workflows.ts`
- `/apps/api/src/database/schema/jobs.ts`
- `/apps/api/src/database/schema/notifications.ts`
- `/apps/api/src/database/schema/index.ts` — re-exports all schemas
- `/apps/api/src/database/db.ts` — Drizzle client instantiation
- `/apps/api/drizzle.config.ts` — Drizzle Kit config

**Todos:**
- [ ] Install `drizzle-orm`, `drizzle-kit`, `postgres` (driver) in `apps/api`
- [ ] Create `apps/api/drizzle.config.ts` pointing to schema directory and Postgres connection
- [ ] Create `packages.ts` schema: `packages` table with JSONB metadata, status enum, soft delete
- [ ] Create `packages.ts` schema: `package_files` table with S3 key reference
- [ ] Create `workers.ts` schema: `workers` table with unique slug
- [ ] Create `workers.ts` schema: `worker_versions` table with immutable version rows
- [ ] Create `workflows.ts` schema: `assembly_lines` table with status enum
- [ ] Create `workflows.ts` schema: `assembly_line_steps` table with step ordering and Worker version FK
- [ ] Create `workflows.ts` schema: `worker_pools` table with concurrency config
- [ ] Create `workflows.ts` schema: `worker_pool_members` table with priority
- [ ] Create `jobs.ts` schema: `job_executions` table with full execution tracking
- [ ] Create `notifications.ts` schema: `notifications` and `webhook_endpoints` tables
- [ ] Create `index.ts` re-exporting all schemas
- [ ] Create `db.ts` with Drizzle client factory (connection pool config)
- [ ] Define all Drizzle relations for type-safe joins
- [ ] Generate initial migration with `drizzle-kit generate`
- [ ] Apply migration with `drizzle-kit migrate` against Docker Compose Postgres
- [ ] Add `db:generate`, `db:migrate`, `db:studio` scripts to `apps/api/package.json`

---

### Task 1.4: Shared Types Package

**Goal:** Define TypeScript types, enums, event definitions, and constants shared across all apps and packages.

**Design considerations:**
- Types must be isomorphic — usable in Node (backend), browser (frontend), and Bun (CLI)
- Event type definitions serve as the contract for RabbitMQ messages
- Worker state enum is the source of truth for the state machine
- Package types are string literals (convention-based) with a set of well-known defaults

**Folder/file locations:**
- `/packages/shared/src/types/package.ts` — Package, PackageFile, PackageType, PackageStatus
- `/packages/shared/src/types/worker.ts` — Worker, WorkerVersion, WorkerState, WorkerConfig
- `/packages/shared/src/types/workflow.ts` — AssemblyLine, AssemblyLineStep, WorkerPool, WorkerPoolMember
- `/packages/shared/src/types/job.ts` — JobExecution, JobStatus, RetryStrategy
- `/packages/shared/src/types/notification.ts` — Notification types
- `/packages/shared/src/events/index.ts` — Event type definitions (RabbitMQ message contracts)
- `/packages/shared/src/constants/index.ts` — Default package types, state enums, config defaults

**Todos:**
- [ ] Define `WorkerState` enum: `WAITING`, `WORKING`, `DONE`, `STUCK`, `ERROR`
- [ ] Define `PackageStatus` enum: `PENDING`, `IN_TRANSIT`, `PROCESSING`, `COMPLETED`, `FAILED`, `EXPIRED`
- [ ] Define `JobStatus` enum: `QUEUED`, `RUNNING`, `COMPLETED`, `STUCK`, `ERROR`, `CANCELLED`
- [ ] Define `Package` interface with type (string), metadata (Record), status, timestamps
- [ ] Define `PackageFile` interface with fileKey, filename, mimeType, sizeBytes
- [ ] Define `Worker` and `WorkerVersion` interfaces (version is immutable snapshot)
- [ ] Define `AssemblyLine` and `AssemblyLineStep` interfaces
- [ ] Define `WorkerPool` and `WorkerPoolMember` interfaces
- [ ] Define `JobExecution` interface with full execution lifecycle fields
- [ ] Define `RetryStrategy` type: `{ type: 'immediate' | 'backoff' | 'skip'; maxRetries?: number }`
- [ ] Define event types: `PackageCreated`, `WorkerStateChanged`, `JobStarted`, `JobCompleted`, `JobStuck`, `JobError`, `AssemblyLineCompleted`
- [ ] Define event payload structure: `{ eventType, timestamp, correlationId, payload: {...details} }`
- [ ] Define default package type constants: `USER_INPUT`, `SPECIFICATION`, `CODE`, `IMAGE`, `PULL_REQUEST`
- [ ] Export all types from `packages/shared/src/index.ts`
- [ ] Verify `pnpm turbo build` compiles shared package successfully

---

## Phase 2: Core Backend

### Task 2.1: NestJS Application Bootstrap

**Goal:** Set up the NestJS application with module structure, configuration management, database connection, health checks, and structured logging.

**Design considerations:**
- Use `@nestjs/config` with Zod validation for type-safe environment config
- Pino logger via `nestjs-pino` for structured JSON logs
- Global exception filter that returns consistent error responses
- Global validation pipe with `class-validator` for DTO validation
- CORS configured for frontend dev server origin
- Health check endpoint at `/health` for Docker Compose and Railway

**Folder/file locations:**
- `/apps/api/src/main.ts` — bootstrap with Pino, CORS, global pipes
- `/apps/api/src/app.module.ts` — root module importing all feature modules
- `/apps/api/src/config/configuration.ts` — Zod-validated config schema
- `/apps/api/src/config/config.module.ts` — NestJS ConfigModule setup
- `/apps/api/src/common/filters/http-exception.filter.ts` — global error handler
- `/apps/api/src/common/interceptors/logging.interceptor.ts` — request logging
- `/apps/api/src/common/pipes/validation.pipe.ts` — DTO validation
- `/apps/api/src/health/health.controller.ts` — health check endpoint

**Todos:**
- [ ] Initialize NestJS app: `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`
- [ ] Install and configure `nestjs-pino` for structured JSON logging
- [ ] Create `config/configuration.ts` with Zod schema for all env vars (DB, Redis, RabbitMQ, MinIO, AI keys)
- [ ] Create `config/config.module.ts` wrapping `@nestjs/config` with validation
- [ ] Create `DatabaseModule` that provides Drizzle client (from Task 1.3)
- [ ] Create global `HttpExceptionFilter` with consistent error response shape: `{ statusCode, message, error, timestamp }`
- [ ] Create global `ValidationPipe` configuration for DTO validation
- [ ] Create `HealthController` at `GET /health` checking DB, Redis, RabbitMQ connectivity
- [ ] Create `app.module.ts` importing Config, Database, Health modules
- [ ] Configure CORS in `main.ts` for `http://localhost:5173` (Vite dev server)
- [ ] Add `Dockerfile` for API with multi-stage build (deps → build → runtime)
- [ ] Verify API starts and `/health` returns 200

---

### Task 2.2: Storage Module (S3/MinIO)

**Goal:** Implement the file storage service for Package file blobs with S3-compatible API.

**Design considerations:**
- Use `@aws-sdk/client-s3` with endpoint override for MinIO in development
- Presigned URLs for direct browser upload (avoid proxying large files through API)
- File key format: `packages/{packageId}/{fileId}/{filename}` for organized storage
- Content-type detection and size validation before upload

**Folder/file locations:**
- `/apps/api/src/modules/storage/storage.module.ts`
- `/apps/api/src/modules/storage/storage.service.ts`
- `/apps/api/src/modules/storage/storage.config.ts`

**Todos:**
- [ ] Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
- [ ] Create `StorageConfig` reading S3 endpoint, bucket, access key, secret from config module
- [ ] Create `StorageService` with methods: `upload(key, buffer, contentType)`, `download(key)`, `delete(key)`, `getPresignedUploadUrl(key, contentType, expiresIn)`, `getPresignedDownloadUrl(key, expiresIn)`
- [ ] Implement `deleteByPrefix(prefix)` for bulk Package file deletion (retention system)
- [ ] Create `StorageModule` as a global module
- [ ] Write unit tests for `StorageService` (mock S3 client)
- [ ] Write integration test verifying upload/download against MinIO in Docker Compose

---

### Task 2.3: Package Module

**Goal:** Implement full Package CRUD, file management, lifecycle tracking, and retention system.

**Design considerations:**
- Packages are the central data model — all workflows operate on them
- Convention-based typing: `type` is a string field, not a foreign key; no schema validation
- Package status transitions must be enforced (e.g., can't go from COMPLETED back to PENDING)
- File uploads go to S3 via presigned URL, then the client confirms upload completion
- Retention system runs as a scheduled task (NestJS `@Cron`)

**Folder/file locations:**
- `/apps/api/src/modules/packages/packages.module.ts`
- `/apps/api/src/modules/packages/packages.controller.ts`
- `/apps/api/src/modules/packages/packages.service.ts`
- `/apps/api/src/modules/packages/dto/create-package.dto.ts`
- `/apps/api/src/modules/packages/dto/update-package.dto.ts`

**API Endpoints:**
- `POST /api/packages` — create Package with type, metadata
- `GET /api/packages` — list Packages (filterable by type, status, assembly_line_id)
- `GET /api/packages/:id` — get Package with files
- `PATCH /api/packages/:id` — update metadata, status
- `DELETE /api/packages/:id` — soft delete
- `POST /api/packages/:id/files/presign` — get presigned upload URL
- `POST /api/packages/:id/files/confirm` — confirm file upload (creates PackageFile record)
- `GET /api/packages/:id/files` — list files for Package
- `DELETE /api/packages/:id/files/:fileId` — remove file

**Todos:**
- [ ] Create DTOs: `CreatePackageDto` (type, metadata, assemblyLineId?), `UpdatePackageDto`, `PresignFileDto` (filename, contentType)
- [ ] Create `PackagesService` with CRUD operations using Drizzle
- [ ] Implement status transition validation (enum-based state machine)
- [ ] Implement `createPresignedUpload` using StorageService
- [ ] Implement `confirmFileUpload` that creates `package_files` row after S3 upload
- [ ] Implement `listFiles` and `deleteFile` (removes S3 object + DB row)
- [ ] Create `PackagesController` with all REST endpoints
- [ ] Implement pagination on `GET /api/packages` (cursor-based or offset)
- [ ] Implement filtering by type, status, assembly_line_id, date range
- [ ] Create retention scheduled task: query soft-deleted packages past retention period, delete S3 files, hard delete DB rows
- [ ] Write unit tests for PackagesService (mock Drizzle)
- [ ] Write integration tests for PackagesController (Supertest)

---

### Task 2.4: Worker Module

**Goal:** Implement Worker and WorkerVersion management, including YAML parsing, Dockerfile validation, and immutable versioning.

**Design considerations:**
- Workers have a mutable record (name, slug, description) and immutable versions
- Creating a new version requires uploading YAML + Dockerfile; version number auto-increments
- Worker YAML is parsed and stored as JSONB in `worker_versions.yaml_config`
- Worker discovery: scan `workers/` directory on startup for drop-in Workers
- Dockerfile is stored in S3 alongside Worker version artifacts

**Folder/file locations:**
- `/apps/api/src/modules/workers/workers.module.ts`
- `/apps/api/src/modules/workers/workers.controller.ts`
- `/apps/api/src/modules/workers/workers.service.ts`
- `/apps/api/src/modules/workers/worker-discovery.service.ts`
- `/apps/api/src/modules/workers/dto/create-worker.dto.ts`
- `/apps/api/src/modules/workers/dto/create-worker-version.dto.ts`

**API Endpoints:**
- `POST /api/workers` — register a new Worker
- `GET /api/workers` — list all Workers (with latest version info)
- `GET /api/workers/:slug` — get Worker details + version history
- `PATCH /api/workers/:slug` — update Worker metadata
- `POST /api/workers/:slug/versions` — create new immutable version (upload YAML + Dockerfile)
- `GET /api/workers/:slug/versions/:version` — get specific version details
- `PATCH /api/workers/:slug/versions/:version` — deprecate a version (status change only)

**Todos:**
- [ ] Create DTOs: `CreateWorkerDto` (name, description), `CreateWorkerVersionDto` (yamlConfig, dockerfile)
- [ ] Create `WorkersService` with CRUD for Workers and version management
- [ ] Implement auto-incrementing version numbers per Worker
- [ ] Implement YAML parsing and validation (required fields: name, inputTypes, outputType, provider config)
- [ ] Implement Dockerfile storage in S3 under `workers/{slug}/v{version}/Dockerfile`
- [ ] Create `WorkerDiscoveryService` that scans `workers/` directory on app startup
- [ ] Discovery service: for each subfolder, read `worker.yaml` + `Dockerfile`, register or update Worker + version
- [ ] Create `WorkersController` with all REST endpoints
- [ ] Implement version deprecation (soft status change, no deletion)
- [ ] Write unit tests for WorkersService
- [ ] Write integration tests for WorkersController

---

### Task 2.5: Assembly Line Module

**Goal:** Implement Assembly Line CRUD, step ordering, and the orchestration engine that moves Packages through sequential steps.

**Design considerations:**
- Assembly Line steps are ordered (step_number) and reference specific Worker versions (immutability)
- Orchestrator listens to RabbitMQ for step completion events and routes to next step
- Each step has its own RabbitMQ queue: `assembly.{lineSlug}.step.{stepNumber}`
- Package's `current_step` in DB tracks progress for UI/API queries
- Scaling: up to (Steps - 1) Packages on a line simultaneously — natural from the queue-per-step model
- Scaling out: multiple Assembly Lines of the same configuration run independently

**Folder/file locations:**
- `/apps/api/src/modules/workflows/assembly-lines/assembly-lines.controller.ts`
- `/apps/api/src/modules/workflows/assembly-lines/assembly-lines.service.ts`
- `/apps/api/src/modules/workflows/assembly-lines/assembly-line-orchestrator.service.ts`
- `/apps/api/src/modules/workflows/assembly-lines/dto/`

**API Endpoints:**
- `POST /api/assembly-lines` — create Assembly Line with steps
- `GET /api/assembly-lines` — list all Assembly Lines
- `GET /api/assembly-lines/:slug` — get Assembly Line with steps and current state
- `PATCH /api/assembly-lines/:slug` — update metadata, pause/resume
- `DELETE /api/assembly-lines/:slug` — archive (soft delete)
- `POST /api/assembly-lines/:slug/submit` — submit a Package to the line (starts at step 1)
- `GET /api/assembly-lines/:slug/packages` — list Packages currently on the line with their step positions

**Todos:**
- [ ] Create DTOs: `CreateAssemblyLineDto` (name, steps: [{workerVersionId, configOverrides}])
- [ ] Create `AssemblyLinesService` with CRUD for lines and step management
- [ ] Implement step ordering validation (no gaps, sequential numbers)
- [ ] Implement `submit` method: create Package, set current_step=1, publish to step 1 queue
- [ ] Create `AssemblyLineOrchestratorService`:
  - [ ] Listen to `job.completed` events from RabbitMQ
  - [ ] On completion: update Package `current_step`, publish to next step queue
  - [ ] On final step completion: mark Package as COMPLETED, emit `assembly-line.completed` event
  - [ ] On job error/stuck: update Package status accordingly
- [ ] Create RabbitMQ queue topology: exchange `smithy.assembly` with topic routing, queues per step
- [ ] Create `AssemblyLinesController` with all REST endpoints
- [ ] Implement pause/resume: paused lines stop publishing to next step queues (jobs in progress complete)
- [ ] Write unit tests for orchestrator logic
- [ ] Write integration tests for full Assembly Line flow (mock container execution)

---

### Task 2.6: Worker Pool Module

**Goal:** Implement Worker Pool management and the round-robin routing engine for loose workflows.

**Design considerations:**
- Worker Pools accept Packages matching any member Worker's input types
- Round-robin routing: maintain a counter per Pool, cycle through eligible Workers
- Pool members have a priority field for future priority-based routing (unused in MVP, but schema supports it)
- Packages submitted to a Pool go to a shared queue; the Pool router dequeues and assigns

**Folder/file locations:**
- `/apps/api/src/modules/workflows/worker-pools/worker-pools.controller.ts`
- `/apps/api/src/modules/workflows/worker-pools/worker-pools.service.ts`
- `/apps/api/src/modules/workflows/worker-pools/pool-router.service.ts`
- `/apps/api/src/modules/workflows/worker-pools/dto/`

**API Endpoints:**
- `POST /api/worker-pools` — create Pool with member Workers
- `GET /api/worker-pools` — list all Pools
- `GET /api/worker-pools/:slug` — get Pool with members and queue depth
- `PATCH /api/worker-pools/:slug` — update members, concurrency
- `DELETE /api/worker-pools/:slug` — archive
- `POST /api/worker-pools/:slug/submit` — submit a Package to the Pool

**Todos:**
- [ ] Create DTOs: `CreateWorkerPoolDto` (name, members: [{workerVersionId, priority}], maxConcurrency)
- [ ] Create `WorkerPoolsService` with CRUD for Pools and member management
- [ ] Create `PoolRouterService`:
  - [ ] Maintain round-robin counter (in Redis for persistence across restarts)
  - [ ] On Package submission: validate type compatibility, select next Worker via round-robin
  - [ ] Publish job to Worker-specific queue
  - [ ] Respect global container concurrency limit (check before dispatching)
- [ ] Create RabbitMQ queue topology: exchange `smithy.pool` with routing
- [ ] Create `WorkerPoolsController` with all REST endpoints
- [ ] Write unit tests for round-robin logic
- [ ] Write integration tests for Pool routing

---

## Phase 3: Worker Runtime

### Task 3.1: Container Manager

**Goal:** Implement the Docker container lifecycle manager that spins up ephemeral Worker containers, streams logs, and tears them down after completion.

**Design considerations:**
- Uses `docker compose run --rm` via child process to execute Workers in ephemeral containers
- Each Worker version has a Dockerfile; images are built and cached on version creation
- Container environment: AI provider keys (from env), Package input (mounted or fetched via API), Worker config
- Logs are streamed from container stdout/stderr and stored in `job_executions.logs`
- Global concurrency limit enforced here: queue jobs when limit reached
- Container output (Package files) uploaded to S3 by the Worker SDK, not the container manager

**Folder/file locations:**
- `/apps/api/src/modules/containers/containers.module.ts`
- `/apps/api/src/modules/containers/container-manager.service.ts`
- `/apps/api/src/modules/containers/container-builder.service.ts`
- `/apps/api/src/modules/containers/container.types.ts`

**Todos:**
- [ ] Create `ContainerBuilderService`:
  - [ ] `buildWorkerImage(workerSlug, version, dockerfilePath)` — runs `docker build` with cache
  - [ ] `imageExists(tag)` — check if image is already built
  - [ ] Image tagging convention: `smithy-worker-{slug}:{version}`
- [ ] Create `ContainerManagerService`:
  - [ ] Maintain active container counter (Redis) for global concurrency limit
  - [ ] `runJob(jobExecution)` — build image if needed, create temp dir with Package input files, run container with env + mounted input, stream logs, capture exit code
  - [ ] Environment variables passed to container: `SMITHY_JOB_ID`, `SMITHY_PACKAGE_ID`, `SMITHY_API_URL`, `SMITHY_API_KEY` (for callback), AI provider keys from env
  - [ ] On container exit 0: mark job completed, emit `job.completed` event
  - [ ] On container exit non-0: mark job error, emit `job.error` event
  - [ ] On timeout (configurable per Worker): kill container, mark error
  - [ ] `cancelJob(jobId)` — stop running container
- [ ] Implement job queue for when concurrency limit is reached (backed by RabbitMQ or in-memory)
- [ ] Implement log streaming: pipe container stdout/stderr to structured log entries, store in DB
- [ ] Write unit tests for concurrency limiting logic
- [ ] Write integration tests (requires Docker-in-Docker or actual Docker access)

---

### Task 3.2: Worker SDK

**Goal:** Build the TypeScript SDK that Worker authors use to implement custom Workers, providing lifecycle hooks, AI interaction, and Package I/O.

**Design considerations:**
- SDK runs INSIDE the Worker container — it's the framework Workers import
- Base class `SmithyWorker` with lifecycle methods: `onReceive(package)`, `onProcess(context)`, `onComplete(output)`, `onError(error)`
- `WorkerContext` provides: AI client (Vercel AI SDK), input Package files, output builder, logger, API client for callbacks
- The SDK communicates back to Smithy API via REST (using `SMITHY_API_URL` env var) for: status updates, interactive questions (STUCK state), output Package creation
- For STUCK state: SDK calls API endpoint, which pushes question via Socket.IO, then polls/waits for response
- Dockerfile.base provides Node runtime + SDK pre-installed

**Folder/file locations:**
- `/packages/worker-sdk/src/base-worker.ts` — abstract SmithyWorker class
- `/packages/worker-sdk/src/context.ts` — WorkerContext with AI, files, logger
- `/packages/worker-sdk/src/ai.ts` — Vercel AI SDK wrapper configured from env
- `/packages/worker-sdk/src/api-client.ts` — REST client for Smithy API callbacks
- `/packages/worker-sdk/src/runner.ts` — Entry point that loads Worker class and orchestrates lifecycle
- `/packages/worker-sdk/Dockerfile.base` — Base Docker image for Workers

**Todos:**
- [ ] Create `SmithyWorker` abstract class with lifecycle hook signatures
- [ ] Create `WorkerContext` class:
  - [ ] `ai` — configured Vercel AI SDK instance (provider from YAML config env vars)
  - [ ] `inputPackage` — parsed Package with file access methods
  - [ ] `outputBuilder` — methods to create output Package: `addFile(name, content, type)`, `setMetadata(key, value)`
  - [ ] `logger` — structured logger that streams to container stdout
  - [ ] `askQuestion(question, options?)` — enters STUCK state, sends question to API, awaits response
- [ ] Create `ApiClient` using fetch for callbacks: `updateStatus(state)`, `submitQuestion(question)`, `awaitAnswer(questionId)`, `createOutputPackage(files, metadata)`
- [ ] Create `AiProvider` wrapper that reads YAML config to determine provider and model, instantiates Vercel AI SDK
- [ ] Create `runner.ts` entry point:
  - [ ] Read YAML config from mounted path
  - [ ] Dynamically import Worker TS class
  - [ ] Create context, call lifecycle hooks in order
  - [ ] Handle errors: call `onError`, report to API
  - [ ] Process exit with appropriate code
- [ ] Create `Dockerfile.base`:
  - [ ] Node 20 alpine base
  - [ ] Install `@smithy/worker-sdk` and `ai` package
  - [ ] Set entry point to `runner.ts`
- [ ] Create YAML config type definition: `{ name, inputTypes[], outputType, provider: { name, model, apiKeyEnv }, tools?: [...], timeout? }`
- [ ] Write unit tests for lifecycle orchestration (mock API client)
- [ ] Create a minimal test Worker to validate SDK end-to-end

---

### Task 3.3: Example Workers

**Goal:** Create example Workers that demonstrate SDK usage and serve as templates for custom Worker development.

**Design considerations:**
- Examples should cover: simple (text→text), interactive (STUCK state), multi-file (code), and tool-using Workers
- Each example is a complete drop-in Worker: `worker.yaml`, `worker.ts`, `Dockerfile`
- Examples double as integration test fixtures

**Folder/file locations:**
- `/workers/examples/summarizer/` — simple text summarization
- `/workers/examples/code-reviewer/` — code review with tool use
- `/workers/examples/spec-writer/` — interactive spec writing (uses STUCK state)

**Todos:**
- [ ] Create `summarizer` Worker: accepts USER_INPUT, outputs SPECIFICATION; simple prompt, no tools
- [ ] Create `code-reviewer` Worker: accepts CODE, outputs CODE; uses file reading tools, provides review + suggestions
- [ ] Create `spec-writer` Worker: accepts USER_INPUT, outputs SPECIFICATION; asks clarifying questions (STUCK state), produces detailed spec
- [ ] Each Worker: YAML config, TypeScript class extending SmithyWorker, Dockerfile extending base image
- [ ] Verify all example Workers build and run in containers
- [ ] Add example Workers to worker discovery path

---

## Phase 4: Real-time & Communication

### Task 4.1: RabbitMQ Event System

**Goal:** Implement the event bus using RabbitMQ with coarse events carrying rich payloads.

**Design considerations:**
- Use `amqplib` (or `@golevelup/nestjs-rabbitmq` for NestJS integration)
- Exchange topology: `smithy.events` (topic exchange) for all domain events
- Routing keys follow pattern: `{domain}.{entity}.{action}` — e.g., `package.created`, `job.state.changed`, `assembly-line.completed`
- Event payloads include: `eventType`, `timestamp`, `correlationId` (Package ID for tracing), and domain-specific details (step number, files changed, summary)
- Dead letter exchange for failed message processing

**Folder/file locations:**
- `/apps/api/src/modules/events/events.module.ts`
- `/apps/api/src/modules/events/event-bus.service.ts`
- `/apps/api/src/modules/events/event-handlers/` — consumer handlers organized by domain
- `/apps/api/src/modules/events/event.types.ts`

**Todos:**
- [ ] Install `@golevelup/nestjs-rabbitmq`
- [ ] Create `EventsModule` with RabbitMQ connection config
- [ ] Create `EventBusService` with `publish(routingKey, event)` method
- [ ] Define exchange topology: `smithy.events` (topic), `smithy.events.dlx` (dead letter)
- [ ] Create event handler decorators / registration for consumers
- [ ] Implement event handlers:
  - [ ] `package.*` events → update in-app notifications, trigger webhooks
  - [ ] `job.state.changed` → update job_executions table, notify via Socket.IO
  - [ ] `assembly-line.completed` → send email notification, trigger webhook
  - [ ] `job.error` → send email notification
- [ ] Add correlation ID propagation across event chains
- [ ] Write unit tests for EventBusService
- [ ] Write integration tests verifying event flow end-to-end

---

### Task 4.2: WebSocket Gateway (Socket.IO)

**Goal:** Implement real-time bidirectional communication for Worker interactions, live status updates, and Phaser view synchronization.

**Design considerations:**
- Socket.IO with Redis adapter for horizontal scaling
- Namespaces: `/workflows` for Assembly Line / Pool updates, `/jobs` for job-level events, `/interactive` for Worker questions
- Rooms: one room per Assembly Line, Worker Pool, and active interactive session
- Client joins rooms by Assembly Line or Pool slug; receives all events for that workflow
- Interactive flow: Worker SDK → API → Socket.IO push question to client → client responds → API → Worker SDK polls response

**Folder/file locations:**
- `/apps/api/src/modules/realtime/realtime.module.ts`
- `/apps/api/src/modules/realtime/realtime.gateway.ts`
- `/apps/api/src/modules/realtime/interactive.gateway.ts`
- `/apps/api/src/modules/realtime/realtime.service.ts`

**Todos:**
- [ ] Install `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@socket.io/redis-adapter`
- [ ] Create `RealtimeModule` with Socket.IO configuration and Redis adapter
- [ ] Create `RealtimeGateway`:
  - [ ] Handle `subscribe:assembly-line` / `subscribe:worker-pool` events — join client to room
  - [ ] Handle `unsubscribe:*` events
  - [ ] Broadcast workflow events to rooms: `package:status`, `job:state`, `assembly-line:progress`
- [ ] Create `InteractiveGateway`:
  - [ ] Handle `interactive:subscribe` — join client to interactive session room
  - [ ] Emit `interactive:question` when Worker enters STUCK state
  - [ ] Handle `interactive:answer` from client — store answer, notify Worker (via API/polling)
- [ ] Create `RealtimeService` — bridge between RabbitMQ events and Socket.IO emissions
  - [ ] Subscribe to RabbitMQ events
  - [ ] Transform events into Socket.IO room broadcasts
- [ ] Implement connection authentication (placeholder for MVP, prepare for multi-tenant)
- [ ] Write integration tests for Socket.IO event flow

---

### Task 4.3: Notification System

**Goal:** Implement email (Resend), in-app, and outgoing webhook notifications triggered by system events.

**Design considerations:**
- Notifications triggered by RabbitMQ event consumers (from Task 4.1)
- Email: Resend API with React Email templates for rich HTML emails
- In-app: stored in `notifications` table, pushed via Socket.IO
- Webhooks: outgoing HTTP POST to configured endpoints with HMAC signature verification
- Webhook retry: 3 attempts with exponential backoff on failure

**Folder/file locations:**
- `/apps/api/src/modules/notifications/notifications.module.ts`
- `/apps/api/src/modules/notifications/notifications.service.ts`
- `/apps/api/src/modules/notifications/channels/email.service.ts`
- `/apps/api/src/modules/notifications/channels/in-app.service.ts`
- `/apps/api/src/modules/notifications/channels/webhook.service.ts`
- `/apps/api/src/modules/notifications/notifications.controller.ts`

**API Endpoints:**
- `GET /api/notifications` — list in-app notifications (paginated, filterable)
- `PATCH /api/notifications/:id/read` — mark as read
- `POST /api/webhook-endpoints` — register webhook endpoint
- `GET /api/webhook-endpoints` — list webhook endpoints
- `DELETE /api/webhook-endpoints/:id` — remove webhook endpoint

**Todos:**
- [ ] Install `resend` SDK
- [ ] Create `EmailService` with Resend integration:
  - [ ] `sendAssemblyLineCompleted(recipient, lineDetails)`
  - [ ] `sendWorkerError(recipient, errorDetails)`
  - [ ] `sendWorkerStuck(recipient, questionDetails)`
- [ ] Create `InAppService`:
  - [ ] `createNotification(type, payload)` — persist to DB, push via Socket.IO
  - [ ] `markRead(notificationId)`
  - [ ] `listForUser(filters, pagination)`
- [ ] Create `WebhookService`:
  - [ ] `deliverWebhook(endpointId, event)` — HTTP POST with HMAC signature
  - [ ] Implement retry queue (3 attempts, exponential backoff)
  - [ ] `registerEndpoint(url, secret, events[])`
- [ ] Create `NotificationsService` facade that routes events to appropriate channels
- [ ] Create `NotificationsController` for in-app notification management and webhook endpoint CRUD
- [ ] Write unit tests for each channel service
- [ ] Write integration tests for webhook delivery

---

### Task 4.4: Log Ingestion & Viewer API

**Goal:** Implement log storage and retrieval for Worker container logs and system events.

**Design considerations:**
- Worker container logs (stdout/stderr) streamed by ContainerManager and stored in `job_executions.logs` as JSONB array
- System logs emitted by Pino, searchable via log viewer
- Log viewer API provides filtered, paginated access to job logs
- Real-time log streaming via Socket.IO for active jobs

**Folder/file locations:**
- `/apps/api/src/modules/logs/logs.module.ts`
- `/apps/api/src/modules/logs/logs.service.ts`
- `/apps/api/src/modules/logs/logs.controller.ts`

**API Endpoints:**
- `GET /api/jobs/:jobId/logs` — get logs for a specific job execution (paginated, filterable by level)
- `GET /api/logs/stream/:jobId` — SSE endpoint for real-time log streaming of active jobs

**Todos:**
- [ ] Create `LogsService`:
  - [ ] `appendLog(jobId, entry: {level, message, timestamp, metadata})` — append to JSONB array
  - [ ] `getLogs(jobId, filters: {level?, after?, before?}, pagination)` — query with JSONB operators
  - [ ] `streamLogs(jobId)` — return Observable that emits new log entries as they arrive
- [ ] Create `LogsController` with REST and SSE endpoints
- [ ] Create SSE endpoint using NestJS `@Sse()` decorator for real-time log streaming
- [ ] Integrate with Socket.IO: emit log entries to job-specific rooms for Phaser/dashboard live view
- [ ] Write unit tests for log filtering and pagination
- [ ] Write integration tests for SSE streaming

---

## Phase 5: Frontend — Managerial Dashboard

### Task 5.1: React Application Scaffold

**Goal:** Set up the Vite + React application with routing, layout, API client, state management, and Socket.IO connection.

**Design considerations:**
- React Router for page routing with layout wrapper
- TanStack Query provider at root with default config (stale time, retry)
- Zustand store for client state: current view (managerial/factory), Socket.IO connection state, notification count
- Socket.IO client auto-connects on mount, joins relevant rooms based on current page
- shadcn/ui requires Tailwind CSS v4, RadixUI primitives, and `cn()` utility

**Folder/file locations:**
- `/apps/web/src/main.tsx` — React root with providers
- `/apps/web/src/app.tsx` — Router definition
- `/apps/web/src/layouts/shell.tsx` — App shell with sidebar, header, notification bell
- `/apps/web/src/api/client.ts` — Fetch-based API client (base URL from env)
- `/apps/web/src/api/socket.ts` — Socket.IO client singleton
- `/apps/web/src/stores/app.store.ts` — Zustand app state
- `/apps/web/src/lib/utils.ts` — `cn()` and shared utilities
- `/apps/web/tailwind.config.ts` — Tailwind config with shadcn/ui theme
- `/apps/web/components.json` — shadcn/ui config

**Todos:**
- [ ] Initialize Vite app: `pnpm create vite apps/web --template react-ts`
- [ ] Install dependencies: `react-router-dom`, `@tanstack/react-query`, `zustand`, `socket.io-client`, `tailwindcss`, `clsx`, `tailwind-merge`
- [ ] Configure Tailwind CSS with shadcn/ui theme (CSS variables for colors)
- [ ] Initialize shadcn/ui: `components.json`, install base components (Button, Card, Input, Dialog, Sheet, DropdownMenu, Table, Badge, Tabs)
- [ ] Create `api/client.ts`: typed fetch wrapper with base URL, error handling, JSON parsing
- [ ] Create `api/socket.ts`: Socket.IO client with auto-reconnection, event type definitions
- [ ] Create `stores/app.store.ts`: Zustand store for view mode, socket state, notification state
- [ ] Create `layouts/shell.tsx`: sidebar navigation (Assembly Lines, Worker Pools, Packages, Workers, Logs, Factory), header with notification bell
- [ ] Create `app.tsx` with React Router routes for all pages
- [ ] Create `main.tsx` with QueryClientProvider, RouterProvider, Zustand hydration
- [ ] Add proxy config in `vite.config.ts` for API requests to `http://localhost:3000`
- [ ] Verify dev server starts and shell layout renders

---

### Task 5.2: Dashboard Home Page

**Goal:** Create the main dashboard page showing system overview with key metrics and recent activity.

**Design considerations:**
- Cards showing: active Assembly Lines, active Worker Pools, Packages in transit, running containers (vs. global limit)
- Recent activity feed (last 20 events from Socket.IO)
- Quick actions: submit new Package, create Assembly Line

**Folder/file locations:**
- `/apps/web/src/pages/dashboard/index.tsx`
- `/apps/web/src/pages/dashboard/components/stats-cards.tsx`
- `/apps/web/src/pages/dashboard/components/activity-feed.tsx`
- `/apps/web/src/api/hooks/use-dashboard-stats.ts`

**Todos:**
- [ ] Create `useDashboardStats` TanStack Query hook: fetch counts from API
- [ ] Create `StatsCards` component: 4 cards with Assembly Line count, Pool count, in-transit Packages, running/max containers
- [ ] Create `ActivityFeed` component: real-time event list from Socket.IO, with event type icons and timestamps
- [ ] Create dashboard page composing stats + activity + quick action buttons
- [ ] Add Socket.IO subscription to global events room for activity feed
- [ ] Style with shadcn/ui Card, Badge components

---

### Task 5.3: Assembly Line Management Pages

**Goal:** Create pages for listing, creating, viewing, and managing Assembly Lines.

**Folder/file locations:**
- `/apps/web/src/pages/assembly-lines/index.tsx` — list page
- `/apps/web/src/pages/assembly-lines/[slug].tsx` — detail page
- `/apps/web/src/pages/assembly-lines/create.tsx` — creation form
- `/apps/web/src/pages/assembly-lines/components/step-editor.tsx` — step ordering UI
- `/apps/web/src/pages/assembly-lines/components/pipeline-visualization.tsx` — step flow diagram
- `/apps/web/src/pages/assembly-lines/components/package-tracker.tsx` — Packages on line
- `/apps/web/src/api/hooks/use-assembly-lines.ts`

**Todos:**
- [ ] Create TanStack Query hooks: `useAssemblyLines()`, `useAssemblyLine(slug)`, `useCreateAssemblyLine()`, `useSubmitPackage(slug)`
- [ ] Create list page: table with name, status, step count, active packages, actions
- [ ] Create step editor component: drag-and-drop step ordering, Worker version selector per step
- [ ] Create creation form: name, description, step editor
- [ ] Create detail page: pipeline visualization (horizontal flow diagram), package tracker showing each Package's position
- [ ] Create pipeline visualization: boxes per step with Worker name, current Package (if any), status indicator
- [ ] Create package tracker: table of Packages with current step, status, timing
- [ ] Add real-time updates via Socket.IO: Package movement, step completion, errors
- [ ] Create submit Package dialog: type selector, metadata fields, file upload

---

### Task 5.4: Worker Pool Management Pages

**Goal:** Create pages for listing, creating, viewing, and managing Worker Pools.

**Folder/file locations:**
- `/apps/web/src/pages/worker-pools/index.tsx` — list page
- `/apps/web/src/pages/worker-pools/[slug].tsx` — detail page
- `/apps/web/src/pages/worker-pools/create.tsx` — creation form
- `/apps/web/src/pages/worker-pools/components/pool-status.tsx`
- `/apps/web/src/api/hooks/use-worker-pools.ts`

**Todos:**
- [ ] Create TanStack Query hooks: `useWorkerPools()`, `useWorkerPool(slug)`, `useCreateWorkerPool()`
- [ ] Create list page: table with name, member count, queue depth, concurrency usage
- [ ] Create creation form: name, Worker member selector (multi-select), max concurrency setting
- [ ] Create detail page: member list with status indicators, queue depth, active jobs
- [ ] Create pool status component: visual representation of pool utilization (active/max containers)
- [ ] Add real-time updates via Socket.IO

---

### Task 5.5: Package Management Pages

**Goal:** Create pages for viewing, tracking, and managing Packages across all workflows.

**Folder/file locations:**
- `/apps/web/src/pages/packages/index.tsx` — list page
- `/apps/web/src/pages/packages/[id].tsx` — detail page
- `/apps/web/src/pages/packages/components/package-files.tsx`
- `/apps/web/src/pages/packages/components/job-history.tsx`
- `/apps/web/src/api/hooks/use-packages.ts`

**Todos:**
- [ ] Create TanStack Query hooks: `usePackages(filters)`, `usePackage(id)`, `usePackageFiles(id)`
- [ ] Create list page: filterable table (by type, status, workflow), search, pagination
- [ ] Create detail page: metadata display, status timeline, file list with download links
- [ ] Create package files component: file list with preview (text/code), download via presigned URLs
- [ ] Create job history component: timeline of all job executions for this Package (step-by-step for Assembly Lines)
- [ ] Add interactive response UI: when a Package's Worker is STUCK, show the question and answer form

---

### Task 5.6: Worker Management Pages

**Goal:** Create pages for viewing Workers, their versions, and configuration.

**Folder/file locations:**
- `/apps/web/src/pages/workers/index.tsx` — list page
- `/apps/web/src/pages/workers/[slug].tsx` — detail page
- `/apps/web/src/pages/workers/components/version-history.tsx`
- `/apps/web/src/pages/workers/components/yaml-viewer.tsx`
- `/apps/web/src/api/hooks/use-workers.ts`

**Todos:**
- [ ] Create TanStack Query hooks: `useWorkers()`, `useWorker(slug)`, `useCreateWorkerVersion(slug)`
- [ ] Create list page: card grid with Worker name, latest version, input/output types, status
- [ ] Create detail page: Worker info, version history table, YAML config viewer
- [ ] Create version history component: version list with status (active/deprecated), created date
- [ ] Create YAML viewer component: syntax-highlighted YAML display
- [ ] Create new version upload form: YAML editor + Dockerfile upload

---

### Task 5.7: Log Viewer Page

**Goal:** Create a log viewer with filtering, search, and real-time streaming for active job logs.

**Folder/file locations:**
- `/apps/web/src/pages/logs/index.tsx`
- `/apps/web/src/pages/logs/components/log-stream.tsx`
- `/apps/web/src/pages/logs/components/log-filters.tsx`
- `/apps/web/src/api/hooks/use-logs.ts`

**Todos:**
- [ ] Create TanStack Query hooks: `useJobLogs(jobId, filters)`, `useLogStream(jobId)` (SSE)
- [ ] Create log viewer page: job selector, log level filter, time range filter, search
- [ ] Create log stream component: auto-scrolling log output with level-based color coding
- [ ] Implement real-time log streaming via SSE for active jobs
- [ ] Create log filters component: log level checkboxes, timestamp range picker
- [ ] Implement virtual scrolling for large log outputs (react-window or similar)

---

## Phase 6: Frontend — Phaser Factory Floor

### Task 6.1: Phaser Integration & Scene Setup

**Goal:** Integrate Phaser 3 into the React application with isometric rendering, camera controls, and the Zustand↔Phaser bridge.

**Design considerations:**
- Phaser instance created inside a React component via `useEffect`
- Game config: WebGL renderer, isometric plugin or custom isometric math
- Camera: pan with drag, zoom with scroll wheel, smooth follow
- Zustand↔Phaser bridge: Zustand store updates trigger Phaser scene updates; Phaser click events update Zustand store
- Multiple scenes: one scene per Assembly Line view, one for Worker Pool view, main factory overview

**Folder/file locations:**
- `/apps/web/src/pages/factory/index.tsx` — React page wrapping Phaser
- `/apps/web/src/phaser/game.ts` — Phaser game instance creation
- `/apps/web/src/phaser/config.ts` — Phaser game config
- `/apps/web/src/phaser/scenes/boot-scene.ts` — asset loading
- `/apps/web/src/phaser/scenes/factory-scene.ts` — main factory floor
- `/apps/web/src/phaser/systems/isometric.ts` — iso coordinate math
- `/apps/web/src/phaser/systems/camera-controller.ts` — pan/zoom
- `/apps/web/src/phaser/bridge.ts` — Zustand ↔ Phaser event bridge

**Todos:**
- [ ] Install `phaser` package
- [ ] Create `PhaserGame` React component: creates Phaser instance on mount, destroys on unmount
- [ ] Create `game.ts`: Phaser.Game factory with config (WebGL, transparent background for React overlay)
- [ ] Create `isometric.ts`: cartesian↔isometric coordinate conversion, tile size constants, depth sorting utility
- [ ] Create `camera-controller.ts`: drag-to-pan, scroll-to-zoom, bounds limiting, smooth pan/zoom
- [ ] Create `boot-scene.ts`: preload all sprite sheets, tilesets, and audio
- [ ] Create `factory-scene.ts`: main scene with isometric tile grid floor
- [ ] Create `bridge.ts`:
  - [ ] Subscribe Phaser scene to Zustand store changes (workflow state, Package positions)
  - [ ] Emit Zustand actions from Phaser click events (select Worker, select Package)
  - [ ] Bidirectional sync for real-time data flow
- [ ] Verify Phaser canvas renders inside React page with basic isometric grid

---

### Task 6.2: Factory Floor Tileset & Layout

**Goal:** Create the isometric factory floor with distinct areas per Assembly Line and Worker Pool, conveyor belts, and environmental details.

**Design considerations:**
- Factory layout auto-generated from workflow configuration: each Assembly Line = a "room" or "section" with Workers as machines along a conveyor belt
- Worker Pools = separate areas with Worker machines arranged in a cluster
- Conveyor belts connect Workers in Assembly Lines sequentially
- Environmental sprites: floors, walls, decorative machines, lighting
- Art pack system: sprite sheets loaded from configurable path (default or user-supplied)

**Folder/file locations:**
- `/apps/web/src/phaser/scenes/factory-scene.ts` (extended)
- `/apps/web/src/phaser/systems/layout-generator.ts` — auto-layout algorithm
- `/apps/web/src/phaser/objects/floor-tile.ts`
- `/apps/web/src/phaser/objects/conveyor-belt.ts`
- `/apps/web/src/phaser/objects/wall.ts`
- `/apps/web/src/phaser/assets/` — default sprite sheets (placeholder initially)

**Todos:**
- [ ] Create `LayoutGenerator`: given Assembly Lines and Worker Pools, compute isometric positions for rooms, machines, belts
- [ ] Create `FloorTile` game object: isometric floor tile with depth sorting
- [ ] Create `ConveyorBelt` game object: animated belt sprite connecting Worker positions in Assembly Lines
- [ ] Create `Wall` game object: isometric wall segments for room boundaries
- [ ] Implement room generation: each Assembly Line gets a rectangular room area
- [ ] Implement conveyor belt routing: belts follow step order between Worker machine positions
- [ ] Create placeholder art: colored rectangles for floors, simple animated strips for belts
- [ ] Implement art pack loading: read sprite sheet paths from config, support custom art packs
- [ ] Add camera bounds based on generated layout size

---

### Task 6.3: Worker & Package Sprites

**Goal:** Create animated game objects representing Workers (as machines/characters) and Packages (as crates/boxes) on the factory floor.

**Design considerations:**
- Workers displayed as machine sprites at fixed positions in Assembly Lines / Pools
- Worker state reflected visually: idle animation (WAITING), working animation (WORKING), flashing/alert (STUCK), red indicator (ERROR), green checkmark (DONE)
- Packages as small crate sprites that move along conveyor belts between Workers
- Package movement animated smoothly along isometric conveyor belt paths
- Click on Worker → shows details panel in React (via Zustand bridge)
- Click on Package → shows Package details in React

**Folder/file locations:**
- `/apps/web/src/phaser/objects/worker-machine.ts` — Worker game object
- `/apps/web/src/phaser/objects/package-crate.ts` — Package game object
- `/apps/web/src/phaser/systems/animation-manager.ts` — centralized animation definitions
- `/apps/web/src/phaser/systems/package-mover.ts` — Package movement along belts

**Todos:**
- [ ] Create `WorkerMachine` game object:
  - [ ] Position on isometric grid
  - [ ] State-dependent animations: idle, working (gears turning), stuck (flashing), error (red glow), done (green pulse)
  - [ ] Hover tooltip with Worker name and status
  - [ ] Click handler → update Zustand store with selected Worker
- [ ] Create `PackageCrate` game object:
  - [ ] Small crate/box sprite with type-based color coding
  - [ ] Smooth isometric movement along conveyor belt path (tweens)
  - [ ] Click handler → update Zustand store with selected Package
- [ ] Create `PackageMover` system:
  - [ ] Calculate isometric path between Worker positions along conveyor belt
  - [ ] Animate Package movement with easing
  - [ ] Handle arrival at Worker: Package "enters" machine (fade/shrink)
  - [ ] Handle exit from Worker: Package "exits" machine (fade in/grow) and moves to next
- [ ] Create `AnimationManager`: define all sprite sheet animations centrally
- [ ] Integrate with Zustand bridge: update sprite states when workflow state changes
- [ ] Implement depth sorting for correct visual overlap of sprites

---

### Task 6.4: Real-time Factory Sync

**Goal:** Connect the Phaser factory floor to live workflow data via Socket.IO, so the factory view reflects real-time system state.

**Design considerations:**
- Socket.IO events → Zustand store → Phaser bridge → sprite updates
- Package creation → new crate appears at Assembly Line start or Pool entrance
- Job started → crate enters Worker machine
- Job completed → crate exits machine, moves along belt to next Worker
- Job stuck → Worker machine switches to flashing animation
- Assembly Line completed → crate exits last machine, success animation
- Smooth interpolation: don't teleport sprites, animate transitions over 500-1000ms

**Folder/file locations:**
- `/apps/web/src/phaser/systems/realtime-sync.ts`
- `/apps/web/src/stores/factory.store.ts` — Zustand store for factory-specific state

**Todos:**
- [ ] Create `factory.store.ts`: Zustand store for factory state (Worker positions, Package positions, active animations)
- [ ] Create `RealtimeSync` system:
  - [ ] Listen to Socket.IO events via Zustand bridge
  - [ ] Map `package:status` events to Package sprite creation/movement/removal
  - [ ] Map `job:state` events to Worker machine animation changes
  - [ ] Map `assembly-line:progress` events to conveyor belt activation
- [ ] Implement smooth Package movement: on step change, animate crate from current position to next Worker
- [ ] Implement Worker state transitions: smooth animation changes with transition effects
- [ ] Handle edge cases: Package creation during scene (add sprite mid-scene), Package deletion (remove sprite gracefully)
- [ ] Add visual feedback for events: particle effects on Package completion, shake effect on errors
- [ ] Write integration tests: mock Socket.IO events, verify Phaser sprite state changes

---

### Task 6.5: Factory UI Overlays

**Goal:** Create React-rendered UI panels that overlay the Phaser canvas for detailed information when clicking Workers or Packages.

**Design considerations:**
- When user clicks a Worker machine in Phaser → React panel slides in from right showing Worker details, current job, logs
- When user clicks a Package crate → React panel shows Package metadata, files, position in workflow
- Interactive Worker (STUCK state) → overlay shows the question form directly on the factory view
- Panels are React components rendered on top of Phaser canvas (absolute positioning)

**Folder/file locations:**
- `/apps/web/src/pages/factory/components/worker-detail-panel.tsx`
- `/apps/web/src/pages/factory/components/package-detail-panel.tsx`
- `/apps/web/src/pages/factory/components/interactive-panel.tsx`
- `/apps/web/src/pages/factory/components/factory-toolbar.tsx`

**Todos:**
- [ ] Create `WorkerDetailPanel`: Worker name, version, state, current job progress, recent logs, configuration
- [ ] Create `PackageDetailPanel`: Package type, metadata, files (with download), position in workflow, job history
- [ ] Create `InteractivePanel`: question display, answer input field, submit button — for STUCK Worker interactions
- [ ] Create `FactoryToolbar`: zoom controls, Assembly Line/Pool selector, submit Package button, toggle managerial view
- [ ] Wire panels to Zustand store: show/hide based on selected Worker/Package
- [ ] Style panels with shadcn/ui components, semi-transparent background to show factory behind
- [ ] Ensure panels don't interfere with Phaser input handling (pointer events pass-through when not over panel)

---

## Phase 7: CLI

### Task 7.1: CLI Scaffold & API Client

**Goal:** Set up the Bun-based CLI with command structure and shared API client.

**Design considerations:**
- CLI lives in `apps/cli/` as a workspace package
- Uses Bun for fast startup (no compilation step needed)
- Command structure: `smithy <category> <action>` (e.g., `smithy worker scaffold`, `smithy submit`)
- API client reuses types from `@smithy/shared` package
- Configuration file at `~/.smithy/config.json` for API URL and settings

**Folder/file locations:**
- `/apps/cli/src/index.ts` — entry point, command routing
- `/apps/cli/src/lib/api-client.ts` — typed API client
- `/apps/cli/src/lib/config.ts` — CLI config management
- `/apps/cli/src/lib/output.ts` — formatted console output (tables, colors, spinners)

**Todos:**
- [ ] Create CLI entry point with argument parsing (use `commander` or manual `process.argv` parsing)
- [ ] Create `ApiClient` class: typed fetch wrapper using `@smithy/shared` types, reads API URL from config
- [ ] Create `ConfigManager`: read/write `~/.smithy/config.json` for API URL, default settings
- [ ] Create output helpers: table formatter, spinner (ora), colored status indicators (chalk)
- [ ] Add `bin` field to `package.json` pointing to entry point
- [ ] Add `smithy` alias via `pnpm` workspace linking for local development
- [ ] Verify `smithy --help` prints command list

---

### Task 7.2: Dev Commands

**Goal:** Implement developer-facing CLI commands for scaffolding, testing, and linting Workers.

**Commands:**
- `smithy worker scaffold <name>` — generate Worker boilerplate (YAML + TS + Dockerfile)
- `smithy worker test <path>` — run Worker locally with test input
- `smithy worker lint <path>` — validate Worker YAML and TypeScript
- `smithy worker build <path>` — build Worker Docker image locally

**Folder/file locations:**
- `/apps/cli/src/commands/dev/scaffold.ts`
- `/apps/cli/src/commands/dev/test.ts`
- `/apps/cli/src/commands/dev/lint.ts`
- `/apps/cli/src/commands/dev/build.ts`
- `/apps/cli/src/templates/` — Worker scaffold templates

**Todos:**
- [ ] Create `scaffold` command: prompt for Worker name, input/output types, AI provider; generate `worker.yaml`, `worker.ts` (with SmithyWorker base class), `Dockerfile` from templates
- [ ] Create scaffold templates: YAML template with placeholders, TS template with lifecycle hooks, Dockerfile extending base image
- [ ] Create `test` command: build Worker image, run container with test input Package (from stdin or file), display output
- [ ] Create `lint` command: parse YAML for required fields, TypeScript type-check, Dockerfile syntax validation
- [ ] Create `build` command: run `docker build` for Worker directory, tag image
- [ ] Write tests for scaffold template generation
- [ ] Write tests for YAML validation logic

---

### Task 7.3: Ops Commands

**Goal:** Implement operational CLI commands for submitting Packages, checking status, viewing logs, and managing configuration.

**Commands:**
- `smithy submit <type> [--line <slug>] [--pool <slug>] [--file <path>]` — submit Package
- `smithy status [--line <slug>] [--pool <slug>]` — show workflow status
- `smithy logs <job-id> [--follow]` — view job logs
- `smithy packages [--type <type>] [--status <status>]` — list Packages
- `smithy config set <key> <value>` — set CLI configuration
- `smithy config get <key>` — get CLI configuration

**Folder/file locations:**
- `/apps/cli/src/commands/ops/submit.ts`
- `/apps/cli/src/commands/ops/status.ts`
- `/apps/cli/src/commands/ops/logs.ts`
- `/apps/cli/src/commands/ops/packages.ts`
- `/apps/cli/src/commands/ops/config.ts`

**Todos:**
- [ ] Create `submit` command: read input from file or stdin, upload files via presigned URL, create Package via API, display Package ID
- [ ] Create `status` command: fetch Assembly Line or Worker Pool status, display as formatted table with step positions
- [ ] Create `logs` command: fetch job logs, display with level-based coloring; `--follow` uses SSE for real-time streaming
- [ ] Create `packages` command: list Packages with filters, display as table
- [ ] Create `config` commands: read/write `~/.smithy/config.json`
- [ ] Add interactive mode for `submit`: if Package type requires metadata, prompt for key-value pairs
- [ ] Write tests for each command (mock API responses)

---

## Phase 8: Quality, Polish & Deployment

### Task 8.1: Authentication Preparation

**Goal:** Lay the groundwork for multi-tenant authentication without implementing it for MVP. Create middleware stubs and database schema additions that can be activated later.

**Design considerations:**
- MVP: no auth, single user assumed
- Prepare: user table schema, auth middleware that passes through, tenant context placeholder
- Future: JWT-based auth, team/org model, RBAC

**Folder/file locations:**
- `/apps/api/src/common/guards/auth.guard.ts` — passthrough guard (MVP), swappable to real auth
- `/apps/api/src/common/decorators/current-user.decorator.ts` — returns stub user
- `/apps/api/src/database/schema/auth.ts` — users table (not enforced yet)

**Todos:**
- [ ] Create `auth.ts` schema: `users` table (id, email, name, created_at) — created but not required by other tables
- [ ] Create `AuthGuard` that always passes (returns a default user context)
- [ ] Create `@CurrentUser()` parameter decorator that returns stub user from guard
- [ ] Add `// TODO: multi-tenant` comments at all tenancy-relevant points
- [ ] Document the auth migration path in code comments

---

### Task 8.2: End-to-End Testing

**Goal:** Create comprehensive E2E tests covering the critical user journeys across both UIs.

**Design considerations:**
- Playwright for browser-based E2E
- Tests run against full Docker Compose stack
- Test fixtures: pre-seeded Workers, Assembly Lines, test Packages
- Critical paths: submit Package → Assembly Line → completion; interactive Worker flow; Pool submission

**Folder/file locations:**
- `/apps/web/e2e/` — Playwright test files
- `/apps/web/e2e/fixtures/` — test data and helpers
- `/apps/web/playwright.config.ts`

**Todos:**
- [ ] Configure Playwright: install browsers, set base URL, configure web server command
- [ ] Create test fixtures: seed database with example Workers, Assembly Line, Worker Pool
- [ ] E2E: Submit Package via managerial UI → verify it appears in Assembly Line → verify step progression → verify completion
- [ ] E2E: Submit Package to Worker Pool → verify routing → verify completion
- [ ] E2E: Interactive Worker flow → submit Package → Worker goes STUCK → answer question in UI → Worker continues → completion
- [ ] E2E: Navigate to Factory view → verify Phaser canvas loads → verify sprites render for active workflows
- [ ] E2E: View Package details → download file → verify content
- [ ] E2E: View job logs → verify log entries appear
- [ ] Create CI-compatible test script that starts Docker Compose, seeds data, runs tests, tears down

---

### Task 8.3: CI/CD Pipeline

**Goal:** Set up GitHub Actions for continuous integration with linting, type checking, testing, and Docker image building.

**Folder/file locations:**
- `/.github/workflows/ci.yml` — main CI pipeline
- `/.github/workflows/deploy.yml` — deployment pipeline (Railway)

**Todos:**
- [ ] Create `ci.yml`:
  - [ ] Trigger on push to main and pull requests
  - [ ] Install pnpm + Node
  - [ ] `pnpm install --frozen-lockfile`
  - [ ] `pnpm turbo lint` — ESLint across all packages
  - [ ] `pnpm turbo typecheck` — TypeScript compilation check
  - [ ] `pnpm turbo test` — unit + integration tests (Vitest)
  - [ ] Start Docker Compose services for integration tests
  - [ ] Run E2E tests (Playwright)
  - [ ] Upload test reports and coverage
- [ ] Create `deploy.yml`:
  - [ ] Trigger on push to main (after CI passes)
  - [ ] Build Docker images for API and Web
  - [ ] Deploy to Railway (or push to container registry)
- [ ] Add branch protection rules documentation

---

### Task 8.4: Docker Compose Production Config

**Goal:** Create production-ready Docker Compose configuration with proper resource limits, restart policies, and security settings.

**Folder/file locations:**
- `/docker/docker-compose.prod.yml` (enhanced from Task 1.2)
- `/docker/nginx.conf` — reverse proxy config (if needed)

**Todos:**
- [ ] Update `docker-compose.prod.yml`:
  - [ ] Resource limits (memory, CPU) for all services
  - [ ] Restart policies (`unless-stopped`)
  - [ ] No source volume mounts
  - [ ] Production environment variables
  - [ ] Health check intervals tuned for production
- [ ] Add Nginx reverse proxy service (optional): SSL termination, rate limiting, static file serving
- [ ] Create `.env.production.example` with all production-required variables
- [ ] Document deployment process for on-prem users
- [ ] Test full production stack locally

---

### Task 8.5: Railway Deployment Configuration

**Goal:** Configure Railway deployment for cloud hosting with managed services.

**Design considerations:**
- Railway provides managed PostgreSQL, Redis; use those instead of self-hosting
- RabbitMQ may need a plugin or separate service (CloudAMQP)
- MinIO replaced with actual S3 or Railway-compatible object storage
- Environment variables set via Railway dashboard

**Folder/file locations:**
- `/railway.toml` — Railway service configuration
- `/Procfile` — process definitions (if needed)

**Todos:**
- [ ] Create `railway.toml` with service definitions: API, Web (static build)
- [ ] Document Railway setup: create project, provision PostgreSQL, Redis
- [ ] Document RabbitMQ cloud option (CloudAMQP free tier or Railway plugin)
- [ ] Document S3 bucket setup for production file storage
- [ ] Configure build commands and start commands in Railway config
- [ ] Test deployment end-to-end on Railway

---

### Task 8.6: Retention System Implementation

**Goal:** Implement the configurable Package retention system that cleans up expired Packages and their files.

**Design considerations:**
- Retention period configurable via environment variable (default: 30 days)
- Scheduled task runs daily (NestJS `@Cron`)
- Soft-deleted Packages past retention: delete S3 files, then hard delete DB rows
- Completed Packages past retention: soft delete first, then follow same flow
- Log all retention actions for auditability

**Folder/file locations:**
- `/apps/api/src/modules/packages/retention.service.ts`

**Todos:**
- [ ] Create `RetentionService` with `@Cron('0 2 * * *')` (daily at 2 AM)
- [ ] Query Packages where `deleted_at < NOW() - retention_period` OR `status = COMPLETED AND completed_at < NOW() - retention_period`
- [ ] For each expired Package: delete all S3 files via `StorageService.deleteByPrefix`, hard delete `package_files` rows, hard delete `package` row
- [ ] Log retention actions with Package IDs and file counts
- [ ] Make retention period configurable via config module
- [ ] Add dry-run mode for testing
- [ ] Write unit tests for retention query logic
- [ ] Write integration test for full retention cycle

---

## Phase Dependency Graph

```
Phase 1 (Foundation)
  ├── Task 1.1: Monorepo Scaffold
  ├── Task 1.2: Docker Compose Infrastructure ← depends on 1.1
  ├── Task 1.3: Database Schema ← depends on 1.1, 1.2
  └── Task 1.4: Shared Types ← depends on 1.1

Phase 2 (Core Backend) ← depends on Phase 1
  ├── Task 2.1: NestJS Bootstrap ← depends on 1.1, 1.3
  ├── Task 2.2: Storage Module ← depends on 2.1
  ├── Task 2.3: Package Module ← depends on 2.1, 2.2
  ├── Task 2.4: Worker Module ← depends on 2.1, 2.2
  ├── Task 2.5: Assembly Line Module ← depends on 2.3, 2.4
  └── Task 2.6: Worker Pool Module ← depends on 2.3, 2.4

Phase 3 (Worker Runtime) ← depends on Phase 2
  ├── Task 3.1: Container Manager ← depends on 2.4, 2.5
  ├── Task 3.2: Worker SDK ← depends on 1.4
  └── Task 3.3: Example Workers ← depends on 3.1, 3.2

Phase 4 (Real-time & Comms) ← depends on Phase 2
  ├── Task 4.1: RabbitMQ Events ← depends on 2.1
  ├── Task 4.2: WebSocket Gateway ← depends on 4.1
  ├── Task 4.3: Notification System ← depends on 4.1, 4.2
  └── Task 4.4: Log Viewer API ← depends on 2.1

Phase 5 (Managerial UI) ← depends on Phase 2, 4
  ├── Task 5.1: React Scaffold ← depends on 1.1
  ├── Task 5.2: Dashboard ← depends on 5.1
  ├── Task 5.3: Assembly Lines ← depends on 5.1, 2.5
  ├── Task 5.4: Worker Pools ← depends on 5.1, 2.6
  ├── Task 5.5: Packages ← depends on 5.1, 2.3
  ├── Task 5.6: Workers ← depends on 5.1, 2.4
  └── Task 5.7: Log Viewer ← depends on 5.1, 4.4

Phase 6 (Phaser Factory) ← depends on Phase 5
  ├── Task 6.1: Phaser Integration ← depends on 5.1
  ├── Task 6.2: Factory Layout ← depends on 6.1
  ├── Task 6.3: Worker/Package Sprites ← depends on 6.2
  ├── Task 6.4: Real-time Sync ← depends on 6.3, 4.2
  └── Task 6.5: Factory Overlays ← depends on 6.3

Phase 7 (CLI) ← depends on Phase 2
  ├── Task 7.1: CLI Scaffold ← depends on 1.4
  ├── Task 7.2: Dev Commands ← depends on 7.1
  └── Task 7.3: Ops Commands ← depends on 7.1

Phase 8 (Quality & Deploy) ← depends on all phases
  ├── Task 8.1: Auth Preparation ← depends on 2.1
  ├── Task 8.2: E2E Testing ← depends on Phase 5, 6
  ├── Task 8.3: CI/CD Pipeline ← depends on all tests
  ├── Task 8.4: Docker Prod Config ← depends on 1.2
  ├── Task 8.5: Railway Deployment ← depends on 8.3, 8.4
  └── Task 8.6: Retention System ← depends on 2.3
```

## Parallel Execution Opportunities

The following tasks can be worked on simultaneously by independent agents:

| Parallel Group | Tasks | Rationale |
|---|---|---|
| **Foundation** | 1.1 → then 1.2, 1.3, 1.4 in parallel | Schema, Docker, and types are independent after monorepo exists |
| **Backend core** | 2.3 + 2.4 in parallel after 2.1 + 2.2 | Packages and Workers are independent modules |
| **Workflow engines** | 2.5 + 2.6 in parallel | Assembly Lines and Worker Pools are independent engines |
| **Runtime + Events** | Phase 3 + Phase 4 in parallel | Container management and event system are independent |
| **Frontend + CLI** | Phase 5 + Phase 7 in parallel | UI and CLI are independent frontend consumers of the same API |
| **Phaser** | Phase 6 (after 5.1 scaffold) | Can start Phaser integration as soon as React scaffold exists |
| **Quality** | 8.1 + 8.6 can start early (after Phase 2) | Auth stubs and retention are independent of frontend |
