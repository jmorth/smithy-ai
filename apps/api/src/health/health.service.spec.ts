import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';
import { PG_POOL } from '../database/database.provider';

vi.mock('ioredis', () => {
  const MockRedis = vi.fn();
  MockRedis.prototype.connect = vi.fn();
  MockRedis.prototype.ping = vi.fn();
  MockRedis.prototype.disconnect = vi.fn();
  return { default: MockRedis };
});

vi.mock('amqplib', () => ({
  connect: vi.fn(),
}));

import Redis from 'ioredis';
import * as amqplib from 'amqplib';

describe('HealthService', () => {
  let service: HealthService;
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };
  let mockRedisInstance: {
    connect: ReturnType<typeof vi.fn>;
    ping: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockPool = { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };

    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'redis.url') return 'redis://localhost:6379';
        if (key === 'rabbitmq.url') return 'amqp://localhost:5672';
        return undefined;
      }),
    };

    mockRedisInstance = {
      connect: vi.fn().mockResolvedValue(undefined),
      ping: vi.fn().mockResolvedValue('PONG'),
      disconnect: vi.fn(),
    };

    vi.mocked(Redis).mockImplementation(() => mockRedisInstance as unknown as Redis);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PG_POOL, useValue: mockPool },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('checkDatabase', () => {
    it('returns up when SELECT 1 succeeds', async () => {
      const result = await service.checkDatabase();
      expect(result).toEqual({ status: 'up' });
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns down with error message when query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('connection refused'));
      const result = await service.checkDatabase();
      expect(result).toEqual({ status: 'down', error: 'connection refused' });
    });

    it('returns down when check times out', async () => {
      vi.useFakeTimers();
      mockPool.query.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000)),
      );
      const checkPromise = service.checkDatabase();
      vi.advanceTimersByTime(3001);
      const result = await checkPromise;
      expect(result.status).toBe('down');
      expect(result.error).toContain('timed out');
      vi.useRealTimers();
    });

    it('returns down with fallback message for non-Error failures', async () => {
      mockPool.query.mockRejectedValue('string error');
      const result = await service.checkDatabase();
      expect(result).toEqual({ status: 'down', error: 'Database check failed' });
    });
  });

  describe('checkRedis', () => {
    it('returns up when PING succeeds', async () => {
      const result = await service.checkRedis();
      expect(result).toEqual({ status: 'up' });
      expect(mockRedisInstance.connect).toHaveBeenCalled();
      expect(mockRedisInstance.ping).toHaveBeenCalled();
      expect(mockRedisInstance.disconnect).toHaveBeenCalled();
    });

    it('returns down with error message when connect fails', async () => {
      mockRedisInstance.connect.mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await service.checkRedis();
      expect(result).toEqual({ status: 'down', error: 'ECONNREFUSED' });
      expect(mockRedisInstance.disconnect).toHaveBeenCalled();
    });

    it('returns down with error message when ping fails', async () => {
      mockRedisInstance.ping.mockRejectedValue(new Error('ping failed'));
      const result = await service.checkRedis();
      expect(result).toEqual({ status: 'down', error: 'ping failed' });
      expect(mockRedisInstance.disconnect).toHaveBeenCalled();
    });

    it('always disconnects even on failure', async () => {
      mockRedisInstance.connect.mockRejectedValue(new Error('fail'));
      await service.checkRedis();
      expect(mockRedisInstance.disconnect).toHaveBeenCalledTimes(1);
    });

    it('returns down with fallback message for non-Error failures', async () => {
      mockRedisInstance.connect.mockRejectedValue('non-error string');
      const result = await service.checkRedis();
      expect(result).toEqual({ status: 'down', error: 'Redis check failed' });
    });

    it('returns down when check times out', async () => {
      vi.useFakeTimers();
      mockRedisInstance.connect.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000)),
      );
      const checkPromise = service.checkRedis();
      vi.advanceTimersByTime(3001);
      const result = await checkPromise;
      expect(result.status).toBe('down');
      expect(result.error).toContain('timed out');
      vi.useRealTimers();
    });
  });

  describe('checkRabbitmq', () => {
    let mockConnection: { close: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockConnection = { close: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(amqplib.connect).mockResolvedValue(
        mockConnection as unknown as amqplib.ChannelModel,
      );
    });

    it('returns up when connection succeeds', async () => {
      const result = await service.checkRabbitmq();
      expect(result).toEqual({ status: 'up' });
      expect(amqplib.connect).toHaveBeenCalledWith('amqp://localhost:5672');
    });

    it('closes connection after successful check', async () => {
      await service.checkRabbitmq();
      expect(mockConnection.close).toHaveBeenCalledTimes(1);
    });

    it('returns down with error message when connect fails', async () => {
      vi.mocked(amqplib.connect).mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await service.checkRabbitmq();
      expect(result).toEqual({ status: 'down', error: 'ECONNREFUSED' });
    });

    it('returns down with fallback message for non-Error failures', async () => {
      vi.mocked(amqplib.connect).mockRejectedValue('non-error');
      const result = await service.checkRabbitmq();
      expect(result).toEqual({ status: 'down', error: 'RabbitMQ check failed' });
    });

    it('does not throw when close fails', async () => {
      mockConnection.close.mockRejectedValue(new Error('close failed'));
      const result = await service.checkRabbitmq();
      expect(result).toEqual({ status: 'up' });
    });

    it('returns down when check times out', async () => {
      vi.useFakeTimers();
      vi.mocked(amqplib.connect).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000)),
      );
      const checkPromise = service.checkRabbitmq();
      vi.advanceTimersByTime(3001);
      const result = await checkPromise;
      expect(result.status).toBe('down');
      expect(result.error).toContain('timed out');
      vi.useRealTimers();
    });
  });

  describe('check', () => {
    it('returns ok status when all services are up', async () => {
      vi.mocked(amqplib.connect).mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as amqplib.ChannelModel);

      const result = await service.check();
      expect(result.status).toBe('ok');
      expect(result.services.database.status).toBe('up');
      expect(result.services.redis.status).toBe('up');
      expect(result.services.rabbitmq.status).toBe('up');
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns degraded when database is down', async () => {
      mockPool.query.mockRejectedValue(new Error('db error'));
      vi.mocked(amqplib.connect).mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as amqplib.ChannelModel);

      const result = await service.check();
      expect(result.status).toBe('degraded');
      expect(result.services.database.status).toBe('down');
    });

    it('returns degraded when redis is down', async () => {
      mockRedisInstance.connect.mockRejectedValue(new Error('redis error'));
      vi.mocked(amqplib.connect).mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as amqplib.ChannelModel);

      const result = await service.check();
      expect(result.status).toBe('degraded');
      expect(result.services.redis.status).toBe('down');
    });

    it('returns degraded when rabbitmq is down', async () => {
      vi.mocked(amqplib.connect).mockRejectedValue(new Error('amqp error'));

      const result = await service.check();
      expect(result.status).toBe('degraded');
      expect(result.services.rabbitmq.status).toBe('down');
    });

    it('returns degraded when all services are down', async () => {
      mockPool.query.mockRejectedValue(new Error('db error'));
      mockRedisInstance.connect.mockRejectedValue(new Error('redis error'));
      vi.mocked(amqplib.connect).mockRejectedValue(new Error('amqp error'));

      const result = await service.check();
      expect(result.status).toBe('degraded');
      expect(result.services.database).toEqual({ status: 'down', error: 'db error' });
      expect(result.services.redis).toEqual({ status: 'down', error: 'redis error' });
      expect(result.services.rabbitmq).toEqual({ status: 'down', error: 'amqp error' });
    });

    it('includes ISO 8601 timestamp', async () => {
      vi.mocked(amqplib.connect).mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as amqplib.ChannelModel);

      const result = await service.check();
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });
});
