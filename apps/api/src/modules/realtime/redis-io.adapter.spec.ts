import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger, INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

const mocks = vi.hoisted(() => {
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockAdapterFactory = vi.fn();
  return {
    mockConnect,
    MockRedis: vi.fn().mockImplementation(() => ({ connect: mockConnect })),
    mockAdapterFactory,
    mockCreateAdapter: vi.fn().mockReturnValue(mockAdapterFactory),
  };
});

vi.mock('ioredis', () => ({
  __esModule: true,
  default: mocks.MockRedis,
}));

vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: mocks.mockCreateAdapter,
}));

import { RedisIoAdapter } from './redis-io.adapter';

describe('RedisIoAdapter', () => {
  let adapter: RedisIoAdapter;
  const mockApp = {} as INestApplication;
  const corsOrigin = 'http://localhost:5173';
  let superCreateIOServerSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.MockRedis.mockClear();
    mocks.mockConnect.mockClear();
    mocks.mockConnect.mockResolvedValue(undefined);
    mocks.mockCreateAdapter.mockClear();
    mocks.mockAdapterFactory.mockClear();

    adapter = new RedisIoAdapter(mockApp, corsOrigin);
    superCreateIOServerSpy = vi
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue({ adapter: vi.fn() });
    logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  describe('connectToRedis', () => {
    it('creates two Redis clients with lazyConnect for pub/sub', async () => {
      await adapter.connectToRedis('redis://localhost:6379');

      expect(mocks.MockRedis).toHaveBeenCalledTimes(2);
      expect(mocks.MockRedis).toHaveBeenCalledWith('redis://localhost:6379', {
        lazyConnect: true,
      });
    });

    it('connects both pub and sub clients', async () => {
      await adapter.connectToRedis('redis://localhost:6379');

      expect(mocks.mockConnect).toHaveBeenCalledTimes(2);
    });

    it('creates the Socket.IO Redis adapter with pub/sub clients', async () => {
      await adapter.connectToRedis('redis://localhost:6379');

      expect(mocks.mockCreateAdapter).toHaveBeenCalledTimes(1);
      const [pubClient, subClient] = mocks.mockCreateAdapter.mock.calls[0]!;
      expect(pubClient).toHaveProperty('connect');
      expect(subClient).toHaveProperty('connect');
    });

    it('logs success when Redis connects', async () => {
      await adapter.connectToRedis('redis://localhost:6379');

      expect(logSpy).toHaveBeenCalledWith(
        'Redis adapter connected for cross-instance broadcasting',
      );
    });

    it('falls back gracefully when Redis connection fails', async () => {
      mocks.mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

      await adapter.connectToRedis('redis://bad-host:6379');

      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to connect Redis adapter: Connection refused. Running in single-instance mode.',
      );
    });

    it('handles non-Error throw values gracefully', async () => {
      mocks.mockConnect.mockRejectedValueOnce('string error');

      await adapter.connectToRedis('redis://bad-host:6379');

      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to connect Redis adapter: Unknown error. Running in single-instance mode.',
      );
    });

    it('does not throw on Redis failure', async () => {
      mocks.mockConnect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        adapter.connectToRedis('redis://bad-host:6379'),
      ).resolves.toBeUndefined();
    });
  });

  describe('createIOServer', () => {
    it('passes CORS configuration to the server', () => {
      adapter.createIOServer(3000);

      expect(superCreateIOServerSpy).toHaveBeenCalledWith(3000, {
        cors: { origin: corsOrigin, credentials: true },
      });
    });

    it('merges additional options with CORS config', () => {
      adapter.createIOServer(3000, { path: '/ws' } as never);

      expect(superCreateIOServerSpy).toHaveBeenCalledWith(3000, {
        path: '/ws',
        cors: { origin: corsOrigin, credentials: true },
      });
    });

    it('attaches Redis adapter when connected', async () => {
      await adapter.connectToRedis('redis://localhost:6379');

      const mockServer = { adapter: vi.fn() };
      superCreateIOServerSpy.mockReturnValue(mockServer);

      adapter.createIOServer(3000);

      expect(mockServer.adapter).toHaveBeenCalledWith(mocks.mockAdapterFactory);
    });

    it('does not attach adapter when Redis is not connected', () => {
      const mockServer = { adapter: vi.fn() };
      superCreateIOServerSpy.mockReturnValue(mockServer);

      adapter.createIOServer(3000);

      expect(mockServer.adapter).not.toHaveBeenCalled();
    });

    it('does not attach adapter after Redis connection failure', async () => {
      mocks.mockConnect.mockRejectedValueOnce(new Error('fail'));

      await adapter.connectToRedis('redis://bad-host:6379');

      const mockServer = { adapter: vi.fn() };
      superCreateIOServerSpy.mockReturnValue(mockServer);

      adapter.createIOServer(3000);

      expect(mockServer.adapter).not.toHaveBeenCalled();
    });

    it('uses custom CORS origin from constructor', () => {
      const customAdapter = new RedisIoAdapter(mockApp, 'https://app.example.com');

      customAdapter.createIOServer(3000);

      expect(superCreateIOServerSpy).toHaveBeenCalledWith(3000, {
        cors: { origin: 'https://app.example.com', credentials: true },
      });
    });
  });
});
