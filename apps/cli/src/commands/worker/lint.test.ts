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
  checkYamlExists,
  checkYamlParseable,
  checkYamlName,
  checkYamlInputTypes,
  checkYamlOutputType,
  checkYamlProvider,
  checkWorkerTsExists,
  checkWorkerTsExtendsSmithyWorker,
  checkDockerfileExists,
  checks,
  printResults,
  run,
  type LintCheckResult,
} from "./lint.js";
import { setJsonMode } from "../../lib/output.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `smithy-lint-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

const VALID_YAML = `name: "test-worker"
slug: "test-worker"
inputTypes:
  - "text"
  - "json"
outputType: "text"
provider:
  name: "anthropic"
  model: "claude-sonnet-4-20250514"
  apiKeyEnv: "ANTHROPIC_API_KEY"
`;

const VALID_WORKER_TS = `import { SmithyWorker } from "@smithy/worker-sdk";

export class TestWorker extends SmithyWorker {
  async onProcess(context: any) {
    return { result: "done" };
  }
}
`;

const VALID_DOCKERFILE = `FROM smithy-worker-base:latest
COPY . .
RUN bun install
CMD ["bun", "run", "worker.ts"]
`;

function createValidWorkerDir(dir: string): void {
  writeFileSync(join(dir, "worker.yaml"), VALID_YAML);
  writeFileSync(join(dir, "worker.ts"), VALID_WORKER_TS);
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
// YAML existence check
// ---------------------------------------------------------------------------

describe("checkYamlExists", () => {
  it("passes when worker.yaml exists", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "name: test");
    const result = checkYamlExists(tmpDir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("found");
  });

  it("fails when worker.yaml is missing", () => {
    const result = checkYamlExists(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// YAML parseable check
// ---------------------------------------------------------------------------

describe("checkYamlParseable", () => {
  it("passes for valid YAML", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), VALID_YAML);
    const result = checkYamlParseable(tmpDir);
    expect(result.passed).toBe(true);
  });

  it("fails for invalid YAML syntax", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), ":\n  :\n  - [invalid");
    const result = checkYamlParseable(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Failed to parse");
  });

  it("fails when YAML is not an object (scalar)", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "just a string");
    const result = checkYamlParseable(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("valid YAML object");
  });

  it("fails when YAML is an array", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "- item1\n- item2");
    const result = checkYamlParseable(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("valid YAML object");
  });

  it("fails when worker.yaml is missing", () => {
    const result = checkYamlParseable(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// YAML name field check
// ---------------------------------------------------------------------------

describe("checkYamlName", () => {
  it("passes for valid name", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), 'name: "my-worker"');
    const result = checkYamlName(tmpDir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("my-worker");
  });

  it("fails for missing name", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "inputTypes:\n  - text");
    const result = checkYamlName(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("non-empty string");
  });

  it("fails for empty name", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), 'name: ""');
    const result = checkYamlName(tmpDir);
    expect(result.passed).toBe(false);
  });

  it("fails for non-string name", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "name: 123");
    const result = checkYamlName(tmpDir);
    expect(result.passed).toBe(false);
  });

  it("fails when yaml is not parseable", () => {
    const result = checkYamlName(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Cannot validate");
  });
});

// ---------------------------------------------------------------------------
// YAML inputTypes field check
// ---------------------------------------------------------------------------

describe("checkYamlInputTypes", () => {
  it("passes for valid non-empty array of strings", () => {
    writeFileSync(
      join(tmpDir, "worker.yaml"),
      "inputTypes:\n  - text\n  - json",
    );
    const result = checkYamlInputTypes(tmpDir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("text");
    expect(result.message).toContain("json");
  });

  it("fails for missing inputTypes", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), 'name: "test"');
    const result = checkYamlInputTypes(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("non-empty array");
  });

  it("fails for empty array", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "inputTypes: []");
    const result = checkYamlInputTypes(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("non-empty array");
  });

  it("fails for non-array", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), 'inputTypes: "text"');
    const result = checkYamlInputTypes(tmpDir);
    expect(result.passed).toBe(false);
  });

  it("fails for array with non-string items", () => {
    writeFileSync(
      join(tmpDir, "worker.yaml"),
      "inputTypes:\n  - 123\n  - true",
    );
    const result = checkYamlInputTypes(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("only strings");
  });

  it("fails when yaml is not parseable", () => {
    const result = checkYamlInputTypes(tmpDir);
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// YAML outputType field check
// ---------------------------------------------------------------------------

describe("checkYamlOutputType", () => {
  it("passes for valid outputType", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), 'outputType: "text"');
    const result = checkYamlOutputType(tmpDir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("text");
  });

  it("fails for missing outputType", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), 'name: "test"');
    const result = checkYamlOutputType(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("non-empty string");
  });

  it("fails for empty outputType", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), 'outputType: ""');
    const result = checkYamlOutputType(tmpDir);
    expect(result.passed).toBe(false);
  });

  it("fails for non-string outputType", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "outputType: 42");
    const result = checkYamlOutputType(tmpDir);
    expect(result.passed).toBe(false);
  });

  it("fails when yaml is not parseable", () => {
    const result = checkYamlOutputType(tmpDir);
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// YAML provider field check
// ---------------------------------------------------------------------------

describe("checkYamlProvider", () => {
  it("passes for valid provider with all fields", () => {
    writeFileSync(
      join(tmpDir, "worker.yaml"),
      `provider:
  name: "anthropic"
  model: "claude-sonnet-4-20250514"
  apiKeyEnv: "ANTHROPIC_API_KEY"`,
    );
    const result = checkYamlProvider(tmpDir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("anthropic");
  });

  it("fails for missing provider", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), 'name: "test"');
    const result = checkYamlProvider(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("must be an object");
  });

  it("fails for non-object provider (string)", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), 'provider: "anthropic"');
    const result = checkYamlProvider(tmpDir);
    expect(result.passed).toBe(false);
  });

  it("fails for non-object provider (array)", () => {
    writeFileSync(
      join(tmpDir, "worker.yaml"),
      "provider:\n  - name\n  - model",
    );
    const result = checkYamlProvider(tmpDir);
    expect(result.passed).toBe(false);
  });

  it("fails when provider is missing name", () => {
    writeFileSync(
      join(tmpDir, "worker.yaml"),
      `provider:
  model: "gpt-4"
  apiKeyEnv: "KEY"`,
    );
    const result = checkYamlProvider(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("name");
  });

  it("fails when provider is missing model", () => {
    writeFileSync(
      join(tmpDir, "worker.yaml"),
      `provider:
  name: "openai"
  apiKeyEnv: "KEY"`,
    );
    const result = checkYamlProvider(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("model");
  });

  it("fails when provider is missing apiKeyEnv", () => {
    writeFileSync(
      join(tmpDir, "worker.yaml"),
      `provider:
  name: "openai"
  model: "gpt-4"`,
    );
    const result = checkYamlProvider(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("apiKeyEnv");
  });

  it("reports all missing fields", () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "provider: {}");
    const result = checkYamlProvider(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("name");
    expect(result.message).toContain("model");
    expect(result.message).toContain("apiKeyEnv");
  });

  it("fails when yaml is not parseable", () => {
    const result = checkYamlProvider(tmpDir);
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TypeScript existence check
// ---------------------------------------------------------------------------

describe("checkWorkerTsExists", () => {
  it("passes when worker.ts exists", () => {
    writeFileSync(join(tmpDir, "worker.ts"), "export class Foo {}");
    const result = checkWorkerTsExists(tmpDir);
    expect(result.passed).toBe(true);
  });

  it("fails when worker.ts is missing", () => {
    const result = checkWorkerTsExists(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// TypeScript extends SmithyWorker check
// ---------------------------------------------------------------------------

describe("checkWorkerTsExtendsSmithyWorker", () => {
  it("passes when class extends SmithyWorker", () => {
    writeFileSync(join(tmpDir, "worker.ts"), VALID_WORKER_TS);
    const result = checkWorkerTsExtendsSmithyWorker(tmpDir);
    expect(result.passed).toBe(true);
    expect(result.message).toContain("Found class extending SmithyWorker");
  });

  it("fails when no class extends SmithyWorker", () => {
    writeFileSync(
      join(tmpDir, "worker.ts"),
      "export class Foo { async run() {} }",
    );
    const result = checkWorkerTsExtendsSmithyWorker(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("No class extending SmithyWorker");
  });

  it("fails when worker.ts does not exist", () => {
    const result = checkWorkerTsExtendsSmithyWorker(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Cannot validate");
  });

  it("matches various class declarations", () => {
    writeFileSync(
      join(tmpDir, "worker.ts"),
      "export class MyCustomWorker   extends   SmithyWorker {\n}",
    );
    const result = checkWorkerTsExtendsSmithyWorker(tmpDir);
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dockerfile existence check
// ---------------------------------------------------------------------------

describe("checkDockerfileExists", () => {
  it("passes when Dockerfile exists", () => {
    writeFileSync(join(tmpDir, "Dockerfile"), "FROM node:18");
    const result = checkDockerfileExists(tmpDir);
    expect(result.passed).toBe(true);
  });

  it("fails when Dockerfile is missing", () => {
    const result = checkDockerfileExists(tmpDir);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// Checks array
// ---------------------------------------------------------------------------

describe("checks array", () => {
  it("contains 9 checks", () => {
    expect(checks).toHaveLength(9);
  });

  it("all pass for a valid worker directory", () => {
    createValidWorkerDir(tmpDir);
    const results = checks.map((check) => check(tmpDir));
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it("reports failures for empty directory", () => {
    const results = checks.map((check) => check(tmpDir));
    const passedCount = results.filter((r) => r.passed).length;
    expect(passedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// printResults
// ---------------------------------------------------------------------------

describe("printResults", () => {
  it("prints checkmarks for passing checks in normal mode", () => {
    const results: LintCheckResult[] = [
      { check: "test check", passed: true, message: "looks good" },
    ];
    printResults(results);
    const output = stdoutData.join("");
    expect(output).toContain("✓");
    expect(output).toContain("test check");
    expect(output).toContain("1/1 checks passed");
  });

  it("prints X marks for failing checks in normal mode", () => {
    const results: LintCheckResult[] = [
      { check: "test check", passed: false, message: "looks bad" },
    ];
    printResults(results);
    const output = stdoutData.join("");
    expect(output).toContain("✗");
    expect(output).toContain("0/1 checks passed");
  });

  it("prints mixed results summary", () => {
    const results: LintCheckResult[] = [
      { check: "check1", passed: true, message: "ok" },
      { check: "check2", passed: false, message: "bad" },
      { check: "check3", passed: true, message: "ok" },
    ];
    printResults(results);
    const output = stdoutData.join("");
    expect(output).toContain("2/3 checks passed");
  });

  it("outputs JSON array in json mode", () => {
    setJsonMode(true);
    const results: LintCheckResult[] = [
      { check: "check1", passed: true, message: "ok" },
      { check: "check2", passed: false, message: "bad" },
    ];
    printResults(results);
    const output = stdoutData.join("");
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ check: "check1", passed: true, message: "ok" });
    expect(parsed[1]).toEqual({
      check: "check2",
      passed: false,
      message: "bad",
    });
  });
});

// ---------------------------------------------------------------------------
// run() command handler
// ---------------------------------------------------------------------------

describe("run", () => {
  const mockCmd = {} as any;

  it("exits 0 for a fully valid worker directory", async () => {
    createValidWorkerDir(tmpDir);
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(0);
  });

  it("exits 1 when any check fails", async () => {
    writeFileSync(join(tmpDir, "worker.yaml"), VALID_YAML);
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(1);
  });

  it("exits 1 when path does not exist", async () => {
    await run({}, mockCmd, join(tmpDir, "nonexistent"));
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    expect(output).toContain("does not exist");
  });

  it("exits 1 when path is a file, not a directory", async () => {
    const filePath = join(tmpDir, "somefile.txt");
    writeFileSync(filePath, "hello");
    await run({}, mockCmd, filePath);
    expect(process.exitCode).toBe(1);
    const output = stderrData.join("");
    expect(output).toContain("is a file, not a directory");
    expect(output).toContain("expects a Worker directory");
  });

  it("defaults to current directory when no path given", async () => {
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    createValidWorkerDir(tmpDir);
    try {
      await run({}, mockCmd);
      expect(process.exitCode).toBe(0);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("enables JSON mode when --json global option is set", async () => {
    createValidWorkerDir(tmpDir);
    await run({ json: true }, mockCmd, tmpDir);
    const output = stdoutData.join("");
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(9);
    expect(parsed.every((r: LintCheckResult) => r.passed)).toBe(true);
  });

  it("JSON output includes failed checks", async () => {
    writeFileSync(join(tmpDir, "worker.yaml"), VALID_YAML);
    await run({ json: true }, mockCmd, tmpDir);
    const output = stdoutData.join("");
    const parsed = JSON.parse(output);
    const failed = parsed.filter((r: LintCheckResult) => !r.passed);
    expect(failed.length).toBeGreaterThan(0);
  });

  it("handles YAML parsing errors gracefully", async () => {
    writeFileSync(join(tmpDir, "worker.yaml"), ":\n  :\n  - [invalid");
    writeFileSync(join(tmpDir, "worker.ts"), VALID_WORKER_TS);
    writeFileSync(join(tmpDir, "Dockerfile"), VALID_DOCKERFILE);
    await run({}, mockCmd, tmpDir);
    expect(process.exitCode).toBe(1);
    const output = stdoutData.join("");
    expect(output).toContain("✗");
  });

  it("handles worker.yaml that is not a YAML object", async () => {
    writeFileSync(join(tmpDir, "worker.yaml"), "just a string");
    writeFileSync(join(tmpDir, "worker.ts"), VALID_WORKER_TS);
    writeFileSync(join(tmpDir, "Dockerfile"), VALID_DOCKERFILE);
    await run({ json: true }, mockCmd, tmpDir);
    const output = stdoutData.join("");
    const parsed = JSON.parse(output);
    const yamlCheck = parsed.find(
      (r: LintCheckResult) => r.check === "worker.yaml is valid YAML",
    );
    expect(yamlCheck.passed).toBe(false);
  });

  it("reports all 9 checks in json output", async () => {
    createValidWorkerDir(tmpDir);
    await run({ json: true }, mockCmd, tmpDir);
    const output = stdoutData.join("");
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(9);
    const checkNames = parsed.map((r: LintCheckResult) => r.check);
    expect(checkNames).toContain("worker.yaml exists");
    expect(checkNames).toContain("worker.yaml is valid YAML");
    expect(checkNames).toContain("name field");
    expect(checkNames).toContain("inputTypes field");
    expect(checkNames).toContain("outputType field");
    expect(checkNames).toContain("provider field");
    expect(checkNames).toContain("worker.ts exists");
    expect(checkNames).toContain("worker.ts extends SmithyWorker");
    expect(checkNames).toContain("Dockerfile exists");
  });
});

// ---------------------------------------------------------------------------
// Integration via createProgram
// ---------------------------------------------------------------------------

describe("CLI integration", () => {
  it("lint command accepts a path argument", async () => {
    const { createProgram } = await import("../../index.js");
    createValidWorkerDir(tmpDir);
    const program = createProgram();
    await program.parseAsync(["node", "smithy", "worker", "lint", tmpDir]);
    expect(process.exitCode).toBe(0);
  });

  it("lint command with --json flag produces valid JSON", async () => {
    const { createProgram } = await import("../../index.js");
    createValidWorkerDir(tmpDir);
    const program = createProgram();
    await program.parseAsync([
      "node",
      "smithy",
      "--json",
      "worker",
      "lint",
      tmpDir,
    ]);
    const output = stdoutData.join("");
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("lint command fails for invalid worker directory", async () => {
    const { createProgram } = await import("../../index.js");
    const program = createProgram();
    await program.parseAsync(["node", "smithy", "worker", "lint", tmpDir]);
    expect(process.exitCode).toBe(1);
  });
});
