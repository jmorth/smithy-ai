import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AppController } from './app.controller';
import { Logger } from 'nestjs-pino';

const requiredEnv = {
  DATABASE_URL: 'postgresql://smithy:smithy@localhost:5432/smithy',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://smithy:smithy@localhost:5672',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'smithy',
  MINIO_SECRET_KEY: 'smithy_secret',
  MINIO_BUCKET: 'smithy',
};

describe('AppModule', () => {
  let module: TestingModule;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    savedEnv = Object.fromEntries(
      Object.keys(requiredEnv).map((k) => [k, process.env[k]]),
    );
    Object.assign(process.env, requiredEnv);

    module = await Test.createTestingModule({
      imports: [AppModule],
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

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide AppController', () => {
    const controller = module.get<AppController>(AppController);
    expect(controller).toBeDefined();
  });

  it('should provide nestjs-pino Logger', () => {
    const logger = module.get<Logger>(Logger);
    expect(logger).toBeDefined();
  });
});
