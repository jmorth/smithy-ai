import { describe, it, expect } from 'vitest';

describe('Workers DTO barrel export', () => {
  it('exports CreateWorkerDto', async () => {
    const mod = await import('./index');
    expect(mod.CreateWorkerDto).toBeDefined();
  });

  it('exports UpdateWorkerDto', async () => {
    const mod = await import('./index');
    expect(mod.UpdateWorkerDto).toBeDefined();
  });

  it('exports CreateWorkerVersionDto', async () => {
    const mod = await import('./index');
    expect(mod.CreateWorkerVersionDto).toBeDefined();
  });

  it('exports WorkerQueryDto', async () => {
    const mod = await import('./index');
    expect(mod.WorkerQueryDto).toBeDefined();
  });
});
