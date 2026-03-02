import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListNotificationsQueryDto } from './list-notifications-query.dto';

describe('ListNotificationsQueryDto', () => {
  it('passes with empty query (all optional)', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('defaults page to 1 and limit to 20', () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('passes with valid status filter', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, { status: 'SENT' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid type filter', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {
      type: 'JOB_ERROR',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails with invalid status', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {
      status: 'INVALID',
    });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'status');
    expect(error).toBeDefined();
  });

  it('fails with invalid type', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {
      type: 'INVALID_TYPE',
    });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'type');
    expect(error).toBeDefined();
  });

  it('passes with valid page and limit', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {
      page: 3,
      limit: 50,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
  });

  it('fails when page is less than 1', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, { page: 0 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'page');
    expect(error).toBeDefined();
  });

  it('fails when limit exceeds 100', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, { limit: 101 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'limit');
    expect(error).toBeDefined();
  });

  it('fails when limit is less than 1', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, { limit: 0 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'limit');
    expect(error).toBeDefined();
  });

  it('coerces string page/limit to numbers', () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {
      page: '5',
      limit: '25',
    });
    expect(dto.page).toBe(5);
    expect(dto.limit).toBe(25);
  });

  it('passes with all valid notification types', async () => {
    const types = [
      'PACKAGE_CREATED',
      'PACKAGE_PROCESSED',
      'JOB_ERROR',
      'JOB_STUCK',
      'ASSEMBLY_LINE_COMPLETED',
      'ASSEMBLY_LINE_STEP_COMPLETED',
    ];
    for (const type of types) {
      const dto = plainToInstance(ListNotificationsQueryDto, { type });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('passes with all valid statuses', async () => {
    const statuses = ['PENDING', 'SENT', 'READ'];
    for (const status of statuses) {
      const dto = plainToInstance(ListNotificationsQueryDto, { status });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('passes with all fields provided', async () => {
    const dto = plainToInstance(ListNotificationsQueryDto, {
      status: 'SENT',
      type: 'JOB_ERROR',
      page: 2,
      limit: 10,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
