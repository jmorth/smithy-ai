import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateWorkerVersionDto } from './create-worker-version.dto';

describe('CreateWorkerVersionDto', () => {
  const validYamlConfig = {
    name: 'my-worker',
    inputTypes: ['text'],
    outputType: 'text',
    provider: { name: 'anthropic', model: 'claude-3', apiKeyEnv: 'CLAUDE_KEY' },
  };

  it('passes with required yamlConfig only', async () => {
    const dto = plainToInstance(CreateWorkerVersionDto, { yamlConfig: validYamlConfig });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with yamlConfig and optional dockerfile', async () => {
    const dto = plainToInstance(CreateWorkerVersionDto, {
      yamlConfig: validYamlConfig,
      dockerfile: 'FROM python:3.11\nRUN pip install anthropic',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes when dockerfile is omitted', async () => {
    const dto = plainToInstance(CreateWorkerVersionDto, { yamlConfig: validYamlConfig });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when yamlConfig is missing', async () => {
    const dto = plainToInstance(CreateWorkerVersionDto, {});
    const errors = await validate(dto);
    const configError = errors.find((e) => e.property === 'yamlConfig');
    expect(configError).toBeDefined();
    expect(configError!.constraints).toBeDefined();
  });

  it('fails when yamlConfig is a string', async () => {
    const dto = plainToInstance(CreateWorkerVersionDto, { yamlConfig: 'not-an-object' });
    const errors = await validate(dto);
    const configError = errors.find((e) => e.property === 'yamlConfig');
    expect(configError).toBeDefined();
    expect(configError!.constraints).toBeDefined();
  });

  it('fails when yamlConfig is a number', async () => {
    const dto = plainToInstance(CreateWorkerVersionDto, { yamlConfig: 42 });
    const errors = await validate(dto);
    const configError = errors.find((e) => e.property === 'yamlConfig');
    expect(configError).toBeDefined();
    expect(configError!.constraints).toBeDefined();
  });

  it('fails when yamlConfig is null', async () => {
    const dto = plainToInstance(CreateWorkerVersionDto, { yamlConfig: null });
    const errors = await validate(dto);
    const configError = errors.find((e) => e.property === 'yamlConfig');
    expect(configError).toBeDefined();
    expect(configError!.constraints).toBeDefined();
  });

  it('fails when dockerfile is not a string', async () => {
    const dto = plainToInstance(CreateWorkerVersionDto, {
      yamlConfig: validYamlConfig,
      dockerfile: 123,
    });
    const errors = await validate(dto);
    const dockerError = errors.find((e) => e.property === 'dockerfile');
    expect(dockerError).toBeDefined();
    expect(dockerError!.constraints).toBeDefined();
  });

  it('passes with an empty object as yamlConfig', async () => {
    const dto = plainToInstance(CreateWorkerVersionDto, { yamlConfig: {} });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with deeply nested yamlConfig', async () => {
    const dto = plainToInstance(CreateWorkerVersionDto, {
      yamlConfig: {
        ...validYamlConfig,
        tools: ['search', 'calculator'],
        timeout: 30000,
      },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
