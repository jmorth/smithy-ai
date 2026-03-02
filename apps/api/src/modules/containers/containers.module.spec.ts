import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ _tag: 'DrizzleClient' })),
}));

vi.mock('../../database/schema', () => ({}));

vi.mock('ioredis', () => {
  const MockRedis = vi.fn();
  MockRedis.prototype.connect = vi.fn();
  MockRedis.prototype.disconnect = vi.fn();
  MockRedis.prototype.quit = vi.fn();
  return { default: MockRedis };
});

import { ContainersModule } from './containers.module';
import { ContainerBuilderService } from './container-builder.service';
import { ContainerManagerService } from './container-manager.service';
import { ConcurrencyLimiterService } from './concurrency-limiter.service';
import { ContainerLogStreamerService } from './container-log-streamer';
import { DatabaseModule } from '../../database/database.module';

describe('ContainersModule', () => {
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
              containers: { concurrencyLimit: 5 },
            }),
          ],
        }),
        DatabaseModule,
        ContainersModule,
      ],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should compile without circular dependency errors', () => {
    expect(module).toBeDefined();
  });

  it('should provide ContainerBuilderService', () => {
    const service = module.get<ContainerBuilderService>(ContainerBuilderService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ContainerBuilderService);
  });

  it('should provide ContainerManagerService', () => {
    const service = module.get<ContainerManagerService>(ContainerManagerService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ContainerManagerService);
  });

  it('should provide ConcurrencyLimiterService', () => {
    const service = module.get<ConcurrencyLimiterService>(ConcurrencyLimiterService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ConcurrencyLimiterService);
  });

  it('should provide ContainerLogStreamerService', () => {
    const service = module.get<ContainerLogStreamerService>(ContainerLogStreamerService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ContainerLogStreamerService);
  });

  it('should export all container services for use by other modules', () => {
    const builder = module.get<ContainerBuilderService>(ContainerBuilderService);
    const manager = module.get<ContainerManagerService>(ContainerManagerService);
    const limiter = module.get<ConcurrencyLimiterService>(ConcurrencyLimiterService);
    const streamer = module.get<ContainerLogStreamerService>(ContainerLogStreamerService);

    expect(builder).toBeDefined();
    expect(manager).toBeDefined();
    expect(limiter).toBeDefined();
    expect(streamer).toBeDefined();
  });
});
