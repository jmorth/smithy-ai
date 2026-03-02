import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateAssemblyLineDto } from './update-assembly-line.dto';

describe('UpdateAssemblyLineDto', () => {
  it('passes with empty object (all fields optional)', async () => {
    const dto = plainToInstance(UpdateAssemblyLineDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with name only', async () => {
    const dto = plainToInstance(UpdateAssemblyLineDto, { name: 'New Name' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with description only', async () => {
    const dto = plainToInstance(UpdateAssemblyLineDto, { description: 'New description' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with status ACTIVE', async () => {
    const dto = plainToInstance(UpdateAssemblyLineDto, { status: 'ACTIVE' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with status PAUSED', async () => {
    const dto = plainToInstance(UpdateAssemblyLineDto, { status: 'PAUSED' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with status ARCHIVED', async () => {
    const dto = plainToInstance(UpdateAssemblyLineDto, { status: 'ARCHIVED' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when name is empty string', async () => {
    const dto = plainToInstance(UpdateAssemblyLineDto, { name: '' });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
  });

  it('fails when name exceeds 100 characters', async () => {
    const dto = plainToInstance(UpdateAssemblyLineDto, { name: 'a'.repeat(101) });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
  });

  it('fails when description exceeds 500 characters', async () => {
    const dto = plainToInstance(UpdateAssemblyLineDto, { description: 'a'.repeat(501) });
    const errors = await validate(dto);
    const descError = errors.find((e) => e.property === 'description');
    expect(descError).toBeDefined();
  });

  it('fails when status is an invalid value', async () => {
    const dto = plainToInstance(UpdateAssemblyLineDto, { status: 'INVALID' });
    const errors = await validate(dto);
    const statusError = errors.find((e) => e.property === 'status');
    expect(statusError).toBeDefined();
  });
});
