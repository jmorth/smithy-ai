import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Nack, RABBIT_HANDLER } from '@golevelup/nestjs-rabbitmq';
import { AssemblyLineHandler } from './assembly-line.handler';
import type {
  AssemblyLineCompletedEvent,
  AssemblyLineStepCompletedEvent,
} from '../event.types';

const mockEmit = vi.fn();
const mockEventEmitter = { emit: mockEmit };

describe('AssemblyLineHandler', () => {
  let handler: AssemblyLineHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new AssemblyLineHandler(mockEventEmitter as any);
  });

  describe('decorator metadata', () => {
    it('is decorated with @Injectable()', () => {
      const metadata = Reflect.getMetadata(
        '__injectable__',
        AssemblyLineHandler,
      );
      expect(metadata).toBe(true);
    });

    it('has @RabbitSubscribe on handleAssemblyLineEvent with correct config', () => {
      const method = AssemblyLineHandler.prototype.handleAssemblyLineEvent;
      const metadata = Reflect.getMetadata(RABBIT_HANDLER, method) as Record<string, any>;
      expect(metadata).toBeDefined();
      expect(metadata.exchange).toBe('smithy.events');
      expect(metadata.routingKey).toBe('assembly-line.*');
      expect(metadata.queue).toBe('smithy.assembly-line.notifications');
      expect(metadata.queueOptions.deadLetterExchange).toBe('smithy.events.dlx');
      expect(metadata.queueOptions.durable).toBe(true);
    });
  });

  describe('handleAssemblyLineEvent', () => {
    it('logs received event at debug level with routing key and correlationId', async () => {
      const loggerSpy = vi.spyOn((handler as any).logger, 'debug');
      const event: AssemblyLineCompletedEvent = {
        eventType: 'assembly-line.completed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-al1',
        payload: {
          assemblyLineId: 'al-1',
          packageId: 'pkg-1',
          totalSteps: 3,
          totalDuration: 15000,
        },
      };

      await handler.handleAssemblyLineEvent(event as any);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('assembly-line.completed'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('corr-al1'),
      );
    });

    describe('assembly-line.completed', () => {
      const completedEvent: AssemblyLineCompletedEvent = {
        eventType: 'assembly-line.completed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-complete',
        payload: {
          assemblyLineId: 'al-1',
          packageId: 'pkg-1',
          totalSteps: 5,
          totalDuration: 12000,
        },
      };

      it('emits notification.email with completion details and timing', async () => {
        await handler.handleAssemblyLineEvent(completedEvent as any);

        expect(mockEmit).toHaveBeenCalledWith(
          'notification.email',
          expect.objectContaining({
            type: 'assembly-line.completed',
            subject: expect.stringContaining('al-1'),
            body: expect.objectContaining({
              assemblyLineId: 'al-1',
              packageId: 'pkg-1',
              totalSteps: 5,
              totalDuration: 12000,
              durationFormatted: '12.0s',
            }),
            correlationId: 'corr-complete',
          }),
        );
      });

      it('emits webhook.outgoing with timing information', async () => {
        await handler.handleAssemblyLineEvent(completedEvent as any);

        expect(mockEmit).toHaveBeenCalledWith(
          'webhook.outgoing',
          expect.objectContaining({
            type: 'assembly-line.completed',
            payload: expect.objectContaining({
              assemblyLineId: 'al-1',
              totalDuration: 12000,
              durationFormatted: '12.0s',
            }),
            correlationId: 'corr-complete',
          }),
        );
      });

      it('emits both email notification and outgoing webhook', async () => {
        await handler.handleAssemblyLineEvent(completedEvent as any);

        expect(mockEmit).toHaveBeenCalledTimes(2);
        expect(mockEmit.mock.calls[0]![0]).toBe('notification.email');
        expect(mockEmit.mock.calls[1]![0]).toBe('webhook.outgoing');
      });

      it('formats duration correctly for sub-second durations', async () => {
        const fastEvent: AssemblyLineCompletedEvent = {
          ...completedEvent,
          payload: { ...completedEvent.payload, totalDuration: 500 },
        };

        await handler.handleAssemblyLineEvent(fastEvent as any);

        const emailPayload = mockEmit.mock.calls[0]![1] as Record<string, any>;
        expect(emailPayload.body.durationFormatted).toBe('0.5s');
      });
    });

    describe('assembly-line.step.completed', () => {
      const stepEvent: AssemblyLineStepCompletedEvent = {
        eventType: 'assembly-line.step.completed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-step',
        payload: {
          assemblyLineId: 'al-1',
          stepIndex: 2,
          stepName: 'lint',
          packageId: 'pkg-1',
          duration: 3500,
        },
      };

      it('emits in-app notification with step summary', async () => {
        await handler.handleAssemblyLineEvent(stepEvent as any);

        expect(mockEmit).toHaveBeenCalledWith(
          'notification.in-app',
          expect.objectContaining({
            type: 'assembly-line.step.completed',
            title: expect.stringContaining('Step Completed'),
            message: expect.stringContaining('lint'),
            correlationId: 'corr-step',
            metadata: expect.objectContaining({
              assemblyLineId: 'al-1',
              stepIndex: 2,
              stepName: 'lint',
              duration: 3500,
            }),
          }),
        );
      });

      it('displays 1-indexed step number in message', async () => {
        await handler.handleAssemblyLineEvent(stepEvent as any);

        const payload = mockEmit.mock.calls[0]![1] as Record<string, unknown>;
        expect(payload.message).toContain('Step 3');
      });
    });

    it('does not emit for unhandled assembly-line event types', async () => {
      const event = {
        eventType: 'assembly-line.unknown',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-unk',
        payload: {},
      };

      await handler.handleAssemblyLineEvent(event as any);

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('returns Nack(false) on handler failure to route to DLX', async () => {
      mockEmit.mockImplementation(() => {
        throw new Error('Webhook service down');
      });

      const event: AssemblyLineCompletedEvent = {
        eventType: 'assembly-line.completed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-fail',
        payload: {
          assemblyLineId: 'al-1',
          packageId: 'pkg-1',
          totalSteps: 3,
          totalDuration: 5000,
        },
      };

      const result = await handler.handleAssemblyLineEvent(event as any);

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
    });

    it('logs error with stack trace on handler failure', async () => {
      const loggerSpy = vi.spyOn((handler as any).logger, 'error');
      mockEmit.mockImplementation(() => {
        throw new Error('Email service unavailable');
      });

      const event: AssemblyLineCompletedEvent = {
        eventType: 'assembly-line.completed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-log',
        payload: {
          assemblyLineId: 'al-1',
          packageId: 'pkg-1',
          totalSteps: 3,
          totalDuration: 5000,
        },
      };

      await handler.handleAssemblyLineEvent(event as any);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle event'),
        expect.stringContaining('Email service unavailable'),
      );
    });

    it('logs error with string representation for non-Error failures', async () => {
      const loggerSpy = vi.spyOn((handler as any).logger, 'error');
      mockEmit.mockImplementation(() => {
        throw 'string error';
      });

      const event: AssemblyLineCompletedEvent = {
        eventType: 'assembly-line.completed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-str-err',
        payload: {
          assemblyLineId: 'al-1',
          packageId: 'pkg-1',
          totalSteps: 3,
          totalDuration: 5000,
        },
      };

      await handler.handleAssemblyLineEvent(event as any);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle event'),
        'string error',
      );
    });

    it('propagates correlationId to all downstream calls', async () => {
      const event: AssemblyLineCompletedEvent = {
        eventType: 'assembly-line.completed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'trace-xyz',
        payload: {
          assemblyLineId: 'al-1',
          packageId: 'pkg-1',
          totalSteps: 3,
          totalDuration: 5000,
        },
      };

      await handler.handleAssemblyLineEvent(event as any);

      for (const call of mockEmit.mock.calls) {
        const payload = call[1] as Record<string, unknown>;
        expect(payload.correlationId).toBe('trace-xyz');
      }
    });
  });
});
