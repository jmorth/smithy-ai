import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { run } from "./get.js";

describe("config get command", () => {
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
    expect(consoleLogs.join("\n")).toContain("Not implemented: config get");
  });

  it("accepts a key argument", async () => {
    await run({}, {} as any, "some-key");
    expect(consoleLogs.join("\n")).toContain("Not implemented: config get");
  });
});
