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
