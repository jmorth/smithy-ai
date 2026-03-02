import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PresignFileDto } from './presign-file.dto';

describe('PresignFileDto', () => {
  it('passes with valid filename and contentType', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'document.pdf',
      contentType: 'application/pdf',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with image/jpeg MIME type', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'image.jpg',
      contentType: 'image/jpeg',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with application/vnd.ms-excel MIME type', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'data.xls',
      contentType: 'application/vnd.ms-excel',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when filename is missing', async () => {
    const dto = plainToInstance(PresignFileDto, { contentType: 'image/jpeg' });
    const errors = await validate(dto);
    const filenameError = errors.find((e) => e.property === 'filename');
    expect(filenameError).toBeDefined();
    expect(filenameError!.constraints).toBeDefined();
  });

  it('fails when filename is empty', async () => {
    const dto = plainToInstance(PresignFileDto, { filename: '', contentType: 'image/jpeg' });
    const errors = await validate(dto);
    const filenameError = errors.find((e) => e.property === 'filename');
    expect(filenameError).toBeDefined();
    expect(filenameError!.constraints).toBeDefined();
    expect(Object.values(filenameError!.constraints!).join(' ')).toContain('empty');
  });

  it('fails when filename exceeds 255 characters', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'a'.repeat(256),
      contentType: 'image/jpeg',
    });
    const errors = await validate(dto);
    const filenameError = errors.find((e) => e.property === 'filename');
    expect(filenameError).toBeDefined();
    expect(filenameError!.constraints).toBeDefined();
    expect(Object.values(filenameError!.constraints!).join(' ')).toContain('255');
  });

  it('passes when filename is exactly 255 characters', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'a'.repeat(255),
      contentType: 'image/jpeg',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when contentType is missing', async () => {
    const dto = plainToInstance(PresignFileDto, { filename: 'file.txt' });
    const errors = await validate(dto);
    const contentTypeError = errors.find((e) => e.property === 'contentType');
    expect(contentTypeError).toBeDefined();
    expect(contentTypeError!.constraints).toBeDefined();
  });

  it('fails when contentType does not match MIME pattern', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'file.txt',
      contentType: 'not-a-mime-type',
    });
    const errors = await validate(dto);
    const contentTypeError = errors.find((e) => e.property === 'contentType');
    expect(contentTypeError).toBeDefined();
    expect(contentTypeError!.constraints).toBeDefined();
    expect(Object.values(contentTypeError!.constraints!).join(' ')).toContain('MIME');
  });
});
