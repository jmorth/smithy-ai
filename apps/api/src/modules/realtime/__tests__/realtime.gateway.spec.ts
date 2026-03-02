import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { WorkflowsGateway } from '../workflows.gateway';
import { RealtimeService } from '../realtime.service';
import { InteractiveGateway, INTERACTIVE_REDIS } from '../interactive.gateway';
import { JobsGateway } from '../jobs.gateway';
import { AssemblyLinesService } from '../../workflows/assembly-lines/assembly-lines.service';
import { WorkerPoolsService } from '../../workflows/worker-pools/worker-pools.service';
import { DRIZZLE } from '../../../database/database.constants';
import type { EventEnvelope } from '../../events/event.types';

// ── Test helpers ────────────────────────────────────────────────────────────

function waitForEvent<T = unknown>(
  client: ClientSocket,
  event: string,
  timeout = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for event "${event}"`)),
      timeout,
    );
    client.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function waitForConnect(client: ClientSocket, timeout = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (client.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(
      () => reject(new Error('Timeout waiting for connection')),
      timeout,
    );
    client.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function expectNoEvent(
  client: ClientSocket,
  event: string,
  duration = 300,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`Unexpected event "${event}" received`));
    client.once(event, handler);
    setTimeout(() => {
      client.off(event, handler);
      resolve();
    }, duration);
  });
}

function makeEnvelope(
  eventType: string,
  payload: Record<string, unknown>,
  correlationId = 'corr-test-001',
  timestamp = '2026-03-02T12:00:00.000Z',
): EventEnvelope<Record<string, unknown>> {
  return { eventType, timestamp, correlationId, payload };
}

// ── Mock services ───────────────────────────────────────────────────────────

function makeMockAssemblyLinesService() {
  return {
    findBySlug: vi.fn().mockResolvedValue({ id: 1, slug: 'test-pipeline' }),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  };
}

function makeMockWorkerPoolsService() {
  return {
    findBySlug: vi.fn().mockResolvedValue({ id: 1, slug: 'test-pool' }),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  };
}

function makeMockDb() {
  const limitFn = vi
    .fn()
    .mockResolvedValue([{ id: '00000000-0000-0000-0000-000000000001', status: 'STUCK' }]);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });

  const returningFn = vi.fn().mockResolvedValue([]);
  const updateWhereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  const updateFn = vi.fn().mockReturnValue({ set: updateSetFn });

  return { select: selectFn, update: updateFn };
}

function makeMockRedis() {
  return {
    exists: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  };
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('Workflow Gateway Integration Tests', () => {
  let app: INestApplication;
  let port: number;
  let workflowsGateway: WorkflowsGateway;
  let realtimeService: RealtimeService;
  const clients: ClientSocket[] = [];

  function createClient(namespace = '/workflows'): ClientSocket {
    const client = io(`http://localhost:${port}${namespace}`, {
      transports: ['websocket'],
      autoConnect: true,
    });
    clients.push(client);
    return client;
  }

  beforeAll(async () => {
    const mockAssemblyLinesService = makeMockAssemblyLinesService();
    const mockWorkerPoolsService = makeMockWorkerPoolsService();
    const mockDb = makeMockDb();
    const mockRedis = makeMockRedis();

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowsGateway,
        JobsGateway,
        InteractiveGateway,
        RealtimeService,
        {
          provide: AssemblyLinesService,
          useValue: mockAssemblyLinesService,
        },
        {
          provide: WorkerPoolsService,
          useValue: mockWorkerPoolsService,
        },
        { provide: DRIZZLE, useValue: mockDb },
        { provide: INTERACTIVE_REDIS, useValue: mockRedis },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);

    const server = app.getHttpServer();
    const address = server.address();
    port = typeof address === 'string' ? parseInt(address, 10) : address.port;

    workflowsGateway = moduleRef.get(WorkflowsGateway);
    realtimeService = moduleRef.get(RealtimeService);
  });

  afterEach(() => {
    for (const client of clients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    clients.length = 0;
  });

  afterAll(async () => {
    for (const client of clients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    clients.length = 0;
    if (app) {
      await app.close();
    }
  });

  // ── Connection tests ────────────────────────────────────────────────────

  describe('client connection', () => {
    it('connects to the /workflows namespace', async () => {
      const client = createClient();
      await waitForConnect(client);
      expect(client.connected).toBe(true);
    });
  });

  // ── Subscription tests ──────────────────────────────────────────────────

  describe('assembly line subscription', () => {
    it('subscribes to an assembly line room and receives package:status events', async () => {
      const client = createClient();
      await waitForConnect(client);

      const subResult = await new Promise<{ success: boolean; room?: string }>(
        (resolve) => {
          client.emit(
            'subscribe:assembly-line',
            'test-pipeline',
            resolve,
          );
        },
      );
      expect(subResult.success).toBe(true);
      expect(subResult.room).toBe('assembly-line:test-pipeline');

      // Broadcast a package:status event via the gateway
      const eventPromise = waitForEvent(client, 'package:status');
      workflowsGateway.broadcastPackageStatus('test-pipeline', {
        packageId: 'pkg-1',
        type: 'source-code',
        createdAt: '2026-03-02T12:00:00.000Z',
        correlationId: 'corr-1',
      });

      const received = await eventPromise;
      expect(received).toEqual({
        packageId: 'pkg-1',
        type: 'source-code',
        createdAt: '2026-03-02T12:00:00.000Z',
        correlationId: 'corr-1',
      });
    });

    it('receives job:state events broadcast to assembly line room', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:assembly-line', 'test-pipeline', resolve);
      });

      const eventPromise = waitForEvent(client, 'job:state');
      workflowsGateway.broadcastJobState('test-pipeline', null, {
        jobId: 'job-1',
        state: 'WORKING',
        stateDisplay: 'In Progress',
        correlationId: 'corr-2',
      });

      const received = await eventPromise;
      expect(received).toEqual(
        expect.objectContaining({
          jobId: 'job-1',
          state: 'WORKING',
          stateDisplay: 'In Progress',
          correlationId: 'corr-2',
        }),
      );
    });

    it('receives assembly-line:completed events', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:assembly-line', 'test-pipeline', resolve);
      });

      const eventPromise = waitForEvent(client, 'assembly-line:completed');
      workflowsGateway.broadcastAssemblyLineCompleted('test-pipeline', {
        assemblyLineId: 'al-1',
        packageId: 'pkg-final',
        totalSteps: 5,
        totalDuration: 10000,
        completedAt: '2026-03-02T12:30:00.000Z',
        correlationId: 'corr-done',
      });

      const received = await eventPromise;
      expect(received).toEqual(
        expect.objectContaining({
          assemblyLineId: 'al-1',
          completedAt: '2026-03-02T12:30:00.000Z',
          correlationId: 'corr-done',
        }),
      );
    });

    it('receives assembly-line:progress events', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:assembly-line', 'test-pipeline', resolve);
      });

      const eventPromise = waitForEvent(client, 'assembly-line:progress');
      workflowsGateway.broadcastAssemblyLineProgress('test-pipeline', {
        assemblyLineId: 'al-1',
        stepIndex: 2,
        stepName: 'build',
        packageId: 'pkg-1',
        duration: 1500,
        completedAt: '2026-03-02T12:10:00.000Z',
        correlationId: 'corr-step',
      });

      const received = await eventPromise;
      expect(received).toEqual(
        expect.objectContaining({
          stepIndex: 2,
          stepName: 'build',
          correlationId: 'corr-step',
        }),
      );
    });
  });

  // ── Worker pool subscription ────────────────────────────────────────────

  describe('worker pool subscription', () => {
    it('subscribes to a worker pool room and receives job:state events', async () => {
      const client = createClient();
      await waitForConnect(client);

      const subResult = await new Promise<{ success: boolean; room?: string }>(
        (resolve) => {
          client.emit('subscribe:worker-pool', 'test-pool', resolve);
        },
      );
      expect(subResult.success).toBe(true);
      expect(subResult.room).toBe('worker-pool:test-pool');

      const eventPromise = waitForEvent(client, 'job:state');
      workflowsGateway.broadcastJobState('other-pipeline', 'test-pool', {
        jobId: 'job-2',
        state: 'DONE',
        stateDisplay: 'Completed',
        correlationId: 'corr-pool-1',
      });

      const received = await eventPromise;
      expect(received).toEqual(
        expect.objectContaining({
          jobId: 'job-2',
          state: 'DONE',
          correlationId: 'corr-pool-1',
        }),
      );
    });
  });

  // ── Room isolation ──────────────────────────────────────────────────────

  describe('room isolation', () => {
    it('client in different room does NOT receive events from other rooms', async () => {
      const clientA = createClient();
      const clientB = createClient();
      await Promise.all([
        waitForConnect(clientA),
        waitForConnect(clientB),
      ]);

      // clientA subscribes to pipeline-a, clientB subscribes to pipeline-b
      await new Promise<unknown>((resolve) => {
        clientA.emit('subscribe:assembly-line', 'test-pipeline', resolve);
      });
      // clientB does NOT subscribe to test-pipeline

      // Broadcast to test-pipeline
      const noEventPromise = expectNoEvent(clientB, 'package:status');
      workflowsGateway.broadcastPackageStatus('test-pipeline', {
        packageId: 'pkg-isolated',
        type: 'test',
        createdAt: '2026-03-02T12:00:00.000Z',
        correlationId: 'corr-isolated',
      });

      // clientB should NOT receive the event
      await noEventPromise;
    });

    it('events sent to assembly-line room do not leak to worker-pool room', async () => {
      const poolClient = createClient();
      await waitForConnect(poolClient);

      await new Promise<unknown>((resolve) => {
        poolClient.emit('subscribe:worker-pool', 'test-pool', resolve);
      });

      const noEventPromise = expectNoEvent(poolClient, 'package:status');
      workflowsGateway.broadcastPackageStatus('test-pipeline', {
        packageId: 'pkg-leak-test',
        type: 'test',
        createdAt: '2026-03-02T12:00:00.000Z',
        correlationId: 'corr-leak',
      });

      await noEventPromise;
    });
  });

  // ── Unsubscribe ─────────────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('unsubscribe removes client from room — no more events received', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:assembly-line', 'test-pipeline', resolve);
      });

      // Unsubscribe
      const unsubResult = await new Promise<{ success: boolean }>(
        (resolve) => {
          client.emit(
            'unsubscribe:assembly-line',
            'test-pipeline',
            resolve,
          );
        },
      );
      expect(unsubResult.success).toBe(true);

      // Should NOT receive events after unsubscribe
      const noEventPromise = expectNoEvent(client, 'package:status');
      workflowsGateway.broadcastPackageStatus('test-pipeline', {
        packageId: 'pkg-after-unsub',
        type: 'test',
        createdAt: '2026-03-02T12:00:00.000Z',
        correlationId: 'corr-unsub',
      });

      await noEventPromise;
    });

    it('unsubscribe from worker pool stops receiving events', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:worker-pool', 'test-pool', resolve);
      });

      await new Promise<unknown>((resolve) => {
        client.emit('unsubscribe:worker-pool', 'test-pool', resolve);
      });

      const noEventPromise = expectNoEvent(client, 'job:state');
      workflowsGateway.broadcastJobState('any-pipeline', 'test-pool', {
        jobId: 'job-unsub',
        state: 'WORKING',
        correlationId: 'corr-unsub-pool',
      });

      await noEventPromise;
    });
  });

  // ── Bridge service integration (direct handler invocation) ──────────────

  describe('bridge service event routing', () => {
    it('job.state.changed event reaches subscribed clients via bridge', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:assembly-line', 'test-pipeline', resolve);
      });

      const eventPromise = waitForEvent(client, 'job:state');
      realtimeService.handleJobStateChanged(
        makeEnvelope('job.state.changed', {
          jobExecutionId: 'exec-100',
          workerId: 'w-1',
          workerVersionId: 'wv-1',
          previousState: 'WAITING',
          newState: 'WORKING',
          packageId: 'pkg-1',
          assemblyLineSlug: 'test-pipeline',
          workerPoolSlug: 'test-pool',
        }),
      );

      const received = await eventPromise;
      expect(received).toEqual(
        expect.objectContaining({
          jobId: 'exec-100',
          state: 'WORKING',
          stateDisplay: 'In Progress',
          previousState: 'WAITING',
          previousStateDisplay: 'Waiting',
          correlationId: 'corr-test-001',
        }),
      );
    });

    it('package.created event reaches subscribed clients via bridge', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:assembly-line', 'test-pipeline', resolve);
      });

      const eventPromise = waitForEvent(client, 'package:status');
      realtimeService.handlePackageCreated(
        makeEnvelope('package.created', {
          packageId: 'pkg-200',
          type: 'source-code',
          assemblyLineSlug: 'test-pipeline',
        }),
      );

      const received = await eventPromise;
      expect(received).toEqual(
        expect.objectContaining({
          packageId: 'pkg-200',
          type: 'source-code',
          correlationId: 'corr-test-001',
        }),
      );
    });

    it('assembly-line.completed event reaches subscribed clients via bridge', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:assembly-line', 'test-pipeline', resolve);
      });

      const eventPromise = waitForEvent(client, 'assembly-line:completed');
      realtimeService.handleAssemblyLineCompleted(
        makeEnvelope('assembly-line.completed', {
          assemblyLineId: 'al-500',
          packageId: 'pkg-final',
          totalSteps: 3,
          totalDuration: 9000,
          assemblyLineSlug: 'test-pipeline',
        }),
      );

      const received = await eventPromise;
      expect(received).toEqual(
        expect.objectContaining({
          assemblyLineId: 'al-500',
          totalSteps: 3,
          totalDuration: 9000,
          correlationId: 'corr-test-001',
        }),
      );
    });

    it('assembly-line.step.completed event reaches subscribed clients via bridge', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:assembly-line', 'test-pipeline', resolve);
      });

      const eventPromise = waitForEvent(client, 'assembly-line:progress');
      realtimeService.handleAssemblyLineStepCompleted(
        makeEnvelope('assembly-line.step.completed', {
          assemblyLineId: 'al-500',
          stepIndex: 1,
          stepName: 'lint',
          packageId: 'pkg-step',
          duration: 2500,
          assemblyLineSlug: 'test-pipeline',
        }),
      );

      const received = await eventPromise;
      expect(received).toEqual(
        expect.objectContaining({
          stepIndex: 1,
          stepName: 'lint',
          duration: 2500,
          correlationId: 'corr-test-001',
        }),
      );
    });

    it('job.state.changed routes to both assembly-line and worker-pool rooms', async () => {
      const alClient = createClient();
      const poolClient = createClient();
      await Promise.all([
        waitForConnect(alClient),
        waitForConnect(poolClient),
      ]);

      await Promise.all([
        new Promise<unknown>((resolve) => {
          alClient.emit(
            'subscribe:assembly-line',
            'test-pipeline',
            resolve,
          );
        }),
        new Promise<unknown>((resolve) => {
          poolClient.emit('subscribe:worker-pool', 'test-pool', resolve);
        }),
      ]);

      const alEvent = waitForEvent(alClient, 'job:state');
      const poolEvent = waitForEvent(poolClient, 'job:state');

      realtimeService.handleJobStateChanged(
        makeEnvelope('job.state.changed', {
          jobExecutionId: 'exec-dual',
          workerId: 'w-1',
          workerVersionId: 'wv-1',
          previousState: 'QUEUED',
          newState: 'RUNNING',
          packageId: 'pkg-1',
          assemblyLineSlug: 'test-pipeline',
          workerPoolSlug: 'test-pool',
        }),
      );

      const [alReceived, poolReceived] = await Promise.all([
        alEvent,
        poolEvent,
      ]);
      expect(alReceived).toEqual(
        expect.objectContaining({ jobId: 'exec-dual', state: 'RUNNING' }),
      );
      expect(poolReceived).toEqual(
        expect.objectContaining({ jobId: 'exec-dual', state: 'RUNNING' }),
      );
    });

    it('event payload is correctly transformed with correlation ID', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:assembly-line', 'test-pipeline', resolve);
      });

      const eventPromise = waitForEvent(client, 'job:state');
      realtimeService.handleJobStateChanged(
        makeEnvelope(
          'job.state.changed',
          {
            jobExecutionId: 'exec-corr',
            workerId: 'w-corr',
            workerVersionId: 'wv-corr',
            previousState: 'STUCK',
            newState: 'ERROR',
            packageId: 'pkg-corr',
            assemblyLineSlug: 'test-pipeline',
          },
          'trace-xyz-789',
          '2026-03-02T15:00:00.000Z',
        ),
      );

      const received = (await eventPromise) as Record<string, unknown>;
      expect(received.correlationId).toBe('trace-xyz-789');
      expect(received.updatedAt).toBe('2026-03-02T15:00:00.000Z');
      expect(received.state).toBe('ERROR');
      expect(received.stateDisplay).toBe('Error');
      expect(received.previousState).toBe('STUCK');
      expect(received.previousStateDisplay).toBe('Stuck');
    });
  });
});
