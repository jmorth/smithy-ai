import { describe, it, expect } from "bun:test";
import { parse, type Schema } from "yaml";
import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const dockerDir = join(import.meta.dir, "..");

function readYaml(filename: string): Record<string, unknown> {
  const raw = readFileSync(join(dockerDir, filename), "utf-8");
  // Docker Compose uses !override / !reset YAML tags — treat them as custom
  // scalars so the parser does not choke.
  const customTags: Schema.CustomTag[] = [
    {
      tag: "!override",
      resolve(_doc: unknown, cst: unknown) {
        return cst;
      },
    },
    {
      tag: "!reset",
      resolve() {
        return null;
      },
    },
  ];
  return parse(raw, { customTags }) as Record<string, unknown>;
}

function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------
const prodCompose = readYaml("docker-compose.prod.yml");
const prodServices = prodCompose.services as Record<
  string,
  Record<string, unknown>
>;

const nginxConf = readFileSync(join(dockerDir, "nginx.conf"), "utf-8");

const envProdContent = readFileSync(
  join(dockerDir, ".env.production.example"),
  "utf-8",
);
const envProdVars = parseEnvFile(envProdContent);

// ---------------------------------------------------------------------------
// docker-compose.prod.yml — Structure
// ---------------------------------------------------------------------------
describe("docker-compose.prod.yml — structure", () => {
  it("parses as valid YAML", () => {
    expect(prodCompose).toBeDefined();
    expect(typeof prodCompose).toBe("object");
  });

  it("has a services key", () => {
    expect(prodServices).toBeDefined();
  });

  it("defines the expected services", () => {
    const expected = [
      "postgres",
      "redis",
      "rabbitmq",
      "minio",
      "minio-init",
      "api",
      "nginx",
    ];
    for (const svc of expected) {
      expect(prodServices[svc]).toBeDefined();
    }
  });

  it("declares web-static volume", () => {
    const volumes = prodCompose.volumes as Record<string, unknown>;
    expect(volumes).toBeDefined();
    expect(volumes).toHaveProperty("web-static");
  });
});

// ---------------------------------------------------------------------------
// docker-compose.prod.yml — Restart Policies
// ---------------------------------------------------------------------------
describe("docker-compose.prod.yml — restart policies", () => {
  const restartableServices = [
    "postgres",
    "redis",
    "rabbitmq",
    "minio",
    "api",
    "nginx",
  ];

  for (const svc of restartableServices) {
    it(`${svc} has restart: unless-stopped`, () => {
      expect(prodServices[svc].restart).toBe("unless-stopped");
    });
  }

  it('minio-init has restart: "no"', () => {
    expect(prodServices["minio-init"].restart).toBe("no");
  });
});

// ---------------------------------------------------------------------------
// docker-compose.prod.yml — Resource Limits
// ---------------------------------------------------------------------------
describe("docker-compose.prod.yml — resource limits", () => {
  function getLimits(
    svc: string,
  ): { cpus: string; memory: string } | undefined {
    const deploy = prodServices[svc]?.deploy as
      | Record<string, unknown>
      | undefined;
    const resources = deploy?.resources as Record<string, unknown> | undefined;
    return resources?.limits as { cpus: string; memory: string } | undefined;
  }

  it("postgres: 1G memory, 1 CPU", () => {
    const limits = getLimits("postgres");
    expect(limits).toBeDefined();
    expect(limits!.memory).toBe("1G");
    expect(limits!.cpus).toBe("1.0");
  });

  it("redis: 512M memory, 0.5 CPU", () => {
    const limits = getLimits("redis");
    expect(limits).toBeDefined();
    expect(limits!.memory).toBe("512M");
    expect(limits!.cpus).toBe("0.5");
  });

  it("rabbitmq: 512M memory, 0.5 CPU", () => {
    const limits = getLimits("rabbitmq");
    expect(limits).toBeDefined();
    expect(limits!.memory).toBe("512M");
    expect(limits!.cpus).toBe("0.5");
  });

  it("minio: 1G memory, 1 CPU", () => {
    const limits = getLimits("minio");
    expect(limits).toBeDefined();
    expect(limits!.memory).toBe("1G");
    expect(limits!.cpus).toBe("1.0");
  });

  it("api: 512M memory, 1 CPU", () => {
    const limits = getLimits("api");
    expect(limits).toBeDefined();
    expect(limits!.memory).toBe("512M");
    expect(limits!.cpus).toBe("1.0");
  });

  it("nginx: 256M memory, 0.5 CPU", () => {
    const limits = getLimits("nginx");
    expect(limits).toBeDefined();
    expect(limits!.memory).toBe("256M");
    expect(limits!.cpus).toBe("0.5");
  });
});

// ---------------------------------------------------------------------------
// docker-compose.prod.yml — API Service (production mode)
// ---------------------------------------------------------------------------
describe("docker-compose.prod.yml — API service", () => {
  const api = prodServices.api;

  it("uses built Docker image", () => {
    expect(api.image).toBe("smithy-api:latest");
  });

  it("runs node dist/main.js (not a dev command)", () => {
    const cmd = api.command as string[];
    expect(cmd).toContain("node");
    expect(cmd.some((c) => c.includes("dist/main.js"))).toBe(true);
  });

  it("has empty volumes (overrides dev mounts)", () => {
    expect(api.volumes).toEqual([]);
  });

  it("sets NODE_ENV to production", () => {
    const env = api.environment as Record<string, string>;
    expect(env.NODE_ENV).toBe("production");
  });

  it("depends on all infrastructure services", () => {
    const deps = api.depends_on as Record<string, unknown>;
    expect(deps).toHaveProperty("postgres");
    expect(deps).toHaveProperty("redis");
    expect(deps).toHaveProperty("rabbitmq");
    expect(deps).toHaveProperty("minio");
  });

  it("is on the smithy network", () => {
    const nets = api.networks as string[];
    expect(nets).toContain("smithy");
  });
});

// ---------------------------------------------------------------------------
// docker-compose.prod.yml — Nginx Service
// ---------------------------------------------------------------------------
describe("docker-compose.prod.yml — Nginx service", () => {
  const nginx = prodServices.nginx;

  it("uses nginx:1.25-alpine image", () => {
    expect(nginx.image).toBe("nginx:1.25-alpine");
  });

  it("exposes ports 443 and 80", () => {
    const ports = nginx.ports as string[];
    const portsStr = JSON.stringify(ports);
    expect(portsStr).toContain("443");
    expect(portsStr).toContain("80");
  });

  it("mounts nginx.conf as read-only", () => {
    const vols = nginx.volumes as string[];
    expect(
      vols.some((v: string) => v.includes("nginx.conf") && v.includes(":ro")),
    ).toBe(true);
  });

  it("mounts certs directory as read-only", () => {
    const vols = nginx.volumes as string[];
    expect(
      vols.some((v: string) => v.includes("certs") && v.includes(":ro")),
    ).toBe(true);
  });

  it("mounts web-static volume as read-only", () => {
    const vols = nginx.volumes as string[];
    expect(
      vols.some(
        (v: string) => v.includes("web-static") && v.includes(":ro"),
      ),
    ).toBe(true);
  });

  it("depends on api", () => {
    const deps = nginx.depends_on as string[];
    expect(deps).toContain("api");
  });

  it("is on the smithy network", () => {
    const nets = nginx.networks as string[];
    expect(nets).toContain("smithy");
  });
});

// ---------------------------------------------------------------------------
// docker-compose.prod.yml — JSON Logging
// ---------------------------------------------------------------------------
describe("docker-compose.prod.yml — JSON logging", () => {
  const loggingServices = [
    "postgres",
    "redis",
    "rabbitmq",
    "minio",
    "api",
    "nginx",
  ];

  for (const svc of loggingServices) {
    it(`${svc} uses json-file log driver`, () => {
      const logging = prodServices[svc].logging as Record<string, unknown>;
      expect(logging).toBeDefined();
      expect(logging.driver).toBe("json-file");
    });

    it(`${svc} has log rotation options`, () => {
      const logging = prodServices[svc].logging as Record<string, unknown>;
      const options = logging.options as Record<string, string>;
      expect(options).toBeDefined();
      expect(options["max-size"]).toBeDefined();
      expect(options["max-file"]).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// docker-compose.prod.yml — Security Hardening
// ---------------------------------------------------------------------------
describe("docker-compose.prod.yml — security hardening", () => {
  it("api has no-new-privileges", () => {
    const secOpt = prodServices.api.security_opt as string[];
    expect(secOpt).toContain("no-new-privileges:true");
  });

  it("api has read_only filesystem", () => {
    expect(prodServices.api.read_only).toBe(true);
  });

  it("api has tmpfs for writable temp", () => {
    const tmpfs = prodServices.api.tmpfs as string[];
    expect(tmpfs).toContain("/tmp");
  });

  it("nginx has no-new-privileges", () => {
    const secOpt = prodServices.nginx.security_opt as string[];
    expect(secOpt).toContain("no-new-privileges:true");
  });

  it("nginx has read_only filesystem", () => {
    expect(prodServices.nginx.read_only).toBe(true);
  });

  it("nginx has tmpfs for writable dirs", () => {
    const tmpfs = prodServices.nginx.tmpfs as string[];
    expect(tmpfs).toContain("/tmp");
    expect(tmpfs).toContain("/var/cache/nginx");
    expect(tmpfs).toContain("/var/run");
  });
});

// ---------------------------------------------------------------------------
// docker-compose.prod.yml — No dev source mounts
// ---------------------------------------------------------------------------
describe("docker-compose.prod.yml — no dev source mounts", () => {
  it("api volumes is empty array", () => {
    expect(prodServices.api.volumes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// nginx.conf — SSL termination
// ---------------------------------------------------------------------------
describe("nginx.conf — SSL termination", () => {
  it("file exists and is non-empty", () => {
    expect(nginxConf.length).toBeGreaterThan(0);
  });

  it("listens on port 443 with SSL", () => {
    expect(nginxConf).toContain("listen 443 ssl");
  });

  it("has ssl_certificate directive", () => {
    expect(nginxConf).toContain("ssl_certificate");
  });

  it("has ssl_certificate_key directive", () => {
    expect(nginxConf).toContain("ssl_certificate_key");
  });

  it("uses TLSv1.2 and TLSv1.3 protocols", () => {
    expect(nginxConf).toContain("TLSv1.2");
    expect(nginxConf).toContain("TLSv1.3");
  });

  it("has HTTP to HTTPS redirect", () => {
    expect(nginxConf).toContain("listen 80");
    expect(nginxConf).toContain("return 301 https://");
  });
});

// ---------------------------------------------------------------------------
// nginx.conf — Rate Limiting
// ---------------------------------------------------------------------------
describe("nginx.conf — rate limiting", () => {
  it("defines limit_req_zone for API", () => {
    expect(nginxConf).toContain("limit_req_zone");
    expect(nginxConf).toContain("zone=api");
    expect(nginxConf).toContain("rate=30r/s");
  });

  it("applies limit_req to /api location", () => {
    // Find the /api location block and check it has limit_req
    const apiBlock = nginxConf.slice(nginxConf.indexOf("location /api"));
    expect(apiBlock).toContain("limit_req zone=api");
  });
});

// ---------------------------------------------------------------------------
// nginx.conf — Gzip Compression
// ---------------------------------------------------------------------------
describe("nginx.conf — gzip compression", () => {
  it("enables gzip", () => {
    expect(nginxConf).toContain("gzip on");
  });

  it("compresses JSON", () => {
    expect(nginxConf).toContain("application/json");
  });

  it("compresses JavaScript", () => {
    expect(nginxConf).toContain("application/javascript");
  });

  it("compresses CSS", () => {
    expect(nginxConf).toContain("text/css");
  });
});

// ---------------------------------------------------------------------------
// nginx.conf — Static File Caching
// ---------------------------------------------------------------------------
describe("nginx.conf — static file caching", () => {
  it("has Cache-Control header with max-age for hashed assets", () => {
    expect(nginxConf).toContain("max-age=31536000");
  });

  it("serves static files from /usr/share/nginx/html", () => {
    expect(nginxConf).toContain("/usr/share/nginx/html");
  });

  it("has try_files for SPA routing", () => {
    expect(nginxConf).toContain("try_files");
    expect(nginxConf).toContain("/index.html");
  });
});

// ---------------------------------------------------------------------------
// nginx.conf — Proxy Pass
// ---------------------------------------------------------------------------
describe("nginx.conf — proxy pass", () => {
  it("proxies /api to api backend", () => {
    expect(nginxConf).toContain("location /api");
    expect(nginxConf).toContain("proxy_pass http://api_backend");
  });

  it("proxies /socket.io with WebSocket upgrade", () => {
    expect(nginxConf).toContain("location /socket.io");
    expect(nginxConf).toContain('Connection "upgrade"');
    expect(nginxConf).toContain("Upgrade $http_upgrade");
  });

  it("defines api upstream pointing to api:3000", () => {
    expect(nginxConf).toContain("upstream api_backend");
    expect(nginxConf).toContain("server api:3000");
  });
});

// ---------------------------------------------------------------------------
// nginx.conf — Health Check
// ---------------------------------------------------------------------------
describe("nginx.conf — health check endpoint", () => {
  it("has /health location on port 80 (no auth required)", () => {
    // The HTTP server block should have a /health endpoint
    const httpBlock = nginxConf.slice(
      nginxConf.indexOf("listen 80"),
      nginxConf.indexOf("listen 443"),
    );
    expect(httpBlock).toContain("location /health");
  });

  it("has /health location on port 443", () => {
    const httpsBlock = nginxConf.slice(nginxConf.indexOf("listen 443"));
    expect(httpsBlock).toContain("location /health");
  });
});

// ---------------------------------------------------------------------------
// nginx.conf — Security Headers
// ---------------------------------------------------------------------------
describe("nginx.conf — security headers", () => {
  it("has X-Frame-Options header", () => {
    expect(nginxConf).toContain("X-Frame-Options");
  });

  it("has X-Content-Type-Options header", () => {
    expect(nginxConf).toContain("X-Content-Type-Options");
  });

  it("has X-XSS-Protection header", () => {
    expect(nginxConf).toContain("X-XSS-Protection");
  });

  it("has Referrer-Policy header", () => {
    expect(nginxConf).toContain("Referrer-Policy");
  });
});

// ---------------------------------------------------------------------------
// nginx.conf — Structured Logging
// ---------------------------------------------------------------------------
describe("nginx.conf — structured logging", () => {
  it("has JSON log format", () => {
    expect(nginxConf).toContain("log_format");
    expect(nginxConf).toContain("json");
    expect(nginxConf).toContain("escape=json");
  });
});

// ---------------------------------------------------------------------------
// .env.production.example — Required Variables
// ---------------------------------------------------------------------------
describe(".env.production.example — required variables", () => {
  it("file exists and is non-empty", () => {
    expect(envProdContent.length).toBeGreaterThan(0);
  });

  // All required vars from the task spec
  const requiredVars = [
    "DATABASE_URL",
    "POSTGRES_PASSWORD",
    "REDIS_URL",
    "REDIS_PASSWORD",
    "RABBITMQ_URL",
    "RABBITMQ_DEFAULT_USER",
    "RABBITMQ_DEFAULT_PASS",
    "MINIO_ENDPOINT",
    "MINIO_ROOT_USER",
    "MINIO_ROOT_PASSWORD",
    "JWT_SECRET",
    "PUBLIC_PORT",
    "PUBLIC_HTTP_PORT",
    "NODE_ENV",
  ];

  for (const v of requiredVars) {
    it(`contains ${v}`, () => {
      expect(envProdVars[v]).toBeDefined();
    });
  }

  it("NODE_ENV is set to production", () => {
    expect(envProdVars.NODE_ENV).toBe("production");
  });
});

// ---------------------------------------------------------------------------
// .env.production.example — No Real Secrets
// ---------------------------------------------------------------------------
describe(".env.production.example — no real secrets", () => {
  it("POSTGRES_PASSWORD is a placeholder", () => {
    expect(envProdVars.POSTGRES_PASSWORD).toContain("CHANGE_ME");
  });

  it("REDIS_PASSWORD is a placeholder", () => {
    expect(envProdVars.REDIS_PASSWORD).toContain("CHANGE_ME");
  });

  it("RABBITMQ_DEFAULT_PASS is a placeholder", () => {
    expect(envProdVars.RABBITMQ_DEFAULT_PASS).toContain("CHANGE_ME");
  });

  it("MINIO_ROOT_PASSWORD is a placeholder", () => {
    expect(envProdVars.MINIO_ROOT_PASSWORD).toContain("CHANGE_ME");
  });

  it("JWT_SECRET is a placeholder", () => {
    expect(envProdVars.JWT_SECRET).toContain("CHANGE_ME");
  });

  it("DATABASE_URL uses placeholder password", () => {
    expect(envProdVars.DATABASE_URL).toContain("CHANGE_ME");
  });

  it("REDIS_URL uses placeholder password", () => {
    expect(envProdVars.REDIS_URL).toContain("CHANGE_ME");
  });

  it("RABBITMQ_URL uses placeholder password", () => {
    expect(envProdVars.RABBITMQ_URL).toContain("CHANGE_ME");
  });
});

// ---------------------------------------------------------------------------
// .env.production.example — Documentation Quality
// ---------------------------------------------------------------------------
describe(".env.production.example — documentation quality", () => {
  it("every variable has a preceding comment line", () => {
    const lines = envProdContent.split("\n");
    const varLineIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        varLineIndices.push(i);
      }
    }
    for (const idx of varLineIndices) {
      const varName = lines[idx].split("=")[0].trim();
      let hasComment = false;
      for (let back = 1; back <= 5 && idx - back >= 0; back++) {
        const prevLine = lines[idx - back].trim();
        if (prevLine.startsWith("#")) {
          hasComment = true;
          break;
        }
        if (prevLine && !prevLine.startsWith("#")) break;
      }
      expect(hasComment, `${varName} should have a preceding comment`).toBe(
        true,
      );
    }
  });

  it("points URLs to internal Docker network hostnames (not localhost)", () => {
    expect(envProdVars.DATABASE_URL).toContain("postgres:");
    expect(envProdVars.RABBITMQ_URL).toContain("rabbitmq:");
    expect(envProdVars.MINIO_ENDPOINT).toContain("minio:");
    expect(envProdVars.REDIS_URL).toContain("redis:");
  });

  it("has header documentation block", () => {
    expect(envProdContent).toContain("Production Environment Variables");
  });

  it("contains usage instructions", () => {
    expect(envProdContent).toContain("docker compose");
  });
});

// ---------------------------------------------------------------------------
// .env.production.example — Additional Production Variables
// ---------------------------------------------------------------------------
describe(".env.production.example — additional production vars", () => {
  it("contains APP_PORT", () => {
    expect(envProdVars.APP_PORT).toBeDefined();
  });

  it("contains CORS_ORIGIN", () => {
    expect(envProdVars.CORS_ORIGIN).toBeDefined();
  });

  it("contains LOG_LEVEL", () => {
    expect(envProdVars.LOG_LEVEL).toBeDefined();
  });

  it("contains OPENAI_API_KEY placeholder", () => {
    expect(envProdVars.OPENAI_API_KEY).toBeDefined();
  });

  it("contains ANTHROPIC_API_KEY placeholder", () => {
    expect(envProdVars.ANTHROPIC_API_KEY).toBeDefined();
  });

  it("contains RESEND_API_KEY placeholder", () => {
    expect(envProdVars.RESEND_API_KEY).toBeDefined();
  });

  it("contains EMAIL_FROM", () => {
    expect(envProdVars.EMAIL_FROM).toBeDefined();
  });

  it("contains DASHBOARD_URL", () => {
    expect(envProdVars.DASHBOARD_URL).toBeDefined();
  });

  it("contains MINIO_ACCESS_KEY", () => {
    expect(envProdVars.MINIO_ACCESS_KEY).toBeDefined();
  });

  it("contains MINIO_SECRET_KEY", () => {
    expect(envProdVars.MINIO_SECRET_KEY).toBeDefined();
  });

  it("contains MINIO_BUCKET", () => {
    expect(envProdVars.MINIO_BUCKET).toBeDefined();
  });
});
