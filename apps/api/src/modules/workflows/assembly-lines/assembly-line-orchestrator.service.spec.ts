import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { AssemblyLineOrchestratorService } from './assembly-line-orchestrator.service';
import { OrchestratorEventBus } from './orchestrator-event-bus';
import { JOB_EVENTS, WORKER_QUEUE_PUBLISH } from './events/job-events';
import type { JobCompletedEvent, JobFailedEvent, JobStuckEvent } from './events/job-events';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePkg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pkg-1',
    assemblyLineId: 'line-uuid-1',
    currentStep: 1,
    status: 'IN_TRANSIT',
    type: 'doc',
    metadata: {},
    createdBy: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-uuid-1',
    slug: 'my-line',
    name: 'My Line',
    ...overrides,
  };
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: 'step-uuid-1',
    assemblyLineId: 'line-uuid-1',
    stepNumber: 1,
    workerVersionId: 'wv-1',
    configOverrides: null,
    ...overrides,
  };
}

// ─── DB mock builder ──────────────────────────────────────────────────────────

function buildMockDb() {
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };

  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockResolvedValue([]),
    innerJoin: vi.fn().mockReturnThis(),
  };

  const db: any = {
    select: vi.fn().mockReturnValue(selectChain),
    update: vi.fn().mockReturnValue(updateChain),
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db)),
    _selectChain: selectChain,
    _updateChain: updateChain,
  };

  return db;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AssemblyLineOrchestratorService', () => {
  let service: AssemblyLineOrchestratorService;
  let db: ReturnType<typeof buildMockDb>;
  let eventBus: OrchestratorEventBus;

  beforeEach(() => {
    db = buildMockDb();
    eventBus = new OrchestratorEventBus();
    service = new AssemblyLineOrchestratorService(db as any, eventBus);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  // ─── onJobCompleted ────────────────────────────────────────────────────────

  describe('onJobCompleted', () => {
    it('advances to next step when not final step', async () => {
      const pkg = makePkg({ currentStep: 1 });

      // selectChain.limit called multiple times across tx
      db._selectChain.limit
        .mockResolvedValueOnce([pkg])        // package lookup
        .mockResolvedValueOnce([makeLine()]); // line lookup inside tx

      db._selectChain.orderBy.mockResolvedValueOnce([
        makeStep({ stepNumber: 1 }),
        makeStep({ id: 'step-2', stepNumber: 2 }),
      ]);

      db._updateChain.returning.mockResolvedValueOnce([{ ...pkg, currentStep: 2 }]);

      const queuePublishSpy = vi.fn();
      eventBus.on(WORKER_QUEUE_PUBLISH, queuePublishSpy);

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).toHaveBeenCalled();
      expect(Logger.prototype.log).toHaveBeenCalled();
      expect(queuePublishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queueName: 'assembly.my-line.step.2',
          packageId: 'pkg-1',
          stepNumber: 2,
        }),
      );
    });

    it('marks package COMPLETED and emits assembly-line.completed on final step', async () => {
      const pkg = makePkg({ currentStep: 2 });

      db._selectChain.limit
        .mockResolvedValueOnce([pkg])
        .mockResolvedValueOnce([makeLine()]);

      db._selectChain.orderBy.mockResolvedValueOnce([
        makeStep({ stepNumber: 1 }),
        makeStep({ id: 'step-2', stepNumber: 2 }),
      ]);

      db._updateChain.returning.mockResolvedValueOnce([{ ...pkg, status: 'COMPLETED' }]);

      const completedEventSpy = vi.fn();
      eventBus.on('assembly-line.completed', completedEventSpy);

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 2,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).toHaveBeenCalled();
      expect(completedEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ packageId: 'pkg-1' }),
      );
    });

    it('ignores stale event when currentStep > completedStep (idempotent)', async () => {
      const pkg = makePkg({ currentStep: 3 });

      db._selectChain.limit.mockResolvedValueOnce([pkg]);

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('logs error when currentStep < completedStep (out of order)', async () => {
      const pkg = makePkg({ currentStep: 1 });

      db._selectChain.limit.mockResolvedValueOnce([pkg]);

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 3,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).not.toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('logs warning and returns when package not found', async () => {
      db._selectChain.limit.mockResolvedValueOnce([]);

      const event: JobCompletedEvent = {
        packageId: 'pkg-missing',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      await expect(service.onJobCompleted(event)).resolves.not.toThrow();
      expect(db.update).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('logs error and returns when assembly line not found inside tx', async () => {
      const pkg = makePkg({ currentStep: 1 });

      db._selectChain.limit
        .mockResolvedValueOnce([pkg])   // package found
        .mockResolvedValueOnce([]);     // line NOT found

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).not.toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  // ─── onJobFailed ───────────────────────────────────────────────────────────

  describe('onJobFailed', () => {
    it('updates package status to FAILED with error details', async () => {
      const pkg = makePkg({ currentStep: 1 });

      db._selectChain.limit.mockResolvedValueOnce([pkg]);
      db._updateChain.returning.mockResolvedValueOnce([{ ...pkg, status: 'FAILED' }]);

      const event: JobFailedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        failedStep: 1,
        jobExecutionId: 'job-1',
        errorMessage: 'container exited with code 1',
      };

      await service.onJobFailed(event);

      expect(db.update).toHaveBeenCalled();
      expect(Logger.prototype.log).toHaveBeenCalled();
    });

    it('logs warning and returns when package not found', async () => {
      db._selectChain.limit.mockResolvedValueOnce([]);

      const event: JobFailedEvent = {
        packageId: 'missing',
        assemblyLineSlug: 'my-line',
        failedStep: 1,
        jobExecutionId: 'job-1',
        errorMessage: 'oops',
      };

      await expect(service.onJobFailed(event)).resolves.not.toThrow();
      expect(db.update).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });
  });

  // ─── onJobStuck ────────────────────────────────────────────────────────────

  describe('onJobStuck', () => {
    it('updates package status and logs a warning', async () => {
      const pkg = makePkg({ currentStep: 1 });

      db._selectChain.limit.mockResolvedValueOnce([pkg]);
      db._updateChain.returning.mockResolvedValueOnce([{ ...pkg, status: 'PROCESSING' }]);

      const event: JobStuckEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        stuckStep: 1,
        jobExecutionId: 'job-1',
      };

      await service.onJobStuck(event);

      expect(db.update).toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('logs warning and returns when package not found', async () => {
      db._selectChain.limit.mockResolvedValueOnce([]);

      const event: JobStuckEvent = {
        packageId: 'missing',
        assemblyLineSlug: 'my-line',
        stuckStep: 1,
        jobExecutionId: 'job-1',
      };

      await expect(service.onJobStuck(event)).resolves.not.toThrow();
      expect(db.update).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });
  });

  // ─── Event bus wiring ─────────────────────────────────────────────────────

  describe('event bus wiring', () => {
    it('subscribes to all three job events via onModuleInit', () => {
      const onSpy = vi.spyOn(eventBus, 'on');
      service.onModuleInit();
      expect(onSpy).toHaveBeenCalledWith(JOB_EVENTS.COMPLETED, expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith(JOB_EVENTS.FAILED, expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith(JOB_EVENTS.STUCK, expect.any(Function));
    });

    it('dispatches job.completed event to onJobCompleted handler', async () => {
      // Package with stale step so no DB update needed
      const pkg = makePkg({ currentStep: 3 });
      db._selectChain.limit.mockResolvedValue([pkg]);

      service.onModuleInit();

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      eventBus.emit(JOB_EVENTS.COMPLETED, event);
      await new Promise((r) => setTimeout(r, 0));

      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('dispatches job.failed event to onJobFailed handler', async () => {
      db._selectChain.limit.mockResolvedValue([]);

      service.onModuleInit();

      const event: JobFailedEvent = {
        packageId: 'missing',
        assemblyLineSlug: 'my-line',
        failedStep: 1,
        jobExecutionId: 'job-1',
        errorMessage: 'err',
      };

      eventBus.emit(JOB_EVENTS.FAILED, event);
      await new Promise((r) => setTimeout(r, 0));

      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('dispatches job.stuck event to onJobStuck handler', async () => {
      db._selectChain.limit.mockResolvedValue([]);

      service.onModuleInit();

      const event: JobStuckEvent = {
        packageId: 'missing',
        assemblyLineSlug: 'my-line',
        stuckStep: 1,
        jobExecutionId: 'job-1',
      };

      eventBus.emit(JOB_EVENTS.STUCK, event);
      await new Promise((r) => setTimeout(r, 0));

      expect(Logger.prototype.warn).toHaveBeenCalled();
    });
  });

  // ─── getQueueName ─────────────────────────────────────────────────────────

  describe('getQueueName', () => {
    it('formats queue name as assembly.{slug}.step.{n}', () => {
      expect(service.getQueueName('my-line', 3)).toBe('assembly.my-line.step.3');
    });

    it('handles slugs with hyphens', () => {
      expect(service.getQueueName('complex-pipeline-v2', 1)).toBe('assembly.complex-pipeline-v2.step.1');
    });
  });
});
