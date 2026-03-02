import { describe, it, expect } from 'vitest';
import type { JobCompletedEvent, JobFailedEvent, JobStuckEvent } from './job-events';

describe('job event interfaces', () => {
  it('JobCompletedEvent has required fields', () => {
    const event: JobCompletedEvent = {
      packageId: 'pkg-1',
      assemblyLineSlug: 'my-line',
      completedStep: 2,
      jobExecutionId: 'job-1',
    };
    expect(event.packageId).toBe('pkg-1');
    expect(event.assemblyLineSlug).toBe('my-line');
    expect(event.completedStep).toBe(2);
    expect(event.jobExecutionId).toBe('job-1');
  });

  it('JobFailedEvent has required fields', () => {
    const event: JobFailedEvent = {
      packageId: 'pkg-1',
      assemblyLineSlug: 'my-line',
      failedStep: 1,
      jobExecutionId: 'job-1',
      errorMessage: 'timeout',
    };
    expect(event.failedStep).toBe(1);
    expect(event.errorMessage).toBe('timeout');
  });

  it('JobStuckEvent has required fields', () => {
    const event: JobStuckEvent = {
      packageId: 'pkg-1',
      assemblyLineSlug: 'my-line',
      stuckStep: 1,
      jobExecutionId: 'job-1',
    };
    expect(event.stuckStep).toBe(1);
  });

  it('JOB_EVENTS constants are defined', async () => {
    const m = await import('./job-events');
    expect(m.JOB_EVENTS.COMPLETED).toBe('job.completed');
    expect(m.JOB_EVENTS.FAILED).toBe('job.failed');
    expect(m.JOB_EVENTS.STUCK).toBe('job.stuck');
  });

  it('WORKER_QUEUE_PUBLISH constant is defined', async () => {
    const m = await import('./job-events');
    expect(m.WORKER_QUEUE_PUBLISH).toBe('worker.queue.publish');
  });

  it('ASSEMBLY_LINE_EVENTS.COMPLETED constant is defined', async () => {
    const m = await import('./job-events');
    expect(m.ASSEMBLY_LINE_EVENTS.COMPLETED).toBe('assembly-line.completed');
  });
});
