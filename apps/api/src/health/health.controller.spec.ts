import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import type { HealthCheckResult } from './health.service';

const makeResponse = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: { check: ReturnType<typeof vi.fn> };

  const allUpResult: HealthCheckResult = {
    status: 'ok',
    services: {
      database: { status: 'up' },
      redis: { status: 'up' },
      rabbitmq: { status: 'up' },
    },
    timestamp: '2025-01-01T00:00:00.000Z',
  };

  const degradedResult: HealthCheckResult = {
    status: 'degraded',
    services: {
      database: { status: 'down', error: 'connection refused' },
      redis: { status: 'up' },
      rabbitmq: { status: 'up' },
    },
    timestamp: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    healthService = { check: vi.fn().mockResolvedValue(allUpResult) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('responds with 200 and ok body when all services are up', async () => {
    const res = makeResponse();
    await controller.check(res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(allUpResult);
  });

  it('responds with 503 and degraded body when a service is down', async () => {
    healthService.check.mockResolvedValue(degradedResult);
    const res = makeResponse();
    await controller.check(res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(degradedResult);
  });

  it('calls HealthService.check exactly once per request', async () => {
    const res = makeResponse();
    await controller.check(res as unknown as Response);
    expect(healthService.check).toHaveBeenCalledTimes(1);
  });

  it('includes error fields in degraded response', async () => {
    healthService.check.mockResolvedValue(degradedResult);
    const res = makeResponse();
    await controller.check(res as unknown as Response);
    const payload = vi.mocked(res.json).mock.calls[0][0] as HealthCheckResult;
    expect(payload.services.database.error).toBe('connection refused');
  });

  it('includes ISO 8601 timestamp in response', async () => {
    const res = makeResponse();
    await controller.check(res as unknown as Response);
    const payload = vi.mocked(res.json).mock.calls[0][0] as HealthCheckResult;
    expect(payload.timestamp).toBe('2025-01-01T00:00:00.000Z');
  });
});
