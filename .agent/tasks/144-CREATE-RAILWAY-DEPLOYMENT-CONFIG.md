# Task 144: Create Railway Deployment Config

## Summary
Create Railway deployment configuration files — service definitions, build commands, and comprehensive environment variable documentation for deploying Smithy to Railway's cloud platform. This covers the API service, web static build, and references to managed backing services.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: 028 (API Dockerfile), 143 (Production Docker Compose — shares env var documentation)
- **Blocks**: None

## Architecture Reference
Railway is Smithy's cloud deployment target. Railway supports Docker-based deployments, Nixpacks auto-detection, and static site hosting. Smithy's API deploys as a Docker container (using the Dockerfile from task 028), and the web app deploys as a static site built by Vite.

Railway provisions managed services for PostgreSQL and Redis. RabbitMQ is provisioned via the CloudAMQP plugin or a custom Docker service. S3-compatible storage uses Railway's volume mounts or an external S3 bucket (MinIO is not available as a Railway managed service).

The `railway.toml` file defines per-service build and deploy configuration.

## Files and Folders
- `/railway.toml` — Railway service configuration (build commands, start commands, health checks)
- `/Procfile` — Process definitions (if Railway's Procfile-based deployment is used as fallback)

## Acceptance Criteria
- [ ] `railway.toml` defines the API service with Docker build configuration pointing to `apps/api/Dockerfile`
- [ ] `railway.toml` defines the web service with Nixpacks or static build configuration
- [ ] API service: build command, start command (`node dist/main.js`), health check path (`/health`)
- [ ] Web service: build command (`pnpm --filter web build`), publish directory (`apps/web/dist`)
- [ ] Environment variables section documented in comments: `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `JWT_SECRET`, `NODE_ENV`
- [ ] Railway project setup steps documented in comments (PostgreSQL provisioning, Redis provisioning, CloudAMQP setup)
- [ ] `Procfile` exists as a fallback with `web: node apps/api/dist/main.js`
- [ ] Configuration handles monorepo root context (Railway builds from repo root)

## Implementation Notes
- `railway.toml` structure:
  ```toml
  # Smithy Railway Deployment Configuration
  #
  # Setup steps:
  # 1. Create a new Railway project: railway init
  # 2. Provision PostgreSQL: Railway dashboard → New → Database → PostgreSQL
  # 3. Provision Redis: Railway dashboard → New → Database → Redis
  # 4. Provision RabbitMQ: Use CloudAMQP plugin or deploy rabbitmq:3-management-alpine as custom service
  # 5. Configure S3: Use AWS S3, Cloudflare R2, or any S3-compatible provider
  #    - Set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET in Railway env vars
  # 6. Set environment variables in Railway dashboard for each service
  # 7. Deploy: railway up (or push to main for auto-deploy)

  [build]
  # Railway builds from repo root — use Dockerfile for API
  dockerfilePath = "apps/api/Dockerfile"

  [deploy]
  startCommand = "node dist/main.js"
  healthcheckPath = "/health"
  healthcheckTimeout = 30
  restartPolicyType = "on_failure"
  restartPolicyMaxRetries = 3

  # Environment variables (set these in Railway dashboard, NOT here):
  # DATABASE_URL        - PostgreSQL connection string (auto-set by Railway PostgreSQL plugin)
  # REDIS_URL           - Redis connection string (auto-set by Railway Redis plugin)
  # RABBITMQ_URL        - RabbitMQ AMQP connection string (from CloudAMQP or custom service)
  # S3_ENDPOINT         - S3-compatible storage endpoint
  # S3_ACCESS_KEY       - S3 access key
  # S3_SECRET_KEY       - S3 secret key
  # S3_BUCKET           - S3 bucket name (default: smithy)
  # JWT_SECRET          - JWT signing secret (for future auth)
  # NODE_ENV            - Set to "production"
  # PORT                - Auto-set by Railway
  ```
- Railway currently supports `railway.toml` at the repo root for the primary service. For multi-service deployments (API + Web), Railway uses the dashboard or `railway.json` to define separate services pointing to different build contexts.
- The Dockerfile for the API (task 028) should handle the monorepo context — it should be buildable from the repo root with `docker build -f apps/api/Dockerfile .`.
- For the web static site, Railway's Nixpacks can auto-detect the Vite build, or a separate static hosting service (Vercel, Netlify, Cloudflare Pages) can serve the frontend. Document both options.
- `Procfile` is a simple fallback:
  ```
  web: node apps/api/dist/main.js
  ```
- Railway auto-injects `PORT` environment variable — ensure the API reads `process.env.PORT` for its listen port.
- For RabbitMQ, CloudAMQP's free tier (Little Lemur) provides a managed RabbitMQ instance. Document the setup steps for adding the CloudAMQP plugin in Railway.
- Consider adding a `railway.json` for more advanced multi-service configuration if `railway.toml` alone is insufficient.
