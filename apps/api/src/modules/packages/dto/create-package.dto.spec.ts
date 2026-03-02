import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePackageDto } from './create-package.dto';

describe('CreatePackageDto', () => {
  it('passes with required type only', async () => {
    const dto = plainToInstance(CreatePackageDto, { type: 'document' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with all optional fields', async () => {
    const dto = plainToInstance(CreatePackageDto, {
      type: 'document',
      metadata: { key: 'value' },
      assemblyLineId: '123e4567-e89b-12d3-a456-426614174000',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when type is empty string', async () => {
    const dto = plainToInstance(CreatePackageDto, { type: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('type');
    expect(errors[0].constraints).toBeDefined();
  });

  it('fails when type is missing', async () => {
    const dto = plainToInstance(CreatePackageDto, {});
    const errors = await validate(dto);
    const typeError = errors.find((e) => e.property === 'type');
    expect(typeError).toBeDefined();
    expect(typeError!.constraints).toBeDefined();
  });

  it('fails when assemblyLineId is not a valid UUID', async () => {
    const dto = plainToInstance(CreatePackageDto, { type: 'doc', assemblyLineId: 'not-a-uuid' });
    const errors = await validate(dto);
    const uuidError = errors.find((e) => e.property === 'assemblyLineId');
    expect(uuidError).toBeDefined();
    expect(uuidError!.constraints).toBeDefined();
    expect(Object.values(uuidError!.constraints!).join(' ')).toContain('UUID');
  });

  it('fails when metadata is not an object', async () => {
    const dto = plainToInstance(CreatePackageDto, { type: 'doc', metadata: 'string' });
    const errors = await validate(dto);
    const metaError = errors.find((e) => e.property === 'metadata');
    expect(metaError).toBeDefined();
    expect(metaError!.constraints).toBeDefined();
    expect(Object.values(metaError!.constraints!).join(' ')).toContain('object');
  });

  it('passes when metadata is omitted but assemblyLineId is present', async () => {
    const dto = plainToInstance(CreatePackageDto, {
      type: 'doc',
      assemblyLineId: '123e4567-e89b-12d3-a456-426614174000',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes when assemblyLineId is omitted but metadata is present', async () => {
    const dto = plainToInstance(CreatePackageDto, {
      type: 'doc',
      metadata: { foo: 'bar' },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
