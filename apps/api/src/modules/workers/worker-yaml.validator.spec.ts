import { BadRequestException } from '@nestjs/common';
import { describe, it, expect } from 'vitest';
import { validateWorkerYaml, validateWorkerConfig } from './worker-yaml.validator';

const VALID_YAML = `
name: my-worker
inputTypes:
  - text
outputType: text
provider:
  name: anthropic
  model: claude-3-5-sonnet-latest
  apiKeyEnv: ANTHROPIC_API_KEY
`;

describe('validateWorkerYaml', () => {
  it('parses and validates a valid YAML string', () => {
    const result = validateWorkerYaml(VALID_YAML);
    expect(result.name).toBe('my-worker');
    expect(result.inputTypes).toEqual(['text']);
    expect(result.outputType).toBe('text');
    expect(result.provider.name).toBe('anthropic');
    expect(result.provider.model).toBe('claude-3-5-sonnet-latest');
    expect(result.provider.apiKeyEnv).toBe('ANTHROPIC_API_KEY');
  });

  it('applies default timeout of 300', () => {
    const result = validateWorkerYaml(VALID_YAML);
    expect(result.timeout).toBe(300);
  });

  it('applies default retries of 0', () => {
    const result = validateWorkerYaml(VALID_YAML);
    expect(result.retries).toBe(0);
  });

  it('applies default tools of []', () => {
    const result = validateWorkerYaml(VALID_YAML);
    expect(result.tools).toEqual([]);
  });

  it('throws BadRequestException for malformed YAML', () => {
    expect(() => validateWorkerYaml('{ invalid: yaml: here:')).toThrow(BadRequestException);
  });

  it('throws BadRequestException with clear message for malformed YAML', () => {
    expect(() => validateWorkerYaml('{ invalid: yaml: here:')).toThrow(/Invalid YAML syntax/);
  });

  it('throws BadRequestException when name is missing', () => {
    const yaml = `
inputTypes: [text]
outputType: text
provider:
  name: anthropic
  model: claude-3-5-sonnet-latest
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when inputTypes is empty array', () => {
    const yaml = `
name: test
inputTypes: []
outputType: text
provider:
  name: anthropic
  model: claude-3-5-sonnet-latest
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when provider.model is missing', () => {
    const yaml = `
name: test
inputTypes: [text]
outputType: text
provider:
  name: anthropic
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('error message contains field name for missing provider.model', () => {
    const yaml = `
name: test
inputTypes: [text]
outputType: text
provider:
  name: anthropic
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(/provider\.model/);
  });

  it('parses optional systemPrompt', () => {
    const yaml = VALID_YAML + '\nsystemPrompt: You are helpful.';
    const result = validateWorkerYaml(yaml);
    expect(result.systemPrompt).toBe('You are helpful.');
  });

  it('parses custom timeout', () => {
    const yaml = VALID_YAML + '\ntimeout: 600';
    const result = validateWorkerYaml(yaml);
    expect(result.timeout).toBe(600);
  });

  it('parses custom retries', () => {
    const yaml = VALID_YAML + '\nretries: 3';
    const result = validateWorkerYaml(yaml);
    expect(result.retries).toBe(3);
  });

  it('throws BadRequestException when timeout is not a positive integer', () => {
    const yaml = VALID_YAML + '\ntimeout: -5';
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when retries is negative', () => {
    const yaml = VALID_YAML + '\nretries: -1';
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('parses tools array', () => {
    const yaml =
      VALID_YAML +
      `
tools:
  - name: search
    description: Search the web
`;
    const result = validateWorkerYaml(yaml);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]?.name).toBe('search');
  });

  it('parses tool with optional parameters', () => {
    const yaml =
      VALID_YAML +
      `
tools:
  - name: search
    description: Search the web
    parameters:
      query:
        type: string
`;
    const result = validateWorkerYaml(yaml);
    expect(result.tools[0]?.parameters).toEqual({ query: { type: 'string' } });
  });

  it('error message contains field name for missing name', () => {
    const yaml = `
inputTypes: [text]
outputType: text
provider:
  name: anthropic
  model: claude-3-5-sonnet-latest
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(/name/);
  });

  it('throws BadRequestException when outputType is missing', () => {
    const yaml = `
name: test
inputTypes: [text]
provider:
  name: anthropic
  model: claude-3-5-sonnet-latest
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when provider.apiKeyEnv is missing', () => {
    const yaml = `
name: test
inputTypes: [text]
outputType: text
provider:
  name: anthropic
  model: claude-3-5-sonnet-latest
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when provider is missing entirely', () => {
    const yaml = `
name: test
inputTypes: [text]
outputType: text
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

});

describe('validateWorkerConfig', () => {
  it('validates a pre-parsed object', () => {
    const config = {
      name: 'my-worker',
      inputTypes: ['text'],
      outputType: 'text',
      provider: { name: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKeyEnv: 'KEY' },
    };
    const result = validateWorkerConfig(config);
    expect(result.name).toBe('my-worker');
  });

  it('throws BadRequestException for invalid pre-parsed object', () => {
    expect(() => validateWorkerConfig({ name: 'test' })).toThrow(BadRequestException);
  });

  it('throws BadRequestException with field-level errors for invalid object', () => {
    expect(() => validateWorkerConfig({ name: 'test' })).toThrow(/inputTypes/);
  });

  it('applies defaults for optional fields', () => {
    const config = {
      name: 'my-worker',
      inputTypes: ['text'],
      outputType: 'text',
      provider: { name: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKeyEnv: 'KEY' },
    };
    const result = validateWorkerConfig(config);
    expect(result.timeout).toBe(300);
    expect(result.retries).toBe(0);
    expect(result.tools).toEqual([]);
  });

  it('throws BadRequestException for null input', () => {
    expect(() => validateWorkerConfig(null)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for non-object input', () => {
    expect(() => validateWorkerConfig('a string')).toThrow(BadRequestException);
  });
});
