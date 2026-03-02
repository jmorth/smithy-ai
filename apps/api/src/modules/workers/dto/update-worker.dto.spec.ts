import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateWorkerDto } from './update-worker.dto';

describe('UpdateWorkerDto', () => {
  it('passes with empty body (all fields optional)', async () => {
    const dto = plainToInstance(UpdateWorkerDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid name', async () => {
    const dto = plainToInstance(UpdateWorkerDto, { name: 'Updated Worker' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid description', async () => {
    const dto = plainToInstance(UpdateWorkerDto, { description: 'Updated description' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with both name and description', async () => {
    const dto = plainToInstance(UpdateWorkerDto, {
      name: 'Updated Worker',
      description: 'Updated description',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with name containing alphanumeric, spaces, hyphens, underscores', async () => {
    const dto = plainToInstance(UpdateWorkerDto, { name: 'Worker-2 new_v2' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when name is empty string', async () => {
    const dto = plainToInstance(UpdateWorkerDto, { name: '' });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });

  it('fails when name exceeds 100 characters', async () => {
    const dto = plainToInstance(UpdateWorkerDto, { name: 'a'.repeat(101) });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });

  it('passes when name is exactly 100 characters', async () => {
    const dto = plainToInstance(UpdateWorkerDto, { name: 'a'.repeat(100) });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when name contains invalid characters', async () => {
    const dto = plainToInstance(UpdateWorkerDto, { name: 'bad@name' });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });

  it('fails when description exceeds 500 characters', async () => {
    const dto = plainToInstance(UpdateWorkerDto, { description: 'a'.repeat(501) });
    const errors = await validate(dto);
    const descError = errors.find((e) => e.property === 'description');
    expect(descError).toBeDefined();
    expect(descError!.constraints).toBeDefined();
  });

  it('passes when description is exactly 500 characters', async () => {
    const dto = plainToInstance(UpdateWorkerDto, { description: 'a'.repeat(500) });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('does not declare a slug field on the class', () => {
    const dto = new UpdateWorkerDto();
    expect('slug' in dto).toBe(false);
  });
});
