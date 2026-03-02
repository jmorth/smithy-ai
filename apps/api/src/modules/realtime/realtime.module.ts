import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AssemblyLinesModule } from '../workflows/assembly-lines/assembly-lines.module';
import { WorkerPoolsModule } from '../workflows/worker-pools/worker-pools.module';
import { InteractiveGateway, INTERACTIVE_REDIS } from './interactive.gateway';
import { JobsGateway } from './jobs.gateway';
import { WorkflowsGateway } from './workflows.gateway';

@Global()
@Module({
  imports: [AssemblyLinesModule, WorkerPoolsModule],
  providers: [
    WorkflowsGateway,
    JobsGateway,
    InteractiveGateway,
    {
      provide: INTERACTIVE_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        return new Redis(config.get<string>('redis.url')!);
      },
    },
  ],
  exports: [WorkflowsGateway, JobsGateway, InteractiveGateway],
})
export class RealtimeModule {}
