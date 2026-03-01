# Task 012: Create Docker Compose Environment Template

## Summary
Create a `.env.example` file with all required environment variables for the Docker Compose stack and the API application, including safe development defaults and explanatory comments. This serves as both documentation of required configuration and a quick-start template that developers can copy to `.env` to get running immediately.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 011 (Docker Compose Dev Stack)
- **Blocks**: 022 (NestJS bootstrap reads these vars)

## Architecture Reference
Environment variables configure connections to all infrastructure services (Postgres, Redis, RabbitMQ, MinIO), API behavior (port, environment), and external service credentials (AI providers, email). The `.env.example` file documents the complete set of variables the system expects, with safe defaults for local development.

## Files and Folders
- `/docker/.env.example` — Environment variable template with all required variables, defaults, and documentation comments

## Acceptance Criteria
- [ ] Contains `DATABASE_URL` with default pointing to Docker Compose Postgres (`postgresql://smithy:smithy@localhost:5432/smithy`)
- [ ] Contains `REDIS_URL` with default (`redis://localhost:6379`)
- [ ] Contains `RABBITMQ_URL` with default (`amqp://smithy:smithy@localhost:5672`)
- [ ] Contains `MINIO_ENDPOINT` with default (`http://localhost:9000`)
- [ ] Contains `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` with development defaults
- [ ] Contains `MINIO_BUCKET` with default (`smithy`)
- [ ] Contains `RESEND_API_KEY` as a placeholder (empty or `your-resend-api-key`)
- [ ] Contains AI provider key placeholders: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- [ ] Contains `APP_PORT` with default (`3000`)
- [ ] Contains `NODE_ENV` with default (`development`)
- [ ] Every variable has a comment explaining its purpose
- [ ] All defaults are safe for local development (no production credentials)
- [ ] File can be copied to `.env` and used immediately with Docker Compose

## Implementation Notes
- Group variables by service with section headers (e.g., `# === PostgreSQL ===`, `# === Redis ===`, etc.).
- Include additional variables that will be needed later even if not consumed yet: `JWT_SECRET`, `CORS_ORIGIN`, `LOG_LEVEL`.
- For AI provider keys, use a comment like `# Required for AI-powered workers. Get your key at https://...`.
- The `RESEND_API_KEY` is for the email notification service (Resend) — mark it as optional for basic development.
- Ensure the values here match the defaults in `docker-compose.yml` exactly to avoid confusion.
- Consider also including `RABBITMQ_MANAGEMENT_URL=http://localhost:15672` and `MINIO_CONSOLE_URL=http://localhost:9001` as convenience variables for developer reference.
