import { describe, it, expect } from 'vitest';
import { AssemblyLinesModule } from './assembly-lines.module';
import { AssemblyLinesController } from './assembly-lines.controller';
import { AssemblyLinesService } from './assembly-lines.service';
import { AssemblyLineOrchestratorService } from './assembly-line-orchestrator.service';
import { OrchestratorEventBus } from './orchestrator-event-bus';
import { WorkersModule } from '../../workers/workers.module';
import { PackagesModule } from '../../packages/packages.module';

describe('AssemblyLinesModule', () => {
  it('is defined', () => {
    expect(AssemblyLinesModule).toBeDefined();
  });

  it('declares AssemblyLinesController as a controller', () => {
    const metadata = Reflect.getMetadata('controllers', AssemblyLinesModule);
    expect(metadata).toContain(AssemblyLinesController);
  });

  it('declares AssemblyLinesService as a provider', () => {
    const metadata = Reflect.getMetadata('providers', AssemblyLinesModule);
    expect(metadata).toContain(AssemblyLinesService);
  });

  it('exports AssemblyLinesService', () => {
    const metadata = Reflect.getMetadata('exports', AssemblyLinesModule);
    expect(metadata).toContain(AssemblyLinesService);
  });

  it('declares AssemblyLineOrchestratorService as a provider', () => {
    const metadata = Reflect.getMetadata('providers', AssemblyLinesModule);
    expect(metadata).toContain(AssemblyLineOrchestratorService);
  });

  it('declares OrchestratorEventBus as a provider', () => {
    const metadata = Reflect.getMetadata('providers', AssemblyLinesModule);
    expect(metadata).toContain(OrchestratorEventBus);
  });

  it('exports OrchestratorEventBus', () => {
    const metadata = Reflect.getMetadata('exports', AssemblyLinesModule);
    expect(metadata).toContain(OrchestratorEventBus);
  });

  it('imports WorkersModule', () => {
    const metadata = Reflect.getMetadata('imports', AssemblyLinesModule);
    expect(metadata).toContain(WorkersModule);
  });

  it('imports PackagesModule', () => {
    const metadata = Reflect.getMetadata('imports', AssemblyLinesModule);
    expect(metadata).toContain(PackagesModule);
  });
});
