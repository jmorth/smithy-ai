import { Module } from '@nestjs/common';
import { WorkersService } from './workers.service';
import { WorkerDiscoveryService } from './worker-discovery.service';
import { WorkersController } from './workers.controller';

@Module({
  controllers: [WorkersController],
  providers: [WorkersService, WorkerDiscoveryService],
  exports: [WorkersService],
})
export class WorkersModule {}
