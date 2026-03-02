import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { run, printHelp, printVersion, printUnknownCommand, runCommand } from "./index.js";

describe("CLI entry point", () => {
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

  describe("printHelp", () => {
    it("prints Smithy CLI heading", () => {
      printHelp();
      expect(consoleLogs.join("\n")).toContain("Smithy CLI");
    });

    it("lists dev command", () => {
      printHelp();
      expect(consoleLogs.join("\n")).toContain("dev");
    });

    it("lists ops command", () => {
      printHelp();
      expect(consoleLogs.join("\n")).toContain("ops");
    });

    it("includes --help option", () => {
      printHelp();
      expect(consoleLogs.join("\n")).toContain("--help");
    });
  });

  describe("printVersion", () => {
    it("prints package name", () => {
      printVersion();
      expect(consoleLogs.join("\n")).toContain("@smithy/cli");
    });
  });

  describe("printUnknownCommand", () => {
    it("prints error with command name", () => {
      printUnknownCommand("bogus");
      expect(consoleErrors.join("\n")).toContain("bogus");
    });

    it("references --help", () => {
      printUnknownCommand("bogus");
      expect(consoleErrors.join("\n")).toContain("--help");
    });
  });

  describe("runCommand", () => {
    it("routes to dev command and runs it", async () => {
      await runCommand("dev", []);
      expect(consoleLogs.join("\n")).toContain("smithy dev");
    });

    it("routes to ops command and runs it", async () => {
      await runCommand("ops", []);
      expect(consoleLogs.join("\n")).toContain("smithy ops");
    });
  });

  describe("run (argument parsing)", () => {
    it("prints help when no arguments provided", () => {
      run(["bun", "smithy"]);
      expect(consoleLogs.join("\n")).toContain("Smithy CLI");
    });

    it("prints help with --help flag", () => {
      run(["bun", "smithy", "--help"]);
      expect(consoleLogs.join("\n")).toContain("Smithy CLI");
    });

    it("prints help with -h flag", () => {
      run(["bun", "smithy", "-h"]);
      expect(consoleLogs.join("\n")).toContain("Smithy CLI");
    });

    it("prints version with --version flag", () => {
      run(["bun", "smithy", "--version"]);
      expect(consoleLogs.join("\n")).toContain("@smithy/cli");
    });

    it("prints version with -v flag", () => {
      run(["bun", "smithy", "-v"]);
      expect(consoleLogs.join("\n")).toContain("@smithy/cli");
    });

    it("exits with code 1 for unknown command", () => {
      expect(() => run(["bun", "smithy", "unknown-command"])).toThrow("process.exit(1)");
      expect(exitCode).toBe(1);
    });

    it("prints error message for unknown command", () => {
      expect(() => run(["bun", "smithy", "foobar"])).toThrow();
      expect(consoleErrors.join("\n")).toContain("foobar");
    });

    it("mentions --help in error message for unknown command", () => {
      expect(() => run(["bun", "smithy", "foobar"])).toThrow();
      expect(consoleErrors.join("\n")).toContain("--help");
    });

    it("routes dev command without throwing", () => {
      expect(() => run(["bun", "smithy", "dev"])).not.toThrow();
    });

    it("routes ops command without throwing", () => {
      expect(() => run(["bun", "smithy", "ops"])).not.toThrow();
    });
  });
});
