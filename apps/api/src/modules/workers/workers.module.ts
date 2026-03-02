import { Module } from '@nestjs/common';
import { WorkersService } from './workers.service';
import { WorkerDiscoveryService } from './worker-discovery.service';

@Module({
  providers: [WorkersService, WorkerDiscoveryService],
  exports: [WorkersService],
})
export class WorkersModule {}
