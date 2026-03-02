import { Inject, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { eq } from 'drizzle-orm';
import type Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { DRIZZLE } from '../../database/database.constants';
import type { DrizzleClient } from '../../database/database.provider';
import { jobExecutions } from '../../database/schema';
import { REALTIME_NAMESPACE_INTERACTIVE } from './realtime.constants';

export const INTERACTIVE_REDIS = Symbol('INTERACTIVE_REDIS');

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_ROOMS_PER_CLIENT = 50;

export interface InteractiveResult {
  success: boolean;
  room?: string;
  error?: string;
}

export interface InteractiveQuestion {
  jobId: string;
  questionId: string;
  question: string;
  choices?: string[];
  askedAt: string;
}

export interface InteractiveAnswer {
  jobId: string;
  questionId: string;
  answer: string;
}

export interface AnswerResult {
  success: boolean;
  error?: string;
}

function redisQuestionKey(jobId: string, questionId: string): string {
  return `smithy:job:${jobId}:question:${questionId}`;
}

function redisAnswerKey(jobId: string, questionId: string): string {
  return `smithy:job:${jobId}:question:${questionId}:answer`;
}

@WebSocketGateway({ namespace: REALTIME_NAMESPACE_INTERACTIVE })
export class InteractiveGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(InteractiveGateway.name);
  private readonly clientSubscriptions = new Map<string, Set<string>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    @Inject(INTERACTIVE_REDIS) private readonly redis: Redis,
  ) {}

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
    this.clientSubscriptions.set(client.id, new Set());
  }

  handleDisconnect(client: Socket): void {
    const rooms = this.clientSubscriptions.get(client.id);
    const roomList = rooms && rooms.size > 0 ? [...rooms].join(', ') : 'none';
    this.logger.debug(
      `Client disconnected: ${client.id}, rooms: ${roomList}`,
    );
    this.clientSubscriptions.delete(client.id);
  }

  // ── subscribe:job ──────────────────────────────────────────────────────────

  @SubscribeMessage('subscribe:job')
  async handleSubscribeJob(
    client: Socket,
    jobId: string,
  ): Promise<InteractiveResult> {
    const validation = this.validateUuid(jobId, 'jobId');
    if (validation) return validation;

    const rateLimitError = this.checkRateLimit(client.id);
    if (rateLimitError) return rateLimitError;

    try {
      const [job] = await this.db
        .select({ id: jobExecutions.id })
        .from(jobExecutions)
        .where(eq(jobExecutions.id, jobId))
        .limit(1);

      if (!job) {
        return { success: false, error: `Job "${jobId}" not found` };
      }
    } catch {
      return { success: false, error: `Job "${jobId}" not found` };
    }

    const room = `job:${jobId}`;
    client.join(room);
    this.trackSubscription(client.id, room);

    return { success: true, room };
  }

  // ── unsubscribe:job ────────────────────────────────────────────────────────

  @SubscribeMessage('unsubscribe:job')
  handleUnsubscribeJob(
    client: Socket,
    jobId: string,
  ): InteractiveResult {
    const validation = this.validateUuid(jobId, 'jobId');
    if (validation) return validation;

    const room = `job:${jobId}`;
    client.leave(room);
    this.untrackSubscription(client.id, room);

    return { success: true, room };
  }

  // ── interactive:answer ─────────────────────────────────────────────────────

  @SubscribeMessage('interactive:answer')
  async handleAnswer(
    client: Socket,
    payload: InteractiveAnswer,
  ): Promise<AnswerResult> {
    // ── Validate payload ────────────────────────────────────────────────────
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Invalid payload' };
    }

    const { jobId, questionId, answer } = payload;

    if (!jobId || !UUID_REGEX.test(jobId)) {
      return { success: false, error: 'Invalid jobId' };
    }
    if (!questionId || !UUID_REGEX.test(questionId)) {
      return { success: false, error: 'Invalid questionId' };
    }
    if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
      return { success: false, error: 'Answer must be a non-empty string' };
    }

    // ── Verify the job exists and is in STUCK state ─────────────────────────
    let job: { id: string; status: string } | undefined;
    try {
      const [result] = await this.db
        .select({ id: jobExecutions.id, status: jobExecutions.status })
        .from(jobExecutions)
        .where(eq(jobExecutions.id, jobId))
        .limit(1);
      job = result;
    } catch {
      return { success: false, error: 'Failed to look up job' };
    }

    if (!job) {
      return { success: false, error: `Job "${jobId}" not found` };
    }

    if (job.status !== 'STUCK') {
      return {
        success: false,
        error: `Job "${jobId}" is not in STUCK state (current: ${job.status})`,
      };
    }

    // ── Verify the question exists in Redis ─────────────────────────────────
    const questionExists = await this.redis.exists(
      redisQuestionKey(jobId, questionId),
    );
    if (!questionExists) {
      return { success: false, error: `Question "${questionId}" not found` };
    }

    // ── Idempotency guard: reject if already answered ───────────────────────
    const answerKey = redisAnswerKey(jobId, questionId);
    const existingAnswer = await this.redis.get(answerKey);
    if (existingAnswer !== null) {
      return {
        success: false,
        error: `Question "${questionId}" has already been answered`,
      };
    }

    // ── Store the answer in Redis ───────────────────────────────────────────
    await this.redis.set(answerKey, answer.trim());

    // ── Update job status from STUCK to RUNNING ─────────────────────────────
    await this.db
      .update(jobExecutions)
      .set({ status: 'RUNNING' })
      .where(eq(jobExecutions.id, jobId));

    // ── Emit interactive:answered to the room ───────────────────────────────
    const room = `job:${jobId}`;
    this.server.to(room).emit('interactive:answered', {
      jobId,
      questionId,
      answeredAt: new Date().toISOString(),
    });

    this.logger.log(
      `Answer stored for question ${questionId} on job ${jobId} by client ${client.id}`,
    );

    return { success: true };
  }

  // ── Emit question to room (called by bridge service, task 074) ────────────

  emitQuestion(question: InteractiveQuestion): void {
    const room = `job:${question.jobId}`;
    this.server.to(room).emit('interactive:question', question);
    this.logger.debug(
      `Emitted interactive:question to room ${room} (questionId=${question.questionId})`,
    );
  }

  // ── Admin visibility ────────────────────────────────────────────────────────

  getClientSubscriptions(): ReadonlyMap<string, ReadonlySet<string>> {
    return this.clientSubscriptions;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private validateUuid(
    value: string,
    fieldName: string,
  ): InteractiveResult | null {
    if (!value || typeof value !== 'string' || !UUID_REGEX.test(value)) {
      return {
        success: false,
        error: `Invalid ${fieldName}. Must be a valid UUID.`,
      };
    }
    return null;
  }

  private checkRateLimit(clientId: string): InteractiveResult | null {
    const rooms = this.clientSubscriptions.get(clientId);
    if (rooms && rooms.size >= MAX_ROOMS_PER_CLIENT) {
      return {
        success: false,
        error: `Maximum room limit (${MAX_ROOMS_PER_CLIENT}) reached`,
      };
    }
    return null;
  }

  private trackSubscription(clientId: string, room: string): void {
    let rooms = this.clientSubscriptions.get(clientId);
    if (!rooms) {
      rooms = new Set();
      this.clientSubscriptions.set(clientId, rooms);
    }
    rooms.add(room);
  }

  private untrackSubscription(clientId: string, room: string): void {
    const rooms = this.clientSubscriptions.get(clientId);
    if (rooms) {
      rooms.delete(room);
    }
  }
}
