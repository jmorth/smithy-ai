import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { AssemblyLineOrchestratorService } from './assembly-line-orchestrator.service';
import { OrchestratorEventBus } from './orchestrator-event-bus';
import { JOB_EVENTS, ASSEMBLY_LINE_EVENTS, WORKER_QUEUE_PUBLISH } from './events/job-events';
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
    it('advances to next step and emits worker.queue.publish event', async () => {
      const pkg = makePkg({ currentStep: 1 });

      db._selectChain.limit
        .mockResolvedValueOnce([pkg])
        .mockResolvedValueOnce([makeLine()]);

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
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('advanced to step 2'),
      );
      expect(queuePublishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queueName: 'assembly.my-line.step.2',
          packageId: 'pkg-1',
          stepNumber: 2,
        }),
      );
    });

    it('emits worker.queue.publish AFTER the transaction commits', async () => {
      const pkg = makePkg({ currentStep: 1 });

      db._selectChain.limit
        .mockResolvedValueOnce([pkg])
        .mockResolvedValueOnce([makeLine()]);

      db._selectChain.orderBy.mockResolvedValueOnce([
        makeStep({ stepNumber: 1 }),
        makeStep({ id: 'step-2', stepNumber: 2 }),
      ]);

      const callOrder: string[] = [];

      db.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        const result = await fn(db);
        callOrder.push('transaction-committed');
        return result;
      });

      eventBus.on(WORKER_QUEUE_PUBLISH, () => callOrder.push('event-emitted'));

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(callOrder).toEqual(['transaction-committed', 'event-emitted']);
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
      eventBus.on(ASSEMBLY_LINE_EVENTS.COMPLETED, completedEventSpy);

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 2,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).toHaveBeenCalled();
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('COMPLETED'),
      );
      expect(completedEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ packageId: 'pkg-1', assemblyLineSlug: 'my-line' }),
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
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('stale event'),
      );
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
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('out-of-order'),
      );
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
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
      );
    });

    it('treats null currentStep as 0 (out-of-order when completedStep > 0)', async () => {
      const pkg = makePkg({ currentStep: null });

      db._selectChain.limit.mockResolvedValueOnce([pkg]);

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 2,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).not.toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('out-of-order'),
      );
    });

    it('logs error when package has no assemblyLineId', async () => {
      const pkg = makePkg({ assemblyLineId: null, currentStep: 1 });

      db._selectChain.limit.mockResolvedValueOnce([pkg]);

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).not.toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('no assembly line'),
      );
    });

    it('logs error and returns when assembly line not found inside tx', async () => {
      const pkg = makePkg({ currentStep: 1 });

      db._selectChain.limit
        .mockResolvedValueOnce([pkg])
        .mockResolvedValueOnce([]);

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
    it('updates package status to FAILED with error details logged', async () => {
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

      expect(db.transaction).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('FAILED'),
      );
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
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
      );
    });
  });

  // ─── onJobStuck ────────────────────────────────────────────────────────────

  describe('onJobStuck', () => {
    it('marks package FAILED and logs a warning for manual intervention', async () => {
      const pkg = makePkg({ currentStep: 1 });

      db._selectChain.limit.mockResolvedValueOnce([pkg]);
      db._updateChain.returning.mockResolvedValueOnce([{ ...pkg, status: 'FAILED' }]);

      const event: JobStuckEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        stuckStep: 1,
        jobExecutionId: 'job-1',
      };

      await service.onJobStuck(event);

      expect(db.transaction).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('STUCK'),
      );
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
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
      );
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

    it('logs error when onJobCompleted throws an unhandled error', async () => {
      vi.spyOn(service, 'onJobCompleted').mockRejectedValueOnce(new Error('unexpected failure'));

      service.onModuleInit();

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      eventBus.emit(JOB_EVENTS.COMPLETED, event);
      await new Promise((r) => setTimeout(r, 0));

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        'Unhandled error in onJobCompleted',
        expect.any(Error),
      );
    });

    it('logs error when onJobFailed throws an unhandled error', async () => {
      vi.spyOn(service, 'onJobFailed').mockRejectedValueOnce(new Error('db exploded'));

      service.onModuleInit();

      const event: JobFailedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        failedStep: 1,
        jobExecutionId: 'job-1',
        errorMessage: 'err',
      };

      eventBus.emit(JOB_EVENTS.FAILED, event);
      await new Promise((r) => setTimeout(r, 0));

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        'Unhandled error in onJobFailed',
        expect.any(Error),
      );
    });

    it('logs error when onJobStuck throws an unhandled error', async () => {
      vi.spyOn(service, 'onJobStuck').mockRejectedValueOnce(new Error('network error'));

      service.onModuleInit();

      const event: JobStuckEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        stuckStep: 1,
        jobExecutionId: 'job-1',
      };

      eventBus.emit(JOB_EVENTS.STUCK, event);
      await new Promise((r) => setTimeout(r, 0));

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        'Unhandled error in onJobStuck',
        expect.any(Error),
      );
    });
  });
});
