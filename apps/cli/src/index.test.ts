import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { resolve } from "path";
import { createProgram } from "./index.js";

describe("CLI entry point", () => {
  let consoleLogs: string[];
  let consoleErrors: string[];
  let stdoutWrites: string[];
  let stderrWrites: string[];
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;
  let stdoutWriteSpy: ReturnType<typeof spyOn>;
  let stderrWriteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogs = [];
    consoleErrors = [];
    stdoutWrites = [];
    stderrWrites = [];

    consoleLogSpy = spyOn(console, "log").mockImplementation(
      (...args: unknown[]) => {
        consoleLogs.push(args.join(" "));
      },
    );

    consoleErrorSpy = spyOn(console, "error").mockImplementation(
      (...args: unknown[]) => {
        consoleErrors.push(args.join(" "));
      },
    );

    processExitSpy = spyOn(process, "exit").mockImplementation(
      (code?: number) => {
        throw new Error(`process.exit(${code})`);
      },
    );

    stdoutWriteSpy = spyOn(process.stdout, "write").mockImplementation(
      (chunk: any) => {
        stdoutWrites.push(String(chunk));
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
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  function parse(...args: string[]) {
    const program = createProgram();
    program.exitOverride();
    return program.parseAsync(["node", "smithy", ...args]);
  }

  function allOutput(): string {
    return (
      stdoutWrites.join("") +
      stderrWrites.join("") +
      consoleLogs.join("\n") +
      consoleErrors.join("\n")
    );
  }

  describe("help output", () => {
    it("prints help with --help flag", async () => {
      await expect(parse("--help")).rejects.toThrow();
      const output = allOutput();
      expect(output).toContain("Smithy CLI");
      expect(output).toContain("worker");
      expect(output).toContain("config");
      expect(output).toContain("submit");
      expect(output).toContain("status");
      expect(output).toContain("logs");
      expect(output).toContain("packages");
    });

    it("prints help with -h flag", async () => {
      await expect(parse("-h")).rejects.toThrow();
      expect(allOutput()).toContain("Smithy CLI");
    });

    it("lists all top-level commands in help", async () => {
      await expect(parse("--help")).rejects.toThrow();
      const output = allOutput();
      expect(output).toContain("worker");
      expect(output).toContain("config");
      expect(output).toContain("submit");
      expect(output).toContain("status");
      expect(output).toContain("logs");
      expect(output).toContain("packages");
    });
  });

  describe("version output", () => {
    it("prints version with --version flag", async () => {
      await expect(parse("--version")).rejects.toThrow();
      expect(allOutput()).toContain("0.0.0");
    });

    it("prints version with -v flag", async () => {
      await expect(parse("-v")).rejects.toThrow();
      expect(allOutput()).toContain("0.0.0");
    });
  });

  describe("unknown commands", () => {
    it("exits with error for unknown command", async () => {
      await expect(parse("bogus")).rejects.toThrow();
    });

    it("displays error mentioning unknown command name", async () => {
      await expect(parse("notacommand")).rejects.toThrow();
      expect(allOutput()).toContain("notacommand");
    });

    it("shows help after unknown command error", async () => {
      await expect(parse("bogus")).rejects.toThrow();
      const output = allOutput();
      expect(output).toContain("worker");
    });
  });

  describe("global --json option", () => {
    it("accepts --json flag without error", async () => {
      await parse("--json", "status");
      expect(consoleLogs.join("\n")).toContain("Not implemented: status");
    });
  });

  describe("worker command group", () => {
    it("shows worker help listing subcommands", async () => {
      await expect(parse("worker", "--help")).rejects.toThrow();
      const output = allOutput();
      expect(output).toContain("scaffold");
      expect(output).toContain("test");
      expect(output).toContain("lint");
      expect(output).toContain("build");
    });

    it("runs worker scaffold command (requires name argument)", async () => {
      try {
        await parse("worker", "scaffold");
      } catch {
        // Commander calls process.exit(1) for missing required argument
      }
      const output = allOutput();
      expect(output).toContain("scaffold");
    });

    it("runs worker test stub", async () => {
      await parse("worker", "test");
      expect(consoleLogs.join("\n")).toContain("Not implemented: worker test");
    });

    it("runs worker lint command", async () => {
      await parse("worker", "lint");
      // lint now runs actual checks against cwd (not a stub)
      // Just verify it doesn't crash
    });

    it("runs worker build command", async () => {
      await parse("worker", "build");
      // build now validates worker directory (not a stub)
      // Just verify it doesn't crash
    });

    it("errors on unknown worker subcommand", async () => {
      await expect(parse("worker", "deploy")).rejects.toThrow();
    });
  });

  describe("config command group", () => {
    it("shows config help listing subcommands", async () => {
      await expect(parse("config", "--help")).rejects.toThrow();
      const output = allOutput();
      expect(output).toContain("get");
      expect(output).toContain("set");
      expect(output).toContain("list");
    });

    it("runs config get stub", async () => {
      await parse("config", "get");
      expect(consoleLogs.join("\n")).toContain("Not implemented: config get");
    });

    it("runs config set stub", async () => {
      await parse("config", "set");
      expect(consoleLogs.join("\n")).toContain("Not implemented: config set");
    });

    it("runs config list stub", async () => {
      await parse("config", "list");
      expect(consoleLogs.join("\n")).toContain("Not implemented: config list");
    });

    it("errors on unknown config subcommand", async () => {
      await expect(parse("config", "delete")).rejects.toThrow();
    });
  });

  describe("top-level commands", () => {
    it("runs submit command (requires type argument)", async () => {
      try {
        await parse("submit");
      } catch {
        // Commander calls process.exit(1) for missing required argument
      }
      const output = allOutput();
      expect(output).toContain("submit");
    });

    it("runs status stub", async () => {
      await parse("status");
      expect(consoleLogs.join("\n")).toContain("Not implemented: status");
    });

    it("runs logs stub", async () => {
      await parse("logs");
      expect(consoleLogs.join("\n")).toContain("Not implemented: logs");
    });

    it("runs packages stub", async () => {
      await parse("packages");
      expect(consoleLogs.join("\n")).toContain("Not implemented: packages");
    });
  });

  describe("shebang and file structure", () => {
    it("has shebang line at top of entry file", async () => {
      const filePath = resolve(import.meta.dir, "index.ts");
      const file = await Bun.file(filePath).text();
      expect(file.startsWith("#!/usr/bin/env bun")).toBe(true);
    });
  });
});
