import { describe, it, expect } from 'vitest';
import type { AssemblyLine, AssemblyLineStep, WorkerPool, WorkerPoolMember } from './workflow.js';

describe('AssemblyLine interface', () => {
  it('accepts a valid AssemblyLine with required fields', () => {
    const line: AssemblyLine = {
      id: 'al-1',
      name: 'Code Review Pipeline',
      slug: 'code-review-pipeline',
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(line.id).toBe('al-1');
    expect(line.name).toBe('Code Review Pipeline');
    expect(line.slug).toBe('code-review-pipeline');
    expect(line.status).toBe('active');
  });

  it('accepts an AssemblyLine with optional description', () => {
    const line: AssemblyLine = {
      id: 'al-2',
      name: 'Full Development Pipeline',
      slug: 'full-dev-pipeline',
      description: 'Spec to PR in one shot',
      status: 'paused',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(line.description).toBe('Spec to PR in one shot');
    expect(line.status).toBe('paused');
  });
});

describe('AssemblyLineStep interface', () => {
  it('accepts a valid AssemblyLineStep with required fields', () => {
    const step: AssemblyLineStep = {
      id: 'step-1',
      assemblyLineId: 'al-1',
      stepNumber: 1,
      workerVersionId: 'wv-1',
    };
    expect(step.id).toBe('step-1');
    expect(step.assemblyLineId).toBe('al-1');
    expect(step.stepNumber).toBe(1);
    expect(step.workerVersionId).toBe('wv-1');
  });

  it('accepts an AssemblyLineStep with optional configOverrides', () => {
    const step: AssemblyLineStep = {
      id: 'step-2',
      assemblyLineId: 'al-1',
      stepNumber: 2,
      workerVersionId: 'wv-2',
      configOverrides: { timeout: 600, model: 'claude-opus-4-6' },
    };
    expect(step.configOverrides).toEqual({ timeout: 600, model: 'claude-opus-4-6' });
  });

  it('stepNumber is numeric', () => {
    const step: AssemblyLineStep = {
      id: 'step-3',
      assemblyLineId: 'al-1',
      stepNumber: 5,
      workerVersionId: 'wv-3',
    };
    expect(typeof step.stepNumber).toBe('number');
  });
});

describe('WorkerPool interface', () => {
  it('accepts a valid WorkerPool with required fields', () => {
    const pool: WorkerPool = {
      id: 'pool-1',
      name: 'High Priority Workers',
      slug: 'high-priority',
      status: 'active',
      maxConcurrency: 10,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(pool.id).toBe('pool-1');
    expect(pool.name).toBe('High Priority Workers');
    expect(pool.slug).toBe('high-priority');
    expect(pool.maxConcurrency).toBe(10);
  });

  it('accepts a WorkerPool with optional description', () => {
    const pool: WorkerPool = {
      id: 'pool-2',
      name: 'Background Workers',
      slug: 'background',
      description: 'Low-priority background processing pool',
      status: 'active',
      maxConcurrency: 50,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(pool.description).toBe('Low-priority background processing pool');
  });

  it('maxConcurrency is numeric', () => {
    const pool: WorkerPool = {
      id: 'pool-3',
      name: 'Test Pool',
      slug: 'test-pool',
      status: 'paused',
      maxConcurrency: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(typeof pool.maxConcurrency).toBe('number');
  });
});

describe('WorkerPoolMember interface', () => {
  it('accepts a valid WorkerPoolMember with all fields', () => {
    const member: WorkerPoolMember = {
      id: 'member-1',
      poolId: 'pool-1',
      workerVersionId: 'wv-1',
      priority: 1,
    };
    expect(member.id).toBe('member-1');
    expect(member.poolId).toBe('pool-1');
    expect(member.workerVersionId).toBe('wv-1');
    expect(member.priority).toBe(1);
  });

  it('priority is numeric', () => {
    const member: WorkerPoolMember = {
      id: 'member-2',
      poolId: 'pool-1',
      workerVersionId: 'wv-2',
      priority: 100,
    };
    expect(typeof member.priority).toBe('number');
  });
});
