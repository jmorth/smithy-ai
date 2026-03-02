import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RABBIT_HANDLER } from '@golevelup/nestjs-rabbitmq';
import { RealtimeService } from './realtime.service';
import type { EventEnvelope } from '../events/event.types';

// ── Mock gateways ───────────────────────────────────────────────────────────

function makeMockWorkflowsGateway() {
  return {
    emitToRoom: vi.fn(),
    emitToAll: vi.fn(),
    broadcastPackageStatus: vi.fn(),
    broadcastJobState: vi.fn(),
    broadcastAssemblyLineProgress: vi.fn(),
    broadcastAssemblyLineCompleted: vi.fn(),
  };
}

function makeMockInteractiveGateway() {
  return {
    emitQuestion: vi.fn(),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEnvelope(
  eventType: string,
  payload: Record<string, unknown>,
  correlationId = 'corr-test',
  timestamp = '2026-01-15T10:30:00.000Z',
): EventEnvelope<Record<string, unknown>> {
  return { eventType, timestamp, correlationId, payload };
}

describe('RealtimeService', () => {
  let service: RealtimeService;
  let workflowsGateway: ReturnType<typeof makeMockWorkflowsGateway>;
  let interactiveGateway: ReturnType<typeof makeMockInteractiveGateway>;

  beforeEach(() => {
    vi.clearAllMocks();
    workflowsGateway = makeMockWorkflowsGateway();
    interactiveGateway = makeMockInteractiveGateway();
    service = new RealtimeService(
      workflowsGateway as any,
      interactiveGateway as any,
    );
  });

  // ── Decorator metadata ──────────────────────────────────────────────────

  describe('decorator metadata', () => {
    it('is decorated with @Injectable()', () => {
      const metadata = Reflect.getMetadata('__injectable__', RealtimeService);
      expect(metadata).toBe(true);
    });

    it('has @RabbitSubscribe on handleJobStateChanged for job.state.changed', () => {
      const method = RealtimeService.prototype.handleJobStateChanged;
      const metadata = Reflect.getMetadata(RABBIT_HANDLER, method) as Record<
        string,
        any
      >;
      expect(metadata).toBeDefined();
      expect(metadata.exchange).toBe('smithy.events');
      expect(metadata.routingKey).toBe('job.state.changed');
      expect(metadata.queue).toBe('smithy.realtime.job-state');
      expect(metadata.queueOptions.durable).toBe(true);
    });

    it('has @RabbitSubscribe on handlePackageCreated for package.created', () => {
      const method = RealtimeService.prototype.handlePackageCreated;
      const metadata = Reflect.getMetadata(RABBIT_HANDLER, method) as Record<
        string,
        any
      >;
      expect(metadata).toBeDefined();
      expect(metadata.exchange).toBe('smithy.events');
      expect(metadata.routingKey).toBe('package.created');
      expect(metadata.queue).toBe('smithy.realtime.package-created');
      expect(metadata.queueOptions.durable).toBe(true);
    });

    it('has @RabbitSubscribe on handleAssemblyLineCompleted for assembly-line.completed', () => {
      const method = RealtimeService.prototype.handleAssemblyLineCompleted;
      const metadata = Reflect.getMetadata(RABBIT_HANDLER, method) as Record<
        string,
        any
      >;
      expect(metadata).toBeDefined();
      expect(metadata.exchange).toBe('smithy.events');
      expect(metadata.routingKey).toBe('assembly-line.completed');
      expect(metadata.queue).toBe('smithy.realtime.assembly-line-completed');
      expect(metadata.queueOptions.durable).toBe(true);
    });

    it('has @RabbitSubscribe on handleAssemblyLineStepCompleted for assembly-line.step.completed', () => {
      const method =
        RealtimeService.prototype.handleAssemblyLineStepCompleted;
      const metadata = Reflect.getMetadata(RABBIT_HANDLER, method) as Record<
        string,
        any
      >;
      expect(metadata).toBeDefined();
      expect(metadata.exchange).toBe('smithy.events');
      expect(metadata.routingKey).toBe('assembly-line.step.completed');
      expect(metadata.queue).toBe('smithy.realtime.assembly-line-step');
      expect(metadata.queueOptions.durable).toBe(true);
    });

    it('has @RabbitSubscribe on handleJobStuck for job.stuck', () => {
      const method = RealtimeService.prototype.handleJobStuck;
      const metadata = Reflect.getMetadata(RABBIT_HANDLER, method) as Record<
        string,
        any
      >;
      expect(metadata).toBeDefined();
      expect(metadata.exchange).toBe('smithy.events');
      expect(metadata.routingKey).toBe('job.stuck');
      expect(metadata.queue).toBe('smithy.realtime.job-stuck');
      expect(metadata.queueOptions.durable).toBe(true);
    });
  });

  // ── job.state.changed ───────────────────────────────────────────────────

  describe('handleJobStateChanged', () => {
    const basePayload = {
      jobExecutionId: 'exec-1',
      workerId: 'w-1',
      workerVersionId: 'wv-1',
      previousState: 'WAITING',
      newState: 'WORKING',
      packageId: 'pkg-1',
      assemblyLineSlug: 'my-pipeline',
      workerPoolSlug: 'pool-a',
    };

    it('emits to job:{jobId} room via workflow gateway with client-friendly payload', () => {
      const envelope = makeEnvelope('job.state.changed', basePayload);
      service.handleJobStateChanged(envelope);

      expect(workflowsGateway.emitToRoom).toHaveBeenCalledWith(
        'job:exec-1',
        'job:state',
        expect.objectContaining({
          jobId: 'exec-1',
          state: 'WORKING',
          stateDisplay: 'In Progress',
          previousState: 'WAITING',
          previousStateDisplay: 'Waiting',
          workerId: 'w-1',
          workerVersionId: 'wv-1',
          correlationId: 'corr-test',
        }),
      );
    });

    it('emits to assembly-line:{slug} room via broadcastJobState when slug is present', () => {
      const envelope = makeEnvelope('job.state.changed', basePayload);
      service.handleJobStateChanged(envelope);

      expect(workflowsGateway.broadcastJobState).toHaveBeenCalledWith(
        'my-pipeline',
        'pool-a',
        expect.objectContaining({
          jobId: 'exec-1',
          state: 'WORKING',
          correlationId: 'corr-test',
        }),
      );
    });

    it('passes null for workerPoolSlug when not present', () => {
      const envelope = makeEnvelope('job.state.changed', {
        ...basePayload,
        workerPoolSlug: undefined,
      });
      service.handleJobStateChanged(envelope);

      expect(workflowsGateway.broadcastJobState).toHaveBeenCalledWith(
        'my-pipeline',
        null,
        expect.any(Object),
      );
    });

    it('skips assembly-line room emission when assemblyLineSlug is missing', () => {
      const envelope = makeEnvelope('job.state.changed', {
        ...basePayload,
        assemblyLineSlug: undefined,
      });
      service.handleJobStateChanged(envelope);

      expect(workflowsGateway.emitToRoom).toHaveBeenCalledTimes(1);
      expect(workflowsGateway.broadcastJobState).not.toHaveBeenCalled();
    });

    it('includes ISO timestamp as updatedAt from envelope', () => {
      const envelope = makeEnvelope(
        'job.state.changed',
        basePayload,
        'corr-ts',
        '2026-03-01T12:00:00.000Z',
      );
      service.handleJobStateChanged(envelope);

      expect(workflowsGateway.emitToRoom).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          updatedAt: '2026-03-01T12:00:00.000Z',
        }),
      );
    });

    it('includes correlationId in the emitted payload', () => {
      const envelope = makeEnvelope(
        'job.state.changed',
        basePayload,
        'trace-abc-123',
      );
      service.handleJobStateChanged(envelope);

      const emittedPayload = workflowsGateway.emitToRoom.mock
        .calls[0]![2] as Record<string, unknown>;
      expect(emittedPayload.correlationId).toBe('trace-abc-123');
    });

    it('provides human-readable state display names', () => {
      const envelope = makeEnvelope('job.state.changed', {
        ...basePayload,
        previousState: 'STUCK',
        newState: 'ERROR',
      });
      service.handleJobStateChanged(envelope);

      expect(workflowsGateway.emitToRoom).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          stateDisplay: 'Error',
          previousStateDisplay: 'Stuck',
        }),
      );
    });

    it('falls back to raw state string for unknown state values', () => {
      const envelope = makeEnvelope('job.state.changed', {
        ...basePayload,
        newState: 'CUSTOM_STATE',
      });
      service.handleJobStateChanged(envelope);

      expect(workflowsGateway.emitToRoom).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          state: 'CUSTOM_STATE',
          stateDisplay: 'CUSTOM_STATE',
        }),
      );
    });

    it('logs but does not throw when gateway emission fails', () => {
      const loggerSpy = vi.spyOn((service as any).logger, 'error');
      workflowsGateway.emitToRoom.mockImplementation(() => {
        throw new Error('Socket.IO failure');
      });

      const envelope = makeEnvelope('job.state.changed', basePayload);
      expect(() => service.handleJobStateChanged(envelope)).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to bridge job.state.changed'),
        expect.stringContaining('Socket.IO failure'),
      );
    });

    it('logs error as string for non-Error exceptions', () => {
      const loggerSpy = vi.spyOn((service as any).logger, 'error');
      workflowsGateway.emitToRoom.mockImplementation(() => {
        throw 'raw string error';
      });

      const envelope = makeEnvelope('job.state.changed', basePayload);
      service.handleJobStateChanged(envelope);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to bridge job.state.changed'),
        'raw string error',
      );
    });
  });

  // ── package.created ─────────────────────────────────────────────────────

  describe('handlePackageCreated', () => {
    const basePayload = {
      packageId: 'pkg-100',
      type: 'source-code',
      metadata: { repo: 'acme/app' },
      assemblyLineSlug: 'build-pipeline',
    };

    it('emits package:status to assembly-line:{slug} room via broadcastPackageStatus', () => {
      const envelope = makeEnvelope('package.created', basePayload);
      service.handlePackageCreated(envelope);

      expect(workflowsGateway.broadcastPackageStatus).toHaveBeenCalledWith(
        'build-pipeline',
        expect.objectContaining({
          packageId: 'pkg-100',
          type: 'source-code',
          correlationId: 'corr-test',
        }),
      );
    });

    it('includes ISO timestamp as createdAt', () => {
      const envelope = makeEnvelope(
        'package.created',
        basePayload,
        'corr-1',
        '2026-02-20T08:15:00.000Z',
      );
      service.handlePackageCreated(envelope);

      expect(workflowsGateway.broadcastPackageStatus).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          createdAt: '2026-02-20T08:15:00.000Z',
        }),
      );
    });

    it('includes correlationId in the emitted payload', () => {
      const envelope = makeEnvelope(
        'package.created',
        basePayload,
        'trace-pkg-1',
      );
      service.handlePackageCreated(envelope);

      const emittedPayload = workflowsGateway.broadcastPackageStatus.mock
        .calls[0]![1] as Record<string, unknown>;
      expect(emittedPayload.correlationId).toBe('trace-pkg-1');
    });

    it('skips emission and warns when assemblyLineSlug is missing', () => {
      const loggerSpy = vi.spyOn((service as any).logger, 'warn');
      const envelope = makeEnvelope('package.created', {
        ...basePayload,
        assemblyLineSlug: undefined,
      });
      service.handlePackageCreated(envelope);

      expect(workflowsGateway.broadcastPackageStatus).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing assemblyLineSlug'),
      );
    });

    it('logs but does not throw when gateway emission fails', () => {
      const loggerSpy = vi.spyOn((service as any).logger, 'error');
      workflowsGateway.broadcastPackageStatus.mockImplementation(() => {
        throw new Error('broadcast failure');
      });

      const envelope = makeEnvelope('package.created', basePayload);
      expect(() => service.handlePackageCreated(envelope)).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to bridge package.created'),
        expect.stringContaining('broadcast failure'),
      );
    });
  });

  // ── assembly-line.completed ─────────────────────────────────────────────

  describe('handleAssemblyLineCompleted', () => {
    const basePayload = {
      assemblyLineId: 'al-1',
      packageId: 'pkg-final',
      totalSteps: 5,
      totalDuration: 12500,
      assemblyLineSlug: 'deploy-pipeline',
    };

    it('emits assembly-line:completed to assembly-line:{slug} room', () => {
      const envelope = makeEnvelope(
        'assembly-line.completed',
        basePayload,
      );
      service.handleAssemblyLineCompleted(envelope);

      expect(
        workflowsGateway.broadcastAssemblyLineCompleted,
      ).toHaveBeenCalledWith(
        'deploy-pipeline',
        expect.objectContaining({
          assemblyLineId: 'al-1',
          packageId: 'pkg-final',
          totalSteps: 5,
          totalDuration: 12500,
          correlationId: 'corr-test',
        }),
      );
    });

    it('includes ISO timestamp as completedAt', () => {
      const envelope = makeEnvelope(
        'assembly-line.completed',
        basePayload,
        'corr-1',
        '2026-01-10T18:00:00.000Z',
      );
      service.handleAssemblyLineCompleted(envelope);

      expect(
        workflowsGateway.broadcastAssemblyLineCompleted,
      ).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          completedAt: '2026-01-10T18:00:00.000Z',
        }),
      );
    });

    it('includes correlationId in emitted payload', () => {
      const envelope = makeEnvelope(
        'assembly-line.completed',
        basePayload,
        'trace-al-done',
      );
      service.handleAssemblyLineCompleted(envelope);

      const emittedPayload =
        workflowsGateway.broadcastAssemblyLineCompleted.mock.calls[0]![1] as Record<
          string,
          unknown
        >;
      expect(emittedPayload.correlationId).toBe('trace-al-done');
    });

    it('skips emission and warns when assemblyLineSlug is missing', () => {
      const loggerSpy = vi.spyOn((service as any).logger, 'warn');
      const envelope = makeEnvelope('assembly-line.completed', {
        ...basePayload,
        assemblyLineSlug: undefined,
      });
      service.handleAssemblyLineCompleted(envelope);

      expect(
        workflowsGateway.broadcastAssemblyLineCompleted,
      ).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing assemblyLineSlug'),
      );
    });

    it('logs but does not throw when gateway emission fails', () => {
      const loggerSpy = vi.spyOn((service as any).logger, 'error');
      workflowsGateway.broadcastAssemblyLineCompleted.mockImplementation(
        () => {
          throw new Error('emit error');
        },
      );

      const envelope = makeEnvelope(
        'assembly-line.completed',
        basePayload,
      );
      expect(() =>
        service.handleAssemblyLineCompleted(envelope),
      ).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to bridge assembly-line.completed'),
        expect.stringContaining('emit error'),
      );
    });
  });

  // ── assembly-line.step.completed ────────────────────────────────────────

  describe('handleAssemblyLineStepCompleted', () => {
    const basePayload = {
      assemblyLineId: 'al-2',
      stepIndex: 2,
      stepName: 'lint',
      packageId: 'pkg-step',
      duration: 3200,
      assemblyLineSlug: 'ci-pipeline',
    };

    it('emits assembly-line:progress to assembly-line:{slug} room', () => {
      const envelope = makeEnvelope(
        'assembly-line.step.completed',
        basePayload,
      );
      service.handleAssemblyLineStepCompleted(envelope);

      expect(
        workflowsGateway.broadcastAssemblyLineProgress,
      ).toHaveBeenCalledWith(
        'ci-pipeline',
        expect.objectContaining({
          assemblyLineId: 'al-2',
          stepIndex: 2,
          stepName: 'lint',
          packageId: 'pkg-step',
          duration: 3200,
          correlationId: 'corr-test',
        }),
      );
    });

    it('includes ISO timestamp as completedAt', () => {
      const envelope = makeEnvelope(
        'assembly-line.step.completed',
        basePayload,
        'corr-step',
        '2026-02-28T14:30:00.000Z',
      );
      service.handleAssemblyLineStepCompleted(envelope);

      expect(
        workflowsGateway.broadcastAssemblyLineProgress,
      ).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          completedAt: '2026-02-28T14:30:00.000Z',
        }),
      );
    });

    it('includes correlationId in emitted payload', () => {
      const envelope = makeEnvelope(
        'assembly-line.step.completed',
        basePayload,
        'trace-step-2',
      );
      service.handleAssemblyLineStepCompleted(envelope);

      const emittedPayload =
        workflowsGateway.broadcastAssemblyLineProgress.mock.calls[0]![1] as Record<
          string,
          unknown
        >;
      expect(emittedPayload.correlationId).toBe('trace-step-2');
    });

    it('skips emission and warns when assemblyLineSlug is missing', () => {
      const loggerSpy = vi.spyOn((service as any).logger, 'warn');
      const envelope = makeEnvelope('assembly-line.step.completed', {
        ...basePayload,
        assemblyLineSlug: undefined,
      });
      service.handleAssemblyLineStepCompleted(envelope);

      expect(
        workflowsGateway.broadcastAssemblyLineProgress,
      ).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing assemblyLineSlug'),
      );
    });

    it('logs but does not throw when gateway emission fails', () => {
      const loggerSpy = vi.spyOn((service as any).logger, 'error');
      workflowsGateway.broadcastAssemblyLineProgress.mockImplementation(
        () => {
          throw new Error('step emit error');
        },
      );

      const envelope = makeEnvelope(
        'assembly-line.step.completed',
        basePayload,
      );
      expect(() =>
        service.handleAssemblyLineStepCompleted(envelope),
      ).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to bridge assembly-line.step.completed',
        ),
        expect.stringContaining('step emit error'),
      );
    });
  });

  // ── job.stuck ───────────────────────────────────────────────────────────

  describe('handleJobStuck', () => {
    const basePayload = {
      jobExecutionId: 'exec-stuck-1',
      packageId: 'pkg-stuck',
      workerVersionId: 'wv-stuck',
      reason: 'Needs human review',
      stuckSince: '2026-01-15T10:00:00.000Z',
    };

    it('emits interactive:question to job:{jobId} room via interactive gateway', () => {
      const envelope = makeEnvelope(
        'job.stuck',
        basePayload,
        'corr-stuck-1',
        '2026-01-15T10:30:00.000Z',
      );
      service.handleJobStuck(envelope);

      expect(interactiveGateway.emitQuestion).toHaveBeenCalledWith({
        jobId: 'exec-stuck-1',
        questionId: 'corr-stuck-1',
        question: 'Needs human review',
        askedAt: '2026-01-15T10:30:00.000Z',
      });
    });

    it('uses correlationId as the questionId', () => {
      const envelope = makeEnvelope(
        'job.stuck',
        basePayload,
        'unique-correlation-id',
      );
      service.handleJobStuck(envelope);

      const emittedQuestion = interactiveGateway.emitQuestion.mock
        .calls[0]![0] as Record<string, unknown>;
      expect(emittedQuestion.questionId).toBe('unique-correlation-id');
    });

    it('uses event timestamp as askedAt', () => {
      const envelope = makeEnvelope(
        'job.stuck',
        basePayload,
        'corr-1',
        '2026-03-01T09:00:00.000Z',
      );
      service.handleJobStuck(envelope);

      const emittedQuestion = interactiveGateway.emitQuestion.mock
        .calls[0]![0] as Record<string, unknown>;
      expect(emittedQuestion.askedAt).toBe('2026-03-01T09:00:00.000Z');
    });

    it('provides default question text when reason is missing', () => {
      const envelope = makeEnvelope('job.stuck', {
        ...basePayload,
        reason: undefined,
      });
      service.handleJobStuck(envelope);

      const emittedQuestion = interactiveGateway.emitQuestion.mock
        .calls[0]![0] as Record<string, unknown>;
      expect(emittedQuestion.question).toBe(
        'Job is stuck and needs input',
      );
    });

    it('logs but does not throw when interactive gateway fails', () => {
      const loggerSpy = vi.spyOn((service as any).logger, 'error');
      interactiveGateway.emitQuestion.mockImplementation(() => {
        throw new Error('interactive failure');
      });

      const envelope = makeEnvelope('job.stuck', basePayload);
      expect(() => service.handleJobStuck(envelope)).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to bridge job.stuck'),
        expect.stringContaining('interactive failure'),
      );
    });

    it('logs error as string for non-Error exceptions', () => {
      const loggerSpy = vi.spyOn((service as any).logger, 'error');
      interactiveGateway.emitQuestion.mockImplementation(() => {
        throw 'raw gateway error';
      });

      const envelope = makeEnvelope('job.stuck', basePayload);
      service.handleJobStuck(envelope);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to bridge job.stuck'),
        'raw gateway error',
      );
    });
  });

  // ── Cross-cutting concerns ──────────────────────────────────────────────

  describe('fire-and-forget error handling', () => {
    it('does not propagate exceptions from any handler', () => {
      workflowsGateway.emitToRoom.mockImplementation(() => {
        throw new Error('emitToRoom crash');
      });
      workflowsGateway.broadcastPackageStatus.mockImplementation(() => {
        throw new Error('broadcast crash');
      });
      workflowsGateway.broadcastAssemblyLineCompleted.mockImplementation(
        () => {
          throw new Error('completed crash');
        },
      );
      workflowsGateway.broadcastAssemblyLineProgress.mockImplementation(
        () => {
          throw new Error('progress crash');
        },
      );
      interactiveGateway.emitQuestion.mockImplementation(() => {
        throw new Error('question crash');
      });

      expect(() =>
        service.handleJobStateChanged(
          makeEnvelope('job.state.changed', {
            jobExecutionId: 'x',
            newState: 'WORKING',
            previousState: 'WAITING',
            workerId: 'w',
            workerVersionId: 'wv',
            packageId: 'p',
          }),
        ),
      ).not.toThrow();

      expect(() =>
        service.handlePackageCreated(
          makeEnvelope('package.created', {
            packageId: 'p',
            type: 't',
            assemblyLineSlug: 's',
          }),
        ),
      ).not.toThrow();

      expect(() =>
        service.handleAssemblyLineCompleted(
          makeEnvelope('assembly-line.completed', {
            assemblyLineId: 'a',
            packageId: 'p',
            totalSteps: 1,
            totalDuration: 100,
            assemblyLineSlug: 's',
          }),
        ),
      ).not.toThrow();

      expect(() =>
        service.handleAssemblyLineStepCompleted(
          makeEnvelope('assembly-line.step.completed', {
            assemblyLineId: 'a',
            stepIndex: 0,
            stepName: 'x',
            packageId: 'p',
            duration: 50,
            assemblyLineSlug: 's',
          }),
        ),
      ).not.toThrow();

      expect(() =>
        service.handleJobStuck(
          makeEnvelope('job.stuck', {
            jobExecutionId: 'j',
            reason: 'stuck',
          }),
        ),
      ).not.toThrow();
    });
  });

  describe('correlationId propagation', () => {
    it('propagates correlationId through all handlers', () => {
      const corrId = 'trace-correlation-xyz';

      service.handleJobStateChanged(
        makeEnvelope('job.state.changed', {
          jobExecutionId: 'j1',
          newState: 'DONE',
          previousState: 'WORKING',
          workerId: 'w',
          workerVersionId: 'wv',
          packageId: 'p',
          assemblyLineSlug: 'slug',
        }, corrId),
      );

      const jobPayload = workflowsGateway.emitToRoom.mock
        .calls[0]![2] as Record<string, unknown>;
      expect(jobPayload.correlationId).toBe(corrId);

      const broadcastPayload = workflowsGateway.broadcastJobState.mock
        .calls[0]![2] as Record<string, unknown>;
      expect(broadcastPayload.correlationId).toBe(corrId);
    });
  });
});
