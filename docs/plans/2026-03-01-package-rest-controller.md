# Package REST Controller Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `PackagesController` with all REST endpoints for Package CRUD and file management, then wire everything into `PackagesModule` and import it in `AppModule`.

**Architecture:** Thin NestJS controller under `@Controller('packages')` — global `/api` prefix already set in `main.ts`. All business logic lives in `PackagesService`; controller extracts parameters, delegates, and returns the right HTTP status codes. `PackagesModule` is a standard feature module with controller + service; since `StorageModule` is `@Global()`, no explicit import is needed in `PackagesModule`.

**Tech Stack:** NestJS, class-validator / class-transformer (DTOs already exist), Vitest + `@nestjs/testing` for unit tests.

---

### Task 1: Create the git branch

**Files:** none (git only)

**Step 1: Create and switch to the feature branch**

```bash
git checkout -b feature/task-035
```

Expected: `Switched to a new branch 'feature/task-035'`

**Step 2: Verify**

```bash
git branch --show-current
```

Expected: `feature/task-035`

---

### Task 2: Write the failing controller spec

**Files:**
- Create: `apps/api/src/modules/packages/packages.controller.spec.ts`

The controller test uses `@nestjs/testing` to build an isolated module with a mocked service. Every endpoint is covered: success paths, 404 cases, 400 bad-request, and correct HTTP status codes.

**Step 1: Write the spec**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';
import type { CreatePackageDto } from './dto/create-package.dto';
import type { UpdatePackageDto } from './dto/update-package.dto';
import type { PaginationQueryDto } from './dto/pagination-query.dto';
import type { PresignFileDto } from './dto/presign-file.dto';
import type { ConfirmFileDto } from './dto/confirm-file.dto';

// ── helpers ─────────────────────────────────────────────────────────────────

function makePackage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pkg-uuid-1',
    type: 'document',
    status: 'PENDING',
    metadata: {},
    assemblyLineId: null,
    currentStep: null,
    createdBy: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-uuid-1',
    packageId: 'pkg-uuid-1',
    fileKey: 'packages/pkg-uuid-1/uuid/file.pdf',
    filename: 'file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ── setup ────────────────────────────────────────────────────────────────────

function makeService() {
  return {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    createPresignedUpload: vi.fn(),
    confirmFileUpload: vi.fn(),
    listFiles: vi.fn(),
    deleteFile: vi.fn(),
  };
}

async function buildModule() {
  const mockService = makeService();

  const module: TestingModule = await Test.createTestingModule({
    controllers: [PackagesController],
    providers: [{ provide: PackagesService, useValue: mockService }],
  }).compile();

  const controller = module.get<PackagesController>(PackagesController);
  return { controller, mockService };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('PackagesController', () => {
  let controller: PackagesController;
  let mockService: ReturnType<typeof makeService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ controller, mockService } = await buildModule());
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── POST /api/packages ───────────────────────────────────────────────────

  describe('create', () => {
    it('delegates to PackagesService.create and returns the result', async () => {
      const pkg = makePackage();
      mockService.create.mockResolvedValue(pkg);
      const dto: CreatePackageDto = { type: 'document' };

      const result = await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(pkg);
    });

    it('passes the full dto to the service', async () => {
      const dto: CreatePackageDto = {
        type: 'image',
        metadata: { source: 'upload' },
        assemblyLineId: 'al-uuid-1',
      };
      mockService.create.mockResolvedValue(makePackage());

      await controller.create(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
    });
  });

  // ── GET /api/packages ────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to PackagesService.findAll and returns the result', async () => {
      const paginationResult = {
        data: [makePackage()],
        total: 1,
        cursor: undefined,
      };
      mockService.findAll.mockResolvedValue(paginationResult);
      const query: PaginationQueryDto = { limit: 20 };

      const result = await controller.findAll(query);

      expect(mockService.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(paginationResult);
    });

    it('passes query params including cursor to service', async () => {
      const query: PaginationQueryDto = { limit: 10, cursor: 'some-cursor' };
      mockService.findAll.mockResolvedValue({ data: [], total: 0 });

      await controller.findAll(query);

      expect(mockService.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ── GET /api/packages/:id ────────────────────────────────────────────────

  describe('findById', () => {
    it('delegates to PackagesService.findById and returns the result', async () => {
      const pkg = { ...makePackage(), files: [makeFile()] };
      mockService.findById.mockResolvedValue(pkg);

      const result = await controller.findById('pkg-uuid-1');

      expect(mockService.findById).toHaveBeenCalledWith('pkg-uuid-1');
      expect(result).toEqual(pkg);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.findById.mockRejectedValue(new NotFoundException('Package missing-id not found'));

      await expect(controller.findById('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /api/packages/:id ──────────────────────────────────────────────

  describe('update', () => {
    it('delegates to PackagesService.update and returns the result', async () => {
      const updated = makePackage({ type: 'image' });
      mockService.update.mockResolvedValue(updated);
      const dto: UpdatePackageDto = { type: 'image' };

      const result = await controller.update('pkg-uuid-1', dto);

      expect(mockService.update).toHaveBeenCalledWith('pkg-uuid-1', dto);
      expect(result).toEqual(updated);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.update.mockRejectedValue(new NotFoundException('Package missing not found'));

      await expect(controller.update('missing', {})).rejects.toThrow(NotFoundException);
    });

    it('propagates BadRequestException from service (invalid status transition)', async () => {
      mockService.update.mockRejectedValue(
        new BadRequestException('Invalid status transition from COMPLETED to PENDING'),
      );

      await expect(controller.update('pkg-uuid-1', { status: 'PENDING' as any })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── DELETE /api/packages/:id ─────────────────────────────────────────────

  describe('softDelete', () => {
    it('delegates to PackagesService.softDelete', async () => {
      mockService.softDelete.mockResolvedValue(undefined);

      await controller.softDelete('pkg-uuid-1');

      expect(mockService.softDelete).toHaveBeenCalledWith('pkg-uuid-1');
    });

    it('resolves to void', async () => {
      mockService.softDelete.mockResolvedValue(undefined);

      const result = await controller.softDelete('pkg-uuid-1');

      expect(result).toBeUndefined();
    });

    it('propagates NotFoundException from service', async () => {
      mockService.softDelete.mockRejectedValue(new NotFoundException('Package missing not found'));

      await expect(controller.softDelete('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /api/packages/:id/files/presign ─────────────────────────────────

  describe('presignUpload', () => {
    it('delegates to PackagesService.createPresignedUpload and returns the result', async () => {
      const presignResult = {
        uploadUrl: 'https://s3.example.com/presigned',
        fileKey: 'packages/pkg-uuid-1/uuid/file.pdf',
      };
      mockService.createPresignedUpload.mockResolvedValue(presignResult);
      const dto: PresignFileDto = { filename: 'file.pdf', contentType: 'application/pdf' };

      const result = await controller.presignUpload('pkg-uuid-1', dto);

      expect(mockService.createPresignedUpload).toHaveBeenCalledWith('pkg-uuid-1', dto);
      expect(result).toEqual(presignResult);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.createPresignedUpload.mockRejectedValue(
        new NotFoundException('Package missing not found'),
      );

      await expect(
        controller.presignUpload('missing', { filename: 'f.pdf', contentType: 'application/pdf' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /api/packages/:id/files/confirm ─────────────────────────────────

  describe('confirmUpload', () => {
    it('delegates to PackagesService.confirmFileUpload and returns the file record', async () => {
      const file = makeFile();
      mockService.confirmFileUpload.mockResolvedValue(file);
      const dto: ConfirmFileDto = {
        fileKey: 'packages/pkg-uuid-1/uuid/file.pdf',
        filename: 'file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      };

      const result = await controller.confirmUpload('pkg-uuid-1', dto);

      expect(mockService.confirmFileUpload).toHaveBeenCalledWith('pkg-uuid-1', dto);
      expect(result).toEqual(file);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.confirmFileUpload.mockRejectedValue(
        new NotFoundException('Package missing not found'),
      );

      await expect(
        controller.confirmUpload('missing', {
          fileKey: 'k',
          filename: 'f',
          mimeType: 'm',
          sizeBytes: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── GET /api/packages/:id/files ──────────────────────────────────────────

  describe('listFiles', () => {
    it('delegates to PackagesService.listFiles and returns the result', async () => {
      const files = [makeFile(), makeFile({ id: 'file-uuid-2' })];
      mockService.listFiles.mockResolvedValue(files);

      const result = await controller.listFiles('pkg-uuid-1');

      expect(mockService.listFiles).toHaveBeenCalledWith('pkg-uuid-1');
      expect(result).toEqual(files);
    });

    it('returns an empty array when no files exist', async () => {
      mockService.listFiles.mockResolvedValue([]);

      const result = await controller.listFiles('pkg-uuid-1');

      expect(result).toEqual([]);
    });
  });

  // ── DELETE /api/packages/:id/files/:fileId ───────────────────────────────

  describe('deleteFile', () => {
    it('delegates to PackagesService.deleteFile', async () => {
      mockService.deleteFile.mockResolvedValue(undefined);

      await controller.deleteFile('pkg-uuid-1', 'file-uuid-1');

      expect(mockService.deleteFile).toHaveBeenCalledWith('pkg-uuid-1', 'file-uuid-1');
    });

    it('resolves to void', async () => {
      mockService.deleteFile.mockResolvedValue(undefined);

      const result = await controller.deleteFile('pkg-uuid-1', 'file-uuid-1');

      expect(result).toBeUndefined();
    });

    it('propagates NotFoundException from service', async () => {
      mockService.deleteFile.mockRejectedValue(new NotFoundException('File missing not found'));

      await expect(controller.deleteFile('pkg-uuid-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
```

**Step 2: Run the spec to verify it fails (controller doesn't exist yet)**

```bash
cd apps/api && npx vitest run src/modules/packages/packages.controller.spec.ts
```

Expected: FAIL — `Cannot find module './packages.controller'`

---

### Task 3: Implement `PackagesController`

**Files:**
- Create: `apps/api/src/modules/packages/packages.controller.ts`

**Step 1: Write the controller**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { PresignFileDto } from './dto/presign-file.dto';
import { ConfirmFileDto } from './dto/confirm-file.dto';

@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  // POST /api/packages — 201 Created
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePackageDto) {
    return this.packagesService.create(dto);
  }

  // GET /api/packages — 200 OK
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.packagesService.findAll(query);
  }

  // GET /api/packages/:id — 200 OK
  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.packagesService.findById(id);
  }

  // PATCH /api/packages/:id — 200 OK
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePackageDto) {
    return this.packagesService.update(id, dto);
  }

  // DELETE /api/packages/:id — 204 No Content
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.packagesService.softDelete(id);
  }

  // POST /api/packages/:id/files/presign — 200 OK
  @Post(':id/files/presign')
  presignUpload(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PresignFileDto) {
    return this.packagesService.createPresignedUpload(id, dto);
  }

  // POST /api/packages/:id/files/confirm — 201 Created
  @Post(':id/files/confirm')
  @HttpCode(HttpStatus.CREATED)
  confirmUpload(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmFileDto) {
    return this.packagesService.confirmFileUpload(id, dto);
  }

  // GET /api/packages/:id/files — 200 OK
  @Get(':id/files')
  listFiles(@Param('id', ParseUUIDPipe) id: string) {
    return this.packagesService.listFiles(id);
  }

  // DELETE /api/packages/:id/files/:fileId — 204 No Content
  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.packagesService.deleteFile(id, fileId);
  }
}
```

**Step 2: Run the spec to verify it passes**

```bash
cd apps/api && npx vitest run src/modules/packages/packages.controller.spec.ts
```

Expected: PASS — all tests green

**Step 3: Commit**

```bash
git add apps/api/src/modules/packages/packages.controller.ts \
        apps/api/src/modules/packages/packages.controller.spec.ts
git commit -m "feat(packages): implement PackagesController with all REST endpoints"
```

---

### Task 4: Write the failing module spec

**Files:**
- Create: `apps/api/src/modules/packages/packages.module.spec.ts`

**Step 1: Write the spec**

```typescript
import { describe, it, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PackagesModule } from './packages.module';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';
import { DRIZZLE } from '../../database/database.constants';
import { StorageService } from '../storage/storage.service';

describe('PackagesModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [PackagesModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue({})
      .overrideProvider(StorageService)
      .useValue({ getPresignedUploadUrl: vi.fn(), delete: vi.fn() })
      .compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide PackagesController', () => {
    const controller = module.get<PackagesController>(PackagesController);
    expect(controller).toBeDefined();
  });

  it('should provide PackagesService', () => {
    const service = module.get<PackagesService>(PackagesService);
    expect(service).toBeDefined();
  });
});
```

**Step 2: Run to verify it fails**

```bash
cd apps/api && npx vitest run src/modules/packages/packages.module.spec.ts
```

Expected: FAIL — `Cannot find module './packages.module'`

---

### Task 5: Implement `PackagesModule`

**Files:**
- Create: `apps/api/src/modules/packages/packages.module.ts`

**Step 1: Write the module**

```typescript
import { Module } from '@nestjs/common';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  controllers: [PackagesController],
  providers: [PackagesService],
})
export class PackagesModule {}
```

Note: `StorageModule` is `@Global()` so its `StorageService` is available without importing `StorageModule` here.
`DatabaseModule` uses a global provider (`DRIZZLE`) injected via the token, also available globally.

**Step 2: Run module spec**

```bash
cd apps/api && npx vitest run src/modules/packages/packages.module.spec.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/api/src/modules/packages/packages.module.ts \
        apps/api/src/modules/packages/packages.module.spec.ts
git commit -m "feat(packages): implement PackagesModule"
```

---

### Task 6: Wire `PackagesModule` into `AppModule`

**Files:**
- Modify: `apps/api/src/app.module.ts`

**Step 1: Add the import**

```typescript
// Add to imports at the top of the file
import { PackagesModule } from './modules/packages/packages.module';

// Add PackagesModule to the @Module imports array
```

The final `@Module` decorator's `imports` array should include `PackagesModule`.

**Step 2: Run the full test suite to verify no regressions**

```bash
cd apps/api && npx vitest run
```

Expected: All tests pass (including existing packages service, status machine, and DTO specs)

**Step 3: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(packages): register PackagesModule in AppModule"
```

---

### Task 7: Verify coverage thresholds

**Step 1: Run with coverage**

```bash
cd apps/api && npx vitest run --coverage
```

Expected: lines ≥ 80%, functions ≥ 80%, branches ≥ 80%, statements ≥ 80%. Controller should be at 100%.

**Step 2: Remove coverage artifacts**

```bash
rm -rf apps/api/coverage
```

---

### Task 8: Run the application to validate end-to-end

**Step 1: Ensure environment prerequisites exist (check for .env)**

```bash
ls apps/api/.env 2>/dev/null || echo "No .env found — run via turbo dev or check README"
```

**Step 2: Build to verify TypeScript compilation**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors

**Step 3: Stop any running dev servers (clean up)**

After verifying the build is clean, no dev server is started to conserve resources. Document why: the application requires database and S3 connections that need a full docker-compose environment.

---

### Task 9: Final cleanup and merge

**Step 1: Increment task in PROGRESS.md**

Update `.agent/PROGRESS.md` from `035` to `036`.

**Step 2: Commit PROGRESS.md**

```bash
git add .agent/PROGRESS.md
git commit -m "chore: advance task tracker to 036"
```

**Step 3: Merge feature branch to main**

```bash
git checkout main
git merge --no-ff feature/task-035 -m "Merge feature/task-035: implement PackagesController and PackagesModule"
```

**Step 4: Check for remote and push if exists**

```bash
git remote | grep origin && git push origin main || echo "No remote origin configured"
```
