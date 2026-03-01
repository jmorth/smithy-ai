# Task 143: Create Production Docker Compose

## Summary
Create a production-ready Docker Compose override configuration with resource limits, restart policies, security hardening, and an optional Nginx reverse proxy for SSL termination and static file serving. This configuration layers on top of the base `docker-compose.yml` for self-hosted / on-premises deployments.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: 011 (Docker Compose Dev Stack)
- **Blocks**: 144 (Railway Deployment Config)

## Architecture Reference
Smithy supports two deployment targets: Railway (cloud) and Docker Compose (self-hosted / on-prem). The production Docker Compose config is an override file that extends the base `docker/docker-compose.yml` with production-specific settings: resource limits, restart policies, no source mounts, and an optional Nginx reverse proxy.

The override pattern (`docker compose -f docker-compose.yml -f docker-compose.prod.yml up`) allows the same base service definitions to be used in both development and production with minimal duplication.

## Files and Folders
- `/docker/docker-compose.prod.yml` — Production Docker Compose override configuration
- `/docker/nginx.conf` — Nginx reverse proxy configuration (optional, for SSL termination)
- `/docker/.env.production.example` — Documented production environment variables template

## Acceptance Criteria
- [ ] `docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml config` validates without errors
- [ ] All services have `restart: unless-stopped`
- [ ] All services have `deploy.resources.limits` for memory and CPU (Postgres: 1GB/1CPU, Redis: 512MB/0.5CPU, RabbitMQ: 512MB/0.5CPU, MinIO: 1GB/1CPU, API: 512MB/1CPU)
- [ ] No source code volume mounts (dev-only mounts are removed/overridden)
- [ ] API service uses the built Docker image (not a dev command)
- [ ] Web app is served as static files (either via Nginx or a separate static file server container)
- [ ] Nginx config (optional): SSL termination placeholder, rate limiting (`limit_req_zone`), gzip compression, static file caching headers, proxy pass to API
- [ ] `.env.production.example` documents ALL required production environment variables with descriptions and example values
- [ ] Security: containers run as non-root where possible, no unnecessary capabilities
- [ ] Logging: JSON log driver configured for structured log collection

## Implementation Notes
- Production override structure:
  ```yaml
  # docker/docker-compose.prod.yml
  # Usage: docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d

  services:
    postgres:
      restart: unless-stopped
      deploy:
        resources:
          limits:
            cpus: "1.0"
            memory: 1G
      environment:
        POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # Override dev default

    redis:
      restart: unless-stopped
      command: redis-server --requirepass ${REDIS_PASSWORD}
      deploy:
        resources:
          limits:
            cpus: "0.5"
            memory: 512M

    rabbitmq:
      restart: unless-stopped
      deploy:
        resources:
          limits:
            cpus: "0.5"
            memory: 512M

    minio:
      restart: unless-stopped
      deploy:
        resources:
          limits:
            cpus: "1.0"
            memory: 1G

    api:
      restart: unless-stopped
      image: smithy-api:latest
      # Override dev command with production start
      command: ["node", "dist/main.js"]
      volumes: []  # Remove dev source mounts
      deploy:
        resources:
          limits:
            cpus: "1.0"
            memory: 512M
      logging:
        driver: json-file
        options:
          max-size: "10m"
          max-file: "3"

    nginx:
      image: nginx:1.25-alpine
      restart: unless-stopped
      ports:
        - "${PUBLIC_PORT:-443}:443"
        - "${PUBLIC_HTTP_PORT:-80}:80"
      volumes:
        - ./nginx.conf:/etc/nginx/nginx.conf:ro
        - ./certs:/etc/nginx/certs:ro  # Mount SSL certs
        - web-static:/usr/share/nginx/html:ro  # Static web assets
      depends_on:
        - api
      deploy:
        resources:
          limits:
            cpus: "0.5"
            memory: 256M

  volumes:
    web-static:
  ```
- Nginx config should include:
  - SSL termination (with placeholder cert paths — users provide their own certs or use certbot)
  - Rate limiting: `limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;`
  - Gzip compression for text/JSON/JS/CSS
  - Static file caching: `Cache-Control: public, max-age=31536000` for hashed assets
  - Proxy pass: `/api` → `http://api:3000`, `/socket.io` → WebSocket upgrade to `http://api:3000`
  - Health check endpoint that does not require auth
- `.env.production.example` should document:
  - `DATABASE_URL`, `POSTGRES_PASSWORD`
  - `REDIS_URL`, `REDIS_PASSWORD`
  - `RABBITMQ_URL`, `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS`
  - `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
  - `JWT_SECRET` (for future auth)
  - `PUBLIC_PORT`, `PUBLIC_HTTP_PORT`
  - `NODE_ENV=production`
- Do NOT include actual secrets in any committed file. The `.example` file contains only placeholder values and descriptions.
