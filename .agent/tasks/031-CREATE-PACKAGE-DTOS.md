# Task 031: Create Package DTOs

## Summary
Create Data Transfer Objects for Package CRUD operations and file management: `CreatePackageDto`, `UpdatePackageDto`, `PresignFileDto`, and `ConfirmFileDto`, all decorated with `class-validator` constraints. These DTOs define the API contract for package operations and are automatically validated by the global validation pipe.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 026 (Global Validation Pipe), 019 (Shared Enums — PackageStatus, PackageType)
- **Blocks**: 032 (Package Service), 035 (Package REST Controller)

## Architecture Reference
DTOs in Smithy follow the NestJS convention of using `class-validator` decorators for runtime validation and `class-transformer` for type coercion. Each DTO maps to a specific API operation. The Package entity is the core data unit flowing through assembly lines — it has a type, metadata, status, and associated files. DTOs reference shared enums from the `@smithy/shared` package (task 019).

## Files and Folders
- `/apps/api/src/modules/packages/dto/create-package.dto.ts` — DTO for creating a new package
- `/apps/api/src/modules/packages/dto/update-package.dto.ts` — DTO for updating package metadata/status
- `/apps/api/src/modules/packages/dto/presign-file.dto.ts` — DTO for requesting a presigned upload URL
- `/apps/api/src/modules/packages/dto/confirm-file.dto.ts` — DTO for confirming a file upload
- `/apps/api/src/modules/packages/dto/index.ts` — Barrel export for all DTOs

## Acceptance Criteria
- [ ] `CreatePackageDto`: `type` is required string (non-empty), `metadata` is optional `Record<string, unknown>`, `assemblyLineId` is optional valid UUID
- [ ] `UpdatePackageDto`: `type` is optional string, `metadata` is optional `Record<string, unknown>`, `status` is optional valid `PackageStatus` enum value
- [ ] `PresignFileDto`: `filename` is required string (non-empty, max 255 chars), `contentType` is required string matching MIME type pattern
- [ ] `ConfirmFileDto`: `fileKey` is required string (the S3 key), `filename` is required string, `mimeType` is required string, `sizeBytes` is required positive integer
- [ ] All DTOs have appropriate class-validator decorators: `@IsString()`, `@IsOptional()`, `@IsUUID()`, `@IsEnum()`, `@IsNotEmpty()`, `@IsInt()`, `@IsPositive()`, `@MaxLength()`, etc.
- [ ] All DTOs are exported from the barrel file
- [ ] Validation errors produce clear, human-readable messages

## Implementation Notes
- Import `PackageStatus` from `@smithy/shared` (task 019). If the shared package is not yet available, define a local enum that matches and add a TODO to import from shared later.
- For `metadata` as `Record<string, unknown>`, use `@IsObject()` and `@IsOptional()`. Note that deeply nested validation of arbitrary metadata is intentionally skipped — the metadata field is schemaless by design.
- For the `contentType` field in `PresignFileDto`, use `@Matches(/^[\w-]+\/[\w\-.+]+$/)` for basic MIME type format validation.
- Consider adding a `PaginationQueryDto` for the list endpoint: `cursor` (optional string), `limit` (optional number, default 20, max 100), `type` (optional string filter), `status` (optional PackageStatus filter).
- `UpdatePackageDto` should NOT use `PartialType(CreatePackageDto)` directly because it includes `status` which is not in `CreatePackageDto`. Build it explicitly.
