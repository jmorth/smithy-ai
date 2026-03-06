import type { Page } from "@playwright/test";

/**
 * Stub login helper — no-op in MVP.
 * Accepts a user parameter for forward-compatibility with real auth.
 */
export async function login(
  _page: Page,
  _user?: { email?: string; password?: string },
): Promise<void> {
  // No-op: auth is passthrough in MVP
}

/**
 * Navigate to a path using the configured baseURL.
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/**
 * Browser-side callback that listens for a Socket.IO event.
 * Extracted for testability — this function is serialized and
 * executed inside the browser via page.evaluate().
 */
export function socketListenerCallback(args: {
  event: string;
  timeout: number;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timed out waiting for socket event: ${args.event}`,
          ),
        ),
      args.timeout,
    );

    const socket = (window as Record<string, unknown>).__socket__ as
      | { once(event: string, cb: (data: unknown) => void): void }
      | undefined;

    if (!socket) {
      clearTimeout(timer);
      reject(
        new Error("Socket.IO instance not found on window.__socket__"),
      );
      return;
    }

    socket.once(args.event, (data: unknown) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Wait for a specific Socket.IO event to be received on the page.
 * Resolves with the event data payload.
 */
export async function waitForSocket<T = unknown>(
  page: Page,
  event: string,
  options?: { timeout?: number },
): Promise<T> {
  const timeout = options?.timeout ?? 10_000;

  return page.evaluate(socketListenerCallback, {
    event,
    timeout,
  }) as Promise<T>;
}
