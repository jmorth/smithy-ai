import { Global, Module } from '@nestjs/common';
import { WorkflowsGateway } from './workflows.gateway';
import { JobsGateway } from './jobs.gateway';
import { InteractiveGateway } from './interactive.gateway';

@Global()
@Module({
  providers: [WorkflowsGateway, JobsGateway, InteractiveGateway],
  exports: [WorkflowsGateway, JobsGateway, InteractiveGateway],
})
export class RealtimeModule {}
