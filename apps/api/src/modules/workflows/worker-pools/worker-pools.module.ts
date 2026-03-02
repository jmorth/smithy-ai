import { Module } from '@nestjs/common';
import { WorkerPoolsService } from './worker-pools.service';

@Module({
  providers: [WorkerPoolsService],
  exports: [WorkerPoolsService],
})
export class WorkerPoolsModule {}
