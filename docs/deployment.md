# Deployment Guide

This guide covers deploying Smithy AI using Docker Compose for both development and production environments.

## Prerequisites

- **Docker** >= 20.10
- **Docker Compose** >= 2.0
- **Node.js** >= 20 and **pnpm** >= 10.28.0 (for development mode)

## Development Setup

The development stack uses Docker Compose for infrastructure services while running the API and web app locally via `pnpm dev`.

### 1. Configure Environment

```bash
cp docker/.env.example docker/.env
```

The defaults in `.env.example` work out of the box with Docker Compose. No changes are required for local development.

### 2. Start Infrastructure Services

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts:

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL 16 | 5432 | Primary database |
| Redis 7 | 6379 | Caching, sessions, Socket.IO adapter |
| RabbitMQ 3 | 5672 (AMQP), 15672 (management UI) | Message bus for worker jobs |
| MinIO | 9000 (API), 9001 (console) | S3-compatible object storage |

A `minio-init` container automatically creates the default bucket on startup.

### 3. Start the Application

```bash
pnpm install
pnpm dev
```

The API runs at `http://localhost:3000` and the web UI at `http://localhost:5173`.

### 4. Verify

- **Health check**: `curl http://localhost:3000/health`
- **Web UI**: Open `http://localhost:5173`
- **RabbitMQ console**: `http://localhost:15672` (smithy/smithy)
- **MinIO console**: `http://localhost:9001` (smithy/smithy_secret)

---

## Production Setup

Production uses Docker Compose with an override file that adds resource limits, security hardening, JSON logging, and an Nginx reverse proxy with SSL termination.

### 1. Configure Environment

```bash
cp docker/.env.production.example docker/.env
```

**You must change all `CHANGE_ME` values.** At minimum:

| Variable | How to Generate |
|----------|----------------|
| `JWT_SECRET` | `openssl rand -base64 48` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `REDIS_PASSWORD` | `openssl rand -base64 24` |
| `RABBITMQ_DEFAULT_PASS` | `openssl rand -base64 24` |
| `MINIO_ROOT_PASSWORD` | `openssl rand -base64 24` |

Update `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL` to include the passwords you generated. Set `CORS_ORIGIN` and `DASHBOARD_URL` to your domain.

### 2. SSL Certificates

Place SSL certificates in `docker/certs/`:

```
docker/certs/
├── server.crt
└── server.key
```

Use [Let's Encrypt](https://letsencrypt.org/) / certbot or your preferred CA.

### 3. Build the API Image

```bash
docker build -t smithy-api:latest -f apps/api/Dockerfile .
```

### 4. Start the Stack

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d
```

### 5. Verify

```bash
# Health check (HTTP, no SSL required)
curl http://localhost/health

# HTTPS
curl https://your-domain.com/health
```

---

## Production Security Hardening

The production override applies these security measures automatically:

- **Non-root user**: API container runs as `smithy` user
- **Read-only filesystems**: API and Nginx containers use `read_only: true` with tmpfs for `/tmp`
- **No new privileges**: `no-new-privileges:true` security option on API and Nginx
- **Internal-only ports**: Infrastructure services (PostgreSQL, Redis, RabbitMQ, MinIO) are not exposed to the host
- **Resource limits**: CPU and memory limits on every service
- **Log rotation**: JSON file logging with 10MB max size, 3 files per service

## Health Checks

The `/health` endpoint checks PostgreSQL, Redis, and RabbitMQ connectivity with a 3-second timeout per service.

**Response when healthy** (HTTP 200):

```json
{
  "status": "ok",
  "services": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "rabbitmq": { "status": "up" }
  },
  "timestamp": "2026-03-06T12:00:00.000Z"
}
```

**Response when degraded** (HTTP 503):

```json
{
  "status": "degraded",
  "services": {
    "database": { "status": "up" },
    "redis": { "status": "down", "error": "Connection refused" },
    "rabbitmq": { "status": "up" }
  },
  "timestamp": "2026-03-06T12:00:00.000Z"
}
```

The Docker health check polls `/health` every 30 seconds. Nginx exposes `/health` on port 80 without SSL for load balancer probes.

## Resource Limits

| Service | CPU | Memory |
|---------|-----|--------|
| PostgreSQL | 1.0 | 1 GB |
| Redis | 0.5 | 512 MB |
| RabbitMQ | 0.5 | 512 MB |
| MinIO | 1.0 | 1 GB |
| API | 1.0 | 512 MB |
| Nginx | 0.5 | 256 MB |

## Package Retention

Expired and soft-deleted packages are cleaned up by a scheduled retention service.

| Variable | Default | Description |
|----------|---------|-------------|
| `RETENTION_DAYS` | `30` | Days before completed packages are eligible for cleanup |
| `RETENTION_DRY_RUN` | `false` | When `true`, logs what would be deleted without actually deleting |

The retention job runs daily at 2:00 AM UTC. It removes MinIO files, `package_files` rows, and then the package record itself.

## Environment Variable Reference

Full variable documentation is available in the template files:

- **Development**: [`docker/.env.example`](../docker/.env.example)
- **Production**: [`docker/.env.production.example`](../docker/.env.production.example)

### Key Variable Groups

| Group | Variables | Purpose |
|-------|----------|---------|
| Application | `APP_PORT`, `NODE_ENV`, `CORS_ORIGIN` | Server configuration |
| Security | `JWT_SECRET` | Authentication |
| Database | `DATABASE_URL`, `POSTGRES_*` | PostgreSQL connection |
| Cache | `REDIS_URL`, `REDIS_PASSWORD` | Redis connection |
| Messaging | `RABBITMQ_URL`, `RABBITMQ_*` | RabbitMQ connection |
| Storage | `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` | Object storage |
| AI | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | AI provider credentials |
| Email | `RESEND_API_KEY`, `EMAIL_FROM`, `DASHBOARD_URL` | Transactional email |
| Logging | `LOG_LEVEL` | Log verbosity (error/warn/info/debug) |
