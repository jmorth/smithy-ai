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

const envExamplePath = join(import.meta.dir, "..", ".env.example");
const envExampleContent = readFileSync(envExamplePath, "utf-8");

function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    vars[key] = value;
  }
  return vars;
}

const envVars = parseEnvFile(envExampleContent);

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

  it("minio-init entrypoint creates smithy bucket", () => {
    const entrypoint = services["minio-init"].entrypoint as string;
    expect(entrypoint).toContain("mc mb");
    expect(entrypoint).toContain("smithy");
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

describe(".env.example", () => {
  it("file exists and is non-empty", () => {
    expect(envExampleContent.length).toBeGreaterThan(0);
  });

  // Application
  it("contains APP_PORT with default 3000", () => {
    expect(envVars["APP_PORT"]).toBe("3000");
  });

  it("contains NODE_ENV with default development", () => {
    expect(envVars["NODE_ENV"]).toBe("development");
  });

  // Security
  it("contains JWT_SECRET", () => {
    expect(envVars["JWT_SECRET"]).toBeDefined();
    expect(envVars["JWT_SECRET"].length).toBeGreaterThan(0);
  });

  it("contains CORS_ORIGIN", () => {
    expect(envVars["CORS_ORIGIN"]).toBeDefined();
  });

  // Logging
  it("contains LOG_LEVEL", () => {
    expect(envVars["LOG_LEVEL"]).toBeDefined();
  });

  // PostgreSQL
  it("contains DATABASE_URL with correct default", () => {
    expect(envVars["DATABASE_URL"]).toBe("postgresql://smithy:smithy@localhost:5432/smithy");
  });

  // Redis
  it("contains REDIS_URL with correct default", () => {
    expect(envVars["REDIS_URL"]).toBe("redis://localhost:6379");
  });

  // RabbitMQ
  it("contains RABBITMQ_URL with correct default", () => {
    expect(envVars["RABBITMQ_URL"]).toBe("amqp://smithy:smithy@localhost:5672");
  });

  it("contains RABBITMQ_MANAGEMENT_URL convenience variable", () => {
    expect(envVars["RABBITMQ_MANAGEMENT_URL"]).toBe("http://localhost:15672");
  });

  // MinIO
  it("contains MINIO_ENDPOINT with correct default", () => {
    expect(envVars["MINIO_ENDPOINT"]).toBe("http://localhost:9000");
  });

  it("contains MINIO_ACCESS_KEY with development default", () => {
    expect(envVars["MINIO_ACCESS_KEY"]).toBe("smithy");
  });

  it("contains MINIO_SECRET_KEY with development default", () => {
    expect(envVars["MINIO_SECRET_KEY"]).toBe("smithy_secret");
  });

  it("contains MINIO_BUCKET with default smithy", () => {
    expect(envVars["MINIO_BUCKET"]).toBe("smithy");
  });

  it("contains MINIO_CONSOLE_URL convenience variable", () => {
    expect(envVars["MINIO_CONSOLE_URL"]).toBe("http://localhost:9001");
  });

  // AI Providers
  it("contains OPENAI_API_KEY placeholder", () => {
    expect(envVars["OPENAI_API_KEY"]).toBeDefined();
  });

  it("contains ANTHROPIC_API_KEY placeholder", () => {
    expect(envVars["ANTHROPIC_API_KEY"]).toBeDefined();
  });

  // Email
  it("contains RESEND_API_KEY placeholder", () => {
    expect(envVars["RESEND_API_KEY"]).toBeDefined();
  });

  // Docker Compose service vars still present
  it("contains Docker Compose postgres vars matching docker-compose.yml defaults", () => {
    expect(envVars["POSTGRES_DB"]).toBe("smithy");
    expect(envVars["POSTGRES_USER"]).toBe("smithy");
    expect(envVars["POSTGRES_PASSWORD"]).toBe("smithy");
    expect(envVars["POSTGRES_PORT"]).toBe("5432");
  });

  it("contains Docker Compose redis vars matching docker-compose.yml defaults", () => {
    expect(envVars["REDIS_PORT"]).toBe("6379");
  });

  it("contains Docker Compose rabbitmq vars matching docker-compose.yml defaults", () => {
    expect(envVars["RABBITMQ_USER"]).toBe("smithy");
    expect(envVars["RABBITMQ_PASSWORD"]).toBe("smithy");
    expect(envVars["RABBITMQ_PORT"]).toBe("5672");
    expect(envVars["RABBITMQ_MGMT_PORT"]).toBe("15672");
  });

  it("contains Docker Compose minio vars matching docker-compose.yml defaults", () => {
    expect(envVars["MINIO_ROOT_USER"]).toBe("smithy");
    expect(envVars["MINIO_ROOT_PASSWORD"]).toBe("smithy_secret");
    expect(envVars["MINIO_PORT"]).toBe("9000");
    expect(envVars["MINIO_CONSOLE_PORT"]).toBe("9001");
  });

  it("every variable has a preceding comment line", () => {
    const lines = envExampleContent.split("\n");
    const varLineIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        varLineIndices.push(i);
      }
    }
    for (const idx of varLineIndices) {
      const varName = lines[idx].split("=")[0].trim();
      // Look back up to 5 lines for a comment
      let hasComment = false;
      for (let back = 1; back <= 5 && idx - back >= 0; back++) {
        const prevLine = lines[idx - back].trim();
        if (prevLine.startsWith("#")) {
          hasComment = true;
          break;
        }
        // Stop if we hit another variable or blank line with no comment above
        if (prevLine && !prevLine.startsWith("#")) break;
      }
      expect(hasComment, `${varName} should have a comment`).toBe(true);
    }
  });

  it("all defaults use safe local development values (no production-like credentials)", () => {
    // DATABASE_URL should point to localhost
    expect(envVars["DATABASE_URL"]).toContain("localhost");
    // REDIS_URL should point to localhost
    expect(envVars["REDIS_URL"]).toContain("localhost");
    // RABBITMQ_URL should point to localhost
    expect(envVars["RABBITMQ_URL"]).toContain("localhost");
    // MINIO_ENDPOINT should point to localhost
    expect(envVars["MINIO_ENDPOINT"]).toContain("localhost");
  });

  it("DATABASE_URL credentials match Docker Compose postgres defaults", () => {
    // DATABASE_URL should embed the same user/pass/db as the Docker Compose vars
    const dbUrl = envVars["DATABASE_URL"];
    expect(dbUrl).toContain(envVars["POSTGRES_USER"]);
    expect(dbUrl).toContain(envVars["POSTGRES_PASSWORD"]);
    expect(dbUrl).toContain(envVars["POSTGRES_DB"]);
  });

  it("RABBITMQ_URL credentials match Docker Compose rabbitmq defaults", () => {
    const amqpUrl = envVars["RABBITMQ_URL"];
    expect(amqpUrl).toContain(envVars["RABBITMQ_USER"]);
    expect(amqpUrl).toContain(envVars["RABBITMQ_PASSWORD"]);
  });

  it("MINIO_ACCESS_KEY matches MINIO_ROOT_USER", () => {
    expect(envVars["MINIO_ACCESS_KEY"]).toBe(envVars["MINIO_ROOT_USER"]);
  });

  it("MINIO_SECRET_KEY matches MINIO_ROOT_PASSWORD", () => {
    expect(envVars["MINIO_SECRET_KEY"]).toBe(envVars["MINIO_ROOT_PASSWORD"]);
  });
});
