import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

export const CONTAINER_REDIS_CLIENT = Symbol('CONTAINER_REDIS_CLIENT');

const REDIS_KEY = 'smithy:containers:active';
const REDIS_KEY_TTL_SECONDS = 3600; // 1 hour safety TTL

/**
 * Lua script for atomic acquire: increments counter only if below limit.
 * Returns the new counter value on success, or -1 if at capacity.
 */
const ACQUIRE_LUA_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == false then current = 0 else current = tonumber(current) end
if current < tonumber(ARGV[1]) then
  local newVal = redis.call('INCR', KEYS[1])
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
  return newVal
else
  return -1
end
`;

/**
 * Lua script for atomic release: decrements counter but never below zero.
 * Returns the new counter value.
 */
const RELEASE_LUA_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == false then current = 0 else current = tonumber(current) end
if current > 0 then
  local newVal = redis.call('DECR', KEYS[1])
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  return newVal
else
  redis.call('SET', KEYS[1], 0)
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  return 0
end
`;

export type PendingJob = {
  jobId: string;
  resolve: (acquired: boolean) => void;
};

@Injectable()
export class ConcurrencyLimiterService {
  private readonly logger = new Logger(ConcurrencyLimiterService.name);
  private readonly concurrencyLimit: number;
  private readonly waitingQueue: PendingJob[] = [];

  constructor(
    @Inject(CONTAINER_REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.concurrencyLimit = this.configService.get<number>('containers.concurrencyLimit')!;
  }

  /**
   * Attempts to acquire a concurrency slot for the given job.
   *
   * Uses an atomic Redis Lua script to increment the counter only if
   * below the configured limit. If at capacity, the job is enqueued
   * in a FIFO waiting queue for later execution.
   *
   * On Redis failure, logs the error and returns true (fail-open) to
   * prevent complete stall of the system.
   *
   * @returns true if a slot was acquired, false if the job was enqueued
   */
  async acquire(jobId: string): Promise<boolean> {
    try {
      // ioredis .eval() runs a Lua script on the Redis server (not JS eval)
      const result = await (this.redis as any).eval(
        ACQUIRE_LUA_SCRIPT,
        1,
        REDIS_KEY,
        this.concurrencyLimit,
        REDIS_KEY_TTL_SECONDS,
      ) as number;

      if (result === -1) {
        this.logger.log(
          `Concurrency limit reached (${this.concurrencyLimit}) — job ${jobId} enqueued (queue size: ${this.waitingQueue.length + 1})`,
        );
        return new Promise<boolean>((resolve) => {
          this.waitingQueue.push({ jobId, resolve });
        });
      }

      this.logger.debug(
        `Slot acquired for job ${jobId} (active: ${result}/${this.concurrencyLimit})`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Redis error during acquire for job ${jobId} — allowing execution (fail-open)`,
        error instanceof Error ? error.stack : String(error),
      );
      return true;
    }
  }

  /**
   * Releases a concurrency slot, atomically decrementing the Redis counter.
   * Never decrements below zero (guarded by Lua script).
   *
   * After releasing, dequeues the next waiting job in FIFO order and
   * attempts to acquire a slot for it.
   *
   * On Redis failure, logs the error and still attempts to dequeue
   * waiting jobs (they will get fail-open behavior).
   */
  async release(): Promise<void> {
    try {
      // ioredis .eval() runs a Lua script on the Redis server (not JS eval)
      const result = await (this.redis as any).eval(
        RELEASE_LUA_SCRIPT,
        1,
        REDIS_KEY,
        REDIS_KEY_TTL_SECONDS,
      ) as number;

      this.logger.debug(
        `Slot released (active: ${result}/${this.concurrencyLimit})`,
      );
    } catch (error) {
      this.logger.error(
        'Redis error during release — attempting to dequeue waiting jobs anyway',
        error instanceof Error ? error.stack : String(error),
      );
    }

    await this.dequeueNext();
  }

  /**
   * Returns the current number of active containers from the Redis counter.
   * Returns null if Redis is unavailable.
   */
  async getActiveCount(): Promise<number | null> {
    try {
      const raw = await this.redis.get(REDIS_KEY);
      return parseInt(raw ?? '0', 10);
    } catch (error) {
      this.logger.error(
        'Redis error during getActiveCount',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /**
   * Force-releases a slot for admin use when a container is stuck.
   * Decrements the counter and dequeues the next waiting job.
   */
  async forceRelease(jobId: string): Promise<void> {
    this.logger.warn(`Force-releasing slot for stuck job ${jobId}`);
    await this.release();
  }

  /**
   * Returns a snapshot of the current waiting queue (job IDs only).
   */
  getWaitingQueue(): string[] {
    return this.waitingQueue.map((pending) => pending.jobId);
  }

  /**
   * Returns the number of jobs waiting in the queue.
   */
  getWaitingCount(): number {
    return this.waitingQueue.length;
  }

  /**
   * Dequeues the next waiting job in FIFO order and attempts to acquire
   * a slot for it. If acquisition succeeds, resolves the job's promise
   * with true. If it fails (shouldn't happen since we just released),
   * the job is re-enqueued at the front.
   */
  private async dequeueNext(): Promise<void> {
    const next = this.waitingQueue.shift();
    if (!next) return;

    try {
      // ioredis .eval() runs a Lua script on the Redis server (not JS eval)
      const result = await (this.redis as any).eval(
        ACQUIRE_LUA_SCRIPT,
        1,
        REDIS_KEY,
        this.concurrencyLimit,
        REDIS_KEY_TTL_SECONDS,
      ) as number;

      if (result === -1) {
        // Slot was taken by another server — re-enqueue at front
        this.waitingQueue.unshift(next);
        return;
      }

      this.logger.debug(
        `Dequeued job ${next.jobId} — slot acquired (active: ${result}/${this.concurrencyLimit})`,
      );
      next.resolve(true);
    } catch (error) {
      this.logger.error(
        `Redis error during dequeue for job ${next.jobId} — allowing execution (fail-open)`,
        error instanceof Error ? error.stack : String(error),
      );
      next.resolve(true);
    }
  }
}
