import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { run } from "./status.js";

describe("status command", () => {
  let consoleLogs: string[];
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogs = [];
    consoleLogSpy = spyOn(console, "log").mockImplementation(
      (...args: unknown[]) => {
        consoleLogs.push(args.join(" "));
      },
    );
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("prints not implemented message", async () => {
    await run({}, {} as any);
    expect(consoleLogs.join("\n")).toContain("Not implemented: status");
  });
});
