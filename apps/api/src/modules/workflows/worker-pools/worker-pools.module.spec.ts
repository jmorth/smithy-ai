import { describe, it, expect } from 'vitest';
import { WorkerPoolsModule } from './worker-pools.module';
import { WorkerPoolsService } from './worker-pools.service';

describe('WorkerPoolsModule', () => {
  it('is defined', () => {
    expect(WorkerPoolsModule).toBeDefined();
  });

  it('declares WorkerPoolsService as a provider', () => {
    const metadata = Reflect.getMetadata('providers', WorkerPoolsModule);
    expect(metadata).toContain(WorkerPoolsService);
  });

  it('exports WorkerPoolsService', () => {
    const metadata = Reflect.getMetadata('exports', WorkerPoolsModule);
    expect(metadata).toContain(WorkerPoolsService);
  });
});
