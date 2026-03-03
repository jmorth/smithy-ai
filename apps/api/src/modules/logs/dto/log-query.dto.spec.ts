import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LogQueryDto } from './log-query.dto';

function toDto(plain: Record<string, unknown>): LogQueryDto {
  return plainToInstance(LogQueryDto, plain);
}

describe('LogQueryDto', () => {
  it('accepts empty query with defaults', async () => {
    const dto = toDto({});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(100);
  });

  it('accepts valid level "debug"', async () => {
    const dto = toDto({ level: 'debug' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts valid level "info"', async () => {
    const dto = toDto({ level: 'info' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts valid level "warn"', async () => {
    const dto = toDto({ level: 'warn' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts valid level "error"', async () => {
    const dto = toDto({ level: 'error' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid level', async () => {
    const dto = toDto({ level: 'critical' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.constraints).toHaveProperty('isIn');
  });

  it('accepts valid ISO date for after', async () => {
    const dto = toDto({ after: '2024-01-01T00:00:00Z' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts ISO date with milliseconds for after', async () => {
    const dto = toDto({ after: '2024-01-01T00:00:00.000Z' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid date format for after', async () => {
    const dto = toDto({ after: '2024-01-01' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.constraints).toHaveProperty('matches');
  });

  it('rejects non-UTC date for after', async () => {
    const dto = toDto({ after: '2024-01-01T00:00:00+05:00' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
  });

  it('accepts valid ISO date for before', async () => {
    const dto = toDto({ before: '2024-12-31T23:59:59Z' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid date format for before', async () => {
    const dto = toDto({ before: 'not-a-date' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
  });

  it('accepts valid page number', async () => {
    const dto = toDto({ page: '3' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(3);
  });

  it('rejects page less than 1', async () => {
    const dto = toDto({ page: '0' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.constraints).toHaveProperty('min');
  });

  it('rejects non-integer page', async () => {
    const dto = toDto({ page: '1.5' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
  });

  it('accepts valid limit', async () => {
    const dto = toDto({ limit: '50' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(50);
  });

  it('rejects limit less than 1', async () => {
    const dto = toDto({ limit: '0' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.constraints).toHaveProperty('min');
  });

  it('rejects limit greater than 100', async () => {
    const dto = toDto({ limit: '101' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.constraints).toHaveProperty('max');
  });

  it('accepts all parameters together', async () => {
    const dto = toDto({
      level: 'warn',
      after: '2024-01-01T00:00:00Z',
      before: '2024-12-31T23:59:59Z',
      page: '2',
      limit: '50',
    });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.level).toBe('warn');
    expect(dto.after).toBe('2024-01-01T00:00:00Z');
    expect(dto.before).toBe('2024-12-31T23:59:59Z');
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });
});
