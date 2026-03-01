# Task 027: Create Health Check Controller

## Summary
Create a health check endpoint at `GET /health` that verifies connectivity to PostgreSQL, Redis, and RabbitMQ, returning service-level status for each. This endpoint is used by Docker Compose health checks, load balancers, and Kubernetes probes to determine application readiness.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 022 (Bootstrap NestJS Application), 024 (Database Provider Module)
- **Blocks**: 011 (Docker Compose stack — the API service health check uses this endpoint)

## Architecture Reference
The health endpoint sits outside the `/api` prefix (registered at the root level) so infrastructure tooling can reach it without knowing the API prefix. It checks three critical dependencies: PostgreSQL (via the Drizzle/pg pool), Redis (via ioredis ping), and RabbitMQ (via amqplib connection check). Each service reports independently so operators can pinpoint which dependency is failing.

## Files and Folders
- `/apps/api/src/health/health.module.ts` — NestJS module for health check components
- `/apps/api/src/health/health.controller.ts` — Controller with `GET /health` endpoint
- `/apps/api/src/health/health.service.ts` — Service that performs connectivity checks for each dependency

## Acceptance Criteria
- [ ] `GET /health` returns 200 when all services are reachable with body: `{ status: "ok", services: { database: "up", redis: "up", rabbitmq: "up" }, timestamp: "<ISO 8601>" }`
- [ ] `GET /health` returns 503 when any service is unreachable with body: `{ status: "degraded", services: { database: "up"|"down", redis: "up"|"down", rabbitmq: "up"|"down" }, timestamp: "<ISO 8601>" }`
- [ ] Failed services include an `error` field with a brief description (not a stack trace)
- [ ] Database check performs a `SELECT 1` query via the injected Drizzle/pg pool
- [ ] Redis check performs a `PING` command
- [ ] RabbitMQ check attempts a connection or channel operation
- [ ] Each check has a timeout (default 3 seconds) — a hanging connection is reported as "down"
- [ ] The endpoint is excluded from the `/api` global prefix (accessible at `/health`, not `/api/health`)
- [ ] Health check module is imported in AppModule

## Implementation Notes
- To exclude from the global prefix, either: (a) use `@Controller()` with no path and set the route path explicitly, then configure the global prefix to exclude this path; or (b) register the health controller on a separate router. The simplest NestJS approach is to use `app.setGlobalPrefix('api', { exclude: ['health'] })` in `main.ts`.
- For Redis, inject an ioredis client. If a RedisModule doesn't exist yet, create a minimal provider that connects using `REDIS_URL` from ConfigService. This can be extracted into a proper RedisModule later.
- For RabbitMQ, use `amqplib` to attempt a connection. If a RabbitMQ module doesn't exist yet, perform a direct connection check using the `RABBITMQ_URL` from ConfigService.
- Wrap each check in a try/catch with a timeout using `Promise.race([check(), timeout(3000)])`.
- Consider using `@nestjs/terminus` for a more structured health check framework, but a manual implementation is acceptable and has fewer dependencies.
- Do NOT log health check requests at info level — they would flood logs. Configure Pino to exclude `/health` or log it at debug level.
