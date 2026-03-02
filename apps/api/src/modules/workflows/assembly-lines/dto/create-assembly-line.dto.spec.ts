import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAssemblyLineDto } from './create-assembly-line.dto';

const validStep = { workerVersionId: '550e8400-e29b-41d4-a716-446655440000' };

describe('CreateAssemblyLineDto', () => {
  it('passes with required name and one step', async () => {
    const dto = plainToInstance(CreateAssemblyLineDto, {
      name: 'My Pipeline',
      steps: [validStep],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with name, description, and multiple steps', async () => {
    const dto = plainToInstance(CreateAssemblyLineDto, {
      name: 'My Pipeline',
      description: 'A test pipeline',
      steps: [
        validStep,
        { workerVersionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' },
      ],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes when step includes configOverrides', async () => {
    const dto = plainToInstance(CreateAssemblyLineDto, {
      name: 'My Pipeline',
      steps: [{ workerVersionId: '550e8400-e29b-41d4-a716-446655440000', configOverrides: { timeout: 30 } }],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when name is missing', async () => {
    const dto = plainToInstance(CreateAssemblyLineDto, { steps: [validStep] });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
  });

  it('fails when name is empty string', async () => {
    const dto = plainToInstance(CreateAssemblyLineDto, { name: '', steps: [validStep] });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
  });

  it('fails when name exceeds 100 characters', async () => {
    const dto = plainToInstance(CreateAssemblyLineDto, {
      name: 'a'.repeat(101),
      steps: [validStep],
    });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
  });

  it('fails when steps is missing', async () => {
    const dto = plainToInstance(CreateAssemblyLineDto, { name: 'My Pipeline' });
    const errors = await validate(dto);
    const stepsError = errors.find((e) => e.property === 'steps');
    expect(stepsError).toBeDefined();
  });

  it('fails when steps is empty array', async () => {
    const dto = plainToInstance(CreateAssemblyLineDto, { name: 'My Pipeline', steps: [] });
    const errors = await validate(dto);
    const stepsError = errors.find((e) => e.property === 'steps');
    expect(stepsError).toBeDefined();
  });

  it('fails when step workerVersionId is not a UUID', async () => {
    const dto = plainToInstance(CreateAssemblyLineDto, {
      name: 'My Pipeline',
      steps: [{ workerVersionId: 'not-a-uuid' }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when description exceeds 500 characters', async () => {
    const dto = plainToInstance(CreateAssemblyLineDto, {
      name: 'My Pipeline',
      description: 'a'.repeat(501),
      steps: [validStep],
    });
    const errors = await validate(dto);
    const descError = errors.find((e) => e.property === 'description');
    expect(descError).toBeDefined();
  });

  it('passes when description is omitted', async () => {
    const dto = plainToInstance(CreateAssemblyLineDto, {
      name: 'My Pipeline',
      steps: [validStep],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
