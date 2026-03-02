import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ _tag: 'DrizzleClient' })),
}));

vi.mock('../database/schema', () => ({}));

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

import { HealthModule } from './health.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { DatabaseModule } from '../database/database.module';

describe('HealthModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              database: { url: 'postgresql://user:pass@localhost:5432/test' },
              redis: { url: 'redis://localhost:6379' },
              rabbitmq: { url: 'amqp://localhost:5672' },
            }),
          ],
        }),
        DatabaseModule,
        HealthModule,
      ],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should provide HealthController', () => {
    const controller = module.get<HealthController>(HealthController);
    expect(controller).toBeDefined();
  });

  it('should provide HealthService', () => {
    const service = module.get<HealthService>(HealthService);
    expect(service).toBeDefined();
  });
});
