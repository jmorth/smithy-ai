# Task 030: Create Storage Presigned URLs

## Summary
Extend the `StorageService` with presigned URL generation for direct browser-to-S3 uploads and downloads. This avoids routing large file payloads through the API server — clients upload directly to MinIO/S3 using a time-limited signed URL, then confirm the upload via the API.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 029 (S3 Storage Service)
- **Blocks**: 034 (Package File Management — uses presigned URLs for package file uploads)

## Architecture Reference
The presigned URL flow for file uploads in Smithy works as follows: (1) client requests a presigned upload URL from the API, (2) client PUTs the file directly to S3/MinIO using the signed URL, (3) client confirms the upload by POSTing file metadata to the API, which creates the database record. This pattern keeps the API server lightweight and avoids memory pressure from large file uploads. The `@aws-sdk/s3-request-presigner` package provides the signing capability.

## Files and Folders
- `/apps/api/src/modules/storage/storage.service.ts` — Extended with presigned URL methods

## Acceptance Criteria
- [ ] `getPresignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>` — returns a signed PUT URL for direct upload
- [ ] `getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<string>` — returns a signed GET URL for direct download
- [ ] Default expiry for both methods is 15 minutes (900 seconds)
- [ ] Expiry is configurable per call via the `expiresIn` parameter (in seconds)
- [ ] Upload URLs include `Content-Type` constraint matching the provided `contentType`
- [ ] Generated URLs work against MinIO in the Docker Compose environment
- [ ] URLs are properly signed and reject requests after expiration
- [ ] Install `@aws-sdk/s3-request-presigner` as a dependency

## Implementation Notes
- Use `getSignedUrl()` from `@aws-sdk/s3-request-presigner` with `PutObjectCommand` for upload URLs and `GetObjectCommand` for download URLs.
- Example: `getSignedUrl(s3Client, new PutObjectCommand({ Bucket, Key, ContentType }), { expiresIn })`.
- When working with MinIO locally, presigned URLs will contain `localhost:9000` (the MinIO port). Ensure Docker networking does not break this — the URL must be reachable from the browser, not from inside Docker.
- Consider a maximum expiry limit (e.g., 1 hour) to prevent overly long-lived signed URLs.
- The `Content-Type` constraint on upload URLs is important — without it, a client could upload an executable disguised as an image. The server should validate this on confirmation as well.
- Test presigned URLs by uploading a small file via `curl` to the signed URL and verifying it appears in MinIO.
