# Docker Compose Dev Stack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Docker Compose v3 file with PostgreSQL 16, Redis 7, RabbitMQ 3 (with management plugin), and MinIO for local development infrastructure.

**Architecture:** All four services run as Docker containers with named volumes for persistence, shared network for inter-service communication, and health checks. A minio-init service creates the default `smithy` bucket on startup.

**Tech Stack:** Docker Compose v3, PostgreSQL 16 Alpine, Redis 7 Alpine, RabbitMQ 3 management Alpine, MinIO

---

### Task 1: Scaffold docker/docker-compose.yml with PostgreSQL service

**Files:**
- Create: `docker/docker-compose.yml`

**Step 1: Create base docker-compose.yml with PostgreSQL**

```yaml
# docker/docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-smithy}
      POSTGRES_USER: ${POSTGRES_USER:-smithy}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-smithy}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - smithy
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-smithy}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

volumes:
  postgres_data:

networks:
  smithy:
    driver: bridge
```

**Step 2: Validate file syntax**

Run: `docker compose -f docker/docker-compose.yml config`
Expected: YAML printed with no errors

**Step 3: Commit**

```bash
git add docker/docker-compose.yml
git commit -m "feat(docker): scaffold compose with PostgreSQL service"
```

---

### Task 2: Add Redis service

**Files:**
- Modify: `docker/docker-compose.yml`

**Step 1: Add Redis service under services block**

```yaml
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis_data:/data
    networks:
      - smithy
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 5s
```

Add `redis_data:` to the volumes block.

**Step 2: Validate**

Run: `docker compose -f docker/docker-compose.yml config`
Expected: both postgres and redis services present

**Step 3: Commit**

```bash
git add docker/docker-compose.yml
git commit -m "feat(docker): add Redis service"
```

---

### Task 3: Add RabbitMQ service

**Files:**
- Modify: `docker/docker-compose.yml`

**Step 1: Add RabbitMQ service**

```yaml
  rabbitmq:
    image: rabbitmq:3-management-alpine
    restart: unless-stopped
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-smithy}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:-smithy}
    ports:
      - "${RABBITMQ_PORT:-5672}:5672"
      - "${RABBITMQ_MGMT_PORT:-15672}:15672"
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    networks:
      - smithy
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
```

Add `rabbitmq_data:` to volumes block.

**Step 2: Validate**

Run: `docker compose -f docker/docker-compose.yml config`
Expected: postgres, redis, rabbitmq services present

**Step 3: Commit**

```bash
git add docker/docker-compose.yml
git commit -m "feat(docker): add RabbitMQ service with management plugin"
```

---

### Task 4: Add MinIO service and minio-init bucket creation service

**Files:**
- Modify: `docker/docker-compose.yml`

**Step 1: Add MinIO service and minio-init service**

```yaml
  minio:
    image: minio/minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-smithy}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-smithy_secret}
    ports:
      - "${MINIO_PORT:-9000}:9000"
      - "${MINIO_CONSOLE_PORT:-9001}:9001"
    volumes:
      - minio_data:/data
    networks:
      - smithy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  minio-init:
    image: minio/mc
    depends_on:
      minio:
        condition: service_healthy
    networks:
      - smithy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 ${MINIO_ROOT_USER:-smithy} ${MINIO_ROOT_PASSWORD:-smithy_secret} &&
      mc mb local/${MINIO_BUCKET:-smithy} --ignore-existing &&
      echo 'MinIO bucket ready'
      "
    restart: "no"
```

Add `minio_data:` to volumes block.

**Step 2: Validate**

Run: `docker compose -f docker/docker-compose.yml config`
Expected: all 5 services present (postgres, redis, rabbitmq, minio, minio-init)

**Step 3: Commit**

```bash
git add docker/docker-compose.yml
git commit -m "feat(docker): add MinIO service with init bucket creation"
```

---

### Task 5: Write validation tests for docker-compose.yml

**Files:**
- Create: `docker/tests/compose.test.sh` — shell-based acceptance tests
- Create: `docker/tests/validate.test.ts` — Node/Bun-based YAML validation tests

**Step 1: Write Bun test to validate docker-compose.yml structure**

```typescript
// docker/tests/validate.test.ts
import { describe, it, expect } from "bun:test";
import { parse } from "yaml";
import { readFileSync } from "fs";
import { join } from "path";

const composePath = join(import.meta.dir, "..", "docker-compose.yml");
const content = readFileSync(composePath, "utf-8");
const compose = parse(content) as Record<string, unknown>;
const services = compose.services as Record<string, Record<string, unknown>>;
const volumes = compose.volumes as Record<string, unknown>;
const networks = compose.networks as Record<string, unknown>;

describe("docker-compose.yml", () => {
  it("has exactly 5 services", () => {
    expect(Object.keys(services)).toHaveLength(5);
  });

  it("has postgres service with correct image", () => {
    expect(services.postgres.image).toBe("postgres:16-alpine");
  });

  it("postgres has healthcheck", () => {
    expect(services.postgres.healthcheck).toBeDefined();
  });

  it("postgres exposes port 5432", () => {
    const ports = services.postgres.ports as string[];
    expect(ports.some((p) => String(p).includes("5432"))).toBe(true);
  });

  it("postgres uses named volume", () => {
    const vols = services.postgres.volumes as string[];
    expect(vols.some((v) => v.startsWith("postgres_data:"))).toBe(true);
  });

  it("postgres is on smithy network", () => {
    const nets = services.postgres.networks as string[];
    expect(nets).toContain("smithy");
  });

  it("has redis service with correct image", () => {
    expect(services.redis.image).toBe("redis:7-alpine");
  });

  it("redis has healthcheck", () => {
    expect(services.redis.healthcheck).toBeDefined();
  });

  it("redis exposes port 6379", () => {
    const ports = services.redis.ports as string[];
    expect(ports.some((p) => String(p).includes("6379"))).toBe(true);
  });

  it("redis is on smithy network", () => {
    const nets = services.redis.networks as string[];
    expect(nets).toContain("smithy");
  });

  it("has rabbitmq service with management image", () => {
    expect(services.rabbitmq.image).toBe("rabbitmq:3-management-alpine");
  });

  it("rabbitmq has healthcheck", () => {
    expect(services.rabbitmq.healthcheck).toBeDefined();
  });

  it("rabbitmq exposes AMQP port 5672", () => {
    const ports = services.rabbitmq.ports as string[];
    expect(ports.some((p) => String(p).includes("5672"))).toBe(true);
  });

  it("rabbitmq exposes management port 15672", () => {
    const ports = services.rabbitmq.ports as string[];
    expect(ports.some((p) => String(p).includes("15672"))).toBe(true);
  });

  it("rabbitmq is on smithy network", () => {
    const nets = services.rabbitmq.networks as string[];
    expect(nets).toContain("smithy");
  });

  it("has minio service", () => {
    expect(services.minio).toBeDefined();
    expect(services.minio.image).toBe("minio/minio");
  });

  it("minio has healthcheck", () => {
    expect(services.minio.healthcheck).toBeDefined();
  });

  it("minio exposes API port 9000", () => {
    const ports = services.minio.ports as string[];
    expect(ports.some((p) => String(p).includes("9000"))).toBe(true);
  });

  it("minio exposes console port 9001", () => {
    const ports = services.minio.ports as string[];
    expect(ports.some((p) => String(p).includes("9001"))).toBe(true);
  });

  it("minio is on smithy network", () => {
    const nets = services.minio.networks as string[];
    expect(nets).toContain("smithy");
  });

  it("has minio-init service", () => {
    expect(services["minio-init"]).toBeDefined();
  });

  it("minio-init depends on minio", () => {
    const deps = services["minio-init"].depends_on as Record<string, unknown>;
    expect(deps).toHaveProperty("minio");
  });

  it("minio-init is on smithy network", () => {
    const nets = services["minio-init"].networks as string[];
    expect(nets).toContain("smithy");
  });

  it("has all named volumes", () => {
    expect(volumes).toHaveProperty("postgres_data");
    expect(volumes).toHaveProperty("redis_data");
    expect(volumes).toHaveProperty("rabbitmq_data");
    expect(volumes).toHaveProperty("minio_data");
  });

  it("has smithy network with bridge driver", () => {
    expect(networks).toHaveProperty("smithy");
    const smithyNet = networks.smithy as Record<string, unknown>;
    expect(smithyNet.driver).toBe("bridge");
  });

  it("all main services have restart: unless-stopped", () => {
    const mainServices = ["postgres", "redis", "rabbitmq", "minio"];
    for (const svc of mainServices) {
      expect(services[svc].restart).toBe("unless-stopped");
    }
  });

  it("minio-init has restart: no", () => {
    expect(services["minio-init"].restart).toBe("no");
  });

  it("all services are on smithy network", () => {
    for (const [name, svc] of Object.entries(services)) {
      const nets = svc.networks as string[];
      expect(nets, `${name} should be on smithy network`).toContain("smithy");
    }
  });
});
```

**Step 2: Install yaml package if needed and run tests**

Run: `cd /home/jmorth/Source/Opus/smithy-ai && bun add -d yaml` (in docker dir or root)
Run: `bun test docker/tests/validate.test.ts`
Expected: all tests pass

**Step 3: Commit**

```bash
git add docker/tests/validate.test.ts
git commit -m "test(docker): add structural validation tests for docker-compose.yml"
```

---

### Task 6: Final validation and integration

**Step 1: Run all tests**

Run: `bun test docker/tests/`
Expected: all pass

**Step 2: Commit PROGRESS.md update**

```bash
git add .agent/PROGRESS.md
git commit -m "chore: advance task progress to 012"
```
