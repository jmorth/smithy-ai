import { describe, it, expect } from 'vitest';
import type { Worker, WorkerVersion, WorkerConfig } from './worker.js';

describe('WorkerConfig interface', () => {
  it('accepts a valid WorkerConfig with all required fields', () => {
    const config: WorkerConfig = {
      name: 'code-reviewer',
      inputTypes: ['CODE'],
      outputType: 'SPECIFICATION',
      provider: {
        name: 'anthropic',
        model: 'claude-sonnet-4-6',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
      },
    };
    expect(config.name).toBe('code-reviewer');
    expect(config.inputTypes).toEqual(['CODE']);
    expect(config.outputType).toBe('SPECIFICATION');
    expect(config.provider.name).toBe('anthropic');
    expect(config.provider.model).toBe('claude-sonnet-4-6');
    expect(config.provider.apiKeyEnv).toBe('ANTHROPIC_API_KEY');
  });

  it('accepts WorkerConfig with optional tools and timeout', () => {
    const config: WorkerConfig = {
      name: 'code-generator',
      inputTypes: ['SPECIFICATION', 'USER_INPUT'],
      outputType: 'CODE',
      provider: {
        name: 'openai',
        model: 'gpt-4o',
        apiKeyEnv: 'OPENAI_API_KEY',
      },
      tools: ['bash', 'file_write'],
      timeout: 300,
    };
    expect(config.tools).toEqual(['bash', 'file_write']);
    expect(config.timeout).toBe(300);
  });

  it('inputTypes is an array of strings', () => {
    const config: WorkerConfig = {
      name: 'multi-input-worker',
      inputTypes: ['CODE', 'IMAGE', 'USER_INPUT'],
      outputType: 'SPECIFICATION',
      provider: { name: 'anthropic', model: 'claude-opus-4-6', apiKeyEnv: 'ANTHROPIC_API_KEY' },
    };
    expect(Array.isArray(config.inputTypes)).toBe(true);
    expect(config.inputTypes).toHaveLength(3);
  });
});

describe('Worker interface', () => {
  it('accepts a valid Worker with required fields', () => {
    const worker: Worker = {
      id: 'worker-1',
      name: 'Code Reviewer',
      slug: 'code-reviewer',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(worker.id).toBe('worker-1');
    expect(worker.name).toBe('Code Reviewer');
    expect(worker.slug).toBe('code-reviewer');
  });

  it('accepts a Worker with optional description', () => {
    const worker: Worker = {
      id: 'worker-2',
      name: 'PR Creator',
      slug: 'pr-creator',
      description: 'Creates pull requests from generated code',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    expect(worker.description).toBe('Creates pull requests from generated code');
  });
});

describe('WorkerVersion interface', () => {
  const config: WorkerConfig = {
    name: 'code-reviewer',
    inputTypes: ['CODE'],
    outputType: 'SPECIFICATION',
    provider: { name: 'anthropic', model: 'claude-sonnet-4-6', apiKeyEnv: 'ANTHROPIC_API_KEY' },
  };

  it('accepts a valid WorkerVersion with required fields', () => {
    const version: WorkerVersion = {
      id: 'wv-1',
      workerId: 'worker-1',
      version: '1.0.0',
      yamlConfig: config,
      status: 'active',
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(version.id).toBe('wv-1');
    expect(version.workerId).toBe('worker-1');
    expect(version.version).toBe('1.0.0');
    expect(version.status).toBe('active');
  });

  it('accepts a WorkerVersion with optional dockerfileHash', () => {
    const version: WorkerVersion = {
      id: 'wv-2',
      workerId: 'worker-1',
      version: '1.1.0',
      yamlConfig: config,
      dockerfileHash: 'sha256:abc123',
      status: 'draft',
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(version.dockerfileHash).toBe('sha256:abc123');
  });

  it('yamlConfig is a WorkerConfig', () => {
    const version: WorkerVersion = {
      id: 'wv-3',
      workerId: 'worker-1',
      version: '2.0.0',
      yamlConfig: config,
      status: 'deprecated',
      createdAt: '2024-01-01T00:00:00Z',
    };
    expect(version.yamlConfig.name).toBe('code-reviewer');
    expect(version.yamlConfig.provider.name).toBe('anthropic');
  });
});
