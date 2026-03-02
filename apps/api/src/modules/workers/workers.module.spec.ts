import { describe, it, expect } from 'vitest';
import { WorkersModule } from './workers.module';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';
import { WorkerDiscoveryService } from './worker-discovery.service';

describe('WorkersModule', () => {
  it('is defined', () => {
    expect(WorkersModule).toBeDefined();
  });

  it('declares WorkersController', () => {
    const metadata = Reflect.getMetadata('controllers', WorkersModule);
    expect(metadata).toContain(WorkersController);
  });

  it('declares WorkersService as a provider', () => {
    const metadata = Reflect.getMetadata('providers', WorkersModule);
    expect(metadata).toContain(WorkersService);
  });

  it('declares WorkerDiscoveryService as a provider', () => {
    const metadata = Reflect.getMetadata('providers', WorkersModule);
    expect(metadata).toContain(WorkerDiscoveryService);
  });

  it('exports WorkersService', () => {
    const metadata = Reflect.getMetadata('exports', WorkersModule);
    expect(metadata).toContain(WorkersService);
  });
});
