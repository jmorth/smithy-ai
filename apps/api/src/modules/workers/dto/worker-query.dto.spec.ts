import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { WorkerQueryDto } from './worker-query.dto';

describe('WorkerQueryDto', () => {
  it('passes with no filters (all optional)', async () => {
    const dto = plainToInstance(WorkerQueryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with name filter', async () => {
    const dto = plainToInstance(WorkerQueryDto, { name: 'my-worker' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with status filter', async () => {
    const dto = plainToInstance(WorkerQueryDto, { status: 'active' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with both name and status', async () => {
    const dto = plainToInstance(WorkerQueryDto, { name: 'test', status: 'active' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when name is not a string', async () => {
    const dto = plainToInstance(WorkerQueryDto, { name: 42 });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.constraints).toBeDefined();
  });

  it('fails when status is not a string', async () => {
    const dto = plainToInstance(WorkerQueryDto, { status: 99 });
    const errors = await validate(dto);
    const statusError = errors.find((e) => e.property === 'status');
    expect(statusError).toBeDefined();
    expect(statusError!.constraints).toBeDefined();
  });

  it('passes with partial name (for partial match use case)', async () => {
    const dto = plainToInstance(WorkerQueryDto, { name: 'part' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
