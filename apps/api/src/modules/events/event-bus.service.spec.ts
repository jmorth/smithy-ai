import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBusService } from './event-bus.service';
import { SMITHY_EVENTS_EXCHANGE } from './events.module';
import { EventRoutes } from './event.types';

const mockPublish = vi.fn<
  [string, string, unknown, Record<string, unknown>?],
  Promise<boolean>
>();

const mockAmqp = {
  publish: mockPublish,
};

describe('EventBusService', () => {
  let service: EventBusService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPublish.mockResolvedValue(true);
    service = new EventBusService(mockAmqp as any);
  });

  describe('publish', () => {
    it('is injectable (decorated with @Injectable)', () => {
      const metadata = Reflect.getMetadata(
        '__injectable__',
        EventBusService,
      );
      expect(metadata).toBe(true);
    });

    it('publishes to the smithy.events exchange with the given routing key', async () => {
      await service.publish(EventRoutes.PACKAGE_CREATED, {
        packageId: 'pkg-1',
        type: 'source',
        metadata: {},
      });

      expect(mockPublish).toHaveBeenCalledWith(
        SMITHY_EVENTS_EXCHANGE,
        EventRoutes.PACKAGE_CREATED,
        expect.any(Object),
        expect.objectContaining({ persistent: true }),
      );
    });

    it('wraps payload in an event envelope with eventType, timestamp, correlationId, and payload', async () => {
      const payload = {
        packageId: 'pkg-1',
        type: 'source',
        metadata: { foo: 'bar' },
        createdBy: 'user-1',
      };

      await service.publish(EventRoutes.PACKAGE_CREATED, payload);

      const envelope = mockPublish.mock.calls[0]![2] as Record<string, unknown>;
      expect(envelope).toEqual({
        eventType: EventRoutes.PACKAGE_CREATED,
        timestamp: expect.any(String),
        correlationId: expect.any(String),
        payload,
      });
    });

    it('sets eventType to the routing key', async () => {
      await service.publish(EventRoutes.JOB_STARTED, {
        jobExecutionId: 'job-1',
        packageId: 'pkg-1',
        workerVersionId: 'wv-1',
      });

      const envelope = mockPublish.mock.calls[0]![2] as Record<string, unknown>;
      expect(envelope.eventType).toBe('job.started');
    });

    it('generates timestamp in ISO 8601 format', async () => {
      await service.publish(EventRoutes.PACKAGE_CREATED, {
        packageId: 'pkg-1',
        type: 'source',
        metadata: {},
      });

      const envelope = mockPublish.mock.calls[0]![2] as Record<string, unknown>;
      const timestamp = envelope.timestamp as string;
      expect(() => new Date(timestamp)).not.toThrow();
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('generates a UUID v4 correlationId when none is provided', async () => {
      await service.publish(EventRoutes.PACKAGE_CREATED, {
        packageId: 'pkg-1',
        type: 'source',
        metadata: {},
      });

      const envelope = mockPublish.mock.calls[0]![2] as Record<string, unknown>;
      const correlationId = envelope.correlationId as string;
      const uuidV4Regex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(correlationId).toMatch(uuidV4Regex);
    });

    it('propagates provided correlationId instead of generating a new one', async () => {
      const customId = 'my-correlation-id-123';

      await service.publish(
        EventRoutes.PACKAGE_CREATED,
        {
          packageId: 'pkg-1',
          type: 'source',
          metadata: {},
        },
        customId,
      );

      const envelope = mockPublish.mock.calls[0]![2] as Record<string, unknown>;
      expect(envelope.correlationId).toBe(customId);
    });

    it('publishes with persistent: true for message durability', async () => {
      await service.publish(EventRoutes.PACKAGE_CREATED, {
        packageId: 'pkg-1',
        type: 'source',
        metadata: {},
      });

      const options = mockPublish.mock.calls[0]![3] as Record<string, unknown>;
      expect(options.persistent).toBe(true);
    });

    it('does not throw on publish failure (fire-and-forget)', async () => {
      mockPublish.mockRejectedValue(new Error('Connection lost'));

      await expect(
        service.publish(EventRoutes.PACKAGE_CREATED, {
          packageId: 'pkg-1',
          type: 'source',
          metadata: {},
        }),
      ).resolves.toBeUndefined();
    });

    it('logs an error when publish fails', async () => {
      const loggerSpy = vi.spyOn(
        (service as any).logger,
        'error',
      );
      mockPublish.mockRejectedValue(new Error('Connection lost'));

      await service.publish(EventRoutes.PACKAGE_CREATED, {
        packageId: 'pkg-1',
        type: 'source',
        metadata: {},
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to publish event'),
        expect.stringContaining('Connection lost'),
      );
    });

    it('logs an error with string representation for non-Error failures', async () => {
      const loggerSpy = vi.spyOn(
        (service as any).logger,
        'error',
      );
      mockPublish.mockRejectedValue('string error');

      await service.publish(EventRoutes.PACKAGE_CREATED, {
        packageId: 'pkg-1',
        type: 'source',
        metadata: {},
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to publish event'),
        'string error',
      );
    });

    it('logs debug message on successful publish', async () => {
      const loggerSpy = vi.spyOn(
        (service as any).logger,
        'debug',
      );

      await service.publish(EventRoutes.JOB_COMPLETED, {
        jobExecutionId: 'job-1',
        packageId: 'pkg-1',
        workerVersionId: 'wv-1',
        duration: 5000,
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Published event: job.completed'),
      );
    });

    it('supports all routing key types', async () => {
      const testCases = [
        {
          key: EventRoutes.JOB_STATE_CHANGED,
          payload: {
            jobExecutionId: 'j1',
            workerId: 'w1',
            workerVersionId: 'wv1',
            previousState: 'idle' as const,
            newState: 'running' as const,
            packageId: 'p1',
          },
        },
        {
          key: EventRoutes.JOB_STUCK,
          payload: {
            jobExecutionId: 'j1',
            packageId: 'p1',
            workerVersionId: 'wv1',
            reason: 'timeout',
            stuckSince: new Date().toISOString(),
          },
        },
        {
          key: EventRoutes.JOB_ERROR,
          payload: {
            jobExecutionId: 'j1',
            packageId: 'p1',
            workerVersionId: 'wv1',
            error: { message: 'fail' },
            retryCount: 1,
            willRetry: true,
          },
        },
        {
          key: EventRoutes.ASSEMBLY_LINE_COMPLETED,
          payload: {
            assemblyLineId: 'al1',
            packageId: 'p1',
            totalSteps: 3,
            totalDuration: 10000,
          },
        },
      ] as const;

      for (const { key, payload } of testCases) {
        mockPublish.mockClear();
        await service.publish(key, payload as any);
        expect(mockPublish).toHaveBeenCalledOnce();
        const envelope = mockPublish.mock.calls[0]![2] as Record<string, unknown>;
        expect(envelope.eventType).toBe(key);
        expect(envelope.payload).toEqual(payload);
      }
    });

    it('generates unique correlationIds for separate publishes', async () => {
      await service.publish(EventRoutes.PACKAGE_CREATED, {
        packageId: 'pkg-1',
        type: 'source',
        metadata: {},
      });
      await service.publish(EventRoutes.PACKAGE_CREATED, {
        packageId: 'pkg-2',
        type: 'source',
        metadata: {},
      });

      const id1 = (mockPublish.mock.calls[0]![2] as Record<string, unknown>)
        .correlationId;
      const id2 = (mockPublish.mock.calls[1]![2] as Record<string, unknown>)
        .correlationId;
      expect(id1).not.toBe(id2);
    });
  });
});
