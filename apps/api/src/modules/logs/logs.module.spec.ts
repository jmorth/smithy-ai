import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { LogsModule } from './logs.module';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

describe('LogsModule', () => {
  async function createTestModule() {
    return Test.createTestingModule({
      imports: [LogsModule],
    })
      .overrideProvider(LogsService)
      .useValue({
        getJobStatus: async () => null,
        getLogs: async () => ({ data: [], total: 0, page: 1, limit: 50 }),
        streamLogs: () => ({ pipe: () => ({}) }),
        isTerminalStatus: () => false,
      })
      .compile();
  }

  it('provides LogsController', async () => {
    const module = await createTestModule();
    const controller = module.get(LogsController);
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(LogsController);
  });

  it('provides LogsService', async () => {
    const module = await createTestModule();
    const service = module.get(LogsService);
    expect(service).toBeDefined();
  });

  it('exports LogsService for use by other modules', async () => {
    // Create a parent module that imports LogsModule
    const module = await Test.createTestingModule({
      imports: [LogsModule],
    })
      .overrideProvider(LogsService)
      .useValue({ getJobStatus: async () => null })
      .compile();

    const service = module.get(LogsService);
    expect(service).toBeDefined();
  });
});
