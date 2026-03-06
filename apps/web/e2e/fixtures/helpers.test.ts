import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Page } from "@playwright/test";
import {
  login,
  navigateTo,
  waitForSocket,
  socketListenerCallback,
} from "./helpers";

function createMockPage(overrides?: Partial<Page>): Page {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Page;
}

describe("login", () => {
  it("should be a no-op that resolves without error", async () => {
    const page = createMockPage();

    await expect(login(page)).resolves.toBeUndefined();
  });

  it("should accept an optional user parameter", async () => {
    const page = createMockPage();

    await expect(
      login(page, { email: "test@test.com", password: "pass" }),
    ).resolves.toBeUndefined();
  });

  it("should not interact with the page", async () => {
    const page = createMockPage();

    await login(page);

    expect(page.goto).not.toHaveBeenCalled();
    expect(page.evaluate).not.toHaveBeenCalled();
  });
});

describe("navigateTo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should navigate to the given path", async () => {
    const page = createMockPage();

    await navigateTo(page, "/dashboard");

    expect(page.goto).toHaveBeenCalledWith("/dashboard");
  });

  it("should wait for networkidle after navigation", async () => {
    const page = createMockPage();

    await navigateTo(page, "/workers");

    expect(page.waitForLoadState).toHaveBeenCalledWith("networkidle");
  });

  it("should call goto before waitForLoadState", async () => {
    const callOrder: string[] = [];
    const page = createMockPage({
      goto: vi.fn().mockImplementation(async () => {
        callOrder.push("goto");
      }),
      waitForLoadState: vi.fn().mockImplementation(async () => {
        callOrder.push("waitForLoadState");
      }),
    } as unknown as Partial<Page>);

    await navigateTo(page, "/test");

    expect(callOrder).toEqual(["goto", "waitForLoadState"]);
  });
});

describe("waitForSocket", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should call page.evaluate with the callback and args", async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue({ data: "test" }),
    } as unknown as Partial<Page>);

    const result = await waitForSocket(page, "job:updated");

    expect(page.evaluate).toHaveBeenCalledWith(socketListenerCallback, {
      event: "job:updated",
      timeout: 10_000,
    });
    expect(result).toEqual({ data: "test" });
  });

  it("should accept a custom timeout", async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockResolvedValue(undefined),
    } as unknown as Partial<Page>);

    await waitForSocket(page, "package:created", { timeout: 5000 });

    expect(page.evaluate).toHaveBeenCalledWith(socketListenerCallback, {
      event: "package:created",
      timeout: 5000,
    });
  });

  it("should return typed data from evaluate", async () => {
    interface JobEvent {
      jobId: string;
      status: string;
    }

    const page = createMockPage({
      evaluate: vi
        .fn()
        .mockResolvedValue({ jobId: "123", status: "completed" }),
    } as unknown as Partial<Page>);

    const result = await waitForSocket<JobEvent>(page, "job:completed");

    expect(result.jobId).toBe("123");
    expect(result.status).toBe("completed");
  });

  it("should propagate evaluate errors", async () => {
    const page = createMockPage({
      evaluate: vi.fn().mockRejectedValue(new Error("Page crashed")),
    } as unknown as Partial<Page>);

    await expect(waitForSocket(page, "test")).rejects.toThrow("Page crashed");
  });
});

describe("socketListenerCallback", () => {
  let originalWindow: typeof globalThis.window;

  beforeEach(() => {
    originalWindow = globalThis.window;
    // Create a minimal window mock for Node environment
    globalThis.window = {} as typeof globalThis.window;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    vi.useRealTimers();
  });

  it("should reject when socket is not found on window", async () => {
    await expect(
      socketListenerCallback({ event: "test", timeout: 100 }),
    ).rejects.toThrow("Socket.IO instance not found on window.__socket__");
  });

  it("should resolve with data when socket event fires", async () => {
    const listeners: Record<string, (data: unknown) => void> = {};
    (window as Record<string, unknown>).__socket__ = {
      once: (event: string, cb: (data: unknown) => void) => {
        listeners[event] = cb;
      },
    };

    const promise = socketListenerCallback({
      event: "job:done",
      timeout: 5000,
    });

    // Simulate the socket event firing
    listeners["job:done"]({ id: "123" });

    await expect(promise).resolves.toEqual({ id: "123" });
  });

  it("should time out if socket event never fires", async () => {
    vi.useFakeTimers();

    (window as Record<string, unknown>).__socket__ = {
      once: () => {
        // Never fires
      },
    };

    const promise = socketListenerCallback({
      event: "nope",
      timeout: 1000,
    });

    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow(
      "Timed out waiting for socket event: nope",
    );
  });
});
