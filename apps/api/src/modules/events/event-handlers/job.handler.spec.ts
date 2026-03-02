import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Nack, RABBIT_HANDLER } from '@golevelup/nestjs-rabbitmq';
import { JobHandler } from './job.handler';
import type {
  WorkerStateChangedEvent,
  JobErrorEvent,
  JobStuckEvent,
} from '../event.types';

const mockEmit = vi.fn();
const mockEventEmitter = { emit: mockEmit };

describe('JobHandler', () => {
  let handler: JobHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new JobHandler(mockEventEmitter as any);
  });

  describe('decorator metadata', () => {
    it('is decorated with @Injectable()', () => {
      const metadata = Reflect.getMetadata('__injectable__', JobHandler);
      expect(metadata).toBe(true);
    });

    it('has @RabbitSubscribe on handleJobEvent with correct config', () => {
      const method = JobHandler.prototype.handleJobEvent;
      const metadata = Reflect.getMetadata(RABBIT_HANDLER, method) as Record<string, any>;
      expect(metadata).toBeDefined();
      expect(metadata.exchange).toBe('smithy.events');
      expect(metadata.routingKey).toBe('job.#');
      expect(metadata.queue).toBe('smithy.job.state-updates');
      expect(metadata.queueOptions.deadLetterExchange).toBe('smithy.events.dlx');
      expect(metadata.queueOptions.durable).toBe(true);
    });
  });

  describe('handleJobEvent', () => {
    it('logs received event at debug level with routing key and correlationId', async () => {
      const loggerSpy = vi.spyOn((handler as any).logger, 'debug');
      const event: WorkerStateChangedEvent = {
        eventType: 'job.state.changed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-j1',
        payload: {
          jobExecutionId: 'exec-1',
          workerId: 'w-1',
          workerVersionId: 'wv-1',
          previousState: 'idle' as any,
          newState: 'running' as any,
          packageId: 'pkg-1',
        },
      };

      await handler.handleJobEvent(event as any);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('job.state.changed'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('corr-j1'),
      );
    });

    describe('job.state.changed', () => {
      const stateChangedEvent: WorkerStateChangedEvent = {
        eventType: 'job.state.changed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-state',
        payload: {
          jobExecutionId: 'exec-1',
          workerId: 'w-1',
          workerVersionId: 'wv-1',
          previousState: 'idle' as any,
          newState: 'running' as any,
          packageId: 'pkg-1',
        },
      };

      it('emits job.state.update-db event with state details', async () => {
        await handler.handleJobEvent(stateChangedEvent as any);

        expect(mockEmit).toHaveBeenCalledWith(
          'job.state.update-db',
          expect.objectContaining({
            jobExecutionId: 'exec-1',
            previousState: 'idle',
            newState: 'running',
            correlationId: 'corr-state',
          }),
        );
      });

      it('emits socketio.broadcast event for real-time updates', async () => {
        await handler.handleJobEvent(stateChangedEvent as any);

        expect(mockEmit).toHaveBeenCalledWith(
          'socketio.broadcast',
          expect.objectContaining({
            room: 'job:exec-1',
            event: 'job.state.changed',
            data: expect.objectContaining({
              jobExecutionId: 'exec-1',
              previousState: 'idle',
              newState: 'running',
            }),
            correlationId: 'corr-state',
          }),
        );
      });

      it('emits both db update and socketio events', async () => {
        await handler.handleJobEvent(stateChangedEvent as any);

        expect(mockEmit).toHaveBeenCalledTimes(2);
        expect(mockEmit.mock.calls[0]![0]).toBe('job.state.update-db');
        expect(mockEmit.mock.calls[1]![0]).toBe('socketio.broadcast');
      });
    });

    describe('job.error', () => {
      const errorEvent: JobErrorEvent = {
        eventType: 'job.error',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-err',
        payload: {
          jobExecutionId: 'exec-2',
          packageId: 'pkg-2',
          workerVersionId: 'wv-2',
          error: { message: 'Out of memory', stack: 'Error: Out of memory\n  at worker.ts:10' },
          retryCount: 1,
          willRetry: true,
        },
      };

      it('emits notification.email with error details for Assembly Line owner', async () => {
        await handler.handleJobEvent(errorEvent as any);

        expect(mockEmit).toHaveBeenCalledWith(
          'notification.email',
          expect.objectContaining({
            type: 'job.error',
            subject: expect.stringContaining('Out of memory'),
            body: expect.objectContaining({
              jobExecutionId: 'exec-2',
              workerVersionId: 'wv-2',
              error: { message: 'Out of memory', stack: 'Error: Out of memory\n  at worker.ts:10' },
              retryCount: 1,
              willRetry: true,
              dashboardLink: '/jobs/exec-2',
            }),
            correlationId: 'corr-err',
          }),
        );
      });

      it('includes dashboard link to the job', async () => {
        await handler.handleJobEvent(errorEvent as any);

        const emittedPayload = mockEmit.mock.calls[0]![1] as Record<string, any>;
        expect(emittedPayload.body.dashboardLink).toBe('/jobs/exec-2');
      });
    });

    describe('job.stuck', () => {
      const stuckEvent: JobStuckEvent = {
        eventType: 'job.stuck',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-stuck',
        payload: {
          jobExecutionId: 'exec-3',
          packageId: 'pkg-3',
          workerVersionId: 'wv-3',
          reason: 'heartbeat timeout',
          stuckSince: '2026-01-01T00:05:00.000Z',
        },
      };

      it('emits in-app notification with stuck details', async () => {
        await handler.handleJobEvent(stuckEvent as any);

        expect(mockEmit).toHaveBeenCalledWith(
          'notification.in-app',
          expect.objectContaining({
            type: 'job.stuck',
            title: expect.stringContaining('Stuck'),
            message: expect.stringContaining('heartbeat timeout'),
            correlationId: 'corr-stuck',
            metadata: expect.objectContaining({
              jobExecutionId: 'exec-3',
              reason: 'heartbeat timeout',
              stuckSince: '2026-01-01T00:05:00.000Z',
            }),
          }),
        );
      });

      it('emits socketio.broadcast for interactive question prompt', async () => {
        await handler.handleJobEvent(stuckEvent as any);

        expect(mockEmit).toHaveBeenCalledWith(
          'socketio.broadcast',
          expect.objectContaining({
            room: 'job:exec-3',
            event: 'job.stuck',
            data: expect.objectContaining({
              jobExecutionId: 'exec-3',
              reason: 'heartbeat timeout',
              stuckSince: '2026-01-01T00:05:00.000Z',
            }),
            correlationId: 'corr-stuck',
          }),
        );
      });

      it('emits both in-app notification and socketio events', async () => {
        await handler.handleJobEvent(stuckEvent as any);

        expect(mockEmit).toHaveBeenCalledTimes(2);
        expect(mockEmit.mock.calls[0]![0]).toBe('notification.in-app');
        expect(mockEmit.mock.calls[1]![0]).toBe('socketio.broadcast');
      });
    });

    it('does not emit for unhandled job event types', async () => {
      const event = {
        eventType: 'job.started',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-unhandled',
        payload: {},
      };

      await handler.handleJobEvent(event as any);

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('returns Nack(false) on handler failure to route to DLX', async () => {
      mockEmit.mockImplementation(() => {
        throw new Error('Downstream failure');
      });

      const event: WorkerStateChangedEvent = {
        eventType: 'job.state.changed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-fail',
        payload: {
          jobExecutionId: 'exec-1',
          workerId: 'w-1',
          workerVersionId: 'wv-1',
          previousState: 'idle' as any,
          newState: 'running' as any,
          packageId: 'pkg-1',
        },
      };

      const result = await handler.handleJobEvent(event as any);

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
    });

    it('logs error with stack trace on handler failure', async () => {
      const loggerSpy = vi.spyOn((handler as any).logger, 'error');
      mockEmit.mockImplementation(() => {
        throw new Error('DB connection lost');
      });

      const event: WorkerStateChangedEvent = {
        eventType: 'job.state.changed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-log',
        payload: {
          jobExecutionId: 'exec-1',
          workerId: 'w-1',
          workerVersionId: 'wv-1',
          previousState: 'idle' as any,
          newState: 'running' as any,
          packageId: 'pkg-1',
        },
      };

      await handler.handleJobEvent(event as any);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle event'),
        expect.stringContaining('DB connection lost'),
      );
    });

    it('logs error with string representation for non-Error failures', async () => {
      const loggerSpy = vi.spyOn((handler as any).logger, 'error');
      mockEmit.mockImplementation(() => {
        throw 'string error';
      });

      const event: WorkerStateChangedEvent = {
        eventType: 'job.state.changed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-str-err',
        payload: {
          jobExecutionId: 'exec-1',
          workerId: 'w-1',
          workerVersionId: 'wv-1',
          previousState: 'idle' as any,
          newState: 'running' as any,
          packageId: 'pkg-1',
        },
      };

      await handler.handleJobEvent(event as any);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle event'),
        'string error',
      );
    });

    it('propagates correlationId to all downstream calls', async () => {
      const event: WorkerStateChangedEvent = {
        eventType: 'job.state.changed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'trace-abc',
        payload: {
          jobExecutionId: 'exec-1',
          workerId: 'w-1',
          workerVersionId: 'wv-1',
          previousState: 'idle' as any,
          newState: 'running' as any,
          packageId: 'pkg-1',
        },
      };

      await handler.handleJobEvent(event as any);

      for (const call of mockEmit.mock.calls) {
        const payload = call[1] as Record<string, unknown>;
        expect(payload.correlationId).toBe('trace-abc');
      }
    });
  });
});
