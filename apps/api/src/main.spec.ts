import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';

describe('bootstrap (main entry point)', () => {
  let listenSpy: ReturnType<typeof vi.fn>;
  let createSpy: ReturnType<typeof vi.fn>;
  let useLoggerSpy: ReturnType<typeof vi.fn>;
  let enableCorsSpy: ReturnType<typeof vi.fn>;
  let setGlobalPrefixSpy: ReturnType<typeof vi.fn>;
  let enableShutdownHooksSpy: ReturnType<typeof vi.fn>;
  let getSpy: ReturnType<typeof vi.fn>;
  let useGlobalFiltersSpy: ReturnType<typeof vi.fn>;
  let mockLogger: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockLogger = { log: vi.fn() };
    listenSpy = vi.fn().mockResolvedValue(undefined);
    useLoggerSpy = vi.fn();
    enableCorsSpy = vi.fn();
    setGlobalPrefixSpy = vi.fn();
    enableShutdownHooksSpy = vi.fn();
    useGlobalFiltersSpy = vi.fn();
    getSpy = vi.fn().mockReturnValue(mockLogger);

    const mockApp: Partial<INestApplication> = {
      listen: listenSpy,
      useLogger: useLoggerSpy,
      enableCors: enableCorsSpy,
      setGlobalPrefix: setGlobalPrefixSpy,
      enableShutdownHooks: enableShutdownHooksSpy,
      useGlobalFilters: useGlobalFiltersSpy,
      get: getSpy,
    };

    createSpy = vi.fn().mockResolvedValue(mockApp);
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env['APP_PORT'];
    delete process.env['CORS_ORIGIN'];
  });

  function setupMocks() {
    vi.doMock('@nestjs/core', () => ({
      NestFactory: { create: createSpy },
    }));
    vi.doMock('./app.module', () => ({
      AppModule: class AppModule {},
    }));
    vi.doMock('nestjs-pino', () => ({
      Logger: class Logger {},
    }));
    vi.doMock('./common/filters/http-exception.filter', () => ({
      HttpExceptionFilter: class HttpExceptionFilter {},
    }));
  }

  it('should start the app on default port 3000', async () => {
    setupMocks();
    const mod = await import('./main');
    await mod.startupPromise;

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(listenSpy).toHaveBeenCalledWith(3000);
  });

  it('should start the app on APP_PORT from environment', async () => {
    process.env['APP_PORT'] = '4000';
    setupMocks();

    const mod = await import('./main');
    await mod.startupPromise;

    expect(listenSpy).toHaveBeenCalledWith(4000);
  });

  it('should attach Pino logger via useLogger', async () => {
    setupMocks();
    const mod = await import('./main');
    await mod.startupPromise;

    expect(useLoggerSpy).toHaveBeenCalledTimes(1);
  });

  it('should enable CORS with default origin http://localhost:5173', async () => {
    setupMocks();
    const mod = await import('./main');
    await mod.startupPromise;

    expect(enableCorsSpy).toHaveBeenCalledWith({
      origin: 'http://localhost:5173',
    });
  });

  it('should enable CORS with CORS_ORIGIN env var when set', async () => {
    process.env['CORS_ORIGIN'] = 'http://localhost:3001';
    setupMocks();

    const mod = await import('./main');
    await mod.startupPromise;

    expect(enableCorsSpy).toHaveBeenCalledWith({
      origin: 'http://localhost:3001',
    });
  });

  it('should set global prefix to "api"', async () => {
    setupMocks();
    const mod = await import('./main');
    await mod.startupPromise;

    expect(setGlobalPrefixSpy).toHaveBeenCalledWith('api');
  });

  it('should enable shutdown hooks', async () => {
    setupMocks();
    const mod = await import('./main');
    await mod.startupPromise;

    expect(enableShutdownHooksSpy).toHaveBeenCalledTimes(1);
  });

  it('should log startup message with port number', async () => {
    setupMocks();
    const mod = await import('./main');
    await mod.startupPromise;

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('3000'),
      'Bootstrap',
    );
  });

  it('should create app with bufferLogs option', async () => {
    setupMocks();
    const mod = await import('./main');
    await mod.startupPromise;

    expect(createSpy).toHaveBeenCalledWith(expect.anything(), {
      bufferLogs: true,
    });
  });

  it('should register global exception filter via useGlobalFilters', async () => {
    setupMocks();
    const mod = await import('./main');
    await mod.startupPromise;

    expect(useGlobalFiltersSpy).toHaveBeenCalledTimes(1);
    expect(useGlobalFiltersSpy).toHaveBeenCalledWith(expect.any(Object));
  });
});
