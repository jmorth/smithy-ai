import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Nack, RABBIT_HANDLER } from '@golevelup/nestjs-rabbitmq';
import { PackageHandler } from './package.handler';
import type {
  PackageCreatedEvent,
  PackageProcessedEvent,
} from '../event.types';

const mockEmit = vi.fn();
const mockEventEmitter = { emit: mockEmit };

describe('PackageHandler', () => {
  let handler: PackageHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new PackageHandler(mockEventEmitter as any);
  });

  describe('decorator metadata', () => {
    it('is decorated with @Injectable()', () => {
      const metadata = Reflect.getMetadata('__injectable__', PackageHandler);
      expect(metadata).toBe(true);
    });

    it('has @RabbitSubscribe on handlePackageEvent with correct config', () => {
      const method = PackageHandler.prototype.handlePackageEvent;
      const metadata = Reflect.getMetadata(RABBIT_HANDLER, method) as Record<string, any>;
      expect(metadata).toBeDefined();
      expect(metadata.exchange).toBe('smithy.events');
      expect(metadata.routingKey).toBe('package.*');
      expect(metadata.queue).toBe('smithy.package.notifications');
      expect(metadata.queueOptions.deadLetterExchange).toBe('smithy.events.dlx');
      expect(metadata.queueOptions.durable).toBe(true);
    });
  });

  describe('handlePackageEvent', () => {
    it('logs received event at debug level with routing key and correlationId', async () => {
      const loggerSpy = vi.spyOn((handler as any).logger, 'debug');
      const event: PackageCreatedEvent = {
        eventType: 'package.created',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-1',
        payload: {
          packageId: 'pkg-1',
          type: 'source',
          metadata: {},
          createdBy: 'user-1',
        },
      };

      await handler.handlePackageEvent(event as any);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('package.created'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('corr-1'),
      );
    });

    it('handles package.created by emitting in-app notification for the owner', async () => {
      const event: PackageCreatedEvent = {
        eventType: 'package.created',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-1',
        payload: {
          packageId: 'pkg-1',
          type: 'source',
          metadata: {},
          createdBy: 'user-1',
        },
      };

      await handler.handlePackageEvent(event as any);

      expect(mockEmit).toHaveBeenCalledWith(
        'notification.in-app',
        expect.objectContaining({
          type: 'package.created',
          recipientId: 'user-1',
          correlationId: 'corr-1',
          metadata: expect.objectContaining({ packageId: 'pkg-1' }),
        }),
      );
    });

    it('handles package.processed by emitting in-app notification with result summary', async () => {
      const event: PackageProcessedEvent = {
        eventType: 'package.processed',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-2',
        payload: {
          packageId: 'pkg-2',
          type: 'source',
          resultSummary: '10 items processed',
          processedBy: 'user-2',
        },
      };

      await handler.handlePackageEvent(event as any);

      expect(mockEmit).toHaveBeenCalledWith(
        'notification.in-app',
        expect.objectContaining({
          type: 'package.processed',
          recipientId: 'user-2',
          correlationId: 'corr-2',
          metadata: expect.objectContaining({
            packageId: 'pkg-2',
            resultSummary: '10 items processed',
          }),
        }),
      );
    });

    it('does not emit for unhandled package event types', async () => {
      const event = {
        eventType: 'package.unknown',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-3',
        payload: {},
      };

      await handler.handlePackageEvent(event as any);

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('returns Nack(false) on handler failure to route to DLX', async () => {
      mockEmit.mockImplementation(() => {
        throw new Error('Downstream failure');
      });

      const event: PackageCreatedEvent = {
        eventType: 'package.created',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-err',
        payload: {
          packageId: 'pkg-1',
          type: 'source',
          metadata: {},
          createdBy: 'user-1',
        },
      };

      const result = await handler.handlePackageEvent(event as any);

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
    });

    it('logs error with stack trace on handler failure', async () => {
      const loggerSpy = vi.spyOn((handler as any).logger, 'error');
      mockEmit.mockImplementation(() => {
        throw new Error('Downstream failure');
      });

      const event: PackageCreatedEvent = {
        eventType: 'package.created',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-err',
        payload: {
          packageId: 'pkg-1',
          type: 'source',
          metadata: {},
          createdBy: 'user-1',
        },
      };

      await handler.handlePackageEvent(event as any);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle event'),
        expect.stringContaining('Downstream failure'),
      );
    });

    it('logs error with string representation for non-Error failures', async () => {
      const loggerSpy = vi.spyOn((handler as any).logger, 'error');
      mockEmit.mockImplementation(() => {
        throw 'string error';
      });

      const event: PackageCreatedEvent = {
        eventType: 'package.created',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-err2',
        payload: {
          packageId: 'pkg-1',
          type: 'source',
          metadata: {},
          createdBy: 'user-1',
        },
      };

      await handler.handlePackageEvent(event as any);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle event'),
        'string error',
      );
    });

    it('propagates correlationId to all downstream calls', async () => {
      const event: PackageCreatedEvent = {
        eventType: 'package.created',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'my-trace-id',
        payload: {
          packageId: 'pkg-1',
          type: 'source',
          metadata: {},
          createdBy: 'user-1',
        },
      };

      await handler.handlePackageEvent(event as any);

      const emittedPayload = mockEmit.mock.calls[0]![1] as Record<string, unknown>;
      expect(emittedPayload.correlationId).toBe('my-trace-id');
    });

    it('does not crash the process on handler error', async () => {
      mockEmit.mockImplementation(() => {
        throw new Error('catastrophic failure');
      });

      const event: PackageCreatedEvent = {
        eventType: 'package.created',
        timestamp: '2026-01-01T00:00:00.000Z',
        correlationId: 'corr-safe',
        payload: {
          packageId: 'pkg-1',
          type: 'source',
          metadata: {},
          createdBy: 'user-1',
        },
      };

      // Should not throw
      await expect(
        handler.handlePackageEvent(event as any),
      ).resolves.toBeDefined();
    });
  });
});
