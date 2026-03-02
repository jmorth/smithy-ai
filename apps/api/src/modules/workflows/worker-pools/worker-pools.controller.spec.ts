import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import request from 'supertest';
import { WorkerPoolsController } from './worker-pools.controller';
import { WorkerPoolsService } from './worker-pools.service';
import { PoolRouterService } from './pool-router.service';
import { globalValidationPipe } from '../../../common/pipes/validation.pipe';

// ── helpers ────────────────────────────────────────────────────────────────

function makePool(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pool-uuid-1',
    name: 'My Pool',
    slug: 'my-pool',
    description: null,
    status: 'ACTIVE',
    maxConcurrency: 5,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makePoolWithMemberCount(overrides: Record<string, unknown> = {}) {
  return { ...makePool(), memberCount: 2, ...overrides };
}

function makePoolWithMembers(overrides: Record<string, unknown> = {}) {
  return {
    ...makePool(),
    members: [
      {
        id: 'member-uuid-1',
        poolId: 'pool-uuid-1',
        workerVersionId: 'wv-uuid-1',
        priority: 1,
        workerName: 'my-worker',
        workerVersionNumber: 1,
      },
    ],
    queueDepth: null,
    ...overrides,
  };
}

function makePackage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pkg-uuid-1',
    type: 'document',
    status: 'PENDING',
    metadata: {},
    assemblyLineId: null,
    workerPoolId: 'pool-uuid-1',
    currentStep: null,
    createdBy: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeRoutingResult(overrides: Record<string, unknown> = {}) {
  return {
    workerSlug: 'my-worker',
    workerVersion: 1,
    status: 'dispatched' as const,
    ...overrides,
  };
}

function makeSubmitResult(overrides: Record<string, unknown> = {}) {
  return {
    package: makePackage(),
    routing: makeRoutingResult(),
    ...overrides,
  };
}

function makeWorkerPoolsService() {
  return {
    create: vi.fn(),
    findAll: vi.fn(),
    findBySlug: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    submit: vi.fn(),
  };
}

function makePoolRouterService() {
  return {
    getActiveCount: vi.fn(),
  };
}

const SLUG = 'my-pool';
const VALID_MEMBER = { workerVersionId: '550e8400-e29b-41d4-a716-446655440000' };

// ── unit tests ─────────────────────────────────────────────────────────────

describe('WorkerPoolsController', () => {
  let controller: WorkerPoolsController;
  let mockWorkerPoolsService: ReturnType<typeof makeWorkerPoolsService>;
  let mockPoolRouterService: ReturnType<typeof makePoolRouterService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockWorkerPoolsService = makeWorkerPoolsService();
    mockPoolRouterService = makePoolRouterService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkerPoolsController],
      providers: [
        { provide: WorkerPoolsService, useValue: mockWorkerPoolsService },
        { provide: PoolRouterService, useValue: mockPoolRouterService },
      ],
    }).compile();

    controller = module.get<WorkerPoolsController>(WorkerPoolsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('delegates to service.create and returns the result', async () => {
      const pool = makePool();
      const dto = { name: 'My Pool', members: [VALID_MEMBER], maxConcurrency: 5 };
      mockWorkerPoolsService.create.mockResolvedValue(pool);

      const result = await controller.create(dto as any);

      expect(mockWorkerPoolsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(pool);
    });

    it('propagates ConflictException from service', async () => {
      mockWorkerPoolsService.create.mockRejectedValue(
        new ConflictException('Worker pool with slug "my-pool" already exists'),
      );

      await expect(
        controller.create({ name: 'My Pool', members: [VALID_MEMBER], maxConcurrency: 5 } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('propagates BadRequestException from service', async () => {
      mockWorkerPoolsService.create.mockRejectedValue(
        new BadRequestException('Worker version "x" does not exist'),
      );

      await expect(
        controller.create({ name: 'My Pool', members: [VALID_MEMBER], maxConcurrency: 5 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to service.findAll and enriches with active job counts', async () => {
      const pools = [makePoolWithMemberCount()];
      mockWorkerPoolsService.findAll.mockResolvedValue(pools);
      mockPoolRouterService.getActiveCount.mockResolvedValue(3);

      const result = await controller.findAll();

      expect(mockWorkerPoolsService.findAll).toHaveBeenCalledOnce();
      expect(mockPoolRouterService.getActiveCount).toHaveBeenCalledWith(SLUG);
      expect(result).toEqual([{ ...pools[0], activeJobCount: 3 }]);
    });

    it('returns activeJobCount null when Redis is unavailable', async () => {
      const pools = [makePoolWithMemberCount()];
      mockWorkerPoolsService.findAll.mockResolvedValue(pools);
      mockPoolRouterService.getActiveCount.mockRejectedValue(new Error('Redis unavailable'));

      const result = await controller.findAll();

      expect(result).toEqual([{ ...pools[0], activeJobCount: null }]);
    });

    it('returns empty array when no pools exist', async () => {
      mockWorkerPoolsService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
    });
  });

  // ── findBySlug ─────────────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('delegates to service.findBySlug and enriches with active job count', async () => {
      const pool = makePoolWithMembers();
      mockWorkerPoolsService.findBySlug.mockResolvedValue(pool);
      mockPoolRouterService.getActiveCount.mockResolvedValue(2);

      const result = await controller.findBySlug(SLUG);

      expect(mockWorkerPoolsService.findBySlug).toHaveBeenCalledWith(SLUG);
      expect(mockPoolRouterService.getActiveCount).toHaveBeenCalledWith(SLUG);
      expect(result).toEqual({ ...pool, activeJobCount: 2 });
    });

    it('returns activeJobCount null when Redis is unavailable', async () => {
      const pool = makePoolWithMembers();
      mockWorkerPoolsService.findBySlug.mockResolvedValue(pool);
      mockPoolRouterService.getActiveCount.mockRejectedValue(new Error('Redis unavailable'));

      const result = await controller.findBySlug(SLUG);

      expect(result).toEqual({ ...pool, activeJobCount: null });
    });

    it('propagates NotFoundException from service', async () => {
      mockWorkerPoolsService.findBySlug.mockRejectedValue(
        new NotFoundException(`Worker pool "${SLUG}" not found`),
      );

      await expect(controller.findBySlug(SLUG)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('delegates to service.update and returns the result', async () => {
      const updated = makePool({ name: 'Updated Pool' });
      const dto = { name: 'Updated Pool' };
      mockWorkerPoolsService.update.mockResolvedValue(updated);

      const result = await controller.update(SLUG, dto as any);

      expect(mockWorkerPoolsService.update).toHaveBeenCalledWith(SLUG, dto);
      expect(result).toEqual(updated);
    });

    it('propagates NotFoundException from service', async () => {
      mockWorkerPoolsService.update.mockRejectedValue(
        new NotFoundException(`Worker pool "${SLUG}" not found`),
      );

      await expect(controller.update(SLUG, {} as any)).rejects.toThrow(NotFoundException);
    });

    it('propagates ConflictException from service', async () => {
      mockWorkerPoolsService.update.mockRejectedValue(
        new ConflictException('Worker pool with slug "new-pool" already exists'),
      );

      await expect(controller.update(SLUG, { name: 'New Pool' } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── archive ────────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('delegates to service.archive and returns undefined (204)', async () => {
      mockWorkerPoolsService.archive.mockResolvedValue(makePool({ status: 'ARCHIVED' }));

      const result = await controller.archive(SLUG);

      expect(mockWorkerPoolsService.archive).toHaveBeenCalledWith(SLUG);
      expect(result).toBeUndefined();
    });

    it('propagates NotFoundException from service', async () => {
      mockWorkerPoolsService.archive.mockRejectedValue(
        new NotFoundException(`Worker pool "${SLUG}" not found or already archived`),
      );

      await expect(controller.archive(SLUG)).rejects.toThrow(NotFoundException);
    });
  });

  // ── submit ─────────────────────────────────────────────────────────────────

  describe('submit', () => {
    it('delegates to service.submit and returns package with routing info', async () => {
      const submitResult = makeSubmitResult();
      const dto = { type: 'document', metadata: { key: 'value' } };
      mockWorkerPoolsService.submit.mockResolvedValue(submitResult);

      const result = await controller.submit(SLUG, dto);

      expect(mockWorkerPoolsService.submit).toHaveBeenCalledWith(SLUG, dto);
      expect(result).toEqual(submitResult);
      expect((result as any).package).toBeDefined();
      expect((result as any).routing).toBeDefined();
      expect((result as any).routing.workerSlug).toBeDefined();
      expect((result as any).routing.status).toBeDefined();
    });

    it('delegates to service.submit with only type (no metadata)', async () => {
      const submitResult = makeSubmitResult();
      const dto = { type: 'document' };
      mockWorkerPoolsService.submit.mockResolvedValue(submitResult);

      const result = await controller.submit(SLUG, dto);

      expect(mockWorkerPoolsService.submit).toHaveBeenCalledWith(SLUG, dto);
      expect(result).toEqual(submitResult);
    });

    it('propagates NotFoundException from service', async () => {
      mockWorkerPoolsService.submit.mockRejectedValue(
        new NotFoundException(`Worker pool "${SLUG}" not found`),
      );

      await expect(controller.submit(SLUG, { type: 'document' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propagates BadRequestException when type is incompatible', async () => {
      mockWorkerPoolsService.submit.mockRejectedValue(
        new BadRequestException('No pool member accepts packages of type "video"'),
      );

      await expect(controller.submit(SLUG, { type: 'video' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

// ── HTTP integration tests (Supertest) ────────────────────────────────────────

describe('WorkerPoolsController HTTP integration', () => {
  let app: INestApplication;
  let mockWorkerPoolsService: ReturnType<typeof makeWorkerPoolsService>;
  let mockPoolRouterService: ReturnType<typeof makePoolRouterService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockWorkerPoolsService = makeWorkerPoolsService();
    mockPoolRouterService = makePoolRouterService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkerPoolsController],
      providers: [
        { provide: WorkerPoolsService, useValue: mockWorkerPoolsService },
        { provide: PoolRouterService, useValue: mockPoolRouterService },
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

  it('POST /worker-pools → 201', async () => {
    mockWorkerPoolsService.create.mockResolvedValue(makePool());
    await request(app.getHttpServer())
      .post('/worker-pools')
      .send({ name: 'My Pool', members: [VALID_MEMBER], maxConcurrency: 5 })
      .expect(201);
  });

  it('GET /worker-pools → 200', async () => {
    mockWorkerPoolsService.findAll.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/worker-pools').expect(200);
  });

  it('GET /worker-pools → 200 with active job counts', async () => {
    mockWorkerPoolsService.findAll.mockResolvedValue([makePoolWithMemberCount()]);
    mockPoolRouterService.getActiveCount.mockResolvedValue(3);
    const res = await request(app.getHttpServer()).get('/worker-pools').expect(200);
    expect(res.body[0]).toHaveProperty('activeJobCount', 3);
  });

  it('GET /worker-pools/:slug → 200', async () => {
    mockWorkerPoolsService.findBySlug.mockResolvedValue(makePoolWithMembers());
    mockPoolRouterService.getActiveCount.mockResolvedValue(0);
    await request(app.getHttpServer()).get(`/worker-pools/${SLUG}`).expect(200);
  });

  it('GET /worker-pools/:slug → 200 includes activeJobCount', async () => {
    mockWorkerPoolsService.findBySlug.mockResolvedValue(makePoolWithMembers());
    mockPoolRouterService.getActiveCount.mockResolvedValue(4);
    const res = await request(app.getHttpServer()).get(`/worker-pools/${SLUG}`).expect(200);
    expect(res.body).toHaveProperty('activeJobCount', 4);
    expect(res.body).toHaveProperty('members');
    expect(res.body).toHaveProperty('queueDepth');
  });

  it('GET /worker-pools/:slug → 200 with null activeJobCount when Redis fails', async () => {
    mockWorkerPoolsService.findBySlug.mockResolvedValue(makePoolWithMembers());
    mockPoolRouterService.getActiveCount.mockRejectedValue(new Error('Redis down'));
    const res = await request(app.getHttpServer()).get(`/worker-pools/${SLUG}`).expect(200);
    expect(res.body).toHaveProperty('activeJobCount', null);
  });

  it('PATCH /worker-pools/:slug → 200', async () => {
    mockWorkerPoolsService.update.mockResolvedValue(makePool());
    await request(app.getHttpServer())
      .patch(`/worker-pools/${SLUG}`)
      .send({ maxConcurrency: 10 })
      .expect(200);
  });

  it('DELETE /worker-pools/:slug → 204', async () => {
    mockWorkerPoolsService.archive.mockResolvedValue(makePool({ status: 'ARCHIVED' }));
    await request(app.getHttpServer())
      .delete(`/worker-pools/${SLUG}`)
      .expect(204);
  });

  it('POST /worker-pools/:slug/submit → 201', async () => {
    mockWorkerPoolsService.submit.mockResolvedValue(makeSubmitResult());
    await request(app.getHttpServer())
      .post(`/worker-pools/${SLUG}/submit`)
      .send({ type: 'document' })
      .expect(201);
  });

  it('POST /worker-pools/:slug/submit → 201 with package and routing in response', async () => {
    mockWorkerPoolsService.submit.mockResolvedValue(makeSubmitResult());
    const res = await request(app.getHttpServer())
      .post(`/worker-pools/${SLUG}/submit`)
      .send({ type: 'document' })
      .expect(201);
    expect(res.body).toHaveProperty('package');
    expect(res.body).toHaveProperty('routing');
    expect(res.body.routing).toHaveProperty('workerSlug');
    expect(res.body.routing).toHaveProperty('workerVersion');
    expect(res.body.routing).toHaveProperty('status');
  });

  it('POST /worker-pools/:slug/submit with metadata → 201', async () => {
    mockWorkerPoolsService.submit.mockResolvedValue(makeSubmitResult());
    await request(app.getHttpServer())
      .post(`/worker-pools/${SLUG}/submit`)
      .send({ type: 'document', metadata: { key: 'value' } })
      .expect(201);
  });

  // ── invalid slug → 400 ────────────────────────────────────────────────────

  it('GET /worker-pools/INVALID-SLUG → 400 (uppercase not allowed)', async () => {
    await request(app.getHttpServer()).get('/worker-pools/INVALID-SLUG').expect(400);
  });

  it('GET /worker-pools/my--pool → 400 (double hyphen)', async () => {
    await request(app.getHttpServer()).get('/worker-pools/my--pool').expect(400);
  });

  it('GET /worker-pools/my-pool- → 400 (trailing hyphen)', async () => {
    await request(app.getHttpServer()).get('/worker-pools/my-pool-').expect(400);
  });

  it('PATCH /worker-pools/UPPERCASE → 400 (invalid slug)', async () => {
    await request(app.getHttpServer())
      .patch('/worker-pools/UPPERCASE')
      .send({ maxConcurrency: 5 })
      .expect(400);
  });

  it('DELETE /worker-pools/UPPERCASE → 400 (invalid slug)', async () => {
    await request(app.getHttpServer())
      .delete('/worker-pools/UPPERCASE')
      .expect(400);
  });

  it('POST /worker-pools/UPPERCASE/submit → 400 (invalid slug)', async () => {
    await request(app.getHttpServer())
      .post('/worker-pools/UPPERCASE/submit')
      .send({ type: 'document' })
      .expect(400);
  });

  // ── body validation → 400 ─────────────────────────────────────────────────

  it('POST /worker-pools with missing name → 400', async () => {
    await request(app.getHttpServer())
      .post('/worker-pools')
      .send({ members: [VALID_MEMBER], maxConcurrency: 5 })
      .expect(400);
  });

  it('POST /worker-pools with empty name → 400', async () => {
    await request(app.getHttpServer())
      .post('/worker-pools')
      .send({ name: '', members: [VALID_MEMBER], maxConcurrency: 5 })
      .expect(400);
  });

  it('POST /worker-pools with empty members array → 400', async () => {
    await request(app.getHttpServer())
      .post('/worker-pools')
      .send({ name: 'My Pool', members: [], maxConcurrency: 5 })
      .expect(400);
  });

  it('POST /worker-pools with missing members → 400', async () => {
    await request(app.getHttpServer())
      .post('/worker-pools')
      .send({ name: 'My Pool', maxConcurrency: 5 })
      .expect(400);
  });

  it('POST /worker-pools with missing maxConcurrency → 400', async () => {
    await request(app.getHttpServer())
      .post('/worker-pools')
      .send({ name: 'My Pool', members: [VALID_MEMBER] })
      .expect(400);
  });

  it('POST /worker-pools/:slug/submit with missing type → 400', async () => {
    await request(app.getHttpServer())
      .post(`/worker-pools/${SLUG}/submit`)
      .send({})
      .expect(400);
  });

  it('POST /worker-pools/:slug/submit with empty type → 400', async () => {
    await request(app.getHttpServer())
      .post(`/worker-pools/${SLUG}/submit`)
      .send({ type: '' })
      .expect(400);
  });

  // ── 404 responses ─────────────────────────────────────────────────────────

  it('GET /worker-pools/:slug → 404 when service throws NotFoundException', async () => {
    mockWorkerPoolsService.findBySlug.mockRejectedValue(
      new NotFoundException('Worker pool not found'),
    );
    await request(app.getHttpServer()).get(`/worker-pools/${SLUG}`).expect(404);
  });

  it('PATCH /worker-pools/:slug → 404 when service throws NotFoundException', async () => {
    mockWorkerPoolsService.update.mockRejectedValue(
      new NotFoundException('Worker pool not found'),
    );
    await request(app.getHttpServer())
      .patch(`/worker-pools/${SLUG}`)
      .send({ maxConcurrency: 5 })
      .expect(404);
  });

  it('DELETE /worker-pools/:slug → 404 when service throws NotFoundException', async () => {
    mockWorkerPoolsService.archive.mockRejectedValue(
      new NotFoundException('Worker pool not found'),
    );
    await request(app.getHttpServer())
      .delete(`/worker-pools/${SLUG}`)
      .expect(404);
  });

  it('POST /worker-pools/:slug/submit → 404 when service throws NotFoundException', async () => {
    mockWorkerPoolsService.submit.mockRejectedValue(
      new NotFoundException('Worker pool not found'),
    );
    await request(app.getHttpServer())
      .post(`/worker-pools/${SLUG}/submit`)
      .send({ type: 'document' })
      .expect(404);
  });

  // ── 400 on incompatible type ───────────────────────────────────────────────

  it('POST /worker-pools/:slug/submit → 400 when type is incompatible', async () => {
    mockWorkerPoolsService.submit.mockRejectedValue(
      new BadRequestException('No pool member accepts packages of type "video"'),
    );
    await request(app.getHttpServer())
      .post(`/worker-pools/${SLUG}/submit`)
      .send({ type: 'video' })
      .expect(400);
  });

  // ── 409 conflict ──────────────────────────────────────────────────────────

  it('POST /worker-pools → 409 when service throws ConflictException', async () => {
    mockWorkerPoolsService.create.mockRejectedValue(
      new ConflictException('Worker pool with slug "my-pool" already exists'),
    );
    await request(app.getHttpServer())
      .post('/worker-pools')
      .send({ name: 'My Pool', members: [VALID_MEMBER], maxConcurrency: 5 })
      .expect(409);
  });
});
