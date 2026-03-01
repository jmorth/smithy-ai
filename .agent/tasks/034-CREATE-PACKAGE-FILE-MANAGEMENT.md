# Task 034: Create Package File Management

## Summary
Implement file operations for Packages: presigned upload URL generation, upload confirmation (creating `package_files` database rows), file listing, and file deletion (both S3 object and database record). This enables the two-phase upload pattern where clients upload directly to S3 via presigned URLs and then confirm the upload through the API.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 032 (Package Service), 030 (Storage Presigned URLs)
- **Blocks**: 035 (Package REST Controller)

## Architecture Reference
Package files follow the two-phase upload pattern: (1) API generates a presigned S3 PUT URL with a deterministic key, (2) client uploads the file directly to S3, (3) client confirms the upload by POSTing metadata to the API, which creates a `package_files` row. S3 keys follow the convention `packages/{packageId}/{uuid}/{filename}` to ensure uniqueness while preserving the original filename. The file methods are added to `PackagesService` to keep all package-related logic colocated.

## Files and Folders
- `/apps/api/src/modules/packages/packages.service.ts` — Extended with file management methods

## Acceptance Criteria
- [ ] `createPresignedUpload(packageId: string, dto: PresignFileDto): Promise<{ uploadUrl: string, fileKey: string }>` — generates S3 key `packages/{packageId}/{uuid}/{filename}`, returns presigned PUT URL and the key
- [ ] `confirmFileUpload(packageId: string, dto: ConfirmFileDto): Promise<PackageFile>` — validates the package exists, creates a `package_files` row with the provided metadata, returns the created record
- [ ] `listFiles(packageId: string): Promise<PackageFile[]>` — returns all non-deleted files for a package
- [ ] `deleteFile(packageId: string, fileId: string): Promise<void>` — deletes the S3 object and removes the `package_files` row; throws `NotFoundException` if file or package not found
- [ ] S3 key format: `packages/{packageId}/{uuid}/{filename}` where uuid is generated server-side
- [ ] `createPresignedUpload` validates that the package exists before generating the URL
- [ ] `confirmFileUpload` verifies the package exists and is not soft-deleted
- [ ] `deleteFile` deletes from S3 first, then from DB (if S3 delete fails, the DB record remains for retry)
- [ ] File operations inject `StorageService` from task 029/030

## Implementation Notes
- Inject `StorageService` in the `PackagesService` constructor alongside the Drizzle client.
- Use `crypto.randomUUID()` (or `uuid` package) to generate the unique path segment in S3 keys. This prevents filename collisions when a package has multiple files with the same name uploaded at different times.
- For `confirmFileUpload`, consider verifying that the S3 object actually exists (via a HEAD request) before creating the DB record. This prevents orphaned DB records if the client never completed the upload. However, this adds latency — for MVP, trusting the client confirmation is acceptable.
- The `deleteFile` operation ordering matters: delete S3 first, then DB. If the DB delete fails after S3 succeeds, you have an orphaned DB record pointing to nothing (easy to clean up). The reverse (DB deleted, S3 object remains) is harder to detect and wastes storage.
- When a package is soft-deleted, its files are NOT automatically deleted from S3. A separate cleanup job (background task) should handle this based on `RETENTION_DAYS`. This is out of scope for this task.
- Consider adding a `getTotalFileSize(packageId)` helper that sums `size_bytes` across all files — useful for enforcing package size limits later.
