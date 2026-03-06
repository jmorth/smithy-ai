import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseWorkerYaml,
  sanitizeName,
  formatSize,
  validateWorkerDir,
  checkDockerAvailable,
  getImageSize,
  run,
  type BuildResult,
} from "./build.js";
import { setJsonMode } from "../../lib/output.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `smithy-build-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

const VALID_YAML = `name: "test-worker"
slug: "test-worker"
version: "1.2.3"
inputTypes:
  - "text"
outputType: "text"
provider:
  name: "anthropic"
  model: "claude-sonnet-4-20250514"
  apiKeyEnv: "ANTHROPIC_API_KEY"
`;

const VALID_YAML_NO_VERSION = `name: "test-worker"
slug: "test-worker"
inputTypes:
  - "text"
outputType: "text"
provider:
  name: "anthropic"
  model: "claude-sonnet-4-20250514"
  apiKeyEnv: "ANTHROPIC_API_KEY"
`;

const VALID_DOCKERFILE = `FROM smithy-worker-base:latest
COPY . .
RUN bun install
CMD ["bun", "run", "worker.ts"]
`;

function createValidWorkerDir(dir: string): void {
  writeFileSync(join(dir, "worker.yaml"), VALID_YAML);
  writeFileSync(join(dir, "Dockerfile"), VALID_DOCKERFILE);
}

function createWorkerDirNoVersion(dir: string): void {
  writeFileSync(join(dir, "worker.yaml"), VALID_YAML_NO_VERSION);
  writeFileSync(join(dir, "Dockerfile"), VALID_DOCKERFILE);
}

let tmpDir: string;
let stdoutData: string[];
let stderrData: string[];
let stdoutSpy: ReturnType<typeof spyOn>;
let stderrSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  tmpDir = makeTmpDir();
  stdoutData = [];
  stderrData = [];
  stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
    (chunk: string | Uint8Array) => {
      stdoutData.push(String(chunk));
      return true;
    },
  );
  stderrSpy = spyOn(process.stderr, "write").mockImplementation(
    (chunk: string | Uint8Array) => {
      stderrData.push(String(chunk));
      return true;
    },
  );
  setJsonMode(false);
  process.exitCode = 0;
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  rmSync(tmpDir, { recursive: true, force: true });
  setJsonMode(false);
  process.exitCode = 0;
});

// ---------------------------------------------------------------------------
// parseWorkerYaml
// ---------------------------------------------------------------------------

describe("parseWorkerYaml", () => {
  it("parses valid worker.yaml", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), VALID_YAML);
    const { data, error } = parseWorkerYaml(tmpDir);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.name).toBe("test-worker");
    expect(data!.version).toBe("1.2.3");
  });

  it("returns error when worker.yaml is missing", () => {
    const { data, error } = parseWorkerYaml(tmpDir);
    expect(data).toBeNull();
    expect(error).toContain("not found");
  });

  it("returns error for invalid YAML", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), ":\n  :\n  - [invalid");
    const { data, error } = parseWorkerYaml(tmpDir);
    expect(data).toBeNull();
    expect(error).toContain("Failed to parse");
  });

  it("returns error for non-object YAML (scalar)", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "just a string");
    const { data, error } = parseWorkerYaml(tmpDir);
    expect(data).toBeNull();
    expect(error).toContain("valid YAML object");
  });

  it("returns error for non-object YAML (array)", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "- item1\n- item2");
    const { data, error } = parseWorkerYaml(tmpDir);
    expect(data).toBeNull();
    expect(error).toContain("valid YAML object");
  });
});

// ---------------------------------------------------------------------------
// sanitizeName
// ---------------------------------------------------------------------------

describe("sanitizeName", () => {
  it("passes through valid lowercase names", () => {
    const { sanitized, wasModified } = sanitizeName("my-worker");
    expect(sanitized).toBe("my-worker");
    expect(wasModified).toBe(false);
  });

  it("lowercases uppercase names", () => {
    const { sanitized, wasModified } = sanitizeName("My-Worker");
    expect(sanitized).toBe("my-worker");
    expect(wasModified).toBe(true);
  });

  it("replaces special characters with hyphens", () => {
    const { sanitized, wasModified } = sanitizeName("my_worker.v2");
    expect(sanitized).toBe("my-worker-v2");
    expect(wasModified).toBe(true);
  });

  it("collapses multiple hyphens", () => {
    const { sanitized, wasModified } = sanitizeName("my---worker");
    expect(sanitized).toBe("my-worker");
    expect(wasModified).toBe(true);
  });

  it("strips leading and trailing hyphens", () => {
    const { sanitized, wasModified } = sanitizeName("-worker-");
    expect(sanitized).toBe("worker");
    expect(wasModified).toBe(true);
  });

  it("handles spaces", () => {
    const { sanitized, wasModified } = sanitizeName("my worker");
    expect(sanitized).toBe("my-worker");
    expect(wasModified).toBe(true);
  });

  it("handles purely numeric names", () => {
    const { sanitized, wasModified } = sanitizeName("123");
    expect(sanitized).toBe("123");
    expect(wasModified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatSize
// ---------------------------------------------------------------------------

describe("formatSize", () => {
  it("formats bytes", () => {
    expect(formatSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatSize(2048)).toBe("2.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatSize(256 * 1024 * 1024)).toBe("256.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatSize(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });

  it("formats zero bytes", () => {
    expect(formatSize(0)).toBe("0 B");
  });

  it("formats fractional MB", () => {
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});

// ---------------------------------------------------------------------------
// validateWorkerDir
// ---------------------------------------------------------------------------

describe("validateWorkerDir", () => {
  it("returns null for valid worker directory", () => {
    createValidWorkerDir(tmpDir);
    expect(validateWorkerDir(tmpDir)).toBeNull();
  });

  it("returns error for non-existent path", () => {
    const result = validateWorkerDir(join(tmpDir, "nonexistent"));
    expect(result).toContain("does not exist");
  });

  it("returns error when path is a file", () => {
    const filePath = join(tmpDir, "somefile.txt");
    writeFileSync(filePath, "hello");
    const result = validateWorkerDir(filePath);
    expect(result).toContain("is a file, not a directory");
  });

  it("returns error when worker.yaml is missing", () => {
    writeFileSync(join(tmpDir, "Dockerfile"), VALID_DOCKERFILE);
    const result = validateWorkerDir(tmpDir);
    expect(result).toContain("worker.yaml not found");
  });

  it("returns error when Dockerfile is missing", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), VALID_YAML);
    const result = validateWorkerDir(tmpDir);
    expect(result).toContain("Dockerfile not found");
  });
});

// ---------------------------------------------------------------------------
// checkDockerAvailable
// ---------------------------------------------------------------------------

describe("checkDockerAvailable", () => {
  let bunSpawnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    bunSpawnSpy = spyOn(Bun, "spawn");
  });

  afterEach(() => {
    bunSpawnSpy.mockRestore();
  });

  it("returns available when docker info succeeds", async () => {
    const stdoutBlob = new Blob([""]);
    const stderrBlob = new Blob([""]);
    bunSpawnSpy.mockImplementation(() => ({
      exited: Promise.resolve(0),
      stdout: stdoutBlob.stream(),
      stderr: stderrBlob.stream(),
      pid: 1,
      kill: () => {},
    }));
    const result = await checkDockerAvailable();
    expect(result.available).toBe(true);
    expect(result.error).toBeNull();
  });

  it("returns unavailable when docker info fails", async () => {
    const stdoutBlob = new Blob([""]);
    const stderrBlob = new Blob([""]);
    bunSpawnSpy.mockImplementation(() => ({
      exited: Promise.resolve(1),
      stdout: stdoutBlob.stream(),
      stderr: stderrBlob.stream(),
      pid: 1,
      kill: () => {},
    }));
    const result = await checkDockerAvailable();
    expect(result.available).toBe(false);
    expect(result.error).toContain("Docker daemon is not running");
  });

  it("returns unavailable when Bun.spawn throws (docker not in PATH)", async () => {
    bunSpawnSpy.mockImplementation(() => {
      throw new Error("spawn failed");
    });
    const result = await checkDockerAvailable();
    expect(result.available).toBe(false);
    expect(result.error).toContain("not installed");
  });
});

// ---------------------------------------------------------------------------
// getImageSize
// ---------------------------------------------------------------------------

describe("getImageSize", () => {
  let bunSpawnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    bunSpawnSpy = spyOn(Bun, "spawn");
  });

  afterEach(() => {
    bunSpawnSpy.mockRestore();
  });

  it("returns size when inspect succeeds", async () => {
    const stdoutBlob = new Blob(["256000000\n"]);
    const stderrBlob = new Blob([""]);
    bunSpawnSpy.mockImplementation(() => ({
      exited: Promise.resolve(0),
      stdout: stdoutBlob.stream(),
      stderr: stderrBlob.stream(),
      pid: 1,
      kill: () => {},
    }));
    const result = await getImageSize("test:latest");
    expect(result.sizeBytes).toBe(256000000);
    expect(result.error).toBeNull();
  });

  it("returns error when inspect exits non-zero", async () => {
    const stdoutBlob = new Blob([""]);
    const stderrBlob = new Blob([""]);
    bunSpawnSpy.mockImplementation(() => ({
      exited: Promise.resolve(1),
      stdout: stdoutBlob.stream(),
      stderr: stderrBlob.stream(),
      pid: 1,
      kill: () => {},
    }));
    const result = await getImageSize("test:latest");
    expect(result.sizeBytes).toBe(0);
    expect(result.error).toContain("Failed to inspect image size");
  });

  it("returns error when output is not a number", async () => {
    const stdoutBlob = new Blob(["not-a-number\n"]);
    const stderrBlob = new Blob([""]);
    bunSpawnSpy.mockImplementation(() => ({
      exited: Promise.resolve(0),
      stdout: stdoutBlob.stream(),
      stderr: stderrBlob.stream(),
      pid: 1,
      kill: () => {},
    }));
    const result = await getImageSize("test:latest");
    expect(result.sizeBytes).toBe(0);
    expect(result.error).toContain("Failed to parse image size");
  });

  it("returns error when Bun.spawn throws", async () => {
    bunSpawnSpy.mockImplementation(() => {
      throw new Error("spawn failed");
    });
    const result = await getImageSize("test:latest");
    expect(result.sizeBytes).toBe(0);
    expect(result.error).toContain("Failed to inspect image");
  });
});

// ---------------------------------------------------------------------------
// run() command handler — validation errors (no Docker needed)
// ---------------------------------------------------------------------------

describe("run - validation", () => {
  const mockCmd = {
    opts: () => ({}),
  } as any;

  it("exits 1 when path does not exist", async () => {
    await run({}, mockCmd, join(tmpDir, "nonexistent"));
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    expect(output).toContain("does not exist");
  });

  it("exits 1 when path is a file", async () => {
    const filePath = join(tmpDir, "somefile.txt");
    writeFileSync(filePath, "hello");
    await run({}, mockCmd, filePath);
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    expect(output).toContain("is a file, not a directory");
  });

  it("exits 1 when worker.yaml is missing", async () => {
    writeFileSync(join(tmpDir, "Dockerfile"), VALID_DOCKERFILE);
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    expect(output).toContain("worker.yaml not found");
  });

  it("exits 1 when Dockerfile is missing", async () => {
    writeFileSync(join(tmpDir, "worker.yaml"), VALID_YAML);
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    expect(output).toContain("Dockerfile not found");
  });

  it("exits 1 when worker.yaml has invalid YAML", async () => {
    writeFileSync(join(tmpDir, "worker.yaml"), ":\n  :\n  - [invalid");
    writeFileSync(join(tmpDir, "Dockerfile"), VALID_DOCKERFILE);
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    expect(output).toContain("Failed to parse");
  });

  it("exits 1 when worker.yaml has no name field", async () => {
    writeFileSync(
      join(tmpDir, "worker.yaml"),
      'inputTypes:\n  - "text"\noutputType: "text"',
    );
    writeFileSync(join(tmpDir, "Dockerfile"), VALID_DOCKERFILE);
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    expect(output).toContain("name");
  });

  it("exits 1 when worker.yaml has empty name", async () => {
    writeFileSync(join(tmpDir, "worker.yaml"), 'name: ""');
    writeFileSync(join(tmpDir, "Dockerfile"), VALID_DOCKERFILE);
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    expect(output).toContain("name");
  });

  it("exits 1 when worker.yaml name is not a string", async () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "name: 123");
    writeFileSync(join(tmpDir, "Dockerfile"), VALID_DOCKERFILE);
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(1);
  });

  it("defaults to current directory when no path given", async () => {
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    writeFileSync(join(tmpDir, "Dockerfile"), VALID_DOCKERFILE);
    try {
      await run({}, mockCmd);
      expect(process.exitCode).toBe(1);
      const output = stderrData.join("");
      expect(output).toContain("worker.yaml not found");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("sets json mode when --json global option is set", async () => {
    await run({ json: true }, mockCmd, join(tmpDir, "nonexistent"));
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// run() command handler — Docker integration (mocked)
// ---------------------------------------------------------------------------

describe("run - Docker build", () => {
  let bunSpawnSpy: ReturnType<typeof spyOn>;

  function createMockProc(
    exitCode: number,
    stdout: string = "",
    stderr: string = "",
  ) {
    const stdoutBlob = new Blob([stdout]);
    const stderrBlob = new Blob([stderr]);
    return {
      exited: Promise.resolve(exitCode),
      stdout: stdoutBlob.stream(),
      stderr: stderrBlob.stream(),
      pid: 12345,
      kill: () => {},
    };
  }

  beforeEach(() => {
    bunSpawnSpy = spyOn(Bun, "spawn");
  });

  afterEach(() => {
    bunSpawnSpy.mockRestore();
  });

  it("exits 1 when Docker is not available", async () => {
    createValidWorkerDir(tmpDir);
    bunSpawnSpy.mockImplementation(() => createMockProc(1));

    const mockCmd = { opts: () => ({}) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    expect(output).toContain("Docker");
  });

  it("builds successfully with correct tags", async () => {
    createValidWorkerDir(tmpDir);
    const calls: string[][] = [];

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];
      calls.push(cmd);

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(0, "256000000\n");
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({}) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);

    // Verify docker build was called with correct tags
    const buildCall = calls.find(
      (c) => c[0] === "docker" && c[1] === "build",
    );
    expect(buildCall).toBeDefined();
    expect(buildCall).toContain("smithy-worker-test-worker:latest");
    expect(buildCall).toContain("smithy-worker-test-worker:1.2.3");

    // Verify output contains image info
    const output = stdoutData.join("");
    expect(output).toContain("smithy-worker-test-worker");
  });

  it("uses default version 0.1.0 when not in YAML", async () => {
    createWorkerDirNoVersion(tmpDir);
    const calls: string[][] = [];

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];
      calls.push(cmd);

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(0, "100000000\n");
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({}) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);

    const buildCall = calls.find(
      (c) => c[0] === "docker" && c[1] === "build",
    );
    expect(buildCall).toContain("smithy-worker-test-worker:0.1.0");
  });

  it("adds custom tag when --tag is specified", async () => {
    createValidWorkerDir(tmpDir);
    const calls: string[][] = [];

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];
      calls.push(cmd);

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(0, "100000000\n");
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({ tag: "custom-tag" }) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);

    const buildCall = calls.find(
      (c) => c[0] === "docker" && c[1] === "build",
    );
    expect(buildCall).toContain("smithy-worker-test-worker:custom-tag");
  });

  it("passes --no-cache to docker build", async () => {
    createValidWorkerDir(tmpDir);
    const calls: string[][] = [];

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];
      calls.push(cmd);

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(0, "100000000\n");
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({ cache: false }) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);

    const buildCall = calls.find(
      (c) => c[0] === "docker" && c[1] === "build",
    );
    expect(buildCall).toContain("--no-cache");
  });

  it("passes --platform to docker build", async () => {
    createValidWorkerDir(tmpDir);
    const calls: string[][] = [];

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];
      calls.push(cmd);

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(0, "100000000\n");
      }
      return createMockProc(1);
    });

    const mockCmd = {
      opts: () => ({ platform: "linux/amd64" }),
    } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);

    const buildCall = calls.find(
      (c) => c[0] === "docker" && c[1] === "build",
    );
    expect(buildCall).toContain("--platform");
    expect(buildCall).toContain("linux/amd64");
  });

  it("exits 1 on build failure and dumps output", async () => {
    createValidWorkerDir(tmpDir);

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(1, "", "error: build failed\n");
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({}) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    expect(output).toContain("Build failed");
    expect(output).toContain("Docker build output");
  });

  it("warns when name is sanitized", async () => {
    writeFileSync(
      join(tmpDir, "worker.yaml"),
      `name: "My Worker_V2"\nversion: "1.0.0"`,
    );
    writeFileSync(join(tmpDir, "Dockerfile"), VALID_DOCKERFILE);

    const calls: string[][] = [];
    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];
      calls.push(cmd);

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(0, "100000000\n");
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({}) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);

    const output = stderrData.join("");
    expect(output).toContain("Warning");
    expect(output).toContain("sanitized");

    // Verify sanitized name was used in tags
    const buildCall = calls.find(
      (c) => c[0] === "docker" && c[1] === "build",
    );
    expect(buildCall).toContain("smithy-worker-my-worker-v2:latest");
  });

  it("outputs JSON on success when --json is set", async () => {
    createValidWorkerDir(tmpDir);

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(0, "256000000\n");
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({}) } as any;
    await run({ json: true }, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);

    const output = stdoutData.join("");
    const parsed = JSON.parse(output) as BuildResult;
    expect(parsed.image).toBe("smithy-worker-test-worker");
    expect(parsed.tags).toContain("smithy-worker-test-worker:latest");
    expect(parsed.tags).toContain("smithy-worker-test-worker:1.2.3");
    expect(parsed.sizeBytes).toBe(256000000);
    expect(parsed.size).toBe("244.1 MB");
  });

  it("does not show sanitization warning in JSON mode", async () => {
    writeFileSync(
      join(tmpDir, "worker.yaml"),
      `name: "My_Worker"\nversion: "1.0.0"`,
    );
    writeFileSync(join(tmpDir, "Dockerfile"), VALID_DOCKERFILE);

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(0, "100000000\n");
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({}) } as any;
    await run({ json: true }, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);

    const output = stderrData.join("");
    expect(output).not.toContain("Warning");
  });

  it("uses verbose mode with inherited stdio", async () => {
    createValidWorkerDir(tmpDir);
    const calls: Array<{ cmd: string[]; opts: any }> = [];

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];
      const opts = args[1] || {};
      calls.push({ cmd, opts });

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return {
          exited: Promise.resolve(0),
          pid: 12345,
          kill: () => {},
        };
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(0, "100000000\n");
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({ verbose: true }) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);

    const buildCallEntry = calls.find(
      (c) => c.cmd[0] === "docker" && c.cmd[1] === "build",
    );
    expect(buildCallEntry).toBeDefined();
    expect(buildCallEntry!.opts.stdout).toBe("inherit");
    expect(buildCallEntry!.opts.stderr).toBe("inherit");
  });

  it("does not dump output on failure when in verbose mode", async () => {
    createValidWorkerDir(tmpDir);

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return {
          exited: Promise.resolve(1),
          pid: 12345,
          kill: () => {},
        };
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({ verbose: true }) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    // verbose already streamed, so should not say "Docker build output"
    expect(output).not.toContain("Docker build output");
  });

  it("reports image size on success output", async () => {
    createValidWorkerDir(tmpDir);

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(0, "524288000\n");
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({}) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);

    const output = stdoutData.join("");
    expect(output).toContain("500.0 MB");
  });

  it("handles image inspect failure gracefully", async () => {
    createValidWorkerDir(tmpDir);

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(1);
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({}) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);
    const output = stdoutData.join("");
    expect(output).toContain("0 B");
  });

  it("builds with Dockerfile in the worker directory", async () => {
    createValidWorkerDir(tmpDir);
    const calls: Array<{ cmd: string[]; opts: any }> = [];

    bunSpawnSpy.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string[];
      const opts = args[1] || {};
      calls.push({ cmd, opts });

      if (cmd[0] === "docker" && cmd[1] === "info") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "build") {
        return createMockProc(0);
      }
      if (cmd[0] === "docker" && cmd[1] === "image") {
        return createMockProc(0, "100000000\n");
      }
      return createMockProc(1);
    });

    const mockCmd = { opts: () => ({}) } as any;
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);

    const buildCallEntry = calls.find(
      (c) => c.cmd[0] === "docker" && c.cmd[1] === "build",
    );
    expect(buildCallEntry).toBeDefined();
    expect(buildCallEntry!.cmd).toContain("-f");
    expect(buildCallEntry!.cmd).toContain("Dockerfile");
    expect(buildCallEntry!.opts.cwd).toBe(tmpDir);
  });
});

// ---------------------------------------------------------------------------
// CLI integration
// ---------------------------------------------------------------------------

describe("CLI integration", () => {
  it("build command accepts a path argument", async () => {
    const { createProgram } = await import("../../index.js");
    const program = createProgram();

    await program.parseAsync([
      "node",
      "smithy",
      "worker",
      "build",
      join(tmpDir, "nonexistent"),
    ]);
    expect(process.exitCode).toBe(1);
  });

  it("build command registers all flags", async () => {
    const { createProgram } = await import("../../index.js");
    const program = createProgram();
    const buildCmd = program.commands
      .find((c) => c.name() === "worker")
      ?.commands.find((c) => c.name() === "build");
    expect(buildCmd).toBeDefined();

    const options = buildCmd!.options.map((o) => o.long);
    expect(options).toContain("--verbose");
    expect(options).toContain("--tag");
    expect(options).toContain("--no-cache");
    expect(options).toContain("--platform");
  });
});
