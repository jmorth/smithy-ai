import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Channel } from 'amqplib';
import type Redis from 'ioredis';
import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleClient } from '../../../database/database.provider';
import { workerPools, workerPoolMembers, workerVersions, workers } from '../../../database/schema';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const RABBITMQ_CHANNEL = Symbol('RABBITMQ_CHANNEL');

export type RoutingResult = {
  workerSlug: string;
  workerVersion: number;
  status: 'dispatched' | 'queued';
};

/**
 * Returns the worker-specific RabbitMQ queue name.
 * Pattern: `worker.{workerSlug}.v{version}`
 */
export function getWorkerQueueName(workerSlug: string, version: number): string {
  return `worker.${workerSlug}.v${version}`;
}

@Injectable()
export class PoolRouterService {
  private readonly logger = new Logger(PoolRouterService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(RABBITMQ_CHANNEL) private readonly channel: Channel,
  ) {}

  /**
   * Routes a package to a worker in the given pool using weighted round-robin.
   *
   * - Uses Redis INCR on `pool:{poolSlug}:rr` for atomic counter increment.
   * - Selects the worker via `members[counter % members.length]`.
   * - Checks `pool:{poolSlug}:active` against maxConcurrency before dispatching.
   * - If at capacity, returns `status: 'queued'` (job deferred until a slot opens).
   * - If under capacity, increments the active counter, publishes the job to the
   *   worker's RabbitMQ queue, and returns `status: 'dispatched'`.
   *
   * MVP note: the "queued" path publishes to the pool's waiting queue in a future
   * task. For now the caller is responsible for retry/queuing logic when
   * `status === 'queued'` is returned.
   */
  async route(poolSlug: string, packageId: string): Promise<RoutingResult> {
    // ── 1. Fetch pool record ──────────────────────────────────────────────────
    const [pool] = await this.db
      .select({ id: workerPools.id, maxConcurrency: workerPools.maxConcurrency })
      .from(workerPools)
      .where(eq(workerPools.slug, poolSlug))
      .limit(1);

    if (!pool) {
      throw new NotFoundException(`Worker pool "${poolSlug}" not found`);
    }

    // ── 2. Fetch pool members with worker info ────────────────────────────────
    const members = await this.db
      .select({
        workerVersionId: workerPoolMembers.workerVersionId,
        priority: workerPoolMembers.priority,
        workerSlug: workers.slug,
        workerVersion: workerVersions.version,
        status: workerVersions.status,
      })
      .from(workerPoolMembers)
      .innerJoin(workerVersions, eq(workerVersions.id, workerPoolMembers.workerVersionId))
      .innerJoin(workers, eq(workers.id, workerVersions.workerId))
      .where(eq(workerPoolMembers.poolId, pool.id));

    // ── 3. Filter out deprecated members ─────────────────────────────────────
    const eligible = members.filter((m) => m.status !== 'DEPRECATED');

    if (eligible.length === 0) {
      throw new BadRequestException(`Worker pool "${poolSlug}" has no eligible members`);
    }

    // ── 4. Build weighted selection list (expand by priority weight) ──────────
    // E.g. member A (priority=3) + member B (priority=1) → [A, A, A, B]
    const weighted: (typeof eligible)[number][] = eligible.flatMap((m) =>
      Array<(typeof eligible)[number]>(Math.max(1, m.priority)).fill(m),
    );

    // ── 5. Atomic round-robin counter via Redis INCR ──────────────────────────
    const counter = await this.redis.incr(`pool:${poolSlug}:rr`);

    // ── 6. Select worker by counter modulo weighted length ────────────────────
    const selected = weighted[counter % weighted.length]!;

    // ── 7. Concurrency check ──────────────────────────────────────────────────
    const activeRaw = await this.redis.get(`pool:${poolSlug}:active`);
    const active = parseInt(activeRaw ?? '0', 10);

    if (active >= pool.maxConcurrency) {
      this.logger.log(
        `Pool "${poolSlug}" at capacity (${active}/${pool.maxConcurrency}) — package ${packageId} queued`,
      );
      return { workerSlug: selected.workerSlug, workerVersion: selected.workerVersion, status: 'queued' };
    }

    // ── 8. Dispatch: increment active counter and publish to RabbitMQ ─────────
    await this.redis.incr(`pool:${poolSlug}:active`);

    const queueName = getWorkerQueueName(selected.workerSlug, selected.workerVersion);
    const message = {
      packageId,
      workerVersionId: selected.workerVersionId,
      poolSlug,
      timestamp: new Date().toISOString(),
    };

    this.channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });

    this.logger.log(
      `Package ${packageId} dispatched to "${queueName}" via pool "${poolSlug}"`,
    );

    return { workerSlug: selected.workerSlug, workerVersion: selected.workerVersion, status: 'dispatched' };
  }

  /**
   * Decrements the active job counter for the given pool.
   * Called when a job completes or fails to free a concurrency slot.
   * Protected against going below zero.
   */
  async releaseSlot(poolSlug: string): Promise<void> {
    const current = parseInt((await this.redis.get(`pool:${poolSlug}:active`)) ?? '0', 10);
    if (current > 0) {
      await this.redis.decr(`pool:${poolSlug}:active`);
    }
  }
}
