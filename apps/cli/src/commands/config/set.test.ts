import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { run } from "./set.js";

describe("config set command", () => {
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
    expect(consoleLogs.join("\n")).toContain("Not implemented: config set");
  });

  it("accepts key and value arguments", async () => {
    await run({}, {} as any, "api-url", "http://localhost:3000");
    expect(consoleLogs.join("\n")).toContain("Not implemented: config set");
  });
});
