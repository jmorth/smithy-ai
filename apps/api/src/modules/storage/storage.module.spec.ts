import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';

const { mockSend, mockCreateBucketCommand } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({}),
  mockCreateBucketCommand: vi.fn().mockImplementation((input: unknown) => ({ _type: 'CreateBucketCommand', input })),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  CreateBucketCommand: mockCreateBucketCommand,
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'PutObjectCommand', input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'GetObjectCommand', input })),
  DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'DeleteObjectCommand', input })),
  DeleteObjectsCommand: vi.fn().mockImplementation((input) => ({ _type: 'DeleteObjectsCommand', input })),
  ListObjectsV2Command: vi.fn().mockImplementation((input) => ({ _type: 'ListObjectsV2Command', input })),
  HeadObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'HeadObjectCommand', input })),
}));

const mockConfigService = {
  get: vi.fn((key: string) => {
    const config: Record<string, string> = {
      'minio.endpoint': 'http://localhost:9000',
      'minio.accessKey': 'minioadmin',
      'minio.secretKey': 'minioadmin',
      'minio.bucket': 'smithy',
    };
    return config[key];
  }),
};

describe('StorageModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    vi.clearAllMocks();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({})] }),
        StorageModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    await module.init();
  });

  afterEach(async () => {
    await module.close();
  });

  it('is defined', () => {
    expect(module).toBeDefined();
  });

  it('provides StorageService', () => {
    const service = module.get(StorageService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(StorageService);
  });

  it('is decorated with @Global()', async () => {
    const { StorageModule: SM } = await import('./storage.module');
    const metadata = Reflect.getMetadata('__module:global__', SM);
    expect(metadata).toBe(true);
  });

  it('calls CreateBucketCommand on init (ensures bucket exists)', () => {
    expect(mockCreateBucketCommand).toHaveBeenCalledWith({ Bucket: 'smithy' });
  });

  it('exports StorageService so other modules can inject it', async () => {
    const { Injectable, Inject, Module: NestModule } = await import('@nestjs/common');

    @Injectable()
    class ConsumerService {
      constructor(@Inject(StorageService) readonly storage: StorageService) {}
    }

    @NestModule({ imports: [StorageModule], providers: [ConsumerService] })
    class ConsumerModule {}

    const consumerModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => ({})] }),
        ConsumerModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    await consumerModule.init();

    const consumer = consumerModule.get(ConsumerService);
    expect(consumer.storage).toBeInstanceOf(StorageService);
    await consumerModule.close();
  });
});
