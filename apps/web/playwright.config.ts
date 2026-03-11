import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
        },
      },
    },
  ],
  webServer: [
    {
      command: "docker compose -f ../../docker/docker-compose.yml up -d",
      timeout: 60_000,
      reuseExistingServer: true,
    },
    {
      command: "pnpm --filter api dev",
      url: "http://localhost:3000/health",
      timeout: 30_000,
      reuseExistingServer: true,
    },
    {
      command: "pnpm --filter web dev",
      url: "http://localhost:5173",
      timeout: 15_000,
      reuseExistingServer: true,
    },
  ],
});
