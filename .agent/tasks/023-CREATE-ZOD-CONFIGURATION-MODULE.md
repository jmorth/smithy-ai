# Task 023: Create Zod Configuration Module

## Summary
Create a NestJS ConfigModule wrapper that validates all environment variables using Zod schemas at application startup. This ensures the app fails fast with clear error messages when required configuration is missing or invalid, and provides type-safe config access throughout the codebase.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 022 (Bootstrap NestJS Application), 012 (Environment Variable Template)
- **Blocks**: 024 (Database Provider Module), 025 (Global Exception Filter), 026 (Global Validation Pipe), 027 (Health Check Controller), 028 (API Dockerfile), 029 (S3 Storage Service)

## Architecture Reference
NestJS `@nestjs/config` provides ConfigModule/ConfigService for environment variable management. This task layers Zod validation on top so every env var is parsed and typed at startup. The validated config object is then accessible via `ConfigService.get<T>()` with full type safety. All downstream modules (database, Redis, RabbitMQ, S3, AI providers) read their connection strings and credentials from this centralized config.

## Files and Folders
- `/apps/api/src/config/env.schema.ts` — Zod schema defining all environment variables with types, defaults, and validation rules
- `/apps/api/src/config/configuration.ts` — Factory function that parses `process.env` through the Zod schema and returns a typed config object
- `/apps/api/src/config/config.module.ts` — NestJS module wrapping `ConfigModule.forRoot()` with the Zod-validated factory

## Acceptance Criteria
- [ ] Zod schema validates all required environment variables: `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`
- [ ] Zod schema validates optional environment variables with defaults: `APP_PORT` (default `3000`), `CORS_ORIGIN` (default `http://localhost:5173`), `NODE_ENV` (default `development`), `RETENTION_DAYS` (default `30`)
- [ ] Zod schema validates AI provider keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (both optional — at least one should be present but not enforced at schema level)
- [ ] Zod schema validates optional `RESEND_API_KEY` for email notifications
- [ ] Application crashes on startup with a clear, human-readable error message when required env vars are missing
- [ ] Application crashes on startup when env vars have invalid formats (e.g., non-numeric port, malformed URL)
- [ ] Typed config is accessible via `ConfigService` with proper TypeScript types throughout the application
- [ ] ConfigModule is registered as global (no need to import in every feature module)

## Implementation Notes
- Use `ConfigModule.forRoot({ isGlobal: true, load: [configuration] })` where `configuration` is the Zod-parsing factory.
- The Zod schema should use `.url()` for URL fields, `.number().int().positive()` for ports, and `.string().min(1)` for required strings.
- Consider grouping config into namespaces: `database`, `redis`, `rabbitmq`, `minio`, `ai`, `app`. This makes `ConfigService.get('database.url')` reads cleaner.
- The `.env.example` from task 012 should align with the variables defined here. If discrepancies are found, update the schema to match reality.
- For development, `DATABASE_URL` typically looks like `postgresql://smithy:smithy@localhost:5432/smithy`.
- Use Zod's `.transform()` to coerce string env vars to proper types (e.g., `APP_PORT` string to number).
