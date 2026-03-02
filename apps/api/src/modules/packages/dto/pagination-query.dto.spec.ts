import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from './pagination-query.dto';
import { PackageStatus } from '@smithy/shared';

describe('PaginationQueryDto', () => {
  it('passes with empty query (all optional)', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('defaults limit to 20 when not provided', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    expect(dto.limit).toBe(20);
  });

  it('passes with valid cursor', async () => {
    const dto = plainToInstance(PaginationQueryDto, { cursor: 'some-cursor-token' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid limit', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: 50 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when limit exceeds 100', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: 101 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'limit');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
    expect(Object.values(error!.constraints!).join(' ')).toContain('100');
  });

  it('fails when limit is less than 1', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: 0 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'limit');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
    expect(Object.values(error!.constraints!).join(' ')).toContain('1');
  });

  it('passes with valid type filter', async () => {
    const dto = plainToInstance(PaginationQueryDto, { type: 'document' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid status filter', async () => {
    const dto = plainToInstance(PaginationQueryDto, { status: PackageStatus.COMPLETED });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when status is not a valid PackageStatus', async () => {
    const dto = plainToInstance(PaginationQueryDto, { status: 'BOGUS' });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'status');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
    expect(Object.values(error!.constraints!).join(' ')).toContain('PackageStatus');
  });

  it('coerces string limit to number and validates', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: '25' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(25);
  });

  it('fails when limit is a non-numeric string', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: 'abc' });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'limit');
    expect(error).toBeDefined();
  });

  it('passes with all fields provided', async () => {
    const dto = plainToInstance(PaginationQueryDto, {
      cursor: 'abc',
      limit: 10,
      type: 'image',
      status: PackageStatus.PROCESSING,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
