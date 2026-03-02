import { Global, Module } from '@nestjs/common';
import { AssemblyLinesModule } from '../workflows/assembly-lines/assembly-lines.module';
import { WorkerPoolsModule } from '../workflows/worker-pools/worker-pools.module';
import { WorkflowsGateway } from './workflows.gateway';
import { JobsGateway } from './jobs.gateway';
import { InteractiveGateway } from './interactive.gateway';

@Global()
@Module({
  imports: [AssemblyLinesModule, WorkerPoolsModule],
  providers: [WorkflowsGateway, JobsGateway, InteractiveGateway],
  exports: [WorkflowsGateway, JobsGateway, InteractiveGateway],
})
export class RealtimeModule {}
