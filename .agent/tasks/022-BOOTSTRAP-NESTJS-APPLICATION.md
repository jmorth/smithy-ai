# Task 022: Bootstrap NestJS Application

## Summary
Set up the NestJS application entry point in `main.ts` with Pino logger (via nestjs-pino), CORS configured for `http://localhost:5173`, a global `/api` prefix, and wire up the root `AppModule`. This is the runtime entry point that all other backend modules depend on to serve traffic.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 007 (NestJS API App Scaffold)
- **Blocks**: 023 (Zod Configuration Module), 024 (Database Provider Module), 025 (Global Exception Filter), 026 (Global Validation Pipe), 027 (Health Check Controller), 028 (API Dockerfile)

## Architecture Reference
The API application lives at `apps/api/` in the Turborepo monorepo. NestJS bootstraps from `main.ts`, creating the application instance from the root `AppModule`. Pino is used for structured JSON logging via `nestjs-pino` (LoggerModule). The app sits behind a Vite React frontend at `localhost:5173` during development, requiring CORS. All routes are prefixed with `/api` so a reverse proxy can split traffic by path.

## Files and Folders
- `/apps/api/src/main.ts` — Application bootstrap: create NestJS app, attach Pino logger, enable CORS, set global prefix, listen on configurable port
- `/apps/api/src/app.module.ts` — Root module importing LoggerModule and placeholder for future module imports

## Acceptance Criteria
- [ ] Application bootstraps successfully with `pnpm --filter api dev`
- [ ] Pino logger is attached as the application logger (structured JSON output in production, pretty-print in development)
- [ ] CORS is enabled for `http://localhost:5173` (configurable via env var `CORS_ORIGIN`)
- [ ] All routes are prefixed with `/api`
- [ ] Application listens on port from `APP_PORT` environment variable (default `3000`)
- [ ] Graceful shutdown is enabled via `app.enableShutdownHooks()`
- [ ] `nestjs-pino` LoggerModule is imported in AppModule
- [ ] Startup log message includes the port number

## Implementation Notes
- Install `nestjs-pino` and `pino-http` as dependencies; `pino-pretty` as a devDependency for local development.
- Use `LoggerModule.forRoot()` with sensible defaults: request logging enabled, auto-logging of request/response, redact authorization headers.
- The CORS origin should be read from an environment variable but has a sensible default for development. Do not over-engineer config at this stage — task 023 introduces the full Zod-validated config.
- `app.enableShutdownHooks()` ensures NestJS lifecycle hooks (`onModuleDestroy`, `beforeApplicationShutdown`) fire on SIGTERM/SIGINT, which is critical for clean database connection teardown.
- Keep `AppModule` minimal — it will grow as subsequent tasks add feature modules.
