# Storage Presigned URLs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend `StorageService` with `getPresignedUploadUrl` and `getPresignedDownloadUrl` methods using `@aws-sdk/s3-request-presigner`.

**Architecture:** Use `getSignedUrl()` from `@aws-sdk/s3-request-presigner` with `PutObjectCommand` (upload, includes ContentType constraint) and `GetObjectCommand` (download). Both default to 900s expiry, configurable per call with a 3600s cap.

**Tech Stack:** NestJS, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, Vitest

---

### Task 1: Install dependency and create feature branch

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Create git branch**

```bash
cd /home/jmorth/Source/Opus/smithy-ai
git checkout -b feature/task-030
```

**Step 2: Install presigner package**

```bash
cd apps/api && pnpm add @aws-sdk/s3-request-presigner
```

**Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): install @aws-sdk/s3-request-presigner"
```

---

### Task 2: Add presigned URL methods to StorageService (TDD)

**Files:**
- Modify: `apps/api/src/modules/storage/storage.service.ts`
- Modify: `apps/api/src/modules/storage/storage.service.spec.ts`

**Step 1: Write failing tests for `getPresignedUploadUrl`**

Add to `storage.service.spec.ts`:

```typescript
// At top - mock the presigner
const mockGetSignedUrl = vi.fn();
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

// In describe block:
describe('getPresignedUploadUrl', () => {
  it('returns signed URL with default expiry (900s)', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://minio/presigned-upload');
    const { service } = buildService();
    const url = await service.getPresignedUploadUrl('packages/123/file.zip', 'application/zip');
    expect(url).toBe('https://minio/presigned-upload');
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'smithy',
      Key: 'packages/123/file.zip',
      ContentType: 'application/zip',
    });
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ _type: 'PutObjectCommand' }),
      { expiresIn: 900 },
    );
  });

  it('uses provided expiresIn when within limit', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://minio/presigned-upload');
    const { service } = buildService();
    await service.getPresignedUploadUrl('key', 'image/png', 300);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { expiresIn: 300 },
    );
  });

  it('caps expiresIn at 3600 seconds', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://minio/presigned-upload');
    const { service } = buildService();
    await service.getPresignedUploadUrl('key', 'image/png', 9999);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { expiresIn: 3600 },
    );
  });
});

describe('getPresignedDownloadUrl', () => {
  it('returns signed URL with default expiry (900s)', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://minio/presigned-download');
    const { service } = buildService();
    const url = await service.getPresignedDownloadUrl('packages/123/file.zip');
    expect(url).toBe('https://minio/presigned-download');
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'smithy',
      Key: 'packages/123/file.zip',
    });
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ _type: 'GetObjectCommand' }),
      { expiresIn: 900 },
    );
  });

  it('uses provided expiresIn when within limit', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://minio/presigned-download');
    const { service } = buildService();
    await service.getPresignedDownloadUrl('key', 60);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { expiresIn: 60 },
    );
  });

  it('caps expiresIn at 3600 seconds', async () => {
    mockGetSignedUrl.mockResolvedValueOnce('https://minio/presigned-download');
    const { service } = buildService();
    await service.getPresignedDownloadUrl('key', 7200);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { expiresIn: 3600 },
    );
  });
});
```

**Step 2: Run to verify failure**

```bash
cd apps/api && pnpm test src/modules/storage/storage.service.spec.ts 2>&1 | tail -20
```

Expected: FAIL (methods don't exist)

**Step 3: Implement the methods in `storage.service.ts`**

Add import at top:
```typescript
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
```

Add constant:
```typescript
private static readonly MAX_PRESIGNED_EXPIRY = 3600;
private static readonly DEFAULT_PRESIGNED_EXPIRY = 900;
```

Add methods:
```typescript
async getPresignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string> {
  const expiry = Math.min(expiresIn ?? StorageService.DEFAULT_PRESIGNED_EXPIRY, StorageService.MAX_PRESIGNED_EXPIRY);
  this.logger.debug(`Generating presigned upload URL: bucket=${this.bucket} key=${key} expiresIn=${expiry}`);
  return getSignedUrl(
    this.client,
    new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
    { expiresIn: expiry },
  );
}

async getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<string> {
  const expiry = Math.min(expiresIn ?? StorageService.DEFAULT_PRESIGNED_EXPIRY, StorageService.MAX_PRESIGNED_EXPIRY);
  this.logger.debug(`Generating presigned download URL: bucket=${this.bucket} key=${key} expiresIn=${expiry}`);
  return getSignedUrl(
    this.client,
    new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    { expiresIn: expiry },
  );
}
```

**Step 4: Run tests to verify pass + coverage**

```bash
cd apps/api && pnpm test:cov src/modules/storage/storage.service.spec.ts 2>&1 | tail -30
```

Expected: All PASS, 100% coverage on storage.service.ts

**Step 5: Run all storage tests**

```bash
cd apps/api && pnpm test src/modules/storage/ 2>&1 | tail -20
```

**Step 6: Commit**

```bash
git add apps/api/src/modules/storage/
git commit -m "feat(api): add presigned URL methods to StorageService (task-030)"
```
