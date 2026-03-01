# Task 007: Scaffold NestJS API Application

## Summary
Create the `apps/api` NestJS application skeleton with `package.json`, `tsconfig.json`, a minimal `src/main.ts` bootstrap, `src/app.module.ts` root module, and the directory structure for all planned feature modules. This is the primary backend application that exposes REST APIs, manages the database, orchestrates workers, and handles real-time communication.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 001 (Initialize pnpm Workspace), 003 (TypeScript Base Config)
- **Blocks**: 022-051 (all backend tasks in Phase 2)

## Architecture Reference
The NestJS API is the central application in Smithy. It:
- Serves REST endpoints for packages, workers, workflows, jobs, and configuration
- Manages PostgreSQL via Drizzle ORM
- Publishes and consumes events via RabbitMQ
- Pushes real-time updates via SSE or WebSockets
- Coordinates container orchestration for worker execution
- Handles file storage via MinIO (S3-compatible)

The module structure follows NestJS conventions with feature modules under `src/modules/`.

## Files and Folders
- `/apps/api/package.json` — Package manifest with NestJS dependencies, scripts for `dev`, `build`, `start`, `test`
- `/apps/api/tsconfig.json` — TypeScript config extending `../../tsconfig.base.json`, with NestJS-specific settings
- `/apps/api/src/main.ts` — NestJS bootstrap file (`NestFactory.create`)
- `/apps/api/src/app.module.ts` — Root AppModule importing feature modules
- `/apps/api/src/modules/packages/` — Empty directory for Package module
- `/apps/api/src/modules/workers/` — Empty directory for Worker module
- `/apps/api/src/modules/workflows/` — Empty directory for Workflow module
- `/apps/api/src/modules/events/` — Empty directory for Event Bus module
- `/apps/api/src/modules/containers/` — Empty directory for Container module
- `/apps/api/src/modules/storage/` — Empty directory for Storage module
- `/apps/api/src/modules/realtime/` — Empty directory for Realtime module
- `/apps/api/src/modules/notifications/` — Empty directory for Notification module
- `/apps/api/src/modules/logs/` — Empty directory for Logs module
- `/apps/api/src/common/` — Empty directory for shared decorators, guards, filters, pipes
- `/apps/api/src/config/` — Empty directory for configuration module
- `/apps/api/src/database/` — Empty directory for Drizzle ORM setup

## Acceptance Criteria
- [ ] `pnpm --filter api build` compiles without error
- [ ] NestJS app bootstraps successfully (starts and listens on a port, even if it serves no routes)
- [ ] Directory structure matches the planned module layout
- [ ] `package.json` depends on `@smithy/shared` via workspace protocol
- [ ] `package.json` has scripts: `dev` (watch mode), `build`, `start`, `start:dev`, `test`
- [ ] `tsconfig.json` extends `../../tsconfig.base.json` and enables `emitDecoratorMetadata` and `experimentalDecorators`
- [ ] `main.ts` creates and starts the NestJS application with a configurable port (from env or default 3000)
- [ ] `app.module.ts` is a valid NestJS module (even if it imports nothing yet)
- [ ] Empty module directories exist with `.gitkeep` or placeholder files

## Implementation Notes
- NestJS requires `emitDecoratorMetadata: true` and `experimentalDecorators: true` in tsconfig — add these in the app-level tsconfig, not the base.
- Use `@nestjs/platform-express` as the HTTP adapter.
- Install core NestJS packages: `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs`.
- For the `dev` script, use `nest start --watch` or `tsx watch` or `ts-node-dev` — pick whichever aligns best with the monorepo setup.
- The `main.ts` should read `process.env.PORT` or default to `3000`.
- Add a simple health check GET `/` route in `app.module.ts` or a dedicated controller to verify the app starts.
- Place `.gitkeep` files in empty directories so they are tracked by git.
