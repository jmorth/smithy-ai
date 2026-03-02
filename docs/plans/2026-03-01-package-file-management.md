# Package File Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add four file management methods to `PackagesService` enabling presigned S3 upload/download, upload confirmation, file listing, and file deletion.

**Architecture:** `PackagesService` gets a second constructor injection: `StorageService` (global, already exported by `StorageModule`). All S3 key generation uses the pattern `packages/{packageId}/{uuid}/{filename}`. Delete ordering is S3-first, DB-second to avoid orphaned S3 objects.

**Tech Stack:** NestJS, Drizzle ORM, AWS S3 SDK via `StorageService`, `crypto.randomUUID()`

---

### Task 1: Implement `createPresignedUpload`

**Files:**
- Modify: `apps/api/src/modules/packages/packages.service.ts`

**Step 1: Write the failing test**

```ts
describe('createPresignedUpload', () => {
  it('throws NotFoundException when package does not exist', async () => { ... });
  it('generates S3 key with correct pattern packages/{id}/{uuid}/{filename}', async () => { ... });
  it('returns uploadUrl and fileKey', async () => { ... });
  it('calls getPresignedUploadUrl with the generated key and contentType', async () => { ... });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter api test packages.service`
Expected: FAIL — method not defined

**Step 3: Add StorageService injection and implement `createPresignedUpload`**

```ts
constructor(
  @Inject(DRIZZLE) private readonly db: DrizzleClient,
  private readonly storage: StorageService,
) {}

async createPresignedUpload(
  packageId: string,
  dto: PresignFileDto,
): Promise<{ uploadUrl: string; fileKey: string }> {
  const exists = await this.db
    .select({ id: packages.id })
    .from(packages)
    .where(and(eq(packages.id, packageId), isNull(packages.deletedAt)))
    .limit(1);
  if (!exists.length) throw new NotFoundException(`Package ${packageId} not found`);

  const fileKey = `packages/${packageId}/${randomUUID()}/${dto.filename}`;
  const uploadUrl = await this.storage.getPresignedUploadUrl(fileKey, dto.contentType);
  return { uploadUrl, fileKey };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter api test packages.service`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/packages/packages.service.ts \
        apps/api/src/modules/packages/packages.service.spec.ts
git commit -m "feat(packages): add createPresignedUpload method"
```

---

### Task 2: Implement `confirmFileUpload`

**Files:**
- Modify: `apps/api/src/modules/packages/packages.service.ts`

**Step 1: Write the failing test**

```ts
describe('confirmFileUpload', () => {
  it('throws NotFoundException when package does not exist', async () => { ... });
  it('inserts a package_files row with provided metadata', async () => { ... });
  it('returns the created file record', async () => { ... });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter api test packages.service`
Expected: FAIL

**Step 3: Implement `confirmFileUpload`**

```ts
async confirmFileUpload(
  packageId: string,
  dto: ConfirmFileDto,
): Promise<PackageFileRecord> {
  const exists = await this.db
    .select({ id: packages.id })
    .from(packages)
    .where(and(eq(packages.id, packageId), isNull(packages.deletedAt)))
    .limit(1);
  if (!exists.length) throw new NotFoundException(`Package ${packageId} not found`);

  const [file] = await this.db
    .insert(packageFiles)
    .values({
      packageId,
      fileKey: dto.fileKey,
      filename: dto.filename,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    })
    .returning();
  return file!;
}
```

---

### Task 3: Implement `listFiles`

**Files:**
- Modify: `apps/api/src/modules/packages/packages.service.ts`

**Step 1: Write the failing test**

```ts
describe('listFiles', () => {
  it('returns all files for the package', async () => { ... });
  it('returns empty array when no files', async () => { ... });
});
```

**Step 3: Implement `listFiles`**

```ts
async listFiles(packageId: string): Promise<PackageFileRecord[]> {
  return this.db
    .select()
    .from(packageFiles)
    .where(eq(packageFiles.packageId, packageId));
}
```

---

### Task 4: Implement `deleteFile`

**Files:**
- Modify: `apps/api/src/modules/packages/packages.service.ts`

**Step 1: Write the failing test**

```ts
describe('deleteFile', () => {
  it('throws NotFoundException when file does not exist', async () => { ... });
  it('deletes S3 object before DB record', async () => { ... });
  it('resolves void on success', async () => { ... });
  it('does not delete DB if S3 delete throws', async () => { ... });
});
```

**Step 3: Implement `deleteFile`**

```ts
async deleteFile(packageId: string, fileId: string): Promise<void> {
  const [file] = await this.db
    .select()
    .from(packageFiles)
    .where(and(eq(packageFiles.id, fileId), eq(packageFiles.packageId, packageId)))
    .limit(1);
  if (!file) throw new NotFoundException(`File ${fileId} not found`);

  await this.storage.delete(file.fileKey);
  await this.db.delete(packageFiles).where(eq(packageFiles.id, fileId));
}
```
