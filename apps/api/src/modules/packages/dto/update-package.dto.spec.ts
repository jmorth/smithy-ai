import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdatePackageDto } from './update-package.dto';
import { PackageStatus } from '@smithy/shared';

describe('UpdatePackageDto', () => {
  it('passes with empty body (all fields optional)', async () => {
    const dto = plainToInstance(UpdatePackageDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid type', async () => {
    const dto = plainToInstance(UpdatePackageDto, { type: 'document' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid status', async () => {
    const dto = plainToInstance(UpdatePackageDto, { status: PackageStatus.COMPLETED });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when status is not a valid PackageStatus', async () => {
    const dto = plainToInstance(UpdatePackageDto, { status: 'INVALID_STATUS' });
    const errors = await validate(dto);
    const statusError = errors.find((e) => e.property === 'status');
    expect(statusError).toBeDefined();
    expect(statusError!.constraints).toBeDefined();
    expect(Object.values(statusError!.constraints!).join(' ')).toContain('PackageStatus');
  });

  it('passes with all valid fields', async () => {
    const dto = plainToInstance(UpdatePackageDto, {
      type: 'image',
      metadata: { processed: true },
      status: PackageStatus.PROCESSING,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when metadata is not an object', async () => {
    const dto = plainToInstance(UpdatePackageDto, { metadata: 42 });
    const errors = await validate(dto);
    const metaError = errors.find((e) => e.property === 'metadata');
    expect(metaError).toBeDefined();
    expect(metaError!.constraints).toBeDefined();
    expect(Object.values(metaError!.constraints!).join(' ')).toContain('object');
  });

  it('fails when type is empty string', async () => {
    const dto = plainToInstance(UpdatePackageDto, { type: '' });
    const errors = await validate(dto);
    const typeError = errors.find((e) => e.property === 'type');
    expect(typeError).toBeDefined();
    expect(typeError!.constraints).toBeDefined();
  });

  it('passes when only status is provided', async () => {
    const dto = plainToInstance(UpdatePackageDto, { status: PackageStatus.PENDING });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes when only metadata is provided', async () => {
    const dto = plainToInstance(UpdatePackageDto, { metadata: { count: 5 } });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
