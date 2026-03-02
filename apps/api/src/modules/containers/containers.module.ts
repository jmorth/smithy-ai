import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ContainerBuilderService } from './container-builder.service';
import { ContainerManagerService } from './container-manager.service';
import { ConcurrencyLimiterService, CONTAINER_REDIS_CLIENT } from './concurrency-limiter.service';

@Module({
  providers: [
    ContainerBuilderService,
    ContainerManagerService,
    ConcurrencyLimiterService,
    {
      provide: CONTAINER_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        return new Redis(config.get<string>('redis.url')!);
      },
    },
  ],
  exports: [ContainerBuilderService, ContainerManagerService, ConcurrencyLimiterService],
})
export class ContainersModule {}
