import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConfirmFileDto } from './confirm-file.dto';

describe('ConfirmFileDto', () => {
  const validPayload = {
    fileKey: 'packages/abc123/document.pdf',
    filename: 'document.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
  };

  it('passes with all valid fields', async () => {
    const dto = plainToInstance(ConfirmFileDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when fileKey is missing', async () => {
    const { fileKey: _, ...rest } = validPayload;
    const dto = plainToInstance(ConfirmFileDto, rest);
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'fileKey');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
  });

  it('fails when fileKey is empty string', async () => {
    const dto = plainToInstance(ConfirmFileDto, { ...validPayload, fileKey: '' });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'fileKey');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
    expect(Object.values(error!.constraints!).join(' ')).toContain('empty');
  });

  it('fails when filename is missing', async () => {
    const { filename: _, ...rest } = validPayload;
    const dto = plainToInstance(ConfirmFileDto, rest);
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'filename');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
  });

  it('fails when filename is empty string', async () => {
    const dto = plainToInstance(ConfirmFileDto, { ...validPayload, filename: '' });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'filename');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
    expect(Object.values(error!.constraints!).join(' ')).toContain('empty');
  });

  it('fails when mimeType is missing', async () => {
    const { mimeType: _, ...rest } = validPayload;
    const dto = plainToInstance(ConfirmFileDto, rest);
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'mimeType');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
  });

  it('fails when mimeType is empty string', async () => {
    const dto = plainToInstance(ConfirmFileDto, { ...validPayload, mimeType: '' });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'mimeType');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
    expect(Object.values(error!.constraints!).join(' ')).toContain('empty');
  });

  it('fails when sizeBytes is missing', async () => {
    const { sizeBytes: _, ...rest } = validPayload;
    const dto = plainToInstance(ConfirmFileDto, rest);
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'sizeBytes');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
  });

  it('fails when sizeBytes is zero', async () => {
    const dto = plainToInstance(ConfirmFileDto, { ...validPayload, sizeBytes: 0 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'sizeBytes');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
    expect(Object.values(error!.constraints!).join(' ')).toContain('positive');
  });

  it('fails when sizeBytes is negative', async () => {
    const dto = plainToInstance(ConfirmFileDto, { ...validPayload, sizeBytes: -1 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'sizeBytes');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
    expect(Object.values(error!.constraints!).join(' ')).toContain('positive');
  });

  it('fails when sizeBytes is a float', async () => {
    const dto = plainToInstance(ConfirmFileDto, { ...validPayload, sizeBytes: 1.5 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'sizeBytes');
    expect(error).toBeDefined();
    expect(error!.constraints).toBeDefined();
    expect(Object.values(error!.constraints!).join(' ')).toContain('integer');
  });
});
