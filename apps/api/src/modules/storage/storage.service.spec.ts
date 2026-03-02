import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';

// --- S3 command mocks ---
const mockSend = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'PutObjectCommand', input })),
    GetObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'GetObjectCommand', input })),
    DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'DeleteObjectCommand', input })),
    DeleteObjectsCommand: vi.fn().mockImplementation((input) => ({ _type: 'DeleteObjectsCommand', input })),
    ListObjectsV2Command: vi.fn().mockImplementation((input) => ({ _type: 'ListObjectsV2Command', input })),
    CreateBucketCommand: vi.fn().mockImplementation((input) => ({ _type: 'CreateBucketCommand', input })),
    HeadObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'HeadObjectCommand', input })),
  };
});

// --- Module under test ---
import { StorageService } from './storage.service';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

function makeConfigService(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    'minio.endpoint': 'http://localhost:9000',
    'minio.accessKey': 'minioadmin',
    'minio.secretKey': 'minioadmin',
    'minio.bucket': 'smithy',
    ...overrides,
  };
  return { get: vi.fn((key: string) => defaults[key]) };
}

function buildService(configOverrides?: Record<string, string>) {
  const config = makeConfigService(configOverrides);
  return { service: new StorageService(config as any), config };
}

describe('StorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor / S3Client configuration', () => {
    it('creates S3Client with endpoint from config', () => {
      buildService();
      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'http://localhost:9000' }),
      );
    });

    it('creates S3Client with forcePathStyle: true', () => {
      buildService();
      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({ forcePathStyle: true }),
      );
    });

    it('creates S3Client with credentials from config', () => {
      buildService();
      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: {
            accessKeyId: 'minioadmin',
            secretAccessKey: 'minioadmin',
          },
        }),
      );
    });

    it('reads bucket name from config', () => {
      const { config } = buildService();
      expect(config.get).toHaveBeenCalledWith('minio.bucket');
    });
  });

  describe('onModuleInit / ensureBucketExists', () => {
    it('calls CreateBucketCommand on init', async () => {
      mockSend.mockResolvedValueOnce({});
      const { service } = buildService();
      await service.onModuleInit();
      expect(CreateBucketCommand).toHaveBeenCalledWith({ Bucket: 'smithy' });
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('ignores BucketAlreadyOwnedByYou error', async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error('owned'), { name: 'BucketAlreadyOwnedByYou' }));
      const { service } = buildService();
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('ignores BucketAlreadyExists error', async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error('exists'), { name: 'BucketAlreadyExists' }));
      const { service } = buildService();
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('throws InternalServerErrorException for unexpected bucket errors', async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error('network'), { name: 'NetworkError' }));
      const { service } = buildService();
      await expect(service.onModuleInit()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('upload', () => {
    it('sends PutObjectCommand with correct params', async () => {
      mockSend.mockResolvedValueOnce({});
      const { service } = buildService();
      await service.upload('packages/123/file.zip', Buffer.from('data'), 'application/zip');
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'smithy',
        Key: 'packages/123/file.zip',
        Body: expect.any(Buffer),
        ContentType: 'application/zip',
      });
      expect(mockSend).toHaveBeenCalledOnce();
    });

    it('throws InternalServerErrorException on S3 error', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 error'));
      const { service } = buildService();
      await expect(service.upload('key', Buffer.from(''), 'text/plain')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('download', () => {
    it('returns Buffer from response body', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      mockSend.mockResolvedValueOnce({
        Body: { transformToByteArray: vi.fn().mockResolvedValue(bytes) },
      });
      const { service } = buildService();
      const result = await service.download('packages/123/file.zip');
      expect(result).toBeInstanceOf(Buffer);
      expect(result).toEqual(Buffer.from(bytes));
      expect(GetObjectCommand).toHaveBeenCalledWith({ Bucket: 'smithy', Key: 'packages/123/file.zip' });
    });

    it('throws NotFoundException on NoSuchKey', async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error('no such key'), { name: 'NoSuchKey' }));
      const { service } = buildService();
      await expect(service.download('missing/key')).rejects.toThrow(NotFoundException);
    });

    it('throws InternalServerErrorException on other S3 errors', async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error('s3 down'), { name: 'ServiceUnavailable' }));
      const { service } = buildService();
      await expect(service.download('key')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('delete', () => {
    it('sends DeleteObjectCommand with correct params', async () => {
      mockSend.mockResolvedValueOnce({});
      const { service } = buildService();
      await service.delete('packages/123/file.zip');
      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'smithy',
        Key: 'packages/123/file.zip',
      });
    });

    it('throws InternalServerErrorException on S3 error', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 error'));
      const { service } = buildService();
      await expect(service.delete('key')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('deleteByPrefix', () => {
    it('lists and deletes all matching objects in a single page', async () => {
      const listResponse = {
        Contents: [{ Key: 'packages/123/a.zip' }, { Key: 'packages/123/b.zip' }],
        IsTruncated: false,
      };
      mockSend
        .mockResolvedValueOnce(listResponse) // ListObjectsV2Command
        .mockResolvedValueOnce({}); // DeleteObjectsCommand

      const { service } = buildService();
      await service.deleteByPrefix('packages/123');

      expect(ListObjectsV2Command).toHaveBeenCalledWith({
        Bucket: 'smithy',
        Prefix: 'packages/123',
        ContinuationToken: undefined,
      });
      expect(DeleteObjectsCommand).toHaveBeenCalledWith({
        Bucket: 'smithy',
        Delete: {
          Objects: [{ Key: 'packages/123/a.zip' }, { Key: 'packages/123/b.zip' }],
          Quiet: true,
        },
      });
    });

    it('handles pagination across multiple pages', async () => {
      const page1 = {
        Contents: [{ Key: 'packages/123/a.zip' }],
        IsTruncated: true,
        NextContinuationToken: 'token1',
      };
      const page2 = {
        Contents: [{ Key: 'packages/123/b.zip' }],
        IsTruncated: false,
      };
      mockSend
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce({}) // delete page 1
        .mockResolvedValueOnce(page2)
        .mockResolvedValueOnce({}); // delete page 2

      const { service } = buildService();
      await service.deleteByPrefix('packages/123');

      expect(ListObjectsV2Command).toHaveBeenCalledTimes(2);
      expect(DeleteObjectsCommand).toHaveBeenCalledTimes(2);
    });

    it('does not call DeleteObjectsCommand when no objects match', async () => {
      mockSend.mockResolvedValueOnce({ Contents: [], IsTruncated: false });
      const { service } = buildService();
      await service.deleteByPrefix('nonexistent/prefix');
      expect(DeleteObjectsCommand).not.toHaveBeenCalled();
    });

    it('handles undefined Contents gracefully', async () => {
      mockSend.mockResolvedValueOnce({ IsTruncated: false });
      const { service } = buildService();
      await expect(service.deleteByPrefix('prefix')).resolves.toBeUndefined();
      expect(DeleteObjectsCommand).not.toHaveBeenCalled();
    });
  });

  describe('headObject', () => {
    it('returns true when object exists', async () => {
      mockSend.mockResolvedValueOnce({});
      const { service } = buildService();
      const result = await service.headObject('packages/123/file.zip');
      expect(result).toBe(true);
      expect(HeadObjectCommand).toHaveBeenCalledWith({ Bucket: 'smithy', Key: 'packages/123/file.zip' });
    });

    it('returns false on NotFound error', async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error('not found'), { name: 'NotFound' }));
      const { service } = buildService();
      const result = await service.headObject('missing/key');
      expect(result).toBe(false);
    });

    it('returns false on NoSuchKey error', async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error('no such key'), { name: 'NoSuchKey' }));
      const { service } = buildService();
      const result = await service.headObject('missing/key');
      expect(result).toBe(false);
    });

    it('throws InternalServerErrorException on other errors', async () => {
      mockSend.mockRejectedValueOnce(Object.assign(new Error('network'), { name: 'NetworkError' }));
      const { service } = buildService();
      await expect(service.headObject('key')).rejects.toThrow(InternalServerErrorException);
    });
  });
});
