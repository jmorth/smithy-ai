import { Module } from '@nestjs/common';
import { AssemblyLinesController } from './assembly-lines.controller';
import { AssemblyLinesService } from './assembly-lines.service';
import { AssemblyLineOrchestratorService } from './assembly-line-orchestrator.service';
import { OrchestratorEventBus } from './orchestrator-event-bus';
import { WorkersModule } from '../../workers/workers.module';
import { PackagesModule } from '../../packages/packages.module';

@Module({
  imports: [WorkersModule, PackagesModule],
  controllers: [AssemblyLinesController],
  providers: [AssemblyLinesService, AssemblyLineOrchestratorService, OrchestratorEventBus],
  exports: [AssemblyLinesService, OrchestratorEventBus],
})
export class AssemblyLinesModule {}
