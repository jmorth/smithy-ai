import { describe, it, expect } from 'vitest';
import { envSchema } from './env.schema';

const validEnv = {
  DATABASE_URL: 'postgresql://smithy:smithy@localhost:5432/smithy',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://smithy:smithy@localhost:5672',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'smithy',
  MINIO_SECRET_KEY: 'smithy_secret',
  MINIO_BUCKET: 'smithy',
};

describe('envSchema', () => {
  describe('required fields', () => {
    it('should parse a fully valid env', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
    });

    it('should fail when DATABASE_URL is missing', () => {
      const { DATABASE_URL: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should fail when REDIS_URL is missing', () => {
      const { REDIS_URL: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should fail when RABBITMQ_URL is missing', () => {
      const { RABBITMQ_URL: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should fail when MINIO_ENDPOINT is missing', () => {
      const { MINIO_ENDPOINT: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should fail when MINIO_ACCESS_KEY is missing', () => {
      const { MINIO_ACCESS_KEY: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should fail when MINIO_SECRET_KEY is missing', () => {
      const { MINIO_SECRET_KEY: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should fail when MINIO_BUCKET is missing', () => {
      const { MINIO_BUCKET: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe('URL validation', () => {
    it('should fail when DATABASE_URL is not a valid URL', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        DATABASE_URL: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should fail when REDIS_URL is not a valid URL', () => {
      const result = envSchema.safeParse({ ...validEnv, REDIS_URL: 'bad' });
      expect(result.success).toBe(false);
    });

    it('should fail when RABBITMQ_URL is not a valid URL', () => {
      const result = envSchema.safeParse({ ...validEnv, RABBITMQ_URL: 'bad' });
      expect(result.success).toBe(false);
    });

    it('should fail when MINIO_ENDPOINT is not a valid URL', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        MINIO_ENDPOINT: 'bad',
      });
      expect(result.success).toBe(false);
    });

    it('should fail when CORS_ORIGIN is not a valid URL', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        CORS_ORIGIN: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('optional fields with defaults', () => {
    it('should default APP_PORT to 3000', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.APP_PORT).toBe(3000);
      }
    });

    it('should default NODE_ENV to development', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('development');
      }
    });

    it('should default CORS_ORIGIN to http://localhost:5173', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CORS_ORIGIN).toBe('http://localhost:5173');
      }
    });

    it('should default RETENTION_DAYS to 30', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.RETENTION_DAYS).toBe(30);
      }
    });

    it('should coerce APP_PORT string to number', () => {
      const result = envSchema.safeParse({ ...validEnv, APP_PORT: '4000' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.APP_PORT).toBe(4000);
      }
    });

    it('should coerce RETENTION_DAYS string to number', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        RETENTION_DAYS: '90',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.RETENTION_DAYS).toBe(90);
      }
    });

    it('should default RETENTION_DRY_RUN to false', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.RETENTION_DRY_RUN).toBe(false);
      }
    });

    it('should coerce RETENTION_DRY_RUN "true" to boolean true', () => {
      const result = envSchema.safeParse({ ...validEnv, RETENTION_DRY_RUN: 'true' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.RETENTION_DRY_RUN).toBe(true);
      }
    });

    it('should coerce RETENTION_DRY_RUN "false" to boolean false', () => {
      const result = envSchema.safeParse({ ...validEnv, RETENTION_DRY_RUN: 'false' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.RETENTION_DRY_RUN).toBe(false);
      }
    });

    it('should fail when RETENTION_DRY_RUN has an invalid value', () => {
      const result = envSchema.safeParse({ ...validEnv, RETENTION_DRY_RUN: 'yes' });
      expect(result.success).toBe(false);
    });

    it('should fail when APP_PORT is non-numeric', () => {
      const result = envSchema.safeParse({ ...validEnv, APP_PORT: 'abc' });
      expect(result.success).toBe(false);
    });

    it('should fail when APP_PORT is zero', () => {
      const result = envSchema.safeParse({ ...validEnv, APP_PORT: '0' });
      expect(result.success).toBe(false);
    });

    it('should fail when APP_PORT is negative', () => {
      const result = envSchema.safeParse({ ...validEnv, APP_PORT: '-1' });
      expect(result.success).toBe(false);
    });

    it('should accept production NODE_ENV', () => {
      const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'production' });
      expect(result.success).toBe(true);
    });

    it('should accept test NODE_ENV', () => {
      const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'test' });
      expect(result.success).toBe(true);
    });

    it('should fail when NODE_ENV has an invalid value', () => {
      const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'staging' });
      expect(result.success).toBe(false);
    });
  });

  describe('AI provider keys (optional)', () => {
    it('should parse successfully without any AI provider keys', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.OPENAI_API_KEY).toBeUndefined();
        expect(result.data.ANTHROPIC_API_KEY).toBeUndefined();
      }
    });

    it('should parse OPENAI_API_KEY when provided', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        OPENAI_API_KEY: 'sk-abc123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.OPENAI_API_KEY).toBe('sk-abc123');
      }
    });

    it('should parse ANTHROPIC_API_KEY when provided', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        ANTHROPIC_API_KEY: 'sk-ant-abc123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ANTHROPIC_API_KEY).toBe('sk-ant-abc123');
      }
    });

    it('should fail when OPENAI_API_KEY is an empty string', () => {
      const result = envSchema.safeParse({ ...validEnv, OPENAI_API_KEY: '' });
      expect(result.success).toBe(false);
    });

    it('should fail when ANTHROPIC_API_KEY is an empty string', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        ANTHROPIC_API_KEY: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('email provider key (optional)', () => {
    it('should parse successfully without RESEND_API_KEY', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.RESEND_API_KEY).toBeUndefined();
      }
    });

    it('should parse RESEND_API_KEY when provided', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        RESEND_API_KEY: 're_abc123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.RESEND_API_KEY).toBe('re_abc123');
      }
    });

    it('should fail when RESEND_API_KEY is an empty string', () => {
      const result = envSchema.safeParse({ ...validEnv, RESEND_API_KEY: '' });
      expect(result.success).toBe(false);
    });
  });
});
