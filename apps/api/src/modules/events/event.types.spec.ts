import { describe, it, expect } from 'vitest';
import { EventRoutes } from './event.types';
import type {
  EventEnvelope,
  EventTypeMap,
  PackageCreatedEvent,
  WorkerStateChangedEvent,
  JobStartedEvent,
  JobCompletedEvent,
  JobStuckEvent,
  JobErrorEvent,
  AssemblyLineCompletedEvent,
  RoutingKey,
} from './event.types';

describe('event.types', () => {
  describe('EventRoutes', () => {
    it('exports PACKAGE_CREATED as "package.created"', () => {
      expect(EventRoutes.PACKAGE_CREATED).toBe('package.created');
    });

    it('exports JOB_STATE_CHANGED as "job.state.changed"', () => {
      expect(EventRoutes.JOB_STATE_CHANGED).toBe('job.state.changed');
    });

    it('exports JOB_STARTED as "job.started"', () => {
      expect(EventRoutes.JOB_STARTED).toBe('job.started');
    });

    it('exports JOB_COMPLETED as "job.completed"', () => {
      expect(EventRoutes.JOB_COMPLETED).toBe('job.completed');
    });

    it('exports JOB_STUCK as "job.stuck"', () => {
      expect(EventRoutes.JOB_STUCK).toBe('job.stuck');
    });

    it('exports JOB_ERROR as "job.error"', () => {
      expect(EventRoutes.JOB_ERROR).toBe('job.error');
    });

    it('exports ASSEMBLY_LINE_COMPLETED as "assembly-line.completed"', () => {
      expect(EventRoutes.ASSEMBLY_LINE_COMPLETED).toBe(
        'assembly-line.completed',
      );
    });

    it('follows dot-separated {domain}.{action} convention', () => {
      const values = Object.values(EventRoutes);
      for (const key of values) {
        expect(key).toMatch(/^[a-z-]+(\.[a-z-]+)+$/);
      }
    });
  });

  describe('type exports (compile-time verification)', () => {
    it('EventEnvelope is a valid generic type', () => {
      const envelope: EventEnvelope<{ test: boolean }> = {
        eventType: 'test',
        timestamp: new Date().toISOString(),
        correlationId: 'abc-123',
        payload: { test: true },
      };
      expect(envelope.eventType).toBe('test');
      expect(envelope.payload.test).toBe(true);
    });

    it('RoutingKey type accepts valid routing keys', () => {
      const key: RoutingKey = 'package.created';
      expect(key).toBe('package.created');
    });

    it('EventTypeMap maps routing keys to event types', () => {
      // This is a compile-time check; if it compiles, the map is correct
      const _check: EventTypeMap[typeof EventRoutes.PACKAGE_CREATED] =
        {} as PackageCreatedEvent;
      expect(_check).toBeDefined();
    });

    it('all event payload types are importable', () => {
      // Compile-time validation that all types exist
      const types: (
        | PackageCreatedEvent
        | WorkerStateChangedEvent
        | JobStartedEvent
        | JobCompletedEvent
        | JobStuckEvent
        | JobErrorEvent
        | AssemblyLineCompletedEvent
        | undefined
      )[] = [undefined];
      expect(types).toBeDefined();
    });
  });
});
