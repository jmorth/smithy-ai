import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBusService } from './event-bus.service';
import { PackageHandler } from './event-handlers/package.handler';
import { JobHandler } from './event-handlers/job.handler';
import { AssemblyLineHandler } from './event-handlers/assembly-line.handler';
import { EventRoutes } from './event.types';
import type { EventEnvelope } from './event.types';

/**
 * Integration tests verifying the full publish → handler flow.
 *
 * Strategy: mock at the AMQP level (option c from the task spec).
 * When EventBusService.publish() is called, we capture the envelope it
 * would have sent to RabbitMQ, then feed that envelope directly into
 * the appropriate handler — simulating what RabbitMQ would do.
 */

const mockAmqpPublish = vi.fn<
  [string, string, unknown, Record<string, unknown>?],
  Promise<boolean>
>();
const mockAmqp = { publish: mockAmqpPublish };

const mockEmit = vi.fn();
const mockEventEmitter = { emit: mockEmit };

describe('Events Integration (AMQP-level mock)', () => {
  let bus: EventBusService;
  let packageHandler: PackageHandler;
  let jobHandler: JobHandler;
  let assemblyLineHandler: AssemblyLineHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAmqpPublish.mockResolvedValue(true);
    bus = new EventBusService(mockAmqp as any);
    packageHandler = new PackageHandler(mockEventEmitter as any);
    jobHandler = new JobHandler(mockEventEmitter as any);
    assemblyLineHandler = new AssemblyLineHandler(mockEventEmitter as any);
  });

  /** Helper: publish via the bus, capture the envelope, and route to the right handler */
  async function publishAndRoute(
    routingKey: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<EventEnvelope<Record<string, unknown>>> {
    await bus.publish(routingKey as any, payload as any, correlationId);

    // Capture the envelope that EventBusService would have sent to RabbitMQ
    expect(mockAmqpPublish).toHaveBeenCalledOnce();
    const envelope = mockAmqpPublish.mock.calls[0]![2] as EventEnvelope<
      Record<string, unknown>
    >;

    // Route envelope to the appropriate handler based on the routing key domain
    if (routingKey.startsWith('package.')) {
      await packageHandler.handlePackageEvent(envelope);
    } else if (routingKey.startsWith('job.')) {
      await jobHandler.handleJobEvent(envelope);
    } else if (routingKey.startsWith('assembly-line.')) {
      await assemblyLineHandler.handleAssemblyLineEvent(envelope);
    }

    return envelope;
  }

  describe('package.created end-to-end', () => {
    it('publishes event via bus and handler emits in-app notification', async () => {
      const payload = {
        packageId: 'pkg-int-1',
        type: 'source',
        metadata: {},
        createdBy: 'user-int-1',
      };

      const envelope = await publishAndRoute(
        EventRoutes.PACKAGE_CREATED,
        payload,
      );

      // Verify envelope structure
      expect(envelope.eventType).toBe('package.created');
      expect(envelope.correlationId).toBeDefined();
      expect(envelope.timestamp).toBeDefined();
      expect(envelope.payload).toEqual(payload);

      // Verify downstream notification was emitted
      expect(mockEmit).toHaveBeenCalledWith(
        'notification.in-app',
        expect.objectContaining({
          type: 'package.created',
          recipientId: 'user-int-1',
          correlationId: envelope.correlationId,
          metadata: expect.objectContaining({ packageId: 'pkg-int-1' }),
        }),
      );
    });
  });

  describe('package.processed end-to-end', () => {
    it('publishes event via bus and handler emits notification with result', async () => {
      const payload = {
        packageId: 'pkg-int-2',
        type: 'source',
        resultSummary: '42 files analyzed',
        processedBy: 'user-int-2',
      };

      const envelope = await publishAndRoute(
        EventRoutes.PACKAGE_PROCESSED,
        payload,
      );

      expect(mockEmit).toHaveBeenCalledWith(
        'notification.in-app',
        expect.objectContaining({
          type: 'package.processed',
          recipientId: 'user-int-2',
          correlationId: envelope.correlationId,
          metadata: expect.objectContaining({
            resultSummary: '42 files analyzed',
          }),
        }),
      );
    });
  });

  describe('job.state.changed end-to-end', () => {
    it('publishes event via bus and handler emits db-update + socketio events', async () => {
      const payload = {
        jobExecutionId: 'exec-int-1',
        workerId: 'w-int-1',
        workerVersionId: 'wv-int-1',
        previousState: 'idle',
        newState: 'running',
        packageId: 'pkg-int-3',
      };

      const envelope = await publishAndRoute(
        EventRoutes.JOB_STATE_CHANGED,
        payload,
        'custom-corr-123',
      );

      // Verify custom correlationId was propagated through the entire chain
      expect(envelope.correlationId).toBe('custom-corr-123');

      expect(mockEmit).toHaveBeenCalledWith(
        'job.state.update-db',
        expect.objectContaining({
          jobExecutionId: 'exec-int-1',
          previousState: 'idle',
          newState: 'running',
          correlationId: 'custom-corr-123',
        }),
      );

      expect(mockEmit).toHaveBeenCalledWith(
        'socketio.broadcast',
        expect.objectContaining({
          room: 'job:exec-int-1',
          event: 'job.state.changed',
          correlationId: 'custom-corr-123',
        }),
      );
    });
  });

  describe('job.error end-to-end', () => {
    it('publishes event via bus and handler emits email notification', async () => {
      const payload = {
        jobExecutionId: 'exec-int-2',
        packageId: 'pkg-int-4',
        workerVersionId: 'wv-int-2',
        error: { message: 'OOM killed', stack: 'Error: OOM killed\n  at ...' },
        retryCount: 0,
        willRetry: false,
      };

      const envelope = await publishAndRoute(EventRoutes.JOB_ERROR, payload);

      expect(mockEmit).toHaveBeenCalledWith(
        'notification.email',
        expect.objectContaining({
          type: 'job.error',
          subject: expect.stringContaining('OOM killed'),
          body: expect.objectContaining({
            jobExecutionId: 'exec-int-2',
            dashboardLink: '/jobs/exec-int-2',
          }),
          correlationId: envelope.correlationId,
        }),
      );
    });
  });

  describe('job.stuck end-to-end', () => {
    it('publishes event via bus and handler emits notification + socketio', async () => {
      const payload = {
        jobExecutionId: 'exec-int-3',
        packageId: 'pkg-int-5',
        workerVersionId: 'wv-int-3',
        reason: 'heartbeat timeout',
        stuckSince: '2026-01-01T00:10:00.000Z',
      };

      const envelope = await publishAndRoute(EventRoutes.JOB_STUCK, payload);

      expect(mockEmit).toHaveBeenCalledWith(
        'notification.in-app',
        expect.objectContaining({
          type: 'job.stuck',
          correlationId: envelope.correlationId,
        }),
      );
      expect(mockEmit).toHaveBeenCalledWith(
        'socketio.broadcast',
        expect.objectContaining({
          room: 'job:exec-int-3',
          event: 'job.stuck',
          correlationId: envelope.correlationId,
        }),
      );
    });
  });

  describe('assembly-line.completed end-to-end', () => {
    it('publishes event via bus and handler emits email + webhook', async () => {
      const payload = {
        assemblyLineId: 'al-int-1',
        packageId: 'pkg-int-6',
        totalSteps: 4,
        totalDuration: 8500,
      };

      const envelope = await publishAndRoute(
        EventRoutes.ASSEMBLY_LINE_COMPLETED,
        payload,
      );

      expect(mockEmit).toHaveBeenCalledWith(
        'notification.email',
        expect.objectContaining({
          type: 'assembly-line.completed',
          subject: expect.stringContaining('al-int-1'),
          body: expect.objectContaining({
            durationFormatted: '8.5s',
          }),
          correlationId: envelope.correlationId,
        }),
      );
      expect(mockEmit).toHaveBeenCalledWith(
        'webhook.outgoing',
        expect.objectContaining({
          type: 'assembly-line.completed',
          correlationId: envelope.correlationId,
        }),
      );
    });
  });

  describe('assembly-line.step.completed end-to-end', () => {
    it('publishes event via bus and handler emits in-app notification', async () => {
      const payload = {
        assemblyLineId: 'al-int-2',
        stepIndex: 1,
        stepName: 'build',
        packageId: 'pkg-int-7',
        duration: 2500,
      };

      const envelope = await publishAndRoute(
        EventRoutes.ASSEMBLY_LINE_STEP_COMPLETED,
        payload,
      );

      expect(mockEmit).toHaveBeenCalledWith(
        'notification.in-app',
        expect.objectContaining({
          type: 'assembly-line.step.completed',
          message: expect.stringContaining('Step 2'),
          message: expect.stringContaining('build'),
          correlationId: envelope.correlationId,
        }),
      );
    });
  });

  describe('correlation ID propagation', () => {
    it('auto-generated correlationId flows from bus through handler to downstream', async () => {
      await publishAndRoute(EventRoutes.PACKAGE_CREATED, {
        packageId: 'pkg-corr',
        type: 'source',
        metadata: {},
        createdBy: 'user-corr',
      });

      const envelope = mockAmqpPublish.mock.calls[0]![2] as EventEnvelope<
        Record<string, unknown>
      >;
      const emittedPayload = mockEmit.mock.calls[0]![1] as Record<
        string,
        unknown
      >;

      expect(emittedPayload.correlationId).toBe(envelope.correlationId);
      // Verify it's a valid UUID v4
      expect(envelope.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('provided correlationId flows from bus through handler to downstream', async () => {
      await publishAndRoute(
        EventRoutes.JOB_ERROR,
        {
          jobExecutionId: 'exec-corr',
          packageId: 'pkg-corr',
          workerVersionId: 'wv-corr',
          error: { message: 'test' },
          retryCount: 0,
          willRetry: false,
        },
        'my-custom-trace-id',
      );

      const emittedPayload = mockEmit.mock.calls[0]![1] as Record<
        string,
        unknown
      >;
      expect(emittedPayload.correlationId).toBe('my-custom-trace-id');
    });
  });

  describe('envelope structure verification', () => {
    it('envelope contains all required fields with correct types', async () => {
      const before = new Date();

      await publishAndRoute(EventRoutes.PACKAGE_CREATED, {
        packageId: 'pkg-env',
        type: 'source',
        metadata: {},
        createdBy: 'user-env',
      });

      const after = new Date();
      const envelope = mockAmqpPublish.mock.calls[0]![2] as EventEnvelope<
        Record<string, unknown>
      >;

      // eventType matches routing key
      expect(envelope.eventType).toBe('package.created');

      // timestamp is ISO 8601 and recent
      const ts = new Date(envelope.timestamp);
      expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());

      // correlationId is present
      expect(typeof envelope.correlationId).toBe('string');
      expect(envelope.correlationId.length).toBeGreaterThan(0);

      // payload is preserved
      expect(envelope.payload).toEqual({
        packageId: 'pkg-env',
        type: 'source',
        metadata: {},
        createdBy: 'user-env',
      });
    });
  });
});
