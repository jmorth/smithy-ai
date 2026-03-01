# Task 029: Create S3 Storage Service

## Summary
Create a `StorageService` that wraps `@aws-sdk/client-s3` to provide upload, download, delete, and prefix-based deletion operations against an S3-compatible object store. In development this targets MinIO running in Docker Compose; in production it targets any S3-compatible service. This is the foundation for all file storage in Smithy — package files, worker artifacts, and build outputs.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 023 (Zod Configuration Module)
- **Blocks**: 030 (Presigned URLs), 034 (Package File Management), 050 (Worker Pool Controller — file handling)

## Architecture Reference
Smithy uses S3-compatible object storage (MinIO locally, AWS S3 or compatible in production) for all binary and file data. The `StorageService` is a thin abstraction over the AWS SDK S3 client, configured via the `minio.*` config namespace from ConfigModule. The service is `@Global()` so any module can inject it without importing StorageModule. All S3 keys follow a hierarchical convention: `{entity}/{entityId}/{filename}`.

## Files and Folders
- `/apps/api/src/modules/storage/storage.module.ts` — Global NestJS module exporting StorageService
- `/apps/api/src/modules/storage/storage.service.ts` — Service with upload, download, delete, deleteByPrefix methods
- `/apps/api/src/modules/storage/storage.constants.ts` — Constants for bucket names, key prefixes

## Acceptance Criteria
- [ ] `upload(key: string, buffer: Buffer, contentType: string): Promise<void>` — uploads an object to the configured bucket
- [ ] `download(key: string): Promise<Buffer>` — downloads an object and returns its contents as a Buffer
- [ ] `delete(key: string): Promise<void>` — deletes a single object by key
- [ ] `deleteByPrefix(prefix: string): Promise<void>` — lists and deletes all objects matching a key prefix (batch delete)
- [ ] S3 client is configured using `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` from ConfigService
- [ ] S3 client uses `forcePathStyle: true` (required for MinIO compatibility)
- [ ] Bucket existence is verified on module initialization; bucket is created if it does not exist
- [ ] StorageModule is decorated with `@Global()`
- [ ] All S3 errors are caught and re-thrown as appropriate NestJS HTTP exceptions (404 for NoSuchKey, 500 for others)
- [ ] Install `@aws-sdk/client-s3` as a dependency

## Implementation Notes
- The S3 client configuration for MinIO requires `forcePathStyle: true` and a custom `endpoint` — without path-style, the SDK tries virtual-hosted-style URLs which MinIO does not support by default.
- Use `CreateBucketCommand` with a try/catch that ignores `BucketAlreadyOwnedByYou` and `BucketAlreadyExists` errors for idempotent bucket creation.
- For `deleteByPrefix`, use `ListObjectsV2Command` to list objects, then `DeleteObjectsCommand` to batch-delete. Handle pagination for prefixes with many objects (>1000).
- The `download` method should stream the response body to a Buffer using `response.Body.transformToByteArray()`.
- Consider adding a `headObject(key)` method for checking object existence without downloading — useful for validation.
- Log all storage operations at debug level with key and bucket information for troubleshooting.
