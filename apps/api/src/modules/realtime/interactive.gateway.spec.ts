import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import {
  InteractiveGateway,
  INTERACTIVE_REDIS,
} from './interactive.gateway';
import type {
  InteractiveAnswer,
  InteractiveQuestion,
} from './interactive.gateway';
import { REALTIME_NAMESPACE_INTERACTIVE } from './realtime.constants';
import { Socket } from 'socket.io';

const VALID_JOB_ID = '00000000-0000-0000-0000-000000000001';
const VALID_QUESTION_ID = '00000000-0000-0000-0000-000000000002';
const VALID_JOB_ID_2 = '00000000-0000-0000-0000-000000000003';

function makeMockSocket(id = 'test-client-001'): Socket {
  return {
    id,
    join: vi.fn(),
    leave: vi.fn(),
  } as unknown as Socket;
}

function makeMockServer() {
  const emitFn = vi.fn();
  const toFn = vi.fn().mockReturnValue({ emit: emitFn });
  return { to: toFn, emit: emitFn, _roomEmit: emitFn, _toFn: toFn };
}

function makeMockDb(overrides: {
  selectReturn?: unknown[];
  updateReturn?: unknown[];
} = {}) {
  const { selectReturn = [], updateReturn = [{ id: VALID_JOB_ID }] } = overrides;

  const returningFn = vi.fn().mockResolvedValue(updateReturn);
  const updateWhereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  const updateFromFn = vi.fn().mockReturnValue({ set: updateSetFn });

  const limitFn = vi.fn().mockResolvedValue(selectReturn);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });

  return {
    select: selectFn,
    update: updateFromFn,
    _selectFn: selectFn,
    _fromFn: fromFn,
    _whereFn: whereFn,
    _limitFn: limitFn,
    _updateFromFn: updateFromFn,
    _updateSetFn: updateSetFn,
    _updateWhereFn: updateWhereFn,
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

function createGateway(
  db = makeMockDb({ selectReturn: [{ id: VALID_JOB_ID, status: 'STUCK' }] }),
  redis = makeMockRedis(),
): { gateway: InteractiveGateway; db: ReturnType<typeof makeMockDb>; redis: ReturnType<typeof makeMockRedis> } {
  const gateway = new InteractiveGateway(
    db as unknown as ConstructorParameters<typeof InteractiveGateway>[0],
    redis as unknown as ConstructorParameters<typeof InteractiveGateway>[1],
  );
  return { gateway, db, redis };
}

describe('InteractiveGateway', () => {
  let gateway: InteractiveGateway;
  let mockDb: ReturnType<typeof makeMockDb>;
  let mockRedis: ReturnType<typeof makeMockRedis>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const created = createGateway();
    gateway = created.gateway;
    mockDb = created.db;
    mockRedis = created.redis;
    debugSpy = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Decorator metadata ──────────────────────────────────────────────────────

  describe('decorator metadata', () => {
    it('is configured with /interactive namespace', () => {
      const metadata = Reflect.getMetadata(
        'websockets:is_gateway',
        InteractiveGateway,
      );
      expect(metadata).toBe(true);

      const gatewayOptions = Reflect.getMetadata(
        'websockets:gateway_options',
        InteractiveGateway,
      );
      expect(gatewayOptions).toBeDefined();
      expect(gatewayOptions.namespace).toBe(REALTIME_NAMESPACE_INTERACTIVE);
    });

    it('registers subscribe:job handler', () => {
      const metadata = Reflect.getMetadata(
        'message',
        InteractiveGateway.prototype.handleSubscribeJob,
      );
      expect(metadata).toBe('subscribe:job');
    });

    it('registers unsubscribe:job handler', () => {
      const metadata = Reflect.getMetadata(
        'message',
        InteractiveGateway.prototype.handleUnsubscribeJob,
      );
      expect(metadata).toBe('unsubscribe:job');
    });

    it('registers interactive:answer handler', () => {
      const metadata = Reflect.getMetadata(
        'message',
        InteractiveGateway.prototype.handleAnswer,
      );
      expect(metadata).toBe('interactive:answer');
    });
  });

  // ── handleConnection ──────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('logs client connection at debug level', () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      expect(debugSpy).toHaveBeenCalledWith(
        'Client connected: test-client-001',
      );
    });

    it('initializes client subscription tracking', () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const subs = gateway.getClientSubscriptions();
      expect(subs.get('test-client-001')).toBeDefined();
      expect(subs.get('test-client-001')!.size).toBe(0);
    });
  });

  // ── handleDisconnect ──────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('logs client disconnection with rooms', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeJob(client, VALID_JOB_ID);

      gateway.handleDisconnect(client);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Client disconnected: test-client-001'),
      );
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining(`job:${VALID_JOB_ID}`),
      );
    });

    it('logs "none" when client has no rooms', () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      gateway.handleDisconnect(client);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('rooms: none'),
      );
    });

    it('removes client from subscription tracking', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeJob(client, VALID_JOB_ID);

      gateway.handleDisconnect(client);

      expect(gateway.getClientSubscriptions().has('test-client-001')).toBe(
        false,
      );
    });

    it('handles disconnect for unknown client gracefully', () => {
      const client = makeMockSocket('unknown-client');
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });
  });

  // ── subscribe:job ─────────────────────────────────────────────────────────

  describe('handleSubscribeJob', () => {
    it('joins the job room on valid jobId', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeJob(client, VALID_JOB_ID);

      expect(result).toEqual({
        success: true,
        room: `job:${VALID_JOB_ID}`,
      });
      expect(client.join).toHaveBeenCalledWith(`job:${VALID_JOB_ID}`);
    });

    it('validates job existence via database', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      await gateway.handleSubscribeJob(client, VALID_JOB_ID);

      expect(mockDb._selectFn).toHaveBeenCalled();
    });

    it('returns error when job does not exist', async () => {
      const { gateway: gw } = createGateway(
        makeMockDb({ selectReturn: [] }),
      );
      const client = makeMockSocket();
      gw.handleConnection(client);

      const result = await gw.handleSubscribeJob(client, VALID_JOB_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain(VALID_JOB_ID);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('tracks subscription in clientSubscriptions map', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      await gateway.handleSubscribeJob(client, VALID_JOB_ID);

      const subs = gateway.getClientSubscriptions().get('test-client-001');
      expect(subs).toBeDefined();
      expect(subs!.has(`job:${VALID_JOB_ID}`)).toBe(true);
    });

    it('rejects empty jobId', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeJob(client, '');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid jobId');
    });

    it('rejects non-UUID jobId', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeJob(client, 'not-a-uuid');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid jobId');
    });

    it('rejects non-string jobId', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeJob(
        client,
        123 as unknown as string,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid jobId');
    });

    it('handles database error gracefully', async () => {
      const failDb = makeMockDb();
      const limitFn = vi.fn().mockRejectedValue(new Error('DB error'));
      failDb._whereFn.mockReturnValue({ limit: limitFn });
      const { gateway: gw } = createGateway(failDb);
      const client = makeMockSocket();
      gw.handleConnection(client);

      const result = await gw.handleSubscribeJob(client, VALID_JOB_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('tracks subscription even without prior handleConnection', async () => {
      const client = makeMockSocket('no-connect-client');

      const result = await gateway.handleSubscribeJob(client, VALID_JOB_ID);

      expect(result.success).toBe(true);
      const subs = gateway
        .getClientSubscriptions()
        .get('no-connect-client');
      expect(subs).toBeDefined();
      expect(subs!.has(`job:${VALID_JOB_ID}`)).toBe(true);
    });
  });

  // ── Rate limiting ──────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('rejects subscription when client exceeds 50 rooms', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const subs = gateway.getClientSubscriptions().get(
        'test-client-001',
      ) as Set<string>;
      for (let i = 0; i < 50; i++) {
        subs.add(`job:fake-${i}`);
      }

      const result = await gateway.handleSubscribeJob(client, VALID_JOB_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum room limit');
      expect(result.error).toContain('50');
    });

    it('allows subscription at exactly 49 rooms', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const subs = gateway.getClientSubscriptions().get(
        'test-client-001',
      ) as Set<string>;
      for (let i = 0; i < 49; i++) {
        subs.add(`job:fake-${i}`);
      }

      const result = await gateway.handleSubscribeJob(client, VALID_JOB_ID);

      expect(result.success).toBe(true);
    });
  });

  // ── unsubscribe:job ────────────────────────────────────────────────────────

  describe('handleUnsubscribeJob', () => {
    it('leaves the job room', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeJob(client, VALID_JOB_ID);

      const result = gateway.handleUnsubscribeJob(client, VALID_JOB_ID);

      expect(result).toEqual({
        success: true,
        room: `job:${VALID_JOB_ID}`,
      });
      expect(client.leave).toHaveBeenCalledWith(`job:${VALID_JOB_ID}`);
    });

    it('removes room from client subscription tracking', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeJob(client, VALID_JOB_ID);

      gateway.handleUnsubscribeJob(client, VALID_JOB_ID);

      const subs = gateway.getClientSubscriptions().get('test-client-001');
      expect(subs!.has(`job:${VALID_JOB_ID}`)).toBe(false);
    });

    it('rejects invalid jobId', () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = gateway.handleUnsubscribeJob(client, '');

      expect(result.success).toBe(false);
    });

    it('handles unsubscribe for unknown client gracefully', () => {
      const client = makeMockSocket('unknown');

      const result = gateway.handleUnsubscribeJob(client, VALID_JOB_ID);

      expect(result.success).toBe(true);
      expect(client.leave).toHaveBeenCalled();
    });
  });

  // ── interactive:answer ────────────────────────────────────────────────────

  describe('handleAnswer', () => {
    const validPayload: InteractiveAnswer = {
      jobId: VALID_JOB_ID,
      questionId: VALID_QUESTION_ID,
      answer: 'Yes, proceed with option A',
    };

    it('stores the answer in Redis and returns success', async () => {
      const client = makeMockSocket();
      const mock = makeMockServer();
      gateway.server = mock as unknown as InteractiveGateway['server'];

      const result = await gateway.handleAnswer(client, validPayload);

      expect(result.success).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        `smithy:job:${VALID_JOB_ID}:question:${VALID_QUESTION_ID}:answer`,
        'Yes, proceed with option A',
      );
    });

    it('updates job status from STUCK to RUNNING', async () => {
      const client = makeMockSocket();
      const mock = makeMockServer();
      gateway.server = mock as unknown as InteractiveGateway['server'];

      await gateway.handleAnswer(client, validPayload);

      expect(mockDb._updateFromFn).toHaveBeenCalled();
    });

    it('emits interactive:answered to the job room', async () => {
      const client = makeMockSocket();
      const mock = makeMockServer();
      gateway.server = mock as unknown as InteractiveGateway['server'];

      await gateway.handleAnswer(client, validPayload);

      expect(mock._toFn).toHaveBeenCalledWith(`job:${VALID_JOB_ID}`);
      expect(mock._roomEmit).toHaveBeenCalledWith(
        'interactive:answered',
        expect.objectContaining({
          jobId: VALID_JOB_ID,
          questionId: VALID_QUESTION_ID,
          answeredAt: expect.any(String),
        }),
      );
    });

    it('trims whitespace from answer before storing', async () => {
      const client = makeMockSocket();
      const mock = makeMockServer();
      gateway.server = mock as unknown as InteractiveGateway['server'];

      await gateway.handleAnswer(client, {
        ...validPayload,
        answer: '  trimmed answer  ',
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        'trimmed answer',
      );
    });

    // ── Payload validation ────────────────────────────────────────────────

    it('rejects null payload', async () => {
      const client = makeMockSocket();

      const result = await gateway.handleAnswer(
        client,
        null as unknown as InteractiveAnswer,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid payload');
    });

    it('rejects non-object payload', async () => {
      const client = makeMockSocket();

      const result = await gateway.handleAnswer(
        client,
        'not-an-object' as unknown as InteractiveAnswer,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid payload');
    });

    it('rejects invalid jobId in payload', async () => {
      const client = makeMockSocket();

      const result = await gateway.handleAnswer(client, {
        ...validPayload,
        jobId: 'not-a-uuid',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid jobId');
    });

    it('rejects empty jobId in payload', async () => {
      const client = makeMockSocket();

      const result = await gateway.handleAnswer(client, {
        ...validPayload,
        jobId: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid jobId');
    });

    it('rejects invalid questionId in payload', async () => {
      const client = makeMockSocket();

      const result = await gateway.handleAnswer(client, {
        ...validPayload,
        questionId: 'not-a-uuid',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid questionId');
    });

    it('rejects empty answer', async () => {
      const client = makeMockSocket();

      const result = await gateway.handleAnswer(client, {
        ...validPayload,
        answer: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('rejects whitespace-only answer', async () => {
      const client = makeMockSocket();

      const result = await gateway.handleAnswer(client, {
        ...validPayload,
        answer: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('rejects non-string answer', async () => {
      const client = makeMockSocket();

      const result = await gateway.handleAnswer(client, {
        ...validPayload,
        answer: 123 as unknown as string,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    // ── Job state validation ──────────────────────────────────────────────

    it('rejects answer when job is not found', async () => {
      const { gateway: gw } = createGateway(
        makeMockDb({ selectReturn: [] }),
      );
      const client = makeMockSocket();

      const result = await gw.handleAnswer(client, validPayload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('rejects answer when job is not in STUCK state', async () => {
      const { gateway: gw } = createGateway(
        makeMockDb({
          selectReturn: [{ id: VALID_JOB_ID, status: 'RUNNING' }],
        }),
      );
      const client = makeMockSocket();

      const result = await gw.handleAnswer(client, validPayload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in STUCK state');
      expect(result.error).toContain('RUNNING');
    });

    it('rejects answer when job is COMPLETED', async () => {
      const { gateway: gw } = createGateway(
        makeMockDb({
          selectReturn: [{ id: VALID_JOB_ID, status: 'COMPLETED' }],
        }),
      );
      const client = makeMockSocket();

      const result = await gw.handleAnswer(client, validPayload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in STUCK state');
    });

    it('rejects answer when job is QUEUED', async () => {
      const { gateway: gw } = createGateway(
        makeMockDb({
          selectReturn: [{ id: VALID_JOB_ID, status: 'QUEUED' }],
        }),
      );
      const client = makeMockSocket();

      const result = await gw.handleAnswer(client, validPayload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in STUCK state');
    });

    // ── Question existence ────────────────────────────────────────────────

    it('rejects answer when question does not exist in Redis', async () => {
      const { gateway: gw } = createGateway(
        makeMockDb({
          selectReturn: [{ id: VALID_JOB_ID, status: 'STUCK' }],
        }),
        makeMockRedis({ existsReturn: 0 }),
      );
      const client = makeMockSocket();

      const result = await gw.handleAnswer(client, validPayload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    // ── Idempotency guard ────────────────────────────────────────────────

    it('rejects answer when question has already been answered', async () => {
      const { gateway: gw } = createGateway(
        makeMockDb({
          selectReturn: [{ id: VALID_JOB_ID, status: 'STUCK' }],
        }),
        makeMockRedis({ getReturn: 'previous answer' }),
      );
      const client = makeMockSocket();

      const result = await gw.handleAnswer(client, validPayload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already been answered');
    });

    // ── Database error handling ──────────────────────────────────────────

    it('handles database lookup error gracefully', async () => {
      const failDb = makeMockDb();
      const limitFn = vi.fn().mockRejectedValue(new Error('DB error'));
      failDb._whereFn.mockReturnValue({ limit: limitFn });
      const { gateway: gw } = createGateway(failDb);
      const client = makeMockSocket();

      const result = await gw.handleAnswer(client, validPayload);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to look up job');
    });
  });

  // ── emitQuestion ───────────────────────────────────────────────────────────

  describe('emitQuestion', () => {
    it('emits interactive:question to the job room', () => {
      const mock = makeMockServer();
      gateway.server = mock as unknown as InteractiveGateway['server'];

      const question: InteractiveQuestion = {
        jobId: VALID_JOB_ID,
        questionId: VALID_QUESTION_ID,
        question: 'What should I do next?',
        choices: ['Option A', 'Option B'],
        askedAt: '2026-03-02T00:00:00.000Z',
      };

      gateway.emitQuestion(question);

      expect(mock._toFn).toHaveBeenCalledWith(`job:${VALID_JOB_ID}`);
      expect(mock._roomEmit).toHaveBeenCalledWith(
        'interactive:question',
        question,
      );
    });

    it('emits question without choices', () => {
      const mock = makeMockServer();
      gateway.server = mock as unknown as InteractiveGateway['server'];

      const question: InteractiveQuestion = {
        jobId: VALID_JOB_ID,
        questionId: VALID_QUESTION_ID,
        question: 'Please provide more details',
        askedAt: '2026-03-02T00:00:00.000Z',
      };

      gateway.emitQuestion(question);

      expect(mock._roomEmit).toHaveBeenCalledWith(
        'interactive:question',
        question,
      );
    });
  });

  // ── getClientSubscriptions ────────────────────────────────────────────────

  describe('getClientSubscriptions', () => {
    it('returns the client subscriptions map', () => {
      const subs = gateway.getClientSubscriptions();
      expect(subs).toBeInstanceOf(Map);
    });

    it('reflects subscriptions after joins', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeJob(client, VALID_JOB_ID);

      const subs = gateway.getClientSubscriptions().get('test-client-001');
      expect(subs!.size).toBe(1);
      expect(subs!.has(`job:${VALID_JOB_ID}`)).toBe(true);
    });
  });
});
