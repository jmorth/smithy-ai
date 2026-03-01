# Task 011: Create Docker Compose Dev Stack

## Summary
Create a Docker Compose file with PostgreSQL 16, Redis 7, RabbitMQ 3 (with management plugin), and MinIO (S3-compatible object storage), all with health checks and named volumes. This provides the complete local development infrastructure stack that the API and workers depend on for data persistence, caching, message brokering, and file storage.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 001 (Initialize pnpm Workspace)
- **Blocks**: 012 (Environment Template), 013+ (database schema tasks need running Postgres)

## Architecture Reference
The Smithy infrastructure stack consists of four services:
- **PostgreSQL 16** — Primary data store for packages, workers, workflows, jobs, notifications
- **Redis 7** — Caching layer, rate limiting, and pub/sub for real-time features
- **RabbitMQ 3** — Message broker for async job dispatch, event bus, and worker communication
- **MinIO** — S3-compatible object storage for package files, worker artifacts, and logs

All services run as Docker containers during local development. In production, these would be managed services (RDS, ElastiCache, Amazon MQ, S3), but the Docker Compose stack mirrors the production topology.

## Files and Folders
- `/docker/docker-compose.yml` — Docker Compose v3 configuration with all four services, health checks, named volumes, and network

## Acceptance Criteria
- [ ] `docker compose -f docker/docker-compose.yml up -d` starts all 4 services
- [ ] All services have health checks that report healthy within 30 seconds
- [ ] PostgreSQL accessible on port 5432 with database `smithy`, user `smithy`, password `smithy`
- [ ] Redis accessible on port 6379
- [ ] RabbitMQ accessible on port 5672 (AMQP); management UI on port 15672
- [ ] MinIO accessible on port 9000 (API); console on port 9001
- [ ] Named volumes persist data across container restarts (`docker compose down` + `up` retains data)
- [ ] A default MinIO bucket named `smithy` is created on startup
- [ ] All services are on a shared Docker network for inter-service communication
- [ ] `docker compose -f docker/docker-compose.yml down` cleanly stops all services

## Implementation Notes
- Use Alpine-based images for smaller footprint: `postgres:16-alpine`, `redis:7-alpine`, `rabbitmq:3-management-alpine`, `minio/minio`.
- PostgreSQL health check: `pg_isready -U smithy`
- Redis health check: `redis-cli ping`
- RabbitMQ health check: `rabbitmq-diagnostics -q ping`
- MinIO health check: `mc ready local` or `curl -f http://localhost:9000/minio/health/live`
- For the MinIO default bucket, use one of these approaches:
  1. A separate `minio-init` service that runs `mc alias set local http://minio:9000 ... && mc mb local/smithy --ignore-existing` then exits
  2. An entrypoint script on the MinIO container itself
  Option 1 (init container) is cleaner and more reliable.
- MinIO needs `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` environment variables.
- Use environment variables with defaults (via `${VAR:-default}` syntax) so values can be overridden via `.env` file.
- RabbitMQ should have a default user/password configured for development (e.g., `smithy`/`smithy`).
- Consider adding `restart: unless-stopped` for development convenience.
