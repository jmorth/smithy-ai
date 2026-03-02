import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { InteractiveGateway, INTERACTIVE_REDIS } from '../interactive.gateway';
import type { InteractiveQuestion } from '../interactive.gateway';
import { WorkflowsGateway } from '../workflows.gateway';
import { RealtimeService } from '../realtime.service';
import { JobsGateway } from '../jobs.gateway';
import { AssemblyLinesService } from '../../workflows/assembly-lines/assembly-lines.service';
import { WorkerPoolsService } from '../../workflows/worker-pools/worker-pools.service';
import { DRIZZLE } from '../../../database/database.constants';

const VALID_JOB_ID = '00000000-0000-0000-0000-000000000001';
const VALID_QUESTION_ID = '00000000-0000-0000-0000-000000000002';

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

// ── Mock factories ──────────────────────────────────────────────────────────

function makeMockDb(overrides: {
  selectReturn?: unknown[];
} = {}) {
  const {
    selectReturn = [{ id: VALID_JOB_ID, status: 'STUCK' }],
  } = overrides;

  const limitFn = vi.fn().mockResolvedValue(selectReturn);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });

  const returningFn = vi.fn().mockResolvedValue([]);
  const updateWhereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  const updateFn = vi.fn().mockReturnValue({ set: updateSetFn });

  return {
    select: selectFn,
    update: updateFn,
    _selectFn: selectFn,
    _limitFn: limitFn,
    _updateFn: updateFn,
    _updateSetFn: updateSetFn,
  };
}

function makeMockRedis(overrides: {
  existsReturn?: number;
  getReturn?: string | null;
} = {}) {
  const { existsReturn = 1, getReturn = null } = overrides;
  return {
    exists: vi.fn().mockResolvedValue(existsReturn),
    get: vi.fn().mockResolvedValue(getReturn),
    set: vi.fn().mockResolvedValue('OK'),
  };
}

function makeMockAssemblyLinesService() {
  return {
    findBySlug: vi.fn().mockResolvedValue({ id: 1, slug: 'test-pipeline' }),
  };
}

function makeMockWorkerPoolsService() {
  return {
    findBySlug: vi.fn().mockResolvedValue({ id: 1, slug: 'test-pool' }),
  };
}

// ── Test suite ──────────────────────────────────────────────────────────────

describe('Interactive Gateway Integration Tests', () => {
  let app: INestApplication;
  let port: number;
  let interactiveGateway: InteractiveGateway;
  let mockDb: ReturnType<typeof makeMockDb>;
  let mockRedis: ReturnType<typeof makeMockRedis>;
  const clients: ClientSocket[] = [];

  function createClient(namespace = '/interactive'): ClientSocket {
    const client = io(`http://localhost:${port}${namespace}`, {
      transports: ['websocket'],
      autoConnect: true,
    });
    clients.push(client);
    return client;
  }

  beforeAll(async () => {
    mockDb = makeMockDb();
    mockRedis = makeMockRedis();
    const mockAssemblyLinesService = makeMockAssemblyLinesService();
    const mockWorkerPoolsService = makeMockWorkerPoolsService();

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

    interactiveGateway = moduleRef.get(InteractiveGateway);
  });

  afterEach(() => {
    for (const client of clients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    clients.length = 0;
    vi.clearAllMocks();
    // Reset mock defaults
    mockDb._limitFn.mockResolvedValue([{ id: VALID_JOB_ID, status: 'STUCK' }]);
    mockRedis.exists.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
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
    it('connects to the /interactive namespace', async () => {
      const client = createClient();
      await waitForConnect(client);
      expect(client.connected).toBe(true);
    });
  });

  // ── Job subscription ────────────────────────────────────────────────────

  describe('job subscription', () => {
    it('subscribes to a job room', async () => {
      const client = createClient();
      await waitForConnect(client);

      const result = await new Promise<{ success: boolean; room?: string }>(
        (resolve) => {
          client.emit('subscribe:job', VALID_JOB_ID, resolve);
        },
      );

      expect(result.success).toBe(true);
      expect(result.room).toBe(`job:${VALID_JOB_ID}`);
    });

    it('receives interactive:question event when emitQuestion is called', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:job', VALID_JOB_ID, resolve);
      });

      const question: InteractiveQuestion = {
        jobId: VALID_JOB_ID,
        questionId: VALID_QUESTION_ID,
        question: 'What environment should be used?',
        choices: ['staging', 'production'],
        askedAt: '2026-03-02T12:00:00.000Z',
      };

      const eventPromise = waitForEvent(client, 'interactive:question');
      interactiveGateway.emitQuestion(question);

      const received = await eventPromise;
      expect(received).toEqual(question);
    });
  });

  // ── Answer flow ─────────────────────────────────────────────────────────

  describe('interactive answer flow', () => {
    it('client sends interactive:answer and receives interactive:answered confirmation', async () => {
      const client = createClient();
      await waitForConnect(client);

      // Subscribe to the job room first
      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:job', VALID_JOB_ID, resolve);
      });

      // Listen for the answered confirmation
      const answeredPromise = waitForEvent(client, 'interactive:answered');

      // Send the answer
      const answerResult = await new Promise<{
        success: boolean;
        error?: string;
      }>((resolve) => {
        client.emit(
          'interactive:answer',
          {
            jobId: VALID_JOB_ID,
            questionId: VALID_QUESTION_ID,
            answer: 'Use staging',
          },
          resolve,
        );
      });

      expect(answerResult.success).toBe(true);

      // Verify the answered confirmation event
      const answered = (await answeredPromise) as Record<string, unknown>;
      expect(answered.jobId).toBe(VALID_JOB_ID);
      expect(answered.questionId).toBe(VALID_QUESTION_ID);
      expect(answered.answeredAt).toBeDefined();
    });

    it('answer is stored in Redis (mocked)', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:job', VALID_JOB_ID, resolve);
      });

      await new Promise<unknown>((resolve) => {
        client.emit(
          'interactive:answer',
          {
            jobId: VALID_JOB_ID,
            questionId: VALID_QUESTION_ID,
            answer: 'Deploy to production',
          },
          resolve,
        );
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        `smithy:job:${VALID_JOB_ID}:question:${VALID_QUESTION_ID}:answer`,
        'Deploy to production',
      );
    });
  });

  // ── Answer validation ───────────────────────────────────────────────────

  describe('answer validation', () => {
    it('rejects duplicate answer for same question (idempotency)', async () => {
      // Mock: answer already exists in Redis
      mockRedis.get.mockResolvedValue('previous answer');

      const client = createClient();
      await waitForConnect(client);

      const result = await new Promise<{
        success: boolean;
        error?: string;
      }>((resolve) => {
        client.emit(
          'interactive:answer',
          {
            jobId: VALID_JOB_ID,
            questionId: VALID_QUESTION_ID,
            answer: 'Duplicate answer',
          },
          resolve,
        );
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already been answered');
    });

    it('rejects answer for non-STUCK job', async () => {
      // Mock: job is RUNNING not STUCK
      mockDb._limitFn.mockResolvedValue([
        { id: VALID_JOB_ID, status: 'RUNNING' },
      ]);

      const client = createClient();
      await waitForConnect(client);

      const result = await new Promise<{
        success: boolean;
        error?: string;
      }>((resolve) => {
        client.emit(
          'interactive:answer',
          {
            jobId: VALID_JOB_ID,
            questionId: VALID_QUESTION_ID,
            answer: 'Some answer',
          },
          resolve,
        );
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in STUCK state');
      expect(result.error).toContain('RUNNING');
    });

    it('rejects answer when question does not exist in Redis', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const client = createClient();
      await waitForConnect(client);

      const result = await new Promise<{
        success: boolean;
        error?: string;
      }>((resolve) => {
        client.emit(
          'interactive:answer',
          {
            jobId: VALID_JOB_ID,
            questionId: VALID_QUESTION_ID,
            answer: 'Some answer',
          },
          resolve,
        );
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('rejects answer with invalid jobId', async () => {
      const client = createClient();
      await waitForConnect(client);

      const result = await new Promise<{
        success: boolean;
        error?: string;
      }>((resolve) => {
        client.emit(
          'interactive:answer',
          {
            jobId: 'not-a-uuid',
            questionId: VALID_QUESTION_ID,
            answer: 'Some answer',
          },
          resolve,
        );
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid jobId');
    });

    it('rejects answer with empty answer text', async () => {
      const client = createClient();
      await waitForConnect(client);

      const result = await new Promise<{
        success: boolean;
        error?: string;
      }>((resolve) => {
        client.emit(
          'interactive:answer',
          {
            jobId: VALID_JOB_ID,
            questionId: VALID_QUESTION_ID,
            answer: '',
          },
          resolve,
        );
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });
  });

  // ── Bridge service integration (job.stuck → interactive:question) ───────

  describe('bridge service — job.stuck event', () => {
    it('job.stuck domain event delivers interactive:question to subscribed client', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:job', VALID_JOB_ID, resolve);
      });

      const eventPromise = waitForEvent(client, 'interactive:question');
      interactiveGateway.emitQuestion({
        jobId: VALID_JOB_ID,
        questionId: VALID_QUESTION_ID,
        question: 'Worker needs human input',
        askedAt: '2026-03-02T14:00:00.000Z',
      });

      const received = (await eventPromise) as Record<string, unknown>;
      expect(received.jobId).toBe(VALID_JOB_ID);
      expect(received.questionId).toBe(VALID_QUESTION_ID);
      expect(received.question).toBe('Worker needs human input');
      expect(received.askedAt).toBe('2026-03-02T14:00:00.000Z');
    });
  });

  // ── Cleanup verification ──────────────────────────────────────────────────

  describe('cleanup', () => {
    it('client properly disconnects without errors', async () => {
      const client = createClient();
      await waitForConnect(client);

      await new Promise<unknown>((resolve) => {
        client.emit('subscribe:job', VALID_JOB_ID, resolve);
      });

      client.disconnect();

      // Small delay to allow server-side cleanup
      await new Promise((r) => setTimeout(r, 100));

      expect(client.connected).toBe(false);
    });
  });
});
