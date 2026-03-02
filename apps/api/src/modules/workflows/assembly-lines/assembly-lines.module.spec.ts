import { describe, it, expect } from 'vitest';
import { AssemblyLinesModule } from './assembly-lines.module';
import { AssemblyLinesService } from './assembly-lines.service';
import { AssemblyLineOrchestratorService } from './assembly-line-orchestrator.service';
import { OrchestratorEventBus } from './orchestrator-event-bus';

describe('AssemblyLinesModule', () => {
  it('is defined', () => {
    expect(AssemblyLinesModule).toBeDefined();
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
});
