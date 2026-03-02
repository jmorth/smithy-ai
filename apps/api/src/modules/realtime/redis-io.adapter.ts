import { INestApplication, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(
    app: INestApplication,
    private readonly corsOrigin: string,
  ) {
    super(app);
  }

  async connectToRedis(redisUrl: string): Promise<void> {
    try {
      const pubClient = new Redis(redisUrl, { lazyConnect: true });
      const subClient = new Redis(redisUrl, { lazyConnect: true });

      await Promise.all([pubClient.connect(), subClient.connect()]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Redis adapter connected for cross-instance broadcasting');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to connect Redis adapter: ${message}. Running in single-instance mode.`,
      );
    }
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.corsOrigin,
        credentials: true,
      },
    });

    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }

    return server;
  }
}
