import { describe, it, expect } from "bun:test";
import { parse } from "yaml";
import { readFileSync } from "fs";
import { join } from "path";

const ciPath = join(import.meta.dir, "..", "workflows", "ci.yml");
const content = readFileSync(ciPath, "utf-8");
const ci = parse(content) as Record<string, unknown>;

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
};

type Job = {
  "runs-on": string;
  needs?: string | string[];
  steps: Step[];
};

const jobs = ci.jobs as Record<string, Job>;
const on = ci.on as Record<string, unknown>;
const concurrency = ci.concurrency as Record<string, unknown>;
const env = ci.env as Record<string, string>;

describe("CI workflow structure", () => {
  it("is valid YAML with name CI", () => {
    expect(ci.name).toBe("CI");
  });

  it("is not empty", () => {
    expect(Object.keys(ci).length).toBeGreaterThan(0);
  });
});

describe("workflow triggers", () => {
  it("triggers on push to main", () => {
    const push = on.push as Record<string, string[]>;
    expect(push.branches).toContain("main");
  });

  it("triggers on pull_request to main", () => {
    const pr = on.pull_request as Record<string, string[]>;
    expect(pr.branches).toContain("main");
  });
});

describe("concurrency", () => {
  it("has concurrency group set", () => {
    expect(concurrency.group).toBeDefined();
    expect(typeof concurrency.group).toBe("string");
  });

  it("cancels in-progress runs", () => {
    expect(concurrency["cancel-in-progress"]).toBe(true);
  });
});

describe("environment variables", () => {
  it("sets DATABASE_URL for Docker Compose postgres", () => {
    expect(env.DATABASE_URL).toContain("localhost:5432");
    expect(env.DATABASE_URL).toContain("smithy");
  });

  it("sets REDIS_URL for Docker Compose redis", () => {
    expect(env.REDIS_URL).toContain("localhost:6379");
  });

  it("sets RABBITMQ_URL for Docker Compose rabbitmq", () => {
    expect(env.RABBITMQ_URL).toContain("localhost:5672");
  });

  it("sets MINIO_ENDPOINT for Docker Compose minio", () => {
    expect(env.MINIO_ENDPOINT).toContain("localhost:9000");
  });

  it("sets MINIO_ACCESS_KEY and MINIO_SECRET_KEY", () => {
    expect(env.MINIO_ACCESS_KEY).toBeDefined();
    expect(env.MINIO_SECRET_KEY).toBeDefined();
  });

  it("sets MINIO_BUCKET", () => {
    expect(env.MINIO_BUCKET).toBe("smithy");
  });

  it("sets JWT_SECRET for CI", () => {
    expect(env.JWT_SECRET).toBeDefined();
    expect(env.JWT_SECRET.length).toBeGreaterThan(0);
  });

  it("references TURBO_TOKEN from secrets (optional remote cache)", () => {
    const raw = content;
    expect(raw).toContain("secrets.TURBO_TOKEN");
  });

  it("references TURBO_TEAM from secrets (optional remote cache)", () => {
    const raw = content;
    expect(raw).toContain("secrets.TURBO_TEAM");
  });
});

describe("lint-and-typecheck job", () => {
  const job = jobs["lint-and-typecheck"];

  it("exists", () => {
    expect(job).toBeDefined();
  });

  it("runs on ubuntu-latest", () => {
    expect(job["runs-on"]).toBe("ubuntu-latest");
  });

  it("checks out code", () => {
    const checkoutStep = job.steps.find((s) => s.uses?.startsWith("actions/checkout"));
    expect(checkoutStep).toBeDefined();
  });

  it("sets up pnpm via pnpm/action-setup", () => {
    const pnpmStep = job.steps.find((s) => s.uses?.startsWith("pnpm/action-setup"));
    expect(pnpmStep).toBeDefined();
  });

  it("sets up Node.js 20 via actions/setup-node", () => {
    const nodeStep = job.steps.find((s) => s.uses?.startsWith("actions/setup-node"));
    expect(nodeStep).toBeDefined();
    expect(nodeStep!.with?.["node-version"]).toBe(20);
  });

  it("configures pnpm cache in setup-node", () => {
    const nodeStep = job.steps.find((s) => s.uses?.startsWith("actions/setup-node"));
    expect(nodeStep!.with?.cache).toBe("pnpm");
  });

  it("installs with --frozen-lockfile", () => {
    const installStep = job.steps.find((s) => s.run?.includes("pnpm install --frozen-lockfile"));
    expect(installStep).toBeDefined();
  });

  it("runs turbo lint", () => {
    const lintStep = job.steps.find((s) => s.run?.includes("turbo lint"));
    expect(lintStep).toBeDefined();
  });

  it("runs turbo typecheck", () => {
    const typecheckStep = job.steps.find((s) => s.run?.includes("turbo typecheck"));
    expect(typecheckStep).toBeDefined();
  });

  it("runs lint before typecheck", () => {
    const lintIdx = job.steps.findIndex((s) => s.run?.includes("turbo lint"));
    const typecheckIdx = job.steps.findIndex((s) => s.run?.includes("turbo typecheck"));
    expect(lintIdx).toBeLessThan(typecheckIdx);
  });
});

describe("test job", () => {
  const job = jobs.test;

  it("exists", () => {
    expect(job).toBeDefined();
  });

  it("runs on ubuntu-latest", () => {
    expect(job["runs-on"]).toBe("ubuntu-latest");
  });

  it("depends on lint-and-typecheck", () => {
    expect(job.needs).toBe("lint-and-typecheck");
  });

  it("checks out code", () => {
    const checkoutStep = job.steps.find((s) => s.uses?.startsWith("actions/checkout"));
    expect(checkoutStep).toBeDefined();
  });

  it("sets up pnpm via pnpm/action-setup", () => {
    const pnpmStep = job.steps.find((s) => s.uses?.startsWith("pnpm/action-setup"));
    expect(pnpmStep).toBeDefined();
  });

  it("sets up Node.js 20", () => {
    const nodeStep = job.steps.find((s) => s.uses?.startsWith("actions/setup-node"));
    expect(nodeStep).toBeDefined();
    expect(nodeStep!.with?.["node-version"]).toBe(20);
  });

  it("installs with --frozen-lockfile", () => {
    const installStep = job.steps.find((s) => s.run?.includes("pnpm install --frozen-lockfile"));
    expect(installStep).toBeDefined();
  });

  it("starts Docker Compose services before tests", () => {
    const dockerStep = job.steps.find((s) => s.run?.includes("docker compose"));
    const testStep = job.steps.find((s) => s.run?.includes("turbo test"));
    expect(dockerStep).toBeDefined();
    expect(testStep).toBeDefined();
    const dockerIdx = job.steps.indexOf(dockerStep!);
    const testIdx = job.steps.indexOf(testStep!);
    expect(dockerIdx).toBeLessThan(testIdx);
  });

  it("uses docker compose with -f docker/docker-compose.yml", () => {
    const dockerStep = job.steps.find((s) => s.run?.includes("docker compose"));
    expect(dockerStep!.run).toContain("-f docker/docker-compose.yml");
  });

  it("uses --wait flag for Docker Compose health checks", () => {
    const dockerStep = job.steps.find((s) => s.run?.includes("docker compose"));
    expect(dockerStep!.run).toContain("--wait");
  });

  it("runs turbo test", () => {
    const testStep = job.steps.find((s) => s.run?.includes("turbo test"));
    expect(testStep).toBeDefined();
  });

  it("uploads coverage artifact", () => {
    const uploadStep = job.steps.find(
      (s) => s.uses?.startsWith("actions/upload-artifact") && s.with?.name === "coverage"
    );
    expect(uploadStep).toBeDefined();
  });

  it("uploads coverage even if tests fail (if: always())", () => {
    const uploadStep = job.steps.find(
      (s) => s.uses?.startsWith("actions/upload-artifact") && s.with?.name === "coverage"
    );
    expect(uploadStep!.if).toBe("always()");
  });

  it("coverage artifact captures coverage directories", () => {
    const uploadStep = job.steps.find(
      (s) => s.uses?.startsWith("actions/upload-artifact") && s.with?.name === "coverage"
    );
    expect(String(uploadStep!.with?.path)).toContain("coverage");
  });
});

describe("e2e job", () => {
  const job = jobs.e2e;

  it("exists", () => {
    expect(job).toBeDefined();
  });

  it("runs on ubuntu-latest", () => {
    expect(job["runs-on"]).toBe("ubuntu-latest");
  });

  it("depends on test", () => {
    expect(job.needs).toBe("test");
  });

  it("checks out code", () => {
    const checkoutStep = job.steps.find((s) => s.uses?.startsWith("actions/checkout"));
    expect(checkoutStep).toBeDefined();
  });

  it("sets up pnpm via pnpm/action-setup", () => {
    const pnpmStep = job.steps.find((s) => s.uses?.startsWith("pnpm/action-setup"));
    expect(pnpmStep).toBeDefined();
  });

  it("sets up Node.js 20", () => {
    const nodeStep = job.steps.find((s) => s.uses?.startsWith("actions/setup-node"));
    expect(nodeStep).toBeDefined();
    expect(nodeStep!.with?.["node-version"]).toBe(20);
  });

  it("installs with --frozen-lockfile", () => {
    const installStep = job.steps.find((s) => s.run?.includes("pnpm install --frozen-lockfile"));
    expect(installStep).toBeDefined();
  });

  it("caches Playwright browsers via actions/cache", () => {
    const cacheStep = job.steps.find(
      (s) => s.uses?.startsWith("actions/cache") && String(s.with?.path).includes("ms-playwright")
    );
    expect(cacheStep).toBeDefined();
  });

  it("Playwright cache key is based on web package.json hash", () => {
    const cacheStep = job.steps.find(
      (s) => s.uses?.startsWith("actions/cache") && String(s.with?.path).includes("ms-playwright")
    );
    const key = String(cacheStep!.with?.key);
    expect(key).toContain("playwright");
    expect(key).toContain("apps/web/package.json");
  });

  it("installs Playwright chromium with deps", () => {
    const installStep = job.steps.find(
      (s) => s.run?.includes("playwright install") && s.run?.includes("chromium")
    );
    expect(installStep).toBeDefined();
    expect(installStep!.run).toContain("--with-deps");
  });

  it("starts Docker Compose services", () => {
    const dockerStep = job.steps.find((s) => s.run?.includes("docker compose"));
    expect(dockerStep).toBeDefined();
    expect(dockerStep!.run).toContain("--wait");
  });

  it("starts API server in background", () => {
    const apiStep = job.steps.find((s) => s.run?.includes("--filter api dev"));
    expect(apiStep).toBeDefined();
    expect(apiStep!.run).toContain("&");
  });

  it("starts web dev server in background", () => {
    const webStep = job.steps.find((s) => s.run?.includes("--filter web dev"));
    expect(webStep).toBeDefined();
    expect(webStep!.run).toContain("&");
  });

  it("waits for servers with wait-on", () => {
    const waitStep = job.steps.find((s) => s.run?.includes("wait-on"));
    expect(waitStep).toBeDefined();
    expect(waitStep!.run).toContain("http://localhost:3000/health");
    expect(waitStep!.run).toContain("http://localhost:5173");
  });

  it("wait-on has a timeout", () => {
    const waitStep = job.steps.find((s) => s.run?.includes("wait-on"));
    expect(waitStep!.run).toContain("--timeout");
  });

  it("runs E2E tests via pnpm --filter web e2e", () => {
    const e2eStep = job.steps.find((s) => s.run?.includes("--filter web e2e"));
    expect(e2eStep).toBeDefined();
  });

  it("uploads Playwright report artifact", () => {
    const uploadStep = job.steps.find(
      (s) =>
        s.uses?.startsWith("actions/upload-artifact") && s.with?.name === "playwright-report"
    );
    expect(uploadStep).toBeDefined();
  });

  it("uploads Playwright report even if tests fail (if: always())", () => {
    const uploadStep = job.steps.find(
      (s) =>
        s.uses?.startsWith("actions/upload-artifact") && s.with?.name === "playwright-report"
    );
    expect(uploadStep!.if).toBe("always()");
  });

  it("Playwright report path points to apps/web/playwright-report/", () => {
    const uploadStep = job.steps.find(
      (s) =>
        s.uses?.startsWith("actions/upload-artifact") && s.with?.name === "playwright-report"
    );
    expect(uploadStep!.with?.path).toBe("apps/web/playwright-report/");
  });
});

describe("job ordering", () => {
  it("has exactly 3 jobs", () => {
    expect(Object.keys(jobs)).toHaveLength(3);
  });

  it("test depends on lint-and-typecheck", () => {
    expect(jobs.test.needs).toBe("lint-and-typecheck");
  });

  it("e2e depends on test", () => {
    expect(jobs.e2e.needs).toBe("test");
  });

  it("lint-and-typecheck has no dependencies", () => {
    expect(jobs["lint-and-typecheck"].needs).toBeUndefined();
  });
});

describe("no untrusted input in run commands", () => {
  const allSteps = Object.values(jobs).flatMap((job) => job.steps);
  const runSteps = allSteps.filter((s) => s.run);

  it("no run step uses github.event directly", () => {
    for (const step of runSteps) {
      expect(step.run).not.toContain("github.event.");
    }
  });

  it("no run step uses github.head_ref directly", () => {
    for (const step of runSteps) {
      expect(step.run).not.toContain("github.head_ref");
    }
  });
});

describe("all jobs use consistent setup pattern", () => {
  for (const [name, job] of Object.entries(jobs)) {
    it(`${name} uses actions/checkout@v4`, () => {
      const step = job.steps.find((s) => s.uses?.startsWith("actions/checkout"));
      expect(step?.uses).toBe("actions/checkout@v4");
    });

    it(`${name} uses pnpm/action-setup@v4`, () => {
      const step = job.steps.find((s) => s.uses?.startsWith("pnpm/action-setup"));
      expect(step?.uses).toBe("pnpm/action-setup@v4");
    });

    it(`${name} uses actions/setup-node@v4 with Node 20`, () => {
      const step = job.steps.find((s) => s.uses?.startsWith("actions/setup-node"));
      expect(step?.uses).toBe("actions/setup-node@v4");
      expect(step?.with?.["node-version"]).toBe(20);
    });

    it(`${name} installs with --frozen-lockfile`, () => {
      const step = job.steps.find((s) => s.run?.includes("pnpm install --frozen-lockfile"));
      expect(step).toBeDefined();
    });
  }
});
