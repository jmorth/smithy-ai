import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { WorkerPoolsModule } from './worker-pools.module';
import { WorkerPoolsService, POOL_ROUTER_SERVICE } from './worker-pools.service';
import { PoolRouterService, REDIS_CLIENT, RABBITMQ_CHANNEL } from './pool-router.service';
import { WorkerPoolsController } from './worker-pools.controller';
import { WorkersModule } from '../../workers/workers.module';

describe('WorkerPoolsModule', () => {
  it('is defined', () => {
    expect(WorkerPoolsModule).toBeDefined();
  });

  it('declares WorkerPoolsService as a provider', () => {
    const metadata: unknown[] = Reflect.getMetadata('providers', WorkerPoolsModule);
    expect(metadata).toContain(WorkerPoolsService);
  });

  it('exports WorkerPoolsService', () => {
    const metadata: unknown[] = Reflect.getMetadata('exports', WorkerPoolsModule);
    expect(metadata).toContain(WorkerPoolsService);
  });

  it('declares PoolRouterService as a provider', () => {
    const metadata: unknown[] = Reflect.getMetadata('providers', WorkerPoolsModule);
    expect(metadata).toContain(PoolRouterService);
  });

  it('exports PoolRouterService', () => {
    const metadata: unknown[] = Reflect.getMetadata('exports', WorkerPoolsModule);
    expect(metadata).toContain(PoolRouterService);
  });

  it('declares a REDIS_CLIENT provider', () => {
    const metadata: unknown[] = Reflect.getMetadata('providers', WorkerPoolsModule);
    const redisProvider = metadata.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        (p as Record<string, unknown>)['provide'] === REDIS_CLIENT,
    );
    expect(redisProvider).toBeDefined();
  });

  it('declares a RABBITMQ_CHANNEL provider', () => {
    const metadata: unknown[] = Reflect.getMetadata('providers', WorkerPoolsModule);
    const channelProvider = metadata.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        (p as Record<string, unknown>)['provide'] === RABBITMQ_CHANNEL,
    );
    expect(channelProvider).toBeDefined();
  });

  it('REDIS_CLIENT provider injects ConfigService', () => {
    const metadata: unknown[] = Reflect.getMetadata('providers', WorkerPoolsModule);
    const redisProvider = metadata.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        (p as Record<string, unknown>)['provide'] === REDIS_CLIENT,
    ) as { inject: unknown[] } | undefined;
    expect(redisProvider?.inject).toContain(ConfigService);
  });

  it('RABBITMQ_CHANNEL provider injects ConfigService', () => {
    const metadata: unknown[] = Reflect.getMetadata('providers', WorkerPoolsModule);
    const channelProvider = metadata.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        (p as Record<string, unknown>)['provide'] === RABBITMQ_CHANNEL,
    ) as { inject: unknown[] } | undefined;
    expect(channelProvider?.inject).toContain(ConfigService);
  });

  it('declares WorkerPoolsController as a controller', () => {
    const metadata: unknown[] = Reflect.getMetadata('controllers', WorkerPoolsModule);
    expect(metadata).toContain(WorkerPoolsController);
  });

  it('imports WorkersModule', () => {
    const metadata: unknown[] = Reflect.getMetadata('imports', WorkerPoolsModule);
    expect(metadata).toContain(WorkersModule);
  });

  it('declares a POOL_ROUTER_SERVICE provider', () => {
    const metadata: unknown[] = Reflect.getMetadata('providers', WorkerPoolsModule);
    const provider = metadata.find(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        'provide' in p &&
        (p as Record<string, unknown>)['provide'] === POOL_ROUTER_SERVICE,
    );
    expect(provider).toBeDefined();
  });
});
