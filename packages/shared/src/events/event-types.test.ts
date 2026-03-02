import { describe, it, expect } from 'vitest';
import type {
  SmithyEvent,
  PackageCreatedEvent,
  PackageProcessedEvent,
  WorkerStateChangedEvent,
  JobStartedEvent,
  JobCompletedEvent,
  JobStuckEvent,
  JobErrorEvent,
  AssemblyLineCompletedEvent,
  AssemblyLineStepCompletedEvent,
  EventTypeMap,
} from './event-types.js';
import { RoutingKeys } from './routing-keys.js';
import { WorkerState } from '../constants/enums.js';

// Helper that asserts a value satisfies a type at compile time only
function assertType<T>(_value: T): void {}

describe('SmithyEvent envelope', () => {
  it('can be constructed with required fields', () => {
    const event: SmithyEvent<{ foo: string }> = {
      eventType: 'test.event',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      payload: { foo: 'bar' },
    };
    expect(event.eventType).toBe('test.event');
    expect(event.timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(event.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(event.payload).toEqual({ foo: 'bar' });
  });

  it('defaults payload to unknown when no generic provided', () => {
    const event: SmithyEvent = {
      eventType: 'test.event',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      payload: 42,
    };
    expect(event.payload).toBe(42);
  });
});

describe('PackageCreatedEvent', () => {
  it('can be constructed with all required fields', () => {
    const event: PackageCreatedEvent = {
      eventType: 'package.created',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-1',
      payload: {
        packageId: 'pkg-1',
        type: 'image/jpeg',
        metadata: { size: 1024 },
      },
    };
    expect(event.payload.packageId).toBe('pkg-1');
    expect(event.payload.type).toBe('image/jpeg');
    expect(event.payload.metadata).toEqual({ size: 1024 });
    expect(event.payload.createdBy).toBeUndefined();
  });

  it('accepts optional createdBy field', () => {
    const event: PackageCreatedEvent = {
      eventType: 'package.created',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-1',
      payload: {
        packageId: 'pkg-1',
        type: 'image/jpeg',
        metadata: {},
        createdBy: 'user-42',
      },
    };
    expect(event.payload.createdBy).toBe('user-42');
  });
});

describe('WorkerStateChangedEvent', () => {
  it('can be constructed with all required fields', () => {
    const event: WorkerStateChangedEvent = {
      eventType: 'job.state.changed',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-2',
      payload: {
        jobExecutionId: 'exec-1',
        workerId: 'worker-1',
        workerVersionId: 'wv-1',
        previousState: WorkerState.WAITING,
        newState: WorkerState.WORKING,
        packageId: 'pkg-1',
      },
    };
    expect(event.payload.previousState).toBe(WorkerState.WAITING);
    expect(event.payload.newState).toBe(WorkerState.WORKING);
    expect(event.payload.packageId).toBe('pkg-1');
  });
});

describe('JobStartedEvent', () => {
  it('can be constructed with required fields', () => {
    const event: JobStartedEvent = {
      eventType: 'job.started',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-3',
      payload: {
        jobExecutionId: 'exec-1',
        packageId: 'pkg-1',
        workerVersionId: 'wv-1',
      },
    };
    expect(event.payload.jobExecutionId).toBe('exec-1');
    expect(event.payload.containerId).toBeUndefined();
  });

  it('accepts optional containerId field', () => {
    const event: JobStartedEvent = {
      eventType: 'job.started',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-3',
      payload: {
        jobExecutionId: 'exec-1',
        packageId: 'pkg-1',
        workerVersionId: 'wv-1',
        containerId: 'container-abc',
      },
    };
    expect(event.payload.containerId).toBe('container-abc');
  });
});

describe('JobCompletedEvent', () => {
  it('can be constructed with required fields', () => {
    const event: JobCompletedEvent = {
      eventType: 'job.completed',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-4',
      payload: {
        jobExecutionId: 'exec-1',
        packageId: 'pkg-1',
        workerVersionId: 'wv-1',
        duration: 1500,
      },
    };
    expect(event.payload.duration).toBe(1500);
    expect(event.payload.outputPackageId).toBeUndefined();
  });

  it('accepts optional outputPackageId field', () => {
    const event: JobCompletedEvent = {
      eventType: 'job.completed',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-4',
      payload: {
        jobExecutionId: 'exec-1',
        packageId: 'pkg-1',
        workerVersionId: 'wv-1',
        duration: 1500,
        outputPackageId: 'pkg-output',
      },
    };
    expect(event.payload.outputPackageId).toBe('pkg-output');
  });
});

describe('JobStuckEvent', () => {
  it('can be constructed with all required fields', () => {
    const event: JobStuckEvent = {
      eventType: 'job.stuck',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-5',
      payload: {
        jobExecutionId: 'exec-1',
        packageId: 'pkg-1',
        workerVersionId: 'wv-1',
        reason: 'heartbeat timeout',
        stuckSince: '2026-01-01T00:05:00.000Z',
      },
    };
    expect(event.payload.reason).toBe('heartbeat timeout');
    expect(event.payload.stuckSince).toBe('2026-01-01T00:05:00.000Z');
  });
});

describe('JobErrorEvent', () => {
  it('can be constructed with all required fields', () => {
    const event: JobErrorEvent = {
      eventType: 'job.error',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-6',
      payload: {
        jobExecutionId: 'exec-1',
        packageId: 'pkg-1',
        workerVersionId: 'wv-1',
        error: { message: 'out of memory' },
        retryCount: 2,
        willRetry: true,
      },
    };
    expect(event.payload.error.message).toBe('out of memory');
    expect(event.payload.retryCount).toBe(2);
    expect(event.payload.willRetry).toBe(true);
    expect(event.payload.error.stack).toBeUndefined();
  });

  it('accepts optional stack trace on error', () => {
    const event: JobErrorEvent = {
      eventType: 'job.error',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-6',
      payload: {
        jobExecutionId: 'exec-1',
        packageId: 'pkg-1',
        workerVersionId: 'wv-1',
        error: { message: 'crash', stack: 'Error: crash\n  at worker.ts:10' },
        retryCount: 0,
        willRetry: false,
      },
    };
    expect(event.payload.error.stack).toBe('Error: crash\n  at worker.ts:10');
  });
});

describe('PackageProcessedEvent', () => {
  it('can be constructed with all required fields', () => {
    const event: PackageProcessedEvent = {
      eventType: 'package.processed',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-8',
      payload: {
        packageId: 'pkg-1',
        type: 'image/jpeg',
        resultSummary: 'Processed 10 items successfully',
      },
    };
    expect(event.payload.packageId).toBe('pkg-1');
    expect(event.payload.resultSummary).toBe('Processed 10 items successfully');
    expect(event.payload.processedBy).toBeUndefined();
  });

  it('accepts optional processedBy field', () => {
    const event: PackageProcessedEvent = {
      eventType: 'package.processed',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-8',
      payload: {
        packageId: 'pkg-1',
        type: 'image/jpeg',
        resultSummary: 'Done',
        processedBy: 'worker-1',
      },
    };
    expect(event.payload.processedBy).toBe('worker-1');
  });
});

describe('AssemblyLineCompletedEvent', () => {
  it('can be constructed with all required fields', () => {
    const event: AssemblyLineCompletedEvent = {
      eventType: 'assembly-line.completed',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-7',
      payload: {
        assemblyLineId: 'al-1',
        packageId: 'pkg-1',
        totalSteps: 5,
        totalDuration: 12000,
      },
    };
    expect(event.payload.assemblyLineId).toBe('al-1');
    expect(event.payload.totalSteps).toBe(5);
    expect(event.payload.totalDuration).toBe(12000);
  });
});

describe('AssemblyLineStepCompletedEvent', () => {
  it('can be constructed with all required fields', () => {
    const event: AssemblyLineStepCompletedEvent = {
      eventType: 'assembly-line.step.completed',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'corr-9',
      payload: {
        assemblyLineId: 'al-1',
        stepIndex: 2,
        stepName: 'lint',
        packageId: 'pkg-1',
        duration: 3500,
      },
    };
    expect(event.payload.assemblyLineId).toBe('al-1');
    expect(event.payload.stepIndex).toBe(2);
    expect(event.payload.stepName).toBe('lint');
    expect(event.payload.duration).toBe(3500);
  });
});

describe('EventTypeMap', () => {
  it('maps PACKAGE_CREATED routing key to PackageCreatedEvent at compile time', () => {
    // Type-level test: verify the map entry is typed correctly
    const event: EventTypeMap[typeof RoutingKeys.PACKAGE_CREATED] = {
      eventType: 'package.created',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'c',
      payload: { packageId: 'p', type: 't', metadata: {} },
    };
    assertType<PackageCreatedEvent>(event);
    expect(event.payload.packageId).toBe('p');
  });

  it('maps JOB_STARTED routing key to JobStartedEvent at compile time', () => {
    const event: EventTypeMap[typeof RoutingKeys.JOB_STARTED] = {
      eventType: 'job.started',
      timestamp: '2026-01-01T00:00:00.000Z',
      correlationId: 'c',
      payload: { jobExecutionId: 'e', packageId: 'p', workerVersionId: 'wv' },
    };
    assertType<JobStartedEvent>(event);
    expect(event.payload.jobExecutionId).toBe('e');
  });
});
