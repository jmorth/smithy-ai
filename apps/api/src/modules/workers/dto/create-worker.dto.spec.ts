import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateWorkerDto } from './create-worker.dto';

describe('CreateWorkerDto', () => {
  it('passes with required name only', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: 'My Worker' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with name and description', async () => {
    const dto = plainToInstance(CreateWorkerDto, {
      name: 'My Worker',
      description: 'A great worker',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with name containing hyphens and underscores', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: 'my-cool_worker' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with name containing alphanumeric and spaces', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: 'Worker 2000' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when name is missing', async () => {
    const dto = plainToInstance(CreateWorkerDto, {});
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });

  it('fails when name is empty string', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: '' });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });

  it('fails when name exceeds 100 characters', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: 'a'.repeat(101) });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });

  it('passes when name is exactly 100 characters', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: 'a'.repeat(100) });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when name contains invalid characters like @', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: 'bad@name' });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });

  it('fails when name contains special chars like !', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: 'bad!name' });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });

  it('passes when description is omitted', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: 'Worker' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when description exceeds 500 characters', async () => {
    const dto = plainToInstance(CreateWorkerDto, {
      name: 'Worker',
      description: 'a'.repeat(501),
    });
    const errors = await validate(dto);
    const descError = errors.find((e) => e.property === 'description');
    expect(descError).toBeDefined();
    expect(descError!.constraints).toBeDefined();
  });

  it('passes when description is exactly 500 characters', async () => {
    const dto = plainToInstance(CreateWorkerDto, {
      name: 'Worker',
      description: 'a'.repeat(500),
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when name is not a string', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: 123 });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });

  it('fails when name contains only spaces', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: '   ' });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });

  it('fails when name contains only hyphens', async () => {
    const dto = plainToInstance(CreateWorkerDto, { name: '-' });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });
});
