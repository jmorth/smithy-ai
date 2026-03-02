import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['worker.ts'],
      exclude: ['*.test.ts', '*.config.ts'],
    },
  },
});
