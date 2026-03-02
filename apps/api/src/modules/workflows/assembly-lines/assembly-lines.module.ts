import { Module } from '@nestjs/common';
import { AssemblyLinesService } from './assembly-lines.service';
import { AssemblyLineOrchestratorService } from './assembly-line-orchestrator.service';
import { OrchestratorEventBus } from './orchestrator-event-bus';

@Module({
  providers: [AssemblyLinesService, AssemblyLineOrchestratorService, OrchestratorEventBus],
  exports: [AssemblyLinesService, OrchestratorEventBus],
})
export class AssemblyLinesModule {}
