import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { run } from "./index.js";

describe("dev command", () => {
  let consoleLogs: string[];
  let consoleErrors: string[];
  let exitCode: number | undefined;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogs = [];
    consoleErrors = [];
    exitCode = undefined;

    consoleLogSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      consoleLogs.push(args.join(" "));
    });

    consoleErrorSpy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.join(" "));
    });

    processExitSpy = spyOn(process, "exit").mockImplementation((code?: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe("help output", () => {
    it("prints help with no args", () => {
      run([]);
      expect(consoleLogs.join("\n")).toContain("smithy dev");
    });

    it("prints help with --help flag", () => {
      run(["--help"]);
      expect(consoleLogs.join("\n")).toContain("smithy dev");
    });

    it("prints help with -h flag", () => {
      run(["-h"]);
      expect(consoleLogs.join("\n")).toContain("smithy dev");
    });

    it("help lists start subcommand", () => {
      run(["--help"]);
      expect(consoleLogs.join("\n")).toContain("start");
    });

    it("help lists logs subcommand", () => {
      run(["--help"]);
      expect(consoleLogs.join("\n")).toContain("logs");
    });

    it("help lists status subcommand", () => {
      run(["--help"]);
      expect(consoleLogs.join("\n")).toContain("status");
    });
  });

  describe("unknown subcommand handling", () => {
    it("exits with code 1 for unknown subcommand", () => {
      expect(() => run(["unknown"])).toThrow("process.exit(1)");
      expect(exitCode).toBe(1);
    });

    it("prints error for unknown subcommand", () => {
      expect(() => run(["unknown"])).toThrow();
      expect(consoleErrors.join("\n")).toContain("unknown");
    });

    it("mentions --help in error message", () => {
      expect(() => run(["bogus"])).toThrow();
      expect(consoleErrors.join("\n")).toContain("--help");
    });
  });
});
