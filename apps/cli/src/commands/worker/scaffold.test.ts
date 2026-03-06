import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { renderTemplate, generateFiles } from "./scaffold.js";
import type { ScaffoldOptions } from "./scaffold.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(tmpdir(), `scaffold-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function defaultOptions(overrides?: Partial<ScaffoldOptions>): ScaffoldOptions {
  return {
    name: "my-worker",
    inputTypes: ["text", "json"],
    outputType: "text",
    providerName: "anthropic",
    modelName: "claude-sonnet-4-20250514",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// renderTemplate
// ---------------------------------------------------------------------------

describe("renderTemplate", () => {
  it("replaces all placeholders in a simple template", () => {
    const tmpl = "name={{WORKER_NAME}} class={{CLASS_NAME}} out={{OUTPUT_TYPE}}";
    const result = renderTemplate(tmpl, defaultOptions());
    expect(result).toBe("name=my-worker class=MyWorkerWorker out=text");
  });

  it("replaces {{INPUT_TYPES}} with YAML list", () => {
    const tmpl = "inputTypes:\n{{INPUT_TYPES}}";
    const result = renderTemplate(tmpl, defaultOptions());
    expect(result).toBe('inputTypes:\n  - "text"\n  - "json"');
  });

  it("replaces {{PROVIDER_NAME}} and {{MODEL_NAME}}", () => {
    const tmpl = "provider={{PROVIDER_NAME}} model={{MODEL_NAME}}";
    const result = renderTemplate(tmpl, defaultOptions({ providerName: "openai", modelName: "gpt-4o" }));
    expect(result).toBe("provider=openai model=gpt-4o");
  });

  it("derives API_KEY_ENV from known providers", () => {
    const tmpl = "key={{API_KEY_ENV}}";
    expect(renderTemplate(tmpl, defaultOptions({ providerName: "anthropic" }))).toBe("key=ANTHROPIC_API_KEY");
    expect(renderTemplate(tmpl, defaultOptions({ providerName: "openai" }))).toBe("key=OPENAI_API_KEY");
    expect(renderTemplate(tmpl, defaultOptions({ providerName: "google" }))).toBe("key=GOOGLE_AI_API_KEY");
  });

  it("derives API_KEY_ENV from unknown provider via uppercase convention", () => {
    const tmpl = "key={{API_KEY_ENV}}";
    const result = renderTemplate(tmpl, defaultOptions({ providerName: "mistral" }));
    expect(result).toBe("key=MISTRAL_API_KEY");
  });

  it("converts hyphenated names to PascalCase for class name", () => {
    const tmpl = "class={{CLASS_NAME}}";
    const result = renderTemplate(tmpl, defaultOptions({ name: "code-reviewer" }));
    expect(result).toBe("class=CodeReviewerWorker");
  });

  it("converts underscore names to PascalCase for class name", () => {
    const tmpl = "class={{CLASS_NAME}}";
    const result = renderTemplate(tmpl, defaultOptions({ name: "spec_writer" }));
    expect(result).toBe("class=SpecWriterWorker");
  });

  it("handles single-word name", () => {
    const tmpl = "class={{CLASS_NAME}}";
    const result = renderTemplate(tmpl, defaultOptions({ name: "summarizer" }));
    expect(result).toBe("class=SummarizerWorker");
  });

  it("handles single input type", () => {
    const tmpl = "{{INPUT_TYPES}}";
    const result = renderTemplate(tmpl, defaultOptions({ inputTypes: ["pdf"] }));
    expect(result).toBe('  - "pdf"');
  });

  it("handles many input types", () => {
    const tmpl = "{{INPUT_TYPES}}";
    const result = renderTemplate(
      tmpl,
      defaultOptions({ inputTypes: ["text", "image", "pdf", "json", "csv"] }),
    );
    const lines = result.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('  - "text"');
    expect(lines[4]).toBe('  - "csv"');
  });
});

// ---------------------------------------------------------------------------
// generateFiles
// ---------------------------------------------------------------------------

describe("generateFiles", () => {
  let tmpDir: string;
  let targetDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    targetDir = join(tmpDir, "workers", "my-worker");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the target directory", () => {
    generateFiles(targetDir, defaultOptions());
    expect(existsSync(targetDir)).toBe(true);
  });

  it("creates worker.yaml with correct content", () => {
    generateFiles(targetDir, defaultOptions());
    const content = readFileSync(join(targetDir, "worker.yaml"), "utf-8");
    expect(content).toContain('name: "my-worker"');
    expect(content).toContain('slug: "my-worker"');
    expect(content).toContain('  - "text"');
    expect(content).toContain('  - "json"');
    expect(content).toContain('outputType: "text"');
    expect(content).toContain('name: "anthropic"');
    expect(content).toContain('model: "claude-sonnet-4-20250514"');
    expect(content).toContain('apiKeyEnv: "ANTHROPIC_API_KEY"');
  });

  it("creates worker.ts with SmithyWorker subclass", () => {
    generateFiles(targetDir, defaultOptions());
    const content = readFileSync(join(targetDir, "worker.ts"), "utf-8");
    expect(content).toContain("class MyWorkerWorker extends SmithyWorker");
    expect(content).toContain("onReceive");
    expect(content).toContain("onProcess");
    expect(content).toContain("import { SmithyWorker } from '@smithy/worker-sdk'");
    expect(content).toContain(".setType('text')");
  });

  it("creates Dockerfile with correct structure", () => {
    generateFiles(targetDir, defaultOptions());
    const content = readFileSync(join(targetDir, "Dockerfile"), "utf-8");
    expect(content).toContain("FROM smithy-worker-base:latest");
    expect(content).toContain("WORKDIR /app");
    expect(content).toContain("COPY . .");
    expect(content).toContain("RUN bun install");
    expect(content).toContain('CMD ["bun", "run", "worker.ts"]');
  });

  it("returns list of created file paths", () => {
    const files = generateFiles(targetDir, defaultOptions());
    expect(files).toHaveLength(3);
    expect(files).toContain(join(targetDir, "worker.yaml"));
    expect(files).toContain(join(targetDir, "worker.ts"));
    expect(files).toContain(join(targetDir, "Dockerfile"));
  });

  it("generates correct content for openai provider", () => {
    const opts = defaultOptions({
      providerName: "openai",
      modelName: "gpt-4o",
    });
    generateFiles(targetDir, opts);
    const yaml = readFileSync(join(targetDir, "worker.yaml"), "utf-8");
    expect(yaml).toContain('name: "openai"');
    expect(yaml).toContain('model: "gpt-4o"');
    expect(yaml).toContain('apiKeyEnv: "OPENAI_API_KEY"');
  });

  it("generates correct content for google provider", () => {
    const opts = defaultOptions({
      providerName: "google",
      modelName: "gemini-2.0-flash",
    });
    generateFiles(targetDir, opts);
    const yaml = readFileSync(join(targetDir, "worker.yaml"), "utf-8");
    expect(yaml).toContain('name: "google"');
    expect(yaml).toContain('model: "gemini-2.0-flash"');
    expect(yaml).toContain('apiKeyEnv: "GOOGLE_AI_API_KEY"');
  });

  it("worker.ts contains meaningful lifecycle comments", () => {
    generateFiles(targetDir, defaultOptions());
    const content = readFileSync(join(targetDir, "worker.ts"), "utf-8");
    expect(content).toContain("validate the incoming Package");
    expect(content).toContain("process the Package");
    expect(content).toContain("context.ai");
    expect(content).toContain("context.inputPackage");
    expect(content).toContain("context.outputBuilder");
  });

  it("creates nested directories as needed", () => {
    const deepDir = join(tmpDir, "a", "b", "c", "workers", "deep");
    generateFiles(deepDir, defaultOptions());
    expect(existsSync(join(deepDir, "worker.yaml"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// run (command handler)
// ---------------------------------------------------------------------------

describe("run command handler", () => {
  let tmpDir: string;
  let originalCwd: string;
  let consoleLogs: string[];
  let stderrWrites: string[];
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let stdoutWriteSpy: ReturnType<typeof spyOn>;
  let stderrWriteSpy: ReturnType<typeof spyOn>;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = 0;

    consoleLogs = [];
    stderrWrites = [];

    consoleLogSpy = spyOn(console, "log").mockImplementation(
      (...args: unknown[]) => {
        consoleLogs.push(args.join(" "));
      },
    );

    stdoutWriteSpy = spyOn(process.stdout, "write").mockImplementation(
      (chunk: any) => {
        // capture spinner/ora output
        return true;
      },
    );

    stderrWriteSpy = spyOn(process.stderr, "write").mockImplementation(
      (chunk: any) => {
        stderrWrites.push(String(chunk));
        return true;
      },
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  function makeCmd(opts: Record<string, unknown> = {}): any {
    return {
      opts: () => opts,
    };
  }

  it("fails with error when no name is provided", async () => {
    const { run } = await import("./scaffold.js");
    await run({}, makeCmd());
    expect(process.exitCode).toBe(1);
    const allStderr = stderrWrites.join("");
    expect(allStderr).toContain("Usage: smithy worker scaffold <name>");
  });

  it("fails when target directory already exists", async () => {
    mkdirSync(join(tmpDir, "workers", "existing"), { recursive: true });
    const { run } = await import("./scaffold.js");
    await run({}, makeCmd(), "existing");
    expect(process.exitCode).toBe(1);
    const allStderr = stderrWrites.join("");
    expect(allStderr).toContain("Directory already exists");
  });

  it("creates worker files in non-interactive mode", async () => {
    const { run } = await import("./scaffold.js");
    await run(
      {},
      makeCmd({
        interactive: false,
        inputTypes: "text,json",
        outputType: "text",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
      }),
      "test-worker",
    );

    expect(process.exitCode).not.toBe(1);
    const targetDir = join(tmpDir, "workers", "test-worker");
    expect(existsSync(join(targetDir, "worker.yaml"))).toBe(true);
    expect(existsSync(join(targetDir, "worker.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "Dockerfile"))).toBe(true);
  });

  it("uses default input types when none provided in non-interactive mode", async () => {
    const { run } = await import("./scaffold.js");
    await run(
      {},
      makeCmd({ interactive: false }),
      "default-worker",
    );

    const yaml = readFileSync(
      join(tmpDir, "workers", "default-worker", "worker.yaml"),
      "utf-8",
    );
    expect(yaml).toContain('  - "text"');
  });

  it("uses provider defaults for model when not specified", async () => {
    const { run } = await import("./scaffold.js");
    await run(
      {},
      makeCmd({ interactive: false, provider: "openai" }),
      "model-default-worker",
    );

    const yaml = readFileSync(
      join(tmpDir, "workers", "model-default-worker", "worker.yaml"),
      "utf-8",
    );
    expect(yaml).toContain('model: "gpt-4o"');
  });

  it("prints created files on success", async () => {
    const { run } = await import("./scaffold.js");
    await run(
      {},
      makeCmd({ interactive: false }),
      "listed-worker",
    );

    const allOutput = consoleLogs.join("\n");
    expect(allOutput).toContain("Created files:");
    expect(allOutput).toContain("worker.yaml");
    expect(allOutput).toContain("worker.ts");
    expect(allOutput).toContain("Dockerfile");
  });

  it("supports google provider in non-interactive mode", async () => {
    const { run } = await import("./scaffold.js");
    await run(
      {},
      makeCmd({ interactive: false, provider: "google", inputTypes: "image" }),
      "google-worker",
    );

    const yaml = readFileSync(
      join(tmpDir, "workers", "google-worker", "worker.yaml"),
      "utf-8",
    );
    expect(yaml).toContain('name: "google"');
    expect(yaml).toContain('model: "gemini-2.0-flash"');
    expect(yaml).toContain('apiKeyEnv: "GOOGLE_AI_API_KEY"');
    expect(yaml).toContain('  - "image"');
  });

  it("generates worker.ts with correct class name from hyphenated name", async () => {
    const { run } = await import("./scaffold.js");
    await run(
      {},
      makeCmd({ interactive: false }),
      "code-reviewer",
    );

    const ts = readFileSync(
      join(tmpDir, "workers", "code-reviewer", "worker.ts"),
      "utf-8",
    );
    expect(ts).toContain("class CodeReviewerWorker extends SmithyWorker");
  });

  it("handles multiple comma-separated input types", async () => {
    const { run } = await import("./scaffold.js");
    await run(
      {},
      makeCmd({ interactive: false, inputTypes: "text,image,pdf,json,csv" }),
      "multi-input",
    );

    const yaml = readFileSync(
      join(tmpDir, "workers", "multi-input", "worker.yaml"),
      "utf-8",
    );
    expect(yaml).toContain('  - "text"');
    expect(yaml).toContain('  - "image"');
    expect(yaml).toContain('  - "pdf"');
    expect(yaml).toContain('  - "json"');
    expect(yaml).toContain('  - "csv"');
  });

  it("uses custom output type in non-interactive mode", async () => {
    const { run } = await import("./scaffold.js");
    await run(
      {},
      makeCmd({ interactive: false, outputType: "SPECIFICATION" }),
      "custom-output",
    );

    const yaml = readFileSync(
      join(tmpDir, "workers", "custom-output", "worker.yaml"),
      "utf-8",
    );
    expect(yaml).toContain('outputType: "SPECIFICATION"');

    const ts = readFileSync(
      join(tmpDir, "workers", "custom-output", "worker.ts"),
      "utf-8",
    );
    expect(ts).toContain(".setType('SPECIFICATION')");
  });

  it("handles file generation errors gracefully", async () => {
    mkdirSync(join(tmpDir, "workers", "read-only-worker"), { recursive: true });
    const { run } = await import("./scaffold.js");
    await run(
      {},
      makeCmd({ interactive: false }),
      "read-only-worker",
    );
    expect(process.exitCode).toBe(1);
    const allStderr = stderrWrites.join("");
    expect(allStderr).toContain("Directory already exists");
  });

  it("catches and reports errors during file generation", async () => {
    // Create a file at the path where a directory would need to be created
    // This causes mkdirSync to fail inside generateFiles
    mkdirSync(join(tmpDir, "workers"), { recursive: true });
    writeFileSync(join(tmpDir, "workers", "broken"), "not-a-dir", "utf-8");
    // Create a nested path so generateFiles tries to mkdir inside a file
    const { run } = await import("./scaffold.js");
    // We need to bypass the existsSync check, so use a path that doesn't exist
    // but where mkdir will fail. A file blocking the path does this.
    await run(
      {},
      makeCmd({ interactive: false }),
      "broken/nested",
    );
    expect(process.exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// promptForOptions (interactive mode)
// ---------------------------------------------------------------------------

describe("promptForOptions", () => {
  let tmpDir: string;
  let originalCwd: string;
  let consoleLogs: string[];
  let stderrWrites: string[];
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let stdoutWriteSpy: ReturnType<typeof spyOn>;
  let stderrWriteSpy: ReturnType<typeof spyOn>;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    originalExitCode = process.exitCode as number | undefined;
    process.exitCode = 0;

    consoleLogs = [];
    stderrWrites = [];

    consoleLogSpy = spyOn(console, "log").mockImplementation(
      (...args: unknown[]) => {
        consoleLogs.push(args.join(" "));
      },
    );

    stdoutWriteSpy = spyOn(process.stdout, "write").mockImplementation(
      (chunk: any) => {
        return true;
      },
    );

    stderrWriteSpy = spyOn(process.stderr, "write").mockImplementation(
      (chunk: any) => {
        stderrWrites.push(String(chunk));
        return true;
      },
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  it("calls promptForOptions when interactive mode is used", async () => {
    // Mock @inquirer/prompts
    let inputCallCount = 0;
    mock.module("@inquirer/prompts", () => ({
      input: async ({ message, default: def }: any) => {
        inputCallCount++;
        if (message === "Worker name:") return "interactive-worker";
        if (message === "Output type:") return "text";
        if (message === "Model name:") return "claude-sonnet-4-20250514";
        return def ?? "";
      },
      checkbox: async () => ["text", "json"],
      select: async () => "anthropic",
    }));

    const { run } = await import("./scaffold.js");

    await run(
      {},
      { opts: () => ({}) } as any,
      "interactive-worker",
    );

    expect(process.exitCode).not.toBe(1);
    const targetDir = join(tmpDir, "workers", "interactive-worker");
    expect(existsSync(join(targetDir, "worker.yaml"))).toBe(true);
    expect(existsSync(join(targetDir, "worker.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "Dockerfile"))).toBe(true);

    const yaml = readFileSync(join(targetDir, "worker.yaml"), "utf-8");
    expect(yaml).toContain('name: "interactive-worker"');
    expect(yaml).toContain('  - "text"');
    expect(yaml).toContain('  - "json"');
  });

  it("handles custom input types via __custom__ selection", async () => {
    mock.module("@inquirer/prompts", () => ({
      input: async ({ message }: any) => {
        if (message === "Worker name:") return "custom-types-worker";
        if (message === "Custom input types (comma-separated):") return "audio,video";
        if (message === "Output type:") return "text";
        if (message === "Model name:") return "gpt-4o";
        return "";
      },
      checkbox: async () => ["text", "__custom__"],
      select: async () => "openai",
    }));

    const { run } = await import("./scaffold.js");
    await run(
      {},
      { opts: () => ({}) } as any,
      "custom-types-worker",
    );

    expect(process.exitCode).not.toBe(1);
    const yaml = readFileSync(
      join(tmpDir, "workers", "custom-types-worker", "worker.yaml"),
      "utf-8",
    );
    expect(yaml).toContain('  - "text"');
    expect(yaml).toContain('  - "audio"');
    expect(yaml).toContain('  - "video"');
  });

  it("defaults to text when no input types are selected", async () => {
    mock.module("@inquirer/prompts", () => ({
      input: async ({ message }: any) => {
        if (message === "Worker name:") return "empty-types-worker";
        if (message === "Output type:") return "text";
        if (message === "Model name:") return "gemini-2.0-flash";
        return "";
      },
      checkbox: async () => [],
      select: async () => "google",
    }));

    const { run } = await import("./scaffold.js");
    await run(
      {},
      { opts: () => ({}) } as any,
      "empty-types-worker",
    );

    expect(process.exitCode).not.toBe(1);
    const yaml = readFileSync(
      join(tmpDir, "workers", "empty-types-worker", "worker.yaml"),
      "utf-8",
    );
    expect(yaml).toContain('  - "text"');
  });
});
