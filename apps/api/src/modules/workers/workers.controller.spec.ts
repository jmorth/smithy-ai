import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import request from 'supertest';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';
import { globalValidationPipe } from '../../common/pipes/validation.pipe';
import type { CreateWorkerDto } from './dto/create-worker.dto';
import type { UpdateWorkerDto } from './dto/update-worker.dto';
import type { CreateWorkerVersionDto } from './dto/create-worker-version.dto';
import type { DeprecateVersionDto } from './dto/deprecate-version.dto';

// ── helpers ────────────────────────────────────────────────────────────────

function makeWorker(overrides: Record<string, unknown> = {}) {
  return {
    id: 'worker-uuid-1',
    name: 'My Worker',
    slug: 'my-worker',
    description: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-uuid-1',
    workerId: 'worker-uuid-1',
    version: 1,
    yamlConfig: {
      name: 'my-worker',
      inputTypes: ['text'],
      outputType: 'text',
      provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'OPENAI_API_KEY' },
    },
    dockerfileHash: null,
    status: 'ACTIVE',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeWorkerWithVersions(overrides: Record<string, unknown> = {}) {
  return { ...makeWorker(), versions: [makeVersion()], ...overrides };
}

function makeService() {
  return {
    createWorker: vi.fn(),
    findAll: vi.fn(),
    findBySlug: vi.fn(),
    updateWorker: vi.fn(),
    createVersion: vi.fn(),
    findVersion: vi.fn(),
    deprecateVersion: vi.fn(),
  };
}

const SLUG = 'my-worker';
const VALID_YAML_CONFIG = {
  name: 'my-worker',
  inputTypes: ['text'],
  outputType: 'text',
  provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'OPENAI_API_KEY' },
};

// ── unit tests ─────────────────────────────────────────────────────────────

describe('WorkersController', () => {
  let controller: WorkersController;
  let mockService: ReturnType<typeof makeService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockService = makeService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkersController],
      providers: [{ provide: WorkersService, useValue: mockService }],
    }).compile();

    controller = module.get<WorkersController>(WorkersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── createWorker ───────────────────────────────────────────────────────────

  describe('createWorker', () => {
    it('delegates to service.createWorker and returns the result', async () => {
      const worker = makeWorker();
      const dto: CreateWorkerDto = { name: 'My Worker' };
      mockService.createWorker.mockResolvedValue(worker);

      const result = await controller.createWorker(dto);

      expect(mockService.createWorker).toHaveBeenCalledWith(dto);
      expect(result).toEqual(worker);
    });

    it('includes description when provided', async () => {
      const worker = makeWorker({ description: 'A worker' });
      const dto: CreateWorkerDto = { name: 'My Worker', description: 'A worker' };
      mockService.createWorker.mockResolvedValue(worker);

      await controller.createWorker(dto);

      expect(mockService.createWorker).toHaveBeenCalledWith(dto);
    });

    it('propagates ConflictException from service', async () => {
      mockService.createWorker.mockRejectedValue(
        new ConflictException('Worker with slug "my-worker" already exists'),
      );

      await expect(controller.createWorker({ name: 'My Worker' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to service.findAll and returns the result', async () => {
      const workers = [makeWorkerWithVersions()];
      mockService.findAll.mockResolvedValue(workers);

      const result = await controller.findAll();

      expect(mockService.findAll).toHaveBeenCalledOnce();
      expect(result).toEqual(workers);
    });

    it('returns empty array when no workers exist', async () => {
      mockService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
    });
  });

  // ── findBySlug ─────────────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('delegates to service.findBySlug and returns the result', async () => {
      const worker = makeWorkerWithVersions();
      mockService.findBySlug.mockResolvedValue(worker);

      const result = await controller.findBySlug(SLUG);

      expect(mockService.findBySlug).toHaveBeenCalledWith(SLUG);
      expect(result).toEqual(worker);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.findBySlug.mockRejectedValue(
        new NotFoundException(`Worker "${SLUG}" not found`),
      );

      await expect(controller.findBySlug(SLUG)).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateWorker ───────────────────────────────────────────────────────────

  describe('updateWorker', () => {
    it('delegates to service.updateWorker and returns the result', async () => {
      const updated = makeWorker({ name: 'Updated' });
      const dto: UpdateWorkerDto = { name: 'Updated' };
      mockService.updateWorker.mockResolvedValue(updated);

      const result = await controller.updateWorker(SLUG, dto);

      expect(mockService.updateWorker).toHaveBeenCalledWith(SLUG, dto);
      expect(result).toEqual(updated);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.updateWorker.mockRejectedValue(
        new NotFoundException(`Worker "${SLUG}" not found`),
      );

      await expect(controller.updateWorker(SLUG, {})).rejects.toThrow(NotFoundException);
    });

    it('propagates ConflictException from service', async () => {
      mockService.updateWorker.mockRejectedValue(
        new ConflictException('Worker with slug "new-name" already exists'),
      );

      await expect(controller.updateWorker(SLUG, { name: 'New Name' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── createVersion ──────────────────────────────────────────────────────────

  describe('createVersion', () => {
    it('delegates to service.createVersion and returns the result', async () => {
      const version = makeVersion();
      const dto: CreateWorkerVersionDto = { yamlConfig: VALID_YAML_CONFIG };
      mockService.createVersion.mockResolvedValue(version);

      const result = await controller.createVersion(SLUG, dto);

      expect(mockService.createVersion).toHaveBeenCalledWith(SLUG, dto);
      expect(result).toEqual(version);
    });

    it('throws BadRequestException for invalid yamlConfig', async () => {
      const dto: CreateWorkerVersionDto = { yamlConfig: { invalid: true } };

      await expect(controller.createVersion(SLUG, dto)).rejects.toThrow(BadRequestException);
      expect(mockService.createVersion).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException from service', async () => {
      const dto: CreateWorkerVersionDto = { yamlConfig: VALID_YAML_CONFIG };
      mockService.createVersion.mockRejectedValue(
        new NotFoundException(`Worker "${SLUG}" not found`),
      );

      await expect(controller.createVersion(SLUG, dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findVersion ────────────────────────────────────────────────────────────

  describe('findVersion', () => {
    it('delegates to service.findVersion and returns the result', async () => {
      const version = makeVersion();
      mockService.findVersion.mockResolvedValue(version);

      const result = await controller.findVersion(SLUG, 1);

      expect(mockService.findVersion).toHaveBeenCalledWith(SLUG, 1);
      expect(result).toEqual(version);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.findVersion.mockRejectedValue(
        new NotFoundException(`Version 1 not found for worker "${SLUG}"`),
      );

      await expect(controller.findVersion(SLUG, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ── deprecateVersion ───────────────────────────────────────────────────────

  describe('deprecateVersion', () => {
    it('delegates to service.deprecateVersion and returns the result', async () => {
      const deprecated = makeVersion({ status: 'DEPRECATED' });
      const dto: DeprecateVersionDto = { status: 'DEPRECATED' };
      mockService.deprecateVersion.mockResolvedValue(deprecated);

      const result = await controller.deprecateVersion(SLUG, 1, dto);

      expect(mockService.deprecateVersion).toHaveBeenCalledWith(SLUG, 1);
      expect(result).toEqual(deprecated);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.deprecateVersion.mockRejectedValue(
        new NotFoundException(`Version 1 not found for worker "${SLUG}"`),
      );

      await expect(
        controller.deprecateVersion(SLUG, 1, { status: 'DEPRECATED' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

// ── HTTP integration tests (Supertest) ────────────────────────────────────────

describe('WorkersController HTTP integration', () => {
  let app: INestApplication;
  let mockService: ReturnType<typeof makeService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockService = makeService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkersController],
      providers: [{ provide: WorkersService, useValue: mockService }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(globalValidationPipe);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── success status codes ───────────────────────────────────────────────────

  it('POST /workers → 201', async () => {
    mockService.createWorker.mockResolvedValue(makeWorker());
    await request(app.getHttpServer())
      .post('/workers')
      .send({ name: 'My Worker' })
      .expect(201);
  });

  it('GET /workers → 200', async () => {
    mockService.findAll.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/workers').expect(200);
  });

  it('GET /workers/:slug → 200', async () => {
    mockService.findBySlug.mockResolvedValue(makeWorkerWithVersions());
    await request(app.getHttpServer()).get(`/workers/${SLUG}`).expect(200);
  });

  it('PATCH /workers/:slug → 200', async () => {
    mockService.updateWorker.mockResolvedValue(makeWorker());
    await request(app.getHttpServer())
      .patch(`/workers/${SLUG}`)
      .send({ description: 'Updated' })
      .expect(200);
  });

  it('POST /workers/:slug/versions → 201', async () => {
    mockService.createVersion.mockResolvedValue(makeVersion());
    await request(app.getHttpServer())
      .post(`/workers/${SLUG}/versions`)
      .send({ yamlConfig: VALID_YAML_CONFIG })
      .expect(201);
  });

  it('GET /workers/:slug/versions/:version → 200', async () => {
    mockService.findVersion.mockResolvedValue(makeVersion());
    await request(app.getHttpServer())
      .get(`/workers/${SLUG}/versions/1`)
      .expect(200);
  });

  it('PATCH /workers/:slug/versions/:version → 200', async () => {
    mockService.deprecateVersion.mockResolvedValue(makeVersion({ status: 'DEPRECATED' }));
    await request(app.getHttpServer())
      .patch(`/workers/${SLUG}/versions/1`)
      .send({ status: 'DEPRECATED' })
      .expect(200);
  });

  // ── invalid slug → 400 ────────────────────────────────────────────────────

  it('GET /workers/INVALID-SLUG → 400 (uppercase not allowed)', async () => {
    await request(app.getHttpServer()).get('/workers/INVALID-SLUG').expect(400);
  });

  it('GET /workers/my--worker → 400 (double hyphen)', async () => {
    await request(app.getHttpServer()).get('/workers/my--worker').expect(400);
  });

  it('GET /workers/my-worker- → 400 (trailing hyphen)', async () => {
    await request(app.getHttpServer()).get('/workers/my-worker-').expect(400);
  });

  it('PATCH /workers/UPPERCASE → 400 (invalid slug)', async () => {
    await request(app.getHttpServer())
      .patch('/workers/UPPERCASE')
      .send({ description: 'Updated' })
      .expect(400);
  });

  it('POST /workers/UPPERCASE/versions → 400 (invalid slug)', async () => {
    await request(app.getHttpServer())
      .post('/workers/UPPERCASE/versions')
      .send({ yamlConfig: VALID_YAML_CONFIG })
      .expect(400);
  });

  // ── invalid version number → 400 ──────────────────────────────────────────

  it('GET /workers/:slug/versions/not-a-number → 400', async () => {
    await request(app.getHttpServer())
      .get(`/workers/${SLUG}/versions/not-a-number`)
      .expect(400);
  });

  it('PATCH /workers/:slug/versions/not-a-number → 400', async () => {
    await request(app.getHttpServer())
      .patch(`/workers/${SLUG}/versions/not-a-number`)
      .send({ status: 'DEPRECATED' })
      .expect(400);
  });

  // ── body validation → 400 ─────────────────────────────────────────────────

  it('POST /workers with missing name → 400', async () => {
    await request(app.getHttpServer())
      .post('/workers')
      .send({})
      .expect(400);
  });

  it('POST /workers with empty name → 400', async () => {
    await request(app.getHttpServer())
      .post('/workers')
      .send({ name: '' })
      .expect(400);
  });

  it('POST /workers/:slug/versions with missing yamlConfig → 400', async () => {
    await request(app.getHttpServer())
      .post(`/workers/${SLUG}/versions`)
      .send({})
      .expect(400);
  });

  it('POST /workers/:slug/versions with invalid yamlConfig schema → 400', async () => {
    await request(app.getHttpServer())
      .post(`/workers/${SLUG}/versions`)
      .send({ yamlConfig: { invalid: true } })
      .expect(400);
  });

  it('PATCH /workers/:slug/versions/:version with invalid status → 400', async () => {
    await request(app.getHttpServer())
      .patch(`/workers/${SLUG}/versions/1`)
      .send({ status: 'ACTIVE' })
      .expect(400);
  });

  it('PATCH /workers/:slug/versions/:version with no body → 400', async () => {
    await request(app.getHttpServer())
      .patch(`/workers/${SLUG}/versions/1`)
      .send({})
      .expect(400);
  });

  // ── 404 responses ─────────────────────────────────────────────────────────

  it('GET /workers/:slug → 404 when service throws NotFoundException', async () => {
    mockService.findBySlug.mockRejectedValue(new NotFoundException('Worker not found'));
    await request(app.getHttpServer()).get(`/workers/${SLUG}`).expect(404);
  });

  it('PATCH /workers/:slug → 404 when service throws NotFoundException', async () => {
    mockService.updateWorker.mockRejectedValue(new NotFoundException('Worker not found'));
    await request(app.getHttpServer())
      .patch(`/workers/${SLUG}`)
      .send({ description: 'x' })
      .expect(404);
  });

  it('POST /workers/:slug/versions → 404 when service throws NotFoundException', async () => {
    mockService.createVersion.mockRejectedValue(new NotFoundException('Worker not found'));
    await request(app.getHttpServer())
      .post(`/workers/${SLUG}/versions`)
      .send({ yamlConfig: VALID_YAML_CONFIG })
      .expect(404);
  });

  it('GET /workers/:slug/versions/:version → 404 when service throws NotFoundException', async () => {
    mockService.findVersion.mockRejectedValue(
      new NotFoundException('Version 99 not found for worker "my-worker"'),
    );
    await request(app.getHttpServer())
      .get(`/workers/${SLUG}/versions/99`)
      .expect(404);
  });

  it('PATCH /workers/:slug/versions/:version → 404 when service throws NotFoundException', async () => {
    mockService.deprecateVersion.mockRejectedValue(
      new NotFoundException('Version 99 not found for worker "my-worker"'),
    );
    await request(app.getHttpServer())
      .patch(`/workers/${SLUG}/versions/99`)
      .send({ status: 'DEPRECATED' })
      .expect(404);
  });

  // ── 409 conflict ──────────────────────────────────────────────────────────

  it('POST /workers → 409 when service throws ConflictException', async () => {
    mockService.createWorker.mockRejectedValue(
      new ConflictException('Worker with slug "my-worker" already exists'),
    );
    await request(app.getHttpServer())
      .post('/workers')
      .send({ name: 'My Worker' })
      .expect(409);
  });

  it('PATCH /workers/:slug → 409 when service throws ConflictException', async () => {
    mockService.updateWorker.mockRejectedValue(
      new ConflictException('Worker with slug "new-slug" already exists'),
    );
    await request(app.getHttpServer())
      .patch(`/workers/${SLUG}`)
      .send({ name: 'New Slug' })
      .expect(409);
  });
});
