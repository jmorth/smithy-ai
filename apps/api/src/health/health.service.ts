import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import Redis from 'ioredis';
import * as amqplib from 'amqplib';
import { PG_POOL } from '../database/database.provider';

export interface ServiceStatus {
  status: 'up' | 'down';
  error?: string;
}

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    rabbitmq: ServiceStatus;
  };
  timestamp: string;
}

const CHECK_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Health check timed out')), ms),
  );
  return Promise.race([promise, timeout]);
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async checkDatabase(): Promise<ServiceStatus> {
    try {
      await withTimeout(this.pool.query('SELECT 1'), CHECK_TIMEOUT_MS);
      return { status: 'up' };
    } catch (err) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : 'Database check failed',
      };
    }
  }

  async checkRedis(): Promise<ServiceStatus> {
    const redisUrl = this.configService.get<string>('redis.url')!;
    const client = new Redis(redisUrl, { lazyConnect: true, enableReadyCheck: false });
    try {
      await withTimeout(
        client.connect().then(() => client.ping()),
        CHECK_TIMEOUT_MS,
      );
      return { status: 'up' };
    } catch (err) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : 'Redis check failed',
      };
    } finally {
      client.disconnect();
    }
  }

  async checkRabbitmq(): Promise<ServiceStatus> {
    const rabbitmqUrl = this.configService.get<string>('rabbitmq.url')!;
    let connection: amqplib.ChannelModel | undefined;
    try {
      connection = await withTimeout(
        amqplib.connect(rabbitmqUrl),
        CHECK_TIMEOUT_MS,
      );
      return { status: 'up' };
    } catch (err) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : 'RabbitMQ check failed',
      };
    } finally {
      if (connection) {
        await connection.close().catch(() => undefined);
      }
    }
  }

  async check(): Promise<HealthCheckResult> {
    const [database, redis, rabbitmq] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkRabbitmq(),
    ]);

    const allUp =
      database.status === 'up' &&
      redis.status === 'up' &&
      rabbitmq.status === 'up';

    return {
      status: allUp ? 'ok' : 'degraded',
      services: { database, redis, rabbitmq },
      timestamp: new Date().toISOString(),
    };
  }
}
