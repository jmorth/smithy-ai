# Package DTOs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create class-validator-decorated DTOs for Package CRUD and file management operations.

**Architecture:** Four DTOs (`CreatePackageDto`, `UpdatePackageDto`, `PresignFileDto`, `ConfirmFileDto`) plus a `PaginationQueryDto`, all validated by the global NestJS validation pipe. Tests use `class-validator`'s `validate()` directly — no NestJS bootstrap required.

**Tech Stack:** NestJS, class-validator, class-transformer, @smithy/shared (PackageStatus enum), vitest

---

### Task 1: CreatePackageDto

**Files:**
- Create: `apps/api/src/modules/packages/dto/create-package.dto.ts`
- Create: `apps/api/src/modules/packages/dto/create-package.dto.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/src/modules/packages/dto/create-package.dto.spec.ts
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePackageDto } from './create-package.dto';

describe('CreatePackageDto', () => {
  it('passes with required type only', async () => {
    const dto = plainToInstance(CreatePackageDto, { type: 'document' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with all optional fields', async () => {
    const dto = plainToInstance(CreatePackageDto, {
      type: 'document',
      metadata: { key: 'value' },
      assemblyLineId: '123e4567-e89b-12d3-a456-426614174000',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when type is empty string', async () => {
    const dto = plainToInstance(CreatePackageDto, { type: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('type');
  });

  it('fails when type is missing', async () => {
    const dto = plainToInstance(CreatePackageDto, {});
    const errors = await validate(dto);
    const typeError = errors.find((e) => e.property === 'type');
    expect(typeError).toBeDefined();
  });

  it('fails when assemblyLineId is not a valid UUID', async () => {
    const dto = plainToInstance(CreatePackageDto, { type: 'doc', assemblyLineId: 'not-a-uuid' });
    const errors = await validate(dto);
    const uuidError = errors.find((e) => e.property === 'assemblyLineId');
    expect(uuidError).toBeDefined();
  });

  it('fails when metadata is not an object', async () => {
    const dto = plainToInstance(CreatePackageDto, { type: 'doc', metadata: 'string' });
    const errors = await validate(dto);
    const metaError = errors.find((e) => e.property === 'metadata');
    expect(metaError).toBeDefined();
  });

  it('passes when metadata is omitted', async () => {
    const dto = plainToInstance(CreatePackageDto, { type: 'doc' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes when assemblyLineId is omitted', async () => {
    const dto = plainToInstance(CreatePackageDto, { type: 'doc' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/create-package.dto.spec.ts
```
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/packages/dto/create-package.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsObject } from 'class-validator';

export class CreatePackageDto {
  @IsString()
  @IsNotEmpty({ message: 'type must not be empty' })
  type!: string;

  @IsOptional()
  @IsObject({ message: 'metadata must be an object' })
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsUUID('4', { message: 'assemblyLineId must be a valid UUID' })
  assemblyLineId?: string;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/create-package.dto.spec.ts
```
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add apps/api/src/modules/packages/dto/create-package.dto.ts \
        apps/api/src/modules/packages/dto/create-package.dto.spec.ts
git commit -m "feat(api): add CreatePackageDto with class-validator decorators"
```

---

### Task 2: UpdatePackageDto

**Files:**
- Create: `apps/api/src/modules/packages/dto/update-package.dto.ts`
- Create: `apps/api/src/modules/packages/dto/update-package.dto.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/src/modules/packages/dto/update-package.dto.spec.ts
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdatePackageDto } from './update-package.dto';
import { PackageStatus } from '@smithy/shared';

describe('UpdatePackageDto', () => {
  it('passes with empty body (all fields optional)', async () => {
    const dto = plainToInstance(UpdatePackageDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid type', async () => {
    const dto = plainToInstance(UpdatePackageDto, { type: 'document' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid status', async () => {
    const dto = plainToInstance(UpdatePackageDto, { status: PackageStatus.COMPLETED });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when status is not a valid PackageStatus', async () => {
    const dto = plainToInstance(UpdatePackageDto, { status: 'INVALID_STATUS' });
    const errors = await validate(dto);
    const statusError = errors.find((e) => e.property === 'status');
    expect(statusError).toBeDefined();
  });

  it('passes with all valid fields', async () => {
    const dto = plainToInstance(UpdatePackageDto, {
      type: 'image',
      metadata: { processed: true },
      status: PackageStatus.PROCESSING,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when metadata is not an object', async () => {
    const dto = plainToInstance(UpdatePackageDto, { metadata: 42 });
    const errors = await validate(dto);
    const metaError = errors.find((e) => e.property === 'metadata');
    expect(metaError).toBeDefined();
  });

  it('fails when type is empty string', async () => {
    const dto = plainToInstance(UpdatePackageDto, { type: '' });
    const errors = await validate(dto);
    const typeError = errors.find((e) => e.property === 'type');
    expect(typeError).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/update-package.dto.spec.ts
```
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/packages/dto/update-package.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsObject, IsEnum } from 'class-validator';
import { PackageStatus } from '@smithy/shared';

export class UpdatePackageDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'type must not be empty' })
  type?: string;

  @IsOptional()
  @IsObject({ message: 'metadata must be an object' })
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(PackageStatus, { message: 'status must be a valid PackageStatus' })
  status?: PackageStatus;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/update-package.dto.spec.ts
```
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add apps/api/src/modules/packages/dto/update-package.dto.ts \
        apps/api/src/modules/packages/dto/update-package.dto.spec.ts
git commit -m "feat(api): add UpdatePackageDto with class-validator decorators"
```

---

### Task 3: PresignFileDto

**Files:**
- Create: `apps/api/src/modules/packages/dto/presign-file.dto.ts`
- Create: `apps/api/src/modules/packages/dto/presign-file.dto.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/src/modules/packages/dto/presign-file.dto.spec.ts
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PresignFileDto } from './presign-file.dto';

describe('PresignFileDto', () => {
  it('passes with valid filename and contentType', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'document.pdf',
      contentType: 'application/pdf',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with complex MIME type', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'image.jpg',
      contentType: 'image/jpeg',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when filename is missing', async () => {
    const dto = plainToInstance(PresignFileDto, { contentType: 'image/jpeg' });
    const errors = await validate(dto);
    const filenameError = errors.find((e) => e.property === 'filename');
    expect(filenameError).toBeDefined();
  });

  it('fails when filename is empty', async () => {
    const dto = plainToInstance(PresignFileDto, { filename: '', contentType: 'image/jpeg' });
    const errors = await validate(dto);
    const filenameError = errors.find((e) => e.property === 'filename');
    expect(filenameError).toBeDefined();
  });

  it('fails when filename exceeds 255 characters', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'a'.repeat(256),
      contentType: 'image/jpeg',
    });
    const errors = await validate(dto);
    const filenameError = errors.find((e) => e.property === 'filename');
    expect(filenameError).toBeDefined();
  });

  it('passes when filename is exactly 255 characters', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'a'.repeat(255),
      contentType: 'image/jpeg',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when contentType is missing', async () => {
    const dto = plainToInstance(PresignFileDto, { filename: 'file.txt' });
    const errors = await validate(dto);
    const contentTypeError = errors.find((e) => e.property === 'contentType');
    expect(contentTypeError).toBeDefined();
  });

  it('fails when contentType does not match MIME pattern', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'file.txt',
      contentType: 'not-a-mime-type',
    });
    const errors = await validate(dto);
    const contentTypeError = errors.find((e) => e.property === 'contentType');
    expect(contentTypeError).toBeDefined();
  });

  it('passes with application/vnd.ms-excel MIME type', async () => {
    const dto = plainToInstance(PresignFileDto, {
      filename: 'data.xls',
      contentType: 'application/vnd.ms-excel',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/presign-file.dto.spec.ts
```
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/packages/dto/presign-file.dto.ts
import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class PresignFileDto {
  @IsString()
  @IsNotEmpty({ message: 'filename must not be empty' })
  @MaxLength(255, { message: 'filename must not exceed 255 characters' })
  filename!: string;

  @IsString()
  @IsNotEmpty({ message: 'contentType must not be empty' })
  @Matches(/^[\w-]+\/[\w\-.+]+$/, { message: 'contentType must be a valid MIME type' })
  contentType!: string;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/presign-file.dto.spec.ts
```
Expected: PASS (9 tests)

**Step 5: Commit**

```bash
git add apps/api/src/modules/packages/dto/presign-file.dto.ts \
        apps/api/src/modules/packages/dto/presign-file.dto.spec.ts
git commit -m "feat(api): add PresignFileDto with MIME type validation"
```

---

### Task 4: ConfirmFileDto

**Files:**
- Create: `apps/api/src/modules/packages/dto/confirm-file.dto.ts`
- Create: `apps/api/src/modules/packages/dto/confirm-file.dto.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/src/modules/packages/dto/confirm-file.dto.spec.ts
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConfirmFileDto } from './confirm-file.dto';

describe('ConfirmFileDto', () => {
  const validPayload = {
    fileKey: 'packages/abc123/document.pdf',
    filename: 'document.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
  };

  it('passes with all valid fields', async () => {
    const dto = plainToInstance(ConfirmFileDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when fileKey is missing', async () => {
    const { fileKey: _, ...rest } = validPayload;
    const dto = plainToInstance(ConfirmFileDto, rest);
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'fileKey');
    expect(error).toBeDefined();
  });

  it('fails when filename is missing', async () => {
    const { filename: _, ...rest } = validPayload;
    const dto = plainToInstance(ConfirmFileDto, rest);
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'filename');
    expect(error).toBeDefined();
  });

  it('fails when mimeType is missing', async () => {
    const { mimeType: _, ...rest } = validPayload;
    const dto = plainToInstance(ConfirmFileDto, rest);
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'mimeType');
    expect(error).toBeDefined();
  });

  it('fails when sizeBytes is missing', async () => {
    const { sizeBytes: _, ...rest } = validPayload;
    const dto = plainToInstance(ConfirmFileDto, rest);
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'sizeBytes');
    expect(error).toBeDefined();
  });

  it('fails when sizeBytes is zero', async () => {
    const dto = plainToInstance(ConfirmFileDto, { ...validPayload, sizeBytes: 0 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'sizeBytes');
    expect(error).toBeDefined();
  });

  it('fails when sizeBytes is negative', async () => {
    const dto = plainToInstance(ConfirmFileDto, { ...validPayload, sizeBytes: -1 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'sizeBytes');
    expect(error).toBeDefined();
  });

  it('fails when sizeBytes is a float', async () => {
    const dto = plainToInstance(ConfirmFileDto, { ...validPayload, sizeBytes: 1.5 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'sizeBytes');
    expect(error).toBeDefined();
  });

  it('fails when fileKey is empty string', async () => {
    const dto = plainToInstance(ConfirmFileDto, { ...validPayload, fileKey: '' });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'fileKey');
    expect(error).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/confirm-file.dto.spec.ts
```
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/packages/dto/confirm-file.dto.ts
import { IsString, IsNotEmpty, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmFileDto {
  @IsString()
  @IsNotEmpty({ message: 'fileKey must not be empty' })
  fileKey!: string;

  @IsString()
  @IsNotEmpty({ message: 'filename must not be empty' })
  filename!: string;

  @IsString()
  @IsNotEmpty({ message: 'mimeType must not be empty' })
  mimeType!: string;

  @Type(() => Number)
  @IsInt({ message: 'sizeBytes must be an integer' })
  @IsPositive({ message: 'sizeBytes must be a positive number' })
  sizeBytes!: number;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/confirm-file.dto.spec.ts
```
Expected: PASS (9 tests)

**Step 5: Commit**

```bash
git add apps/api/src/modules/packages/dto/confirm-file.dto.ts \
        apps/api/src/modules/packages/dto/confirm-file.dto.spec.ts
git commit -m "feat(api): add ConfirmFileDto with integer/positive validation"
```

---

### Task 5: PaginationQueryDto

**Files:**
- Create: `apps/api/src/modules/packages/dto/pagination-query.dto.ts`
- Create: `apps/api/src/modules/packages/dto/pagination-query.dto.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/src/modules/packages/dto/pagination-query.dto.spec.ts
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from './pagination-query.dto';
import { PackageStatus } from '@smithy/shared';

describe('PaginationQueryDto', () => {
  it('passes with empty query (all optional)', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid cursor', async () => {
    const dto = plainToInstance(PaginationQueryDto, { cursor: 'some-cursor-token' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid limit', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: 50 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('defaults limit to 20 when not provided', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    expect(dto.limit).toBe(20);
  });

  it('fails when limit exceeds 100', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: 101 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'limit');
    expect(error).toBeDefined();
  });

  it('fails when limit is less than 1', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: 0 });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'limit');
    expect(error).toBeDefined();
  });

  it('passes with valid type filter', async () => {
    const dto = plainToInstance(PaginationQueryDto, { type: 'document' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with valid status filter', async () => {
    const dto = plainToInstance(PaginationQueryDto, { status: PackageStatus.COMPLETED });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when status is not a valid PackageStatus', async () => {
    const dto = plainToInstance(PaginationQueryDto, { status: 'BOGUS' });
    const errors = await validate(dto);
    const error = errors.find((e) => e.property === 'status');
    expect(error).toBeDefined();
  });

  it('coerces string limit to number', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: '25' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(25);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/pagination-query.dto.spec.ts
```
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/packages/dto/pagination-query.dto.ts
import { IsString, IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PackageStatus } from '@smithy/shared';

export class PaginationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit must not exceed 100' })
  limit: number = 20;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsEnum(PackageStatus, { message: 'status must be a valid PackageStatus' })
  status?: PackageStatus;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/pagination-query.dto.spec.ts
```
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
git add apps/api/src/modules/packages/dto/pagination-query.dto.ts \
        apps/api/src/modules/packages/dto/pagination-query.dto.spec.ts
git commit -m "feat(api): add PaginationQueryDto with cursor/limit/filter support"
```

---

### Task 6: Barrel Export

**Files:**
- Create: `apps/api/src/modules/packages/dto/index.ts`
- Create: `apps/api/src/modules/packages/dto/index.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/src/modules/packages/dto/index.spec.ts
import { describe, it, expect } from 'vitest';
import * as dtos from './index';

describe('Package DTOs barrel export', () => {
  it('exports CreatePackageDto', () => {
    expect(dtos.CreatePackageDto).toBeDefined();
  });

  it('exports UpdatePackageDto', () => {
    expect(dtos.UpdatePackageDto).toBeDefined();
  });

  it('exports PresignFileDto', () => {
    expect(dtos.PresignFileDto).toBeDefined();
  });

  it('exports ConfirmFileDto', () => {
    expect(dtos.ConfirmFileDto).toBeDefined();
  });

  it('exports PaginationQueryDto', () => {
    expect(dtos.PaginationQueryDto).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/index.spec.ts
```
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/packages/dto/index.ts
export * from './create-package.dto';
export * from './update-package.dto';
export * from './presign-file.dto';
export * from './confirm-file.dto';
export * from './pagination-query.dto';
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && pnpm vitest run src/modules/packages/dto/index.spec.ts
```
Expected: PASS (5 tests)

**Step 5: Full test suite + coverage check**

```bash
cd apps/api && pnpm vitest run --coverage src/modules/packages/dto/
```
Expected: All 43+ tests pass, coverage 100% for DTO files

**Step 6: Commit**

```bash
git add apps/api/src/modules/packages/dto/index.ts \
        apps/api/src/modules/packages/dto/index.spec.ts
git commit -m "feat(api): add package DTOs barrel export"
```

---

### Task 7: Final validation

**Step 1: Run full API test suite**

```bash
cd apps/api && pnpm vitest run
```
Expected: All tests pass, no regressions

**Step 2: Run coverage**

```bash
cd apps/api && pnpm vitest run --coverage
```
Expected: Coverage thresholds met (lines/functions/branches/statements >= 80%)

**Step 3: Cleanup coverage artifacts**

```bash
rm -rf apps/api/coverage
```

**Step 4: Update PROGRESS.md and commit**

```bash
# Edit .agent/PROGRESS.md to say "Current task: 032"
git add .agent/PROGRESS.md
git commit -m "chore: advance progress to task 032"
```

**Step 5: Merge and push**

```bash
git checkout main
git merge --no-ff feature/task-031 -m "Merge feature/task-031: create Package DTOs"
git push origin main
```
