import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import request from 'supertest';
import { AssemblyLinesController } from './assembly-lines.controller';
import { AssemblyLinesService } from './assembly-lines.service';
import { PackagesService } from '../../packages/packages.service';
import { globalValidationPipe } from '../../../common/pipes/validation.pipe';

// ── helpers ────────────────────────────────────────────────────────────────

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-uuid-1',
    name: 'My Pipeline',
    slug: 'my-pipeline',
    description: null,
    status: 'ACTIVE',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeLineWithStepCount(overrides: Record<string, unknown> = {}) {
  return { ...makeLine(), stepCount: 2, ...overrides };
}

function makeLineWithSteps(overrides: Record<string, unknown> = {}) {
  return {
    ...makeLine(),
    steps: [
      {
        id: 'step-uuid-1',
        assemblyLineId: 'line-uuid-1',
        stepNumber: 1,
        workerVersionId: 'wv-uuid-1',
        configOverrides: null,
        workerName: 'my-worker',
        workerVersionNumber: 1,
      },
    ],
    ...overrides,
  };
}

function makePackage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pkg-uuid-1',
    type: 'document',
    status: 'IN_TRANSIT',
    metadata: {},
    assemblyLineId: 'line-uuid-1',
    currentStep: 1,
    createdBy: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makePaginationResult(packages: unknown[] = []) {
  return { data: packages, total: packages.length, cursor: undefined };
}

function makeAssemblyLinesService() {
  return {
    create: vi.fn(),
    findAll: vi.fn(),
    findBySlug: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    submit: vi.fn(),
  };
}

function makePackagesService() {
  return {
    findAll: vi.fn(),
  };
}

const SLUG = 'my-pipeline';
const VALID_STEP = { workerVersionId: '550e8400-e29b-41d4-a716-446655440000' };

// ── unit tests ─────────────────────────────────────────────────────────────

describe('AssemblyLinesController', () => {
  let controller: AssemblyLinesController;
  let mockAssemblyLinesService: ReturnType<typeof makeAssemblyLinesService>;
  let mockPackagesService: ReturnType<typeof makePackagesService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAssemblyLinesService = makeAssemblyLinesService();
    mockPackagesService = makePackagesService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssemblyLinesController],
      providers: [
        { provide: AssemblyLinesService, useValue: mockAssemblyLinesService },
        { provide: PackagesService, useValue: mockPackagesService },
      ],
    }).compile();

    controller = module.get<AssemblyLinesController>(AssemblyLinesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('delegates to service.create and returns the result', async () => {
      const line = makeLine();
      const dto = { name: 'My Pipeline', steps: [VALID_STEP] };
      mockAssemblyLinesService.create.mockResolvedValue(line);

      const result = await controller.create(dto as any);

      expect(mockAssemblyLinesService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(line);
    });

    it('propagates ConflictException from service', async () => {
      mockAssemblyLinesService.create.mockRejectedValue(
        new ConflictException('Assembly line with slug "my-pipeline" already exists'),
      );

      await expect(
        controller.create({ name: 'My Pipeline', steps: [VALID_STEP] } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('propagates BadRequestException from service', async () => {
      mockAssemblyLinesService.create.mockRejectedValue(
        new BadRequestException('Worker version "x" does not exist'),
      );

      await expect(
        controller.create({ name: 'My Pipeline', steps: [VALID_STEP] } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to service.findAll and returns the result', async () => {
      const lines = [makeLineWithStepCount()];
      mockAssemblyLinesService.findAll.mockResolvedValue(lines);

      const result = await controller.findAll();

      expect(mockAssemblyLinesService.findAll).toHaveBeenCalledOnce();
      expect(result).toEqual(lines);
    });

    it('returns empty array when no assembly lines exist', async () => {
      mockAssemblyLinesService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
    });
  });

  // ── findBySlug ─────────────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('delegates to service.findBySlug and returns the result', async () => {
      const line = makeLineWithSteps();
      mockAssemblyLinesService.findBySlug.mockResolvedValue(line);

      const result = await controller.findBySlug(SLUG);

      expect(mockAssemblyLinesService.findBySlug).toHaveBeenCalledWith(SLUG);
      expect(result).toEqual(line);
    });

    it('propagates NotFoundException from service', async () => {
      mockAssemblyLinesService.findBySlug.mockRejectedValue(
        new NotFoundException(`Assembly line "${SLUG}" not found`),
      );

      await expect(controller.findBySlug(SLUG)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('delegates to service.update and returns the result', async () => {
      const updated = makeLine({ name: 'Updated' });
      const dto = { name: 'Updated' };
      mockAssemblyLinesService.update.mockResolvedValue(updated);

      const result = await controller.update(SLUG, dto as any);

      expect(mockAssemblyLinesService.update).toHaveBeenCalledWith(SLUG, dto);
      expect(result).toEqual(updated);
    });

    it('propagates NotFoundException from service', async () => {
      mockAssemblyLinesService.update.mockRejectedValue(
        new NotFoundException(`Assembly line "${SLUG}" not found`),
      );

      await expect(controller.update(SLUG, {} as any)).rejects.toThrow(NotFoundException);
    });

    it('propagates ConflictException from service', async () => {
      mockAssemblyLinesService.update.mockRejectedValue(
        new ConflictException('Assembly line with slug "new-name" already exists'),
      );

      await expect(controller.update(SLUG, { name: 'New Name' } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── archive ────────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('delegates to service.archive and returns undefined (204)', async () => {
      mockAssemblyLinesService.archive.mockResolvedValue(makeLine({ status: 'ARCHIVED' }));

      const result = await controller.archive(SLUG);

      expect(mockAssemblyLinesService.archive).toHaveBeenCalledWith(SLUG);
      expect(result).toBeUndefined();
    });

    it('propagates NotFoundException from service', async () => {
      mockAssemblyLinesService.archive.mockRejectedValue(
        new NotFoundException(`Assembly line "${SLUG}" not found or already archived`),
      );

      await expect(controller.archive(SLUG)).rejects.toThrow(NotFoundException);
    });
  });

  // ── submit ─────────────────────────────────────────────────────────────────

  describe('submit', () => {
    it('delegates to service.submit and returns the created package', async () => {
      const pkg = makePackage();
      const dto = { type: 'document', metadata: { key: 'value' } };
      mockAssemblyLinesService.submit.mockResolvedValue(pkg);

      const result = await controller.submit(SLUG, dto);

      expect(mockAssemblyLinesService.submit).toHaveBeenCalledWith(SLUG, dto);
      expect(result).toEqual(pkg);
    });

    it('delegates to service.submit with only type (no metadata)', async () => {
      const pkg = makePackage();
      const dto = { type: 'document' };
      mockAssemblyLinesService.submit.mockResolvedValue(pkg);

      const result = await controller.submit(SLUG, dto);

      expect(mockAssemblyLinesService.submit).toHaveBeenCalledWith(SLUG, dto);
      expect(result).toEqual(pkg);
    });

    it('propagates NotFoundException from service', async () => {
      mockAssemblyLinesService.submit.mockRejectedValue(
        new NotFoundException(`Assembly line "${SLUG}" not found`),
      );

      await expect(controller.submit(SLUG, { type: 'document' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propagates BadRequestException when line is paused/archived', async () => {
      mockAssemblyLinesService.submit.mockRejectedValue(
        new BadRequestException('Assembly line "my-pipeline" is PAUSED and not accepting submissions'),
      );

      await expect(controller.submit(SLUG, { type: 'document' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── listPackages ───────────────────────────────────────────────────────────

  describe('listPackages', () => {
    it('delegates to packagesService.findAll with assemblyLineId filter', async () => {
      const line = makeLine();
      const result = makePaginationResult([makePackage()]);
      mockAssemblyLinesService.findBySlug.mockResolvedValue(line);
      mockPackagesService.findAll.mockResolvedValue(result);

      const response = await controller.listPackages(SLUG, {});

      expect(mockAssemblyLinesService.findBySlug).toHaveBeenCalledWith(SLUG);
      expect(mockPackagesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ assemblyLineId: 'line-uuid-1' }),
      );
      expect(response).toEqual(result);
    });

    it('passes query params to packagesService.findAll', async () => {
      const line = makeLine();
      mockAssemblyLinesService.findBySlug.mockResolvedValue(line);
      mockPackagesService.findAll.mockResolvedValue(makePaginationResult([]));

      await controller.listPackages(SLUG, { limit: 10, status: 'IN_TRANSIT' as any });

      expect(mockPackagesService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          assemblyLineId: 'line-uuid-1',
          limit: 10,
          status: 'IN_TRANSIT',
        }),
      );
    });

    it('propagates NotFoundException when assembly line not found', async () => {
      mockAssemblyLinesService.findBySlug.mockRejectedValue(
        new NotFoundException(`Assembly line "${SLUG}" not found`),
      );

      await expect(controller.listPackages(SLUG, {})).rejects.toThrow(NotFoundException);
    });
  });
});

// ── HTTP integration tests (Supertest) ────────────────────────────────────────

describe('AssemblyLinesController HTTP integration', () => {
  let app: INestApplication;
  let mockAssemblyLinesService: ReturnType<typeof makeAssemblyLinesService>;
  let mockPackagesService: ReturnType<typeof makePackagesService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAssemblyLinesService = makeAssemblyLinesService();
    mockPackagesService = makePackagesService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssemblyLinesController],
      providers: [
        { provide: AssemblyLinesService, useValue: mockAssemblyLinesService },
        { provide: PackagesService, useValue: mockPackagesService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(globalValidationPipe);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── success status codes ───────────────────────────────────────────────────

  it('POST /assembly-lines → 201', async () => {
    mockAssemblyLinesService.create.mockResolvedValue(makeLine());
    await request(app.getHttpServer())
      .post('/assembly-lines')
      .send({ name: 'My Pipeline', steps: [VALID_STEP] })
      .expect(201);
  });

  it('GET /assembly-lines → 200', async () => {
    mockAssemblyLinesService.findAll.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/assembly-lines').expect(200);
  });

  it('GET /assembly-lines/:slug → 200', async () => {
    mockAssemblyLinesService.findBySlug.mockResolvedValue(makeLineWithSteps());
    await request(app.getHttpServer()).get(`/assembly-lines/${SLUG}`).expect(200);
  });

  it('PATCH /assembly-lines/:slug → 200', async () => {
    mockAssemblyLinesService.update.mockResolvedValue(makeLine());
    await request(app.getHttpServer())
      .patch(`/assembly-lines/${SLUG}`)
      .send({ description: 'Updated' })
      .expect(200);
  });

  it('PATCH /assembly-lines/:slug with status PAUSED → 200', async () => {
    mockAssemblyLinesService.update.mockResolvedValue(makeLine({ status: 'PAUSED' }));
    await request(app.getHttpServer())
      .patch(`/assembly-lines/${SLUG}`)
      .send({ status: 'PAUSED' })
      .expect(200);
  });

  it('DELETE /assembly-lines/:slug → 204', async () => {
    mockAssemblyLinesService.archive.mockResolvedValue(makeLine({ status: 'ARCHIVED' }));
    await request(app.getHttpServer())
      .delete(`/assembly-lines/${SLUG}`)
      .expect(204);
  });

  it('POST /assembly-lines/:slug/submit → 201', async () => {
    mockAssemblyLinesService.submit.mockResolvedValue(makePackage());
    await request(app.getHttpServer())
      .post(`/assembly-lines/${SLUG}/submit`)
      .send({ type: 'document' })
      .expect(201);
  });

  it('POST /assembly-lines/:slug/submit with metadata → 201', async () => {
    mockAssemblyLinesService.submit.mockResolvedValue(makePackage());
    await request(app.getHttpServer())
      .post(`/assembly-lines/${SLUG}/submit`)
      .send({ type: 'document', metadata: { key: 'value' } })
      .expect(201);
  });

  it('GET /assembly-lines/:slug/packages → 200', async () => {
    mockAssemblyLinesService.findBySlug.mockResolvedValue(makeLine());
    mockPackagesService.findAll.mockResolvedValue(makePaginationResult([]));
    await request(app.getHttpServer())
      .get(`/assembly-lines/${SLUG}/packages`)
      .expect(200);
  });

  it('GET /assembly-lines/:slug/packages with query params → 200', async () => {
    mockAssemblyLinesService.findBySlug.mockResolvedValue(makeLine());
    mockPackagesService.findAll.mockResolvedValue(makePaginationResult([]));
    await request(app.getHttpServer())
      .get(`/assembly-lines/${SLUG}/packages?limit=10&status=IN_TRANSIT`)
      .expect(200);
  });

  // ── invalid slug → 400 ────────────────────────────────────────────────────

  it('GET /assembly-lines/INVALID-SLUG → 400 (uppercase not allowed)', async () => {
    await request(app.getHttpServer()).get('/assembly-lines/INVALID-SLUG').expect(400);
  });

  it('GET /assembly-lines/my--pipeline → 400 (double hyphen)', async () => {
    await request(app.getHttpServer()).get('/assembly-lines/my--pipeline').expect(400);
  });

  it('GET /assembly-lines/my-pipeline- → 400 (trailing hyphen)', async () => {
    await request(app.getHttpServer()).get('/assembly-lines/my-pipeline-').expect(400);
  });

  it('PATCH /assembly-lines/UPPERCASE → 400 (invalid slug)', async () => {
    await request(app.getHttpServer())
      .patch('/assembly-lines/UPPERCASE')
      .send({ description: 'Updated' })
      .expect(400);
  });

  it('DELETE /assembly-lines/UPPERCASE → 400 (invalid slug)', async () => {
    await request(app.getHttpServer())
      .delete('/assembly-lines/UPPERCASE')
      .expect(400);
  });

  it('POST /assembly-lines/UPPERCASE/submit → 400 (invalid slug)', async () => {
    await request(app.getHttpServer())
      .post('/assembly-lines/UPPERCASE/submit')
      .send({ type: 'document' })
      .expect(400);
  });

  it('GET /assembly-lines/UPPERCASE/packages → 400 (invalid slug)', async () => {
    await request(app.getHttpServer())
      .get('/assembly-lines/UPPERCASE/packages')
      .expect(400);
  });

  // ── body validation → 400 ─────────────────────────────────────────────────

  it('POST /assembly-lines with missing name → 400', async () => {
    await request(app.getHttpServer())
      .post('/assembly-lines')
      .send({ steps: [VALID_STEP] })
      .expect(400);
  });

  it('POST /assembly-lines with empty name → 400', async () => {
    await request(app.getHttpServer())
      .post('/assembly-lines')
      .send({ name: '', steps: [VALID_STEP] })
      .expect(400);
  });

  it('POST /assembly-lines with empty steps array → 400', async () => {
    await request(app.getHttpServer())
      .post('/assembly-lines')
      .send({ name: 'My Pipeline', steps: [] })
      .expect(400);
  });

  it('POST /assembly-lines with missing steps → 400', async () => {
    await request(app.getHttpServer())
      .post('/assembly-lines')
      .send({ name: 'My Pipeline' })
      .expect(400);
  });

  it('POST /assembly-lines/:slug/submit with missing type → 400', async () => {
    await request(app.getHttpServer())
      .post(`/assembly-lines/${SLUG}/submit`)
      .send({})
      .expect(400);
  });

  it('POST /assembly-lines/:slug/submit with empty type → 400', async () => {
    await request(app.getHttpServer())
      .post(`/assembly-lines/${SLUG}/submit`)
      .send({ type: '' })
      .expect(400);
  });

  it('PATCH /assembly-lines/:slug with invalid status → 400', async () => {
    await request(app.getHttpServer())
      .patch(`/assembly-lines/${SLUG}`)
      .send({ status: 'INVALID_STATUS' })
      .expect(400);
  });

  // ── 404 responses ─────────────────────────────────────────────────────────

  it('GET /assembly-lines/:slug → 404 when service throws NotFoundException', async () => {
    mockAssemblyLinesService.findBySlug.mockRejectedValue(
      new NotFoundException('Assembly line not found'),
    );
    await request(app.getHttpServer()).get(`/assembly-lines/${SLUG}`).expect(404);
  });

  it('PATCH /assembly-lines/:slug → 404 when service throws NotFoundException', async () => {
    mockAssemblyLinesService.update.mockRejectedValue(
      new NotFoundException('Assembly line not found'),
    );
    await request(app.getHttpServer())
      .patch(`/assembly-lines/${SLUG}`)
      .send({ description: 'x' })
      .expect(404);
  });

  it('DELETE /assembly-lines/:slug → 404 when service throws NotFoundException', async () => {
    mockAssemblyLinesService.archive.mockRejectedValue(
      new NotFoundException('Assembly line not found'),
    );
    await request(app.getHttpServer())
      .delete(`/assembly-lines/${SLUG}`)
      .expect(404);
  });

  it('POST /assembly-lines/:slug/submit → 404 when service throws NotFoundException', async () => {
    mockAssemblyLinesService.submit.mockRejectedValue(
      new NotFoundException('Assembly line not found'),
    );
    await request(app.getHttpServer())
      .post(`/assembly-lines/${SLUG}/submit`)
      .send({ type: 'document' })
      .expect(404);
  });

  it('GET /assembly-lines/:slug/packages → 404 when assembly line not found', async () => {
    mockAssemblyLinesService.findBySlug.mockRejectedValue(
      new NotFoundException('Assembly line not found'),
    );
    await request(app.getHttpServer())
      .get(`/assembly-lines/${SLUG}/packages`)
      .expect(404);
  });

  // ── 400 on paused/archived submit ─────────────────────────────────────────

  it('POST /assembly-lines/:slug/submit → 400 when line is paused', async () => {
    mockAssemblyLinesService.submit.mockRejectedValue(
      new BadRequestException('Assembly line "my-pipeline" is PAUSED and not accepting submissions'),
    );
    await request(app.getHttpServer())
      .post(`/assembly-lines/${SLUG}/submit`)
      .send({ type: 'document' })
      .expect(400);
  });

  it('POST /assembly-lines/:slug/submit → 400 when line is archived', async () => {
    mockAssemblyLinesService.submit.mockRejectedValue(
      new BadRequestException('Assembly line "my-pipeline" is ARCHIVED and not accepting submissions'),
    );
    await request(app.getHttpServer())
      .post(`/assembly-lines/${SLUG}/submit`)
      .send({ type: 'document' })
      .expect(400);
  });

  // ── 409 conflict ──────────────────────────────────────────────────────────

  it('POST /assembly-lines → 409 when service throws ConflictException', async () => {
    mockAssemblyLinesService.create.mockRejectedValue(
      new ConflictException('Assembly line with slug "my-pipeline" already exists'),
    );
    await request(app.getHttpServer())
      .post('/assembly-lines')
      .send({ name: 'My Pipeline', steps: [VALID_STEP] })
      .expect(409);
  });
});
