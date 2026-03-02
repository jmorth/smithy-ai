import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from './config.module';

const validEnv = {
  DATABASE_URL: 'postgresql://smithy:smithy@localhost:5432/smithy',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://smithy:smithy@localhost:5672',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'smithy',
  MINIO_SECRET_KEY: 'smithy_secret',
  MINIO_BUCKET: 'smithy',
};

describe('AppConfigModule', () => {
  let module: TestingModule;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    savedEnv = Object.fromEntries(
      Object.keys(validEnv).map((k) => [k, process.env[k]]),
    );
    Object.assign(process.env, validEnv);

    module = await Test.createTestingModule({
      imports: [AppConfigModule],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should provide ConfigService', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService).toBeDefined();
  });

  it('should expose database.url via ConfigService', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService.get('database.url')).toBe(validEnv.DATABASE_URL);
  });

  it('should expose redis.url via ConfigService', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService.get('redis.url')).toBe(validEnv.REDIS_URL);
  });

  it('should expose rabbitmq.url via ConfigService', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService.get('rabbitmq.url')).toBe(validEnv.RABBITMQ_URL);
  });

  it('should expose minio config via ConfigService', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService.get('minio.endpoint')).toBe(validEnv.MINIO_ENDPOINT);
    expect(configService.get('minio.accessKey')).toBe(validEnv.MINIO_ACCESS_KEY);
    expect(configService.get('minio.secretKey')).toBe(validEnv.MINIO_SECRET_KEY);
    expect(configService.get('minio.bucket')).toBe(validEnv.MINIO_BUCKET);
  });

  it('should expose app defaults via ConfigService', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService.get('app.port')).toBe(3000);
    expect(configService.get('app.nodeEnv')).toBeDefined();
    expect(configService.get('app.corsOrigin')).toBe('http://localhost:5173');
    expect(configService.get('app.retentionDays')).toBe(30);
  });

  it('should throw during compilation when required env vars are missing', async () => {
    const savedUrl = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];

    await expect(
      Test.createTestingModule({
        imports: [AppConfigModule],
      }).compile(),
    ).rejects.toThrow();

    process.env['DATABASE_URL'] = savedUrl;
  });
});
