import { describe, it, expect } from "bun:test";
import { parse as parseToml } from "smol-toml";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const repoRoot = join(import.meta.dir, "..", "..");

function readFile(filename: string): string {
  return readFileSync(join(repoRoot, filename), "utf-8");
}

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------
const railwayRaw = readFile("railway.toml");
const railwayToml = parseToml(railwayRaw) as Record<string, unknown>;
const procfileRaw = readFile("Procfile");

// ---------------------------------------------------------------------------
// railway.toml — File & Parse
// ---------------------------------------------------------------------------
describe("railway.toml — file structure", () => {
  it("exists at repo root", () => {
    expect(existsSync(join(repoRoot, "railway.toml"))).toBe(true);
  });

  it("parses as valid TOML", () => {
    expect(railwayToml).toBeDefined();
    expect(typeof railwayToml).toBe("object");
  });

  it("has [build] section", () => {
    expect(railwayToml.build).toBeDefined();
  });

  it("has [deploy] section", () => {
    expect(railwayToml.deploy).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// railway.toml — [build] section (API Docker config)
// ---------------------------------------------------------------------------
describe("railway.toml — [build] section", () => {
  const build = railwayToml.build as Record<string, unknown>;

  it("dockerfilePath points to apps/api/Dockerfile", () => {
    expect(build.dockerfilePath).toBe("apps/api/Dockerfile");
  });

  it("referenced Dockerfile exists", () => {
    expect(existsSync(join(repoRoot, "apps/api/Dockerfile"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// railway.toml — [deploy] section (API service)
// ---------------------------------------------------------------------------
describe("railway.toml — [deploy] section", () => {
  const deploy = railwayToml.deploy as Record<string, unknown>;

  it("startCommand runs node with the API dist entrypoint", () => {
    const cmd = deploy.startCommand as string;
    expect(cmd).toContain("node");
    expect(cmd).toContain("apps/api/dist/main.js");
  });

  it("healthcheckPath is /health", () => {
    expect(deploy.healthcheckPath).toBe("/health");
  });

  it("healthcheckTimeout is a positive number", () => {
    expect(typeof deploy.healthcheckTimeout).toBe("number");
    expect(deploy.healthcheckTimeout as number).toBeGreaterThan(0);
  });

  it("restartPolicyType is on_failure", () => {
    expect(deploy.restartPolicyType).toBe("on_failure");
  });

  it("restartPolicyMaxRetries is a positive number", () => {
    expect(typeof deploy.restartPolicyMaxRetries).toBe("number");
    expect(deploy.restartPolicyMaxRetries as number).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// railway.toml — Environment variable documentation
// ---------------------------------------------------------------------------
describe("railway.toml — environment variable documentation", () => {
  const requiredEnvVars = [
    "DATABASE_URL",
    "REDIS_URL",
    "RABBITMQ_URL",
    "S3_ENDPOINT",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_BUCKET",
    "JWT_SECRET",
    "NODE_ENV",
  ];

  for (const envVar of requiredEnvVars) {
    it(`documents ${envVar} in comments`, () => {
      expect(railwayRaw).toContain(envVar);
    });
  }

  it("documents PORT as auto-set by Railway", () => {
    expect(railwayRaw).toContain("PORT");
    expect(railwayRaw.toLowerCase()).toContain("auto-set by railway");
  });

  it("warns not to set env vars in this file", () => {
    const lowerRaw = railwayRaw.toLowerCase();
    expect(lowerRaw).toContain("not in this file");
  });
});

// ---------------------------------------------------------------------------
// railway.toml — Railway project setup documentation
// ---------------------------------------------------------------------------
describe("railway.toml — setup steps documentation", () => {
  it("documents railway init", () => {
    expect(railwayRaw).toContain("railway init");
  });

  it("documents PostgreSQL provisioning", () => {
    expect(railwayRaw).toContain("PostgreSQL");
  });

  it("documents Redis provisioning", () => {
    expect(railwayRaw).toContain("Redis");
  });

  it("documents CloudAMQP setup for RabbitMQ", () => {
    expect(railwayRaw).toContain("CloudAMQP");
    expect(railwayRaw).toContain("RabbitMQ");
  });

  it("documents S3 configuration", () => {
    expect(railwayRaw).toContain("S3");
    expect(railwayRaw).toContain("S3_ENDPOINT");
  });

  it("documents deploy command", () => {
    expect(railwayRaw).toContain("railway up");
  });

  it("documents auto-deploy via push to main", () => {
    const lower = railwayRaw.toLowerCase();
    expect(lower).toContain("push to main");
  });
});

// ---------------------------------------------------------------------------
// railway.toml — Web service documentation
// ---------------------------------------------------------------------------
describe("railway.toml — web static build documentation", () => {
  it("documents web build command", () => {
    expect(railwayRaw).toContain("pnpm --filter web build");
  });

  it("documents web publish directory apps/web/dist", () => {
    expect(railwayRaw).toContain("apps/web/dist");
  });

  it("documents static hosting alternatives (Vercel, Netlify, Cloudflare Pages)", () => {
    expect(railwayRaw).toContain("Vercel");
    expect(railwayRaw).toContain("Netlify");
    expect(railwayRaw).toContain("Cloudflare Pages");
  });
});

// ---------------------------------------------------------------------------
// railway.toml — Monorepo context handling
// ---------------------------------------------------------------------------
describe("railway.toml — monorepo context", () => {
  it("comments mention building from repo root", () => {
    expect(railwayRaw.toLowerCase()).toContain("repo root");
  });

  it("Dockerfile path is relative to repo root (not apps/api/)", () => {
    const build = railwayToml.build as Record<string, unknown>;
    const dockerPath = build.dockerfilePath as string;
    // Path should start with apps/ indicating it's relative to repo root
    expect(dockerPath.startsWith("apps/")).toBe(true);
  });

  it("start command uses full path from repo root", () => {
    const deploy = railwayToml.deploy as Record<string, unknown>;
    const cmd = deploy.startCommand as string;
    expect(cmd).toContain("apps/api/dist/main.js");
  });
});

// ---------------------------------------------------------------------------
// Procfile — Existence & Structure
// ---------------------------------------------------------------------------
describe("Procfile — structure", () => {
  it("exists at repo root", () => {
    expect(existsSync(join(repoRoot, "Procfile"))).toBe(true);
  });

  it("is non-empty", () => {
    expect(procfileRaw.trim().length).toBeGreaterThan(0);
  });

  it("defines a web process type", () => {
    expect(procfileRaw).toMatch(/^web:/m);
  });

  it("web process runs node apps/api/dist/main.js", () => {
    const webLine = procfileRaw
      .split("\n")
      .find((line) => line.startsWith("web:"));
    expect(webLine).toBeDefined();
    expect(webLine).toContain("node");
    expect(webLine).toContain("apps/api/dist/main.js");
  });
});

// ---------------------------------------------------------------------------
// Procfile — Consistency with railway.toml
// ---------------------------------------------------------------------------
describe("Procfile — consistency with railway.toml", () => {
  it("Procfile web command matches railway.toml startCommand entrypoint", () => {
    const deploy = railwayToml.deploy as Record<string, unknown>;
    const railwayStart = deploy.startCommand as string;

    const webLine = procfileRaw
      .split("\n")
      .find((line) => line.startsWith("web:"));
    const procfileCmd = webLine!.replace(/^web:\s*/, "").trim();

    // Both should reference the same entrypoint
    expect(procfileCmd).toContain("apps/api/dist/main.js");
    expect(railwayStart).toContain("apps/api/dist/main.js");
  });
});

// ---------------------------------------------------------------------------
// Cross-validation — Dockerfile alignment
// ---------------------------------------------------------------------------
describe("cross-validation — Dockerfile alignment", () => {
  const dockerfile = readFile("apps/api/Dockerfile");

  it("Dockerfile CMD matches railway.toml start entrypoint", () => {
    // Dockerfile CMD should reference the same main.js
    expect(dockerfile).toContain("dist/main.js");
    const deploy = railwayToml.deploy as Record<string, unknown>;
    const startCmd = deploy.startCommand as string;
    // The railway.toml uses full repo-relative path, Dockerfile uses container-relative
    // Both should end with the same file
    expect(startCmd).toContain("main.js");
  });

  it("Dockerfile exposes port 3000 (Railway injects PORT)", () => {
    expect(dockerfile).toContain("EXPOSE 3000");
  });

  it("Dockerfile has HEALTHCHECK matching railway.toml healthcheckPath", () => {
    const deploy = railwayToml.deploy as Record<string, unknown>;
    const healthPath = deploy.healthcheckPath as string;
    expect(dockerfile).toContain(healthPath);
  });

  it("Dockerfile sets NODE_ENV=production", () => {
    expect(dockerfile).toContain("NODE_ENV=production");
  });
});
