import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ParseSlugPipe } from './parse-slug.pipe';

describe('ParseSlugPipe', () => {
  const pipe = new ParseSlugPipe();

  describe('valid slugs', () => {
    it('passes a simple lowercase slug', () => {
      expect(pipe.transform('my-worker')).toBe('my-worker');
    });

    it('passes a single word slug', () => {
      expect(pipe.transform('worker')).toBe('worker');
    });

    it('passes a slug with numbers', () => {
      expect(pipe.transform('worker-v2')).toBe('worker-v2');
    });

    it('passes a slug with multiple segments', () => {
      expect(pipe.transform('my-cool-worker-123')).toBe('my-cool-worker-123');
    });

    it('passes a numeric-only slug', () => {
      expect(pipe.transform('123')).toBe('123');
    });
  });

  describe('invalid slugs', () => {
    it('throws BadRequestException for empty string', () => {
      expect(() => pipe.transform('')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for uppercase letters', () => {
      expect(() => pipe.transform('My-Worker')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for slug with trailing hyphen', () => {
      expect(() => pipe.transform('my-worker-')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for slug with leading hyphen', () => {
      expect(() => pipe.transform('-my-worker')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for slug with double hyphens', () => {
      expect(() => pipe.transform('my--worker')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for slug with spaces', () => {
      expect(() => pipe.transform('my worker')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for slug with underscores', () => {
      expect(() => pipe.transform('my_worker')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for slug with special characters', () => {
      expect(() => pipe.transform('my@worker')).toThrow(BadRequestException);
    });

    it('includes the invalid slug in the error message', () => {
      try {
        pipe.transform('INVALID');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).message).toContain('INVALID');
      }
    });
  });
});
