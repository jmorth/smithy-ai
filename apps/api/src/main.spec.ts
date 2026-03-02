import { vi, describe, it, expect, afterEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';

describe('bootstrap (main entry point)', () => {
  let listenSpy: ReturnType<typeof vi.fn>;
  let createSpy: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env['PORT'];
  });

  it('should start the app on default port 3000', async () => {
    listenSpy = vi.fn().mockResolvedValue(undefined);
    const mockApp: Partial<INestApplication> = { listen: listenSpy };
    createSpy = vi.fn().mockResolvedValue(mockApp);

    vi.doMock('@nestjs/core', () => ({
      NestFactory: { create: createSpy },
    }));
    vi.doMock('./app.module', () => ({
      AppModule: class AppModule {},
    }));

    const mod = await import('./main');
    await mod.startupPromise;

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(listenSpy).toHaveBeenCalledWith(3000);
  });

  it('should start the app on PORT from environment', async () => {
    process.env['PORT'] = '4000';

    listenSpy = vi.fn().mockResolvedValue(undefined);
    const mockApp: Partial<INestApplication> = { listen: listenSpy };
    createSpy = vi.fn().mockResolvedValue(mockApp);

    vi.doMock('@nestjs/core', () => ({
      NestFactory: { create: createSpy },
    }));
    vi.doMock('./app.module', () => ({
      AppModule: class AppModule {},
    }));

    const mod = await import('./main');
    await mod.startupPromise;

    expect(listenSpy).toHaveBeenCalledWith('4000');
  });
});
