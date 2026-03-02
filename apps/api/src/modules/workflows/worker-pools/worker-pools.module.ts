import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as amqplib from 'amqplib';
import { WorkerPoolsService, POOL_ROUTER_SERVICE } from './worker-pools.service';
import { PoolRouterService, REDIS_CLIENT, RABBITMQ_CHANNEL } from './pool-router.service';
import { WorkerPoolsController } from './worker-pools.controller';
import { WorkersModule } from '../../workers/workers.module';

@Module({
  imports: [WorkersModule],
  controllers: [WorkerPoolsController],
  providers: [
    PoolRouterService,
    {
      provide: POOL_ROUTER_SERVICE,
      useExisting: PoolRouterService,
    },
    WorkerPoolsService,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        return new Redis(config.get<string>('redis.url')!);
      },
    },
    {
      provide: RABBITMQ_CHANNEL,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<amqplib.Channel> => {
        const connection = await amqplib.connect(config.get<string>('rabbitmq.url')!);
        return connection.createChannel();
      },
    },
  ],
  exports: [WorkerPoolsService, PoolRouterService],
})
export class WorkerPoolsModule {}
