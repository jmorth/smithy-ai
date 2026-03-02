import { describe, it, expect } from 'vitest';
import { RealtimeModule } from './realtime.module';
import { WorkflowsGateway } from './workflows.gateway';
import { JobsGateway } from './jobs.gateway';
import { InteractiveGateway } from './interactive.gateway';

describe('RealtimeModule', () => {
  describe('module metadata', () => {
    it('is decorated with @Global()', () => {
      const metadata = Reflect.getMetadata('__module:global__', RealtimeModule);
      expect(metadata).toBe(true);
    });

    it('provides WorkflowsGateway', () => {
      const providers = Reflect.getMetadata(
        'providers',
        RealtimeModule,
      ) as unknown[];
      expect(providers).toContain(WorkflowsGateway);
    });

    it('provides JobsGateway', () => {
      const providers = Reflect.getMetadata(
        'providers',
        RealtimeModule,
      ) as unknown[];
      expect(providers).toContain(JobsGateway);
    });

    it('provides InteractiveGateway', () => {
      const providers = Reflect.getMetadata(
        'providers',
        RealtimeModule,
      ) as unknown[];
      expect(providers).toContain(InteractiveGateway);
    });

    it('exports WorkflowsGateway', () => {
      const exports = Reflect.getMetadata(
        'exports',
        RealtimeModule,
      ) as unknown[];
      expect(exports).toContain(WorkflowsGateway);
    });

    it('exports JobsGateway', () => {
      const exports = Reflect.getMetadata(
        'exports',
        RealtimeModule,
      ) as unknown[];
      expect(exports).toContain(JobsGateway);
    });

    it('exports InteractiveGateway', () => {
      const exports = Reflect.getMetadata(
        'exports',
        RealtimeModule,
      ) as unknown[];
      expect(exports).toContain(InteractiveGateway);
    });

    it('provides exactly three gateways', () => {
      const providers = Reflect.getMetadata(
        'providers',
        RealtimeModule,
      ) as unknown[];
      expect(providers).toHaveLength(3);
    });

    it('exports exactly three gateways', () => {
      const exports = Reflect.getMetadata(
        'exports',
        RealtimeModule,
      ) as unknown[];
      expect(exports).toHaveLength(3);
    });
  });
});
