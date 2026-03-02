import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { IsString, IsNumber, IsNotEmpty, ValidateNested, IsEmail, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { globalValidationPipe } from './validation.pipe';

// ── Test DTOs ──────────────────────────────────────────────────────────────────

class AddressDto {
  @IsString()
  @IsNotEmpty()
  street!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;
}

class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsNumber()
  age!: number;

  @IsOptional()
  @IsString()
  bio?: string;
}

// DTO for testing enableImplicitConversion — uses @Type() for esbuild compatibility
class QueryParamDto {
  @Type(() => Number)
  @IsNumber()
  page!: number;
}

class CreateUserWithAddressDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function validate<T extends object>(
  metatype: new () => T,
  value: Record<string, unknown>,
): Promise<T> {
  return globalValidationPipe.transform(value, {
    type: 'body',
    metatype,
  }) as Promise<T>;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('globalValidationPipe', () => {
  it('is an instance of ValidationPipe', () => {
    expect(globalValidationPipe).toBeInstanceOf(ValidationPipe);
  });

  describe('whitelist — strips unknown properties', () => {
    it('rejects unknown properties because forbidNonWhitelisted is also active', async () => {
      // whitelist:true determines which properties are "known" (decorated ones).
      // forbidNonWhitelisted:true means any non-whitelisted property throws 400
      // rather than being silently stripped. Both options work together.
      await expect(
        validate(CreateUserDto, {
          name: 'Alice',
          email: 'alice@example.com',
          age: 30,
          unknownField: 'not in whitelist',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps decorated properties intact', async () => {
      const result = await validate(CreateUserDto, {
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
      });

      expect(result.name).toBe('Alice');
      expect(result.email).toBe('alice@example.com');
      expect(result.age).toBe(30);
    });
  });

  describe('forbidNonWhitelisted — rejects unknown properties', () => {
    it('throws BadRequestException when unknown properties are present', async () => {
      await expect(
        validate(CreateUserDto, {
          name: 'Bob',
          email: 'bob@example.com',
          age: 25,
          hackField: 'injected',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('includes property name in error message', async () => {
      let error: BadRequestException | undefined;
      try {
        await validate(CreateUserDto, {
          name: 'Bob',
          email: 'bob@example.com',
          age: 25,
          hackField: 'injected',
        });
      } catch (e) {
        error = e as BadRequestException;
      }

      const response = error!.getResponse() as { message: string[] };
      const messages = response.message;
      const joined = Array.isArray(messages) ? messages.join(' ') : String(messages);
      expect(joined).toContain('hackField');
    });
  });

  describe('transform — converts plain objects to DTO instances', () => {
    it('returns an instance of the metatype class', async () => {
      const result = await validate(CreateUserDto, {
        name: 'Carol',
        email: 'carol@example.com',
        age: 22,
      });

      expect(result).toBeInstanceOf(CreateUserDto);
    });
  });

  describe('transformOptions.enableImplicitConversion — coerces primitive types', () => {
    it('converts string to number when @Type(() => Number) is declared', async () => {
      // enableImplicitConversion:true + class-transformer @Type() converts the
      // string "10" to the number 10. This reflects the behaviour relied upon
      // for query-param DTOs where params always arrive as strings.
      const result = await validate(QueryParamDto, { page: '10' });

      expect(result.page).toBe(10);
      expect(typeof result.page).toBe('number');
    });
  });

  describe('validation errors — 400 with human-readable messages', () => {
    it('throws BadRequestException when required field is missing', async () => {
      await expect(
        validate(CreateUserDto, { email: 'x@x.com', age: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns array of validation messages on failure', async () => {
      let error: BadRequestException | undefined;
      try {
        await validate(CreateUserDto, { name: '', email: 'not-an-email', age: 1 });
      } catch (e) {
        error = e as BadRequestException;
      }

      const response = error!.getResponse() as { message: string[] };
      expect(Array.isArray(response.message)).toBe(true);
      expect(response.message.length).toBeGreaterThan(0);
    });

    it('includes property name in the error message', async () => {
      let error: BadRequestException | undefined;
      try {
        await validate(CreateUserDto, {
          name: 'Valid',
          email: 'invalid-email',
          age: 1,
        });
      } catch (e) {
        error = e as BadRequestException;
      }

      const response = error!.getResponse() as { message: string[] };
      const messages = response.message;
      const joined = messages.join(' ');
      expect(joined).toContain('email');
    });

    it('includes constraint description in the error message', async () => {
      let error: BadRequestException | undefined;
      try {
        await validate(CreateUserDto, {
          name: 'Valid',
          email: 'invalid-email',
          age: 1,
        });
      } catch (e) {
        error = e as BadRequestException;
      }

      const response = error!.getResponse() as { message: string[] };
      const messages = response.message;
      // message should be a human-readable string, not just a key
      expect(messages.every((m) => m.length > 0)).toBe(true);
    });
  });

  describe('nested object validation', () => {
    it('validates nested DTO classes with @ValidateNested() and @Type()', async () => {
      await expect(
        validate(CreateUserWithAddressDto, {
          name: 'Eve',
          address: { street: '', city: 'NYC' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('passes when nested DTO is valid', async () => {
      const result = await validate(CreateUserWithAddressDto, {
        name: 'Eve',
        address: { street: '123 Main St', city: 'NYC' },
      });

      expect(result).toBeInstanceOf(CreateUserWithAddressDto);
      expect(result.address).toBeInstanceOf(AddressDto);
      expect(result.address.city).toBe('NYC');
    });

    it('includes nested property path in validation error', async () => {
      let error: BadRequestException | undefined;
      try {
        await validate(CreateUserWithAddressDto, {
          name: 'Eve',
          address: { street: '', city: 'NYC' },
        });
      } catch (e) {
        error = e as BadRequestException;
      }

      const response = error!.getResponse() as { message: string[] };
      const joined = response.message.join(' ');
      expect(joined).toContain('address');
    });
  });

  describe('optional fields', () => {
    it('accepts absent optional fields without error', async () => {
      const result = await validate(CreateUserDto, {
        name: 'Frank',
        email: 'frank@example.com',
        age: 40,
      });

      expect(result.bio).toBeUndefined();
    });

    it('accepts present optional fields when valid', async () => {
      const result = await validate(CreateUserDto, {
        name: 'Frank',
        email: 'frank@example.com',
        age: 40,
        bio: 'Software engineer',
      });

      expect(result.bio).toBe('Software engineer');
    });
  });
});
