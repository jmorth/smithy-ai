import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configuration } from './configuration';

const validEnv = {
  DATABASE_URL: 'postgresql://smithy:smithy@localhost:5432/smithy',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://smithy:smithy@localhost:5672',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'smithy',
  MINIO_SECRET_KEY: 'smithy_secret',
  MINIO_BUCKET: 'smithy',
};

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('configuration()', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      APP_PORT: process.env['APP_PORT'],
      NODE_ENV: process.env['NODE_ENV'],
      CORS_ORIGIN: process.env['CORS_ORIGIN'],
      RETENTION_DAYS: process.env['RETENTION_DAYS'],
      RETENTION_DRY_RUN: process.env['RETENTION_DRY_RUN'],
      DATABASE_URL: process.env['DATABASE_URL'],
      REDIS_URL: process.env['REDIS_URL'],
      RABBITMQ_URL: process.env['RABBITMQ_URL'],
      MINIO_ENDPOINT: process.env['MINIO_ENDPOINT'],
      MINIO_ACCESS_KEY: process.env['MINIO_ACCESS_KEY'],
      MINIO_SECRET_KEY: process.env['MINIO_SECRET_KEY'],
      MINIO_BUCKET: process.env['MINIO_BUCKET'],
      OPENAI_API_KEY: process.env['OPENAI_API_KEY'],
      ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'],
      RESEND_API_KEY: process.env['RESEND_API_KEY'],
    };
    setEnv({ ...savedEnv, ...Object.fromEntries(Object.keys(savedEnv).map((k) => [k, undefined])) });
    setEnv(validEnv);
  });

  afterEach(() => {
    setEnv(savedEnv);
  });

  it('should return a typed config object with defaults', () => {
    const config = configuration();
    expect(config.app.port).toBe(3000);
    expect(config.app.nodeEnv).toBe('development');
    expect(config.app.corsOrigin).toBe('http://localhost:5173');
    expect(config.app.retentionDays).toBe(30);
    expect(config.app.retentionDryRun).toBe(false);
  });

  it('should map database.url from DATABASE_URL', () => {
    const config = configuration();
    expect(config.database.url).toBe(validEnv.DATABASE_URL);
  });

  it('should map redis.url from REDIS_URL', () => {
    const config = configuration();
    expect(config.redis.url).toBe(validEnv.REDIS_URL);
  });

  it('should map rabbitmq.url from RABBITMQ_URL', () => {
    const config = configuration();
    expect(config.rabbitmq.url).toBe(validEnv.RABBITMQ_URL);
  });

  it('should map minio fields from MINIO_* env vars', () => {
    const config = configuration();
    expect(config.minio.endpoint).toBe(validEnv.MINIO_ENDPOINT);
    expect(config.minio.accessKey).toBe(validEnv.MINIO_ACCESS_KEY);
    expect(config.minio.secretKey).toBe(validEnv.MINIO_SECRET_KEY);
    expect(config.minio.bucket).toBe(validEnv.MINIO_BUCKET);
  });

  it('should map optional AI provider keys as undefined when absent', () => {
    const config = configuration();
    expect(config.ai.openaiApiKey).toBeUndefined();
    expect(config.ai.anthropicApiKey).toBeUndefined();
  });

  it('should map OPENAI_API_KEY when present', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    const config = configuration();
    expect(config.ai.openaiApiKey).toBe('sk-test');
    delete process.env['OPENAI_API_KEY'];
  });

  it('should map ANTHROPIC_API_KEY when present', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    const config = configuration();
    expect(config.ai.anthropicApiKey).toBe('sk-ant-test');
    delete process.env['ANTHROPIC_API_KEY'];
  });

  it('should map email.resendApiKey as undefined when absent', () => {
    const config = configuration();
    expect(config.email.resendApiKey).toBeUndefined();
  });

  it('should map RESEND_API_KEY when present', () => {
    process.env['RESEND_API_KEY'] = 're_test';
    const config = configuration();
    expect(config.email.resendApiKey).toBe('re_test');
    delete process.env['RESEND_API_KEY'];
  });

  it('should use custom APP_PORT from environment', () => {
    process.env['APP_PORT'] = '4000';
    const config = configuration();
    expect(config.app.port).toBe(4000);
    delete process.env['APP_PORT'];
  });

  it('should use custom CORS_ORIGIN from environment', () => {
    process.env['CORS_ORIGIN'] = 'http://localhost:3001';
    const config = configuration();
    expect(config.app.corsOrigin).toBe('http://localhost:3001');
    delete process.env['CORS_ORIGIN'];
  });

  it('should use custom NODE_ENV from environment', () => {
    process.env['NODE_ENV'] = 'production';
    const config = configuration();
    expect(config.app.nodeEnv).toBe('production');
    delete process.env['NODE_ENV'];
  });

  it('should use custom RETENTION_DAYS from environment', () => {
    process.env['RETENTION_DAYS'] = '60';
    const config = configuration();
    expect(config.app.retentionDays).toBe(60);
    delete process.env['RETENTION_DAYS'];
  });

  it('should map RETENTION_DRY_RUN true from environment', () => {
    process.env['RETENTION_DRY_RUN'] = 'true';
    const config = configuration();
    expect(config.app.retentionDryRun).toBe(true);
    delete process.env['RETENTION_DRY_RUN'];
  });

  describe('validation failures', () => {
    it('should throw when DATABASE_URL is missing', () => {
      delete process.env['DATABASE_URL'];
      expect(() => configuration()).toThrow('Configuration validation failed');
    });

    it('should throw with a clear human-readable error message', () => {
      delete process.env['REDIS_URL'];
      expect(() => configuration()).toThrow(/REDIS_URL/);
    });

    it('should throw when DATABASE_URL is an invalid URL', () => {
      process.env['DATABASE_URL'] = 'not-a-url';
      expect(() => configuration()).toThrow('Configuration validation failed');
    });

    it('should throw when APP_PORT is non-numeric', () => {
      process.env['APP_PORT'] = 'abc';
      expect(() => configuration()).toThrow('Configuration validation failed');
    });

    it('should throw when NODE_ENV is invalid', () => {
      process.env['NODE_ENV'] = 'staging';
      expect(() => configuration()).toThrow('Configuration validation failed');
    });
  });
});
