import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateWorkerPoolDto } from './create-worker-pool.dto';

const validMember = { workerVersionId: '550e8400-e29b-41d4-a716-446655440000' };

describe('CreateWorkerPoolDto', () => {
  it('passes with required name, one member, and maxConcurrency', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: 'My Pool',
      members: [validMember],
      maxConcurrency: 5,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes when member includes optional priority', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: 'My Pool',
      members: [{ workerVersionId: '550e8400-e29b-41d4-a716-446655440000', priority: 2 }],
      maxConcurrency: 3,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with multiple members', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: 'My Pool',
      members: [
        validMember,
        { workerVersionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' },
      ],
      maxConcurrency: 10,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when name is missing', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      members: [validMember],
      maxConcurrency: 5,
    });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
  });

  it('fails when name is empty string', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: '',
      members: [validMember],
      maxConcurrency: 5,
    });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
  });

  it('fails when name exceeds 100 characters', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: 'a'.repeat(101),
      members: [validMember],
      maxConcurrency: 5,
    });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
  });

  it('fails when members is missing', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: 'My Pool',
      maxConcurrency: 5,
    });
    const errors = await validate(dto);
    const membersError = errors.find((e) => e.property === 'members');
    expect(membersError).toBeDefined();
  });

  it('fails when members is empty array', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: 'My Pool',
      members: [],
      maxConcurrency: 5,
    });
    const errors = await validate(dto);
    const membersError = errors.find((e) => e.property === 'members');
    expect(membersError).toBeDefined();
  });

  it('fails when member workerVersionId is not a UUID', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: 'My Pool',
      members: [{ workerVersionId: 'not-a-uuid' }],
      maxConcurrency: 5,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('fails when maxConcurrency is missing', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: 'My Pool',
      members: [validMember],
    });
    const errors = await validate(dto);
    const maxError = errors.find((e) => e.property === 'maxConcurrency');
    expect(maxError).toBeDefined();
  });

  it('fails when maxConcurrency is 0', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: 'My Pool',
      members: [validMember],
      maxConcurrency: 0,
    });
    const errors = await validate(dto);
    const maxError = errors.find((e) => e.property === 'maxConcurrency');
    expect(maxError).toBeDefined();
  });

  it('fails when maxConcurrency is negative', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: 'My Pool',
      members: [validMember],
      maxConcurrency: -1,
    });
    const errors = await validate(dto);
    const maxError = errors.find((e) => e.property === 'maxConcurrency');
    expect(maxError).toBeDefined();
  });

  it('fails when maxConcurrency is not an integer', async () => {
    const dto = plainToInstance(CreateWorkerPoolDto, {
      name: 'My Pool',
      members: [validMember],
      maxConcurrency: 1.5,
    });
    const errors = await validate(dto);
    const maxError = errors.find((e) => e.property === 'maxConcurrency');
    expect(maxError).toBeDefined();
  });
});
