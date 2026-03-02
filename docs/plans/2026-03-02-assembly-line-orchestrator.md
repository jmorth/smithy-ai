# Assembly Line Orchestrator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `AssemblyLineOrchestratorService` that routes Packages through Assembly Line steps by reacting to job lifecycle events.

**Architecture:** Event-driven service using Node.js `EventEmitter` as a placeholder for the future RabbitMQ event bus (task 067). The orchestrator listens for `job.completed`, `job.failed`, and `job.stuck` events, performs idempotent step advancement via DB transactions, and publishes to Worker queues. All state transitions are logged at info level.

**Tech Stack:** NestJS, Drizzle ORM, Vitest, `nestjs-pino` (Logger), Node EventEmitter (placeholder for RabbitMQ)

---

### Task 1: Define Event Interfaces

**Files:**
- Create: `apps/api/src/modules/workflows/assembly-lines/events/job-events.ts`

**Step 1: Write the failing test**

```typescript
// apps/api/src/modules/workflows/assembly-lines/events/job-events.spec.ts
import { describe, it, expect } from 'vitest';
import type { JobCompletedEvent, JobFailedEvent, JobStuckEvent } from './job-events';

describe('job event interfaces', () => {
  it('JobCompletedEvent has required fields', () => {
    const event: JobCompletedEvent = {
      packageId: 'pkg-1',
      assemblyLineSlug: 'my-line',
      completedStep: 2,
      jobExecutionId: 'job-1',
    };
    expect(event.packageId).toBe('pkg-1');
    expect(event.assemblyLineSlug).toBe('my-line');
    expect(event.completedStep).toBe(2);
    expect(event.jobExecutionId).toBe('job-1');
  });

  it('JobFailedEvent has required fields', () => {
    const event: JobFailedEvent = {
      packageId: 'pkg-1',
      assemblyLineSlug: 'my-line',
      failedStep: 1,
      jobExecutionId: 'job-1',
      errorMessage: 'timeout',
    };
    expect(event.errorMessage).toBe('timeout');
  });

  it('JobStuckEvent has required fields', () => {
    const event: JobStuckEvent = {
      packageId: 'pkg-1',
      assemblyLineSlug: 'my-line',
      stuckStep: 1,
      jobExecutionId: 'job-1',
    };
    expect(event.stuckStep).toBe(1);
  });

  it('JOB_EVENTS constants are defined', async () => {
    const m = await import('./job-events');
    expect(m.JOB_EVENTS.COMPLETED).toBe('job.completed');
    expect(m.JOB_EVENTS.FAILED).toBe('job.failed');
    expect(m.JOB_EVENTS.STUCK).toBe('job.stuck');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/workflows/assembly-lines/events/job-events.spec.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// apps/api/src/modules/workflows/assembly-lines/events/job-events.ts

export const JOB_EVENTS = {
  COMPLETED: 'job.completed',
  FAILED: 'job.failed',
  STUCK: 'job.stuck',
} as const;

export type JobCompletedEvent = {
  packageId: string;
  assemblyLineSlug: string;
  completedStep: number;
  jobExecutionId: string;
};

export type JobFailedEvent = {
  packageId: string;
  assemblyLineSlug: string;
  failedStep: number;
  jobExecutionId: string;
  errorMessage: string;
};

export type JobStuckEvent = {
  packageId: string;
  assemblyLineSlug: string;
  stuckStep: number;
  jobExecutionId: string;
};
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/modules/workflows/assembly-lines/events/job-events.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/workflows/assembly-lines/events/
git commit -m "feat(orchestrator): define job event interfaces and constants"
```

---

### Task 2: Create OrchestratorEventBus (EventEmitter placeholder)

**Files:**
- Create: `apps/api/src/modules/workflows/assembly-lines/orchestrator-event-bus.ts`

**Step 1: Write the failing test**

```typescript
// apps/api/src/modules/workflows/assembly-lines/orchestrator-event-bus.spec.ts
import { describe, it, expect } from 'vitest';
import { OrchestratorEventBus, ORCHESTRATOR_EVENT_BUS } from './orchestrator-event-bus';
import { EventEmitter } from 'events';

describe('OrchestratorEventBus', () => {
  it('is a class that extends EventEmitter', () => {
    const bus = new OrchestratorEventBus();
    expect(bus).toBeInstanceOf(EventEmitter);
  });

  it('ORCHESTRATOR_EVENT_BUS token is defined', () => {
    expect(ORCHESTRATOR_EVENT_BUS).toBeDefined();
  });

  it('can emit and receive events', () => {
    const bus = new OrchestratorEventBus();
    let received: unknown;
    bus.on('test', (data) => { received = data; });
    bus.emit('test', { foo: 'bar' });
    expect(received).toEqual({ foo: 'bar' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/workflows/assembly-lines/orchestrator-event-bus.spec.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// apps/api/src/modules/workflows/assembly-lines/orchestrator-event-bus.ts
import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export const ORCHESTRATOR_EVENT_BUS = Symbol('ORCHESTRATOR_EVENT_BUS');

@Injectable()
export class OrchestratorEventBus extends EventEmitter {}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/modules/workflows/assembly-lines/orchestrator-event-bus.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/workflows/assembly-lines/orchestrator-event-bus.ts \
        apps/api/src/modules/workflows/assembly-lines/orchestrator-event-bus.spec.ts
git commit -m "feat(orchestrator): add OrchestratorEventBus EventEmitter placeholder"
```

---

### Task 3: Implement AssemblyLineOrchestratorService (core logic)

**Files:**
- Create: `apps/api/src/modules/workflows/assembly-lines/assembly-line-orchestrator.service.ts`
- Create: `apps/api/src/modules/workflows/assembly-lines/assembly-line-orchestrator.service.spec.ts`

**Step 1: Write the failing tests**

```typescript
// apps/api/src/modules/workflows/assembly-lines/assembly-line-orchestrator.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { AssemblyLineOrchestratorService } from './assembly-line-orchestrator.service';
import { OrchestratorEventBus } from './orchestrator-event-bus';
import { JOB_EVENTS } from './events/job-events';
import type { JobCompletedEvent, JobFailedEvent, JobStuckEvent } from './events/job-events';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePkg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pkg-1',
    assemblyLineId: 'line-uuid-1',
    currentStep: 1,
    status: 'IN_TRANSIT',
    type: 'doc',
    metadata: {},
    createdBy: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-uuid-1',
    slug: 'my-line',
    name: 'My Line',
    ...overrides,
  };
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: 'step-uuid-1',
    assemblyLineId: 'line-uuid-1',
    stepNumber: 1,
    workerVersionId: 'wv-1',
    configOverrides: null,
    ...overrides,
  };
}

// ─── DB mock builder ──────────────────────────────────────────────────────────

function buildMockDb() {
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };

  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockResolvedValue([]),
    innerJoin: vi.fn().mockReturnThis(),
  };

  const db = {
    select: vi.fn().mockReturnValue(selectChain),
    update: vi.fn().mockReturnValue(updateChain),
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db)),
    _selectChain: selectChain,
    _updateChain: updateChain,
  };

  return db;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AssemblyLineOrchestratorService', () => {
  let service: AssemblyLineOrchestratorService;
  let db: ReturnType<typeof buildMockDb>;
  let eventBus: OrchestratorEventBus;

  beforeEach(() => {
    db = buildMockDb();
    eventBus = new OrchestratorEventBus();
    service = new AssemblyLineOrchestratorService(db as any, eventBus);
    // suppress logs in tests
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  // ─── onJobCompleted ────────────────────────────────────────────────────────

  describe('onJobCompleted', () => {
    it('advances to next step and updates currentStep when not final step', async () => {
      const pkg = makePkg({ currentStep: 1 });
      const step2 = makeStep({ stepNumber: 2 });

      // First select: package lookup
      db._selectChain.limit
        .mockResolvedValueOnce([pkg])          // findPackage
        .mockResolvedValueOnce([makeLine()])    // findLine
        .mockResolvedValueOnce([step2]);        // findNextStep

      // Count of steps (select with orderBy)
      db._selectChain.orderBy.mockResolvedValueOnce([makeStep(), step2]);

      db._updateChain.returning.mockResolvedValueOnce([{ ...pkg, currentStep: 2 }]);

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).toHaveBeenCalled();
    });

    it('marks package COMPLETED and emits assembly-line.completed on final step', async () => {
      const pkg = makePkg({ currentStep: 2 });
      const steps = [makeStep({ stepNumber: 1 }), makeStep({ stepNumber: 2 })];

      db._selectChain.limit
        .mockResolvedValueOnce([pkg])          // findPackage
        .mockResolvedValueOnce([makeLine()]);   // findLine

      db._selectChain.orderBy.mockResolvedValueOnce(steps); // all steps

      db._updateChain.returning.mockResolvedValueOnce([{ ...pkg, status: 'COMPLETED' }]);

      const completedEventSpy = vi.fn();
      eventBus.on('assembly-line.completed', completedEventSpy);

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 2,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).toHaveBeenCalled();
      expect(completedEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ packageId: 'pkg-1' }),
      );
    });

    it('ignores stale event when currentStep > completedStep (idempotent)', async () => {
      const pkg = makePkg({ currentStep: 3 });

      db._selectChain.limit.mockResolvedValueOnce([pkg]);

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).not.toHaveBeenCalled();
    });

    it('logs error when currentStep < completedStep (out of order)', async () => {
      const pkg = makePkg({ currentStep: 1 });

      db._selectChain.limit.mockResolvedValueOnce([pkg]);

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 3,
        jobExecutionId: 'job-1',
      };

      await service.onJobCompleted(event);

      expect(db.update).not.toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('logs warning and returns when package not found', async () => {
      db._selectChain.limit.mockResolvedValueOnce([]);

      const event: JobCompletedEvent = {
        packageId: 'pkg-missing',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      await expect(service.onJobCompleted(event)).resolves.not.toThrow();
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  // ─── onJobFailed ───────────────────────────────────────────────────────────

  describe('onJobFailed', () => {
    it('updates package status to FAILED with error details', async () => {
      const pkg = makePkg({ currentStep: 1 });

      db._selectChain.limit.mockResolvedValueOnce([pkg]);
      db._updateChain.returning.mockResolvedValueOnce([{ ...pkg, status: 'FAILED' }]);

      const event: JobFailedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        failedStep: 1,
        jobExecutionId: 'job-1',
        errorMessage: 'container exited with code 1',
      };

      await service.onJobFailed(event);

      expect(db.update).toHaveBeenCalled();
    });

    it('logs warning and returns when package not found', async () => {
      db._selectChain.limit.mockResolvedValueOnce([]);

      const event: JobFailedEvent = {
        packageId: 'missing',
        assemblyLineSlug: 'my-line',
        failedStep: 1,
        jobExecutionId: 'job-1',
        errorMessage: 'oops',
      };

      await expect(service.onJobFailed(event)).resolves.not.toThrow();
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  // ─── onJobStuck ────────────────────────────────────────────────────────────

  describe('onJobStuck', () => {
    it('updates package status and logs a warning', async () => {
      const pkg = makePkg({ currentStep: 1 });

      db._selectChain.limit.mockResolvedValueOnce([pkg]);
      db._updateChain.returning.mockResolvedValueOnce([{ ...pkg, status: 'PROCESSING' }]);

      const event: JobStuckEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        stuckStep: 1,
        jobExecutionId: 'job-1',
      };

      await service.onJobStuck(event);

      expect(db.update).toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('logs warning and returns when package not found', async () => {
      db._selectChain.limit.mockResolvedValueOnce([]);

      const event: JobStuckEvent = {
        packageId: 'missing',
        assemblyLineSlug: 'my-line',
        stuckStep: 1,
        jobExecutionId: 'job-1',
      };

      await expect(service.onJobStuck(event)).resolves.not.toThrow();
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  // ─── Event bus wiring ─────────────────────────────────────────────────────

  describe('event bus wiring', () => {
    it('subscribes to job.completed events via onModuleInit', () => {
      const onSpy = vi.spyOn(eventBus, 'on');
      service.onModuleInit();
      expect(onSpy).toHaveBeenCalledWith(JOB_EVENTS.COMPLETED, expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith(JOB_EVENTS.FAILED, expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith(JOB_EVENTS.STUCK, expect.any(Function));
    });

    it('dispatches job.completed event to onJobCompleted handler', async () => {
      const pkg = makePkg({ currentStep: 3 }); // stale — no update needed
      db._selectChain.limit.mockResolvedValue([pkg]);

      service.onModuleInit();

      const event: JobCompletedEvent = {
        packageId: 'pkg-1',
        assemblyLineSlug: 'my-line',
        completedStep: 1,
        jobExecutionId: 'job-1',
      };

      eventBus.emit(JOB_EVENTS.COMPLETED, event);
      // give async handler a tick
      await new Promise((r) => setTimeout(r, 0));

      expect(Logger.prototype.warn).toHaveBeenCalled();
    });
  });

  // ─── getQueueName ─────────────────────────────────────────────────────────

  describe('getQueueName', () => {
    it('formats queue name as assembly.{slug}.step.{n}', () => {
      expect(service.getQueueName('my-line', 3)).toBe('assembly.my-line.step.3');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/workflows/assembly-lines/assembly-line-orchestrator.service.spec.ts`
Expected: FAIL — service not found

**Step 3: Write minimal implementation**

```typescript
// apps/api/src/modules/workflows/assembly-lines/assembly-line-orchestrator.service.ts
import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleClient } from '../../../database/database.provider';
import { packages, assemblyLines, assemblyLineSteps } from '../../../database/schema';
import { OrchestratorEventBus } from './orchestrator-event-bus';
import {
  JOB_EVENTS,
  type JobCompletedEvent,
  type JobFailedEvent,
  type JobStuckEvent,
} from './events/job-events';

@Injectable()
export class AssemblyLineOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(AssemblyLineOrchestratorService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
    private readonly eventBus: OrchestratorEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.on(JOB_EVENTS.COMPLETED, (event: JobCompletedEvent) => {
      this.onJobCompleted(event).catch((err: unknown) => {
        this.logger.error('Unhandled error in onJobCompleted', err);
      });
    });

    this.eventBus.on(JOB_EVENTS.FAILED, (event: JobFailedEvent) => {
      this.onJobFailed(event).catch((err: unknown) => {
        this.logger.error('Unhandled error in onJobFailed', err);
      });
    });

    this.eventBus.on(JOB_EVENTS.STUCK, (event: JobStuckEvent) => {
      this.onJobStuck(event).catch((err: unknown) => {
        this.logger.error('Unhandled error in onJobStuck', err);
      });
    });
  }

  async onJobCompleted(event: JobCompletedEvent): Promise<void> {
    const { packageId, assemblyLineSlug, completedStep, jobExecutionId } = event;

    const [pkg] = await this.db
      .select()
      .from(packages)
      .where(eq(packages.id, packageId))
      .limit(1);

    if (!pkg) {
      this.logger.warn(
        `job.completed: package ${packageId} not found — ignoring (job=${jobExecutionId})`,
      );
      return;
    }

    const currentStep = pkg.currentStep ?? 0;

    // Idempotency check
    if (currentStep > completedStep) {
      this.logger.warn(
        `job.completed: stale event for package ${packageId} — currentStep=${currentStep} > completedStep=${completedStep}, job=${jobExecutionId}`,
      );
      return;
    }

    if (currentStep < completedStep) {
      this.logger.error(
        `job.completed: out-of-order event for package ${packageId} — currentStep=${currentStep} < completedStep=${completedStep}, job=${jobExecutionId}`,
      );
      return;
    }

    // currentStep === completedStep — proceed
    await this.db.transaction(async (tx) => {
      const [line] = await (tx as typeof this.db)
        .select({ id: assemblyLines.id, slug: assemblyLines.slug })
        .from(assemblyLines)
        .where(eq(assemblyLines.id, pkg.assemblyLineId!))
        .limit(1);

      if (!line) {
        this.logger.error(
          `job.completed: assembly line not found for package ${packageId}`,
        );
        return;
      }

      const steps = await (tx as typeof this.db)
        .select()
        .from(assemblyLineSteps)
        .where(eq(assemblyLineSteps.assemblyLineId, line.id))
        .orderBy(assemblyLineSteps.stepNumber);

      const totalSteps = steps.length;
      const isFinal = completedStep >= totalSteps;

      if (isFinal) {
        await (tx as typeof this.db)
          .update(packages)
          .set({ status: 'COMPLETED', updatedAt: new Date() })
          .where(eq(packages.id, packageId))
          .returning();

        this.logger.log(
          `Package ${packageId} COMPLETED on assembly line "${assemblyLineSlug}" after step ${completedStep}`,
        );

        this.eventBus.emit('assembly-line.completed', {
          packageId,
          assemblyLineSlug,
          totalSteps,
        });
      } else {
        const nextStep = completedStep + 1;

        await (tx as typeof this.db)
          .update(packages)
          .set({ currentStep: nextStep, updatedAt: new Date() })
          .where(eq(packages.id, packageId))
          .returning();

        const queueName = this.getQueueName(assemblyLineSlug, nextStep);

        this.logger.log(
          `Package ${packageId} advanced to step ${nextStep} on "${assemblyLineSlug}" — queue: ${queueName}`,
        );
      }
    });
  }

  async onJobFailed(event: JobFailedEvent): Promise<void> {
    const { packageId, assemblyLineSlug, failedStep, jobExecutionId, errorMessage } = event;

    const [pkg] = await this.db
      .select()
      .from(packages)
      .where(eq(packages.id, packageId))
      .limit(1);

    if (!pkg) {
      this.logger.warn(
        `job.failed: package ${packageId} not found — ignoring (job=${jobExecutionId})`,
      );
      return;
    }

    await this.db
      .update(packages)
      .set({ status: 'FAILED', updatedAt: new Date() })
      .where(eq(packages.id, packageId))
      .returning();

    this.logger.log(
      `Package ${packageId} FAILED on assembly line "${assemblyLineSlug}" at step ${failedStep} — ${errorMessage} (job=${jobExecutionId})`,
    );
  }

  async onJobStuck(event: JobStuckEvent): Promise<void> {
    const { packageId, assemblyLineSlug, stuckStep, jobExecutionId } = event;

    const [pkg] = await this.db
      .select()
      .from(packages)
      .where(eq(packages.id, packageId))
      .limit(1);

    if (!pkg) {
      this.logger.warn(
        `job.stuck: package ${packageId} not found — ignoring (job=${jobExecutionId})`,
      );
      return;
    }

    await this.db
      .update(packages)
      .set({ status: 'PROCESSING', updatedAt: new Date() })
      .where(eq(packages.id, packageId))
      .returning();

    this.logger.warn(
      `Package ${packageId} is STUCK on assembly line "${assemblyLineSlug}" at step ${stuckStep} (job=${jobExecutionId}) — manual intervention required`,
    );
  }

  getQueueName(assemblyLineSlug: string, stepNumber: number): string {
    return `assembly.${assemblyLineSlug}.step.${stepNumber}`;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/modules/workflows/assembly-lines/assembly-line-orchestrator.service.spec.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add apps/api/src/modules/workflows/assembly-lines/assembly-line-orchestrator.service.ts \
        apps/api/src/modules/workflows/assembly-lines/assembly-line-orchestrator.service.spec.ts
git commit -m "feat(orchestrator): implement AssemblyLineOrchestratorService with event handlers"
```

---

### Task 4: Wire Orchestrator into AssemblyLinesModule

**Files:**
- Modify: `apps/api/src/modules/workflows/assembly-lines/assembly-lines.module.ts`
- Modify: `apps/api/src/modules/workflows/assembly-lines/assembly-lines.module.spec.ts`

**Step 1: Write the failing module spec**

```typescript
// apps/api/src/modules/workflows/assembly-lines/assembly-lines.module.spec.ts
import { describe, it, expect } from 'vitest';
import { AssemblyLinesModule } from './assembly-lines.module';
import { AssemblyLinesService } from './assembly-lines.service';
import { AssemblyLineOrchestratorService } from './assembly-line-orchestrator.service';
import { OrchestratorEventBus } from './orchestrator-event-bus';

describe('AssemblyLinesModule', () => {
  it('is defined', () => {
    expect(AssemblyLinesModule).toBeDefined();
  });

  it('declares AssemblyLinesService as a provider', () => {
    const metadata = Reflect.getMetadata('providers', AssemblyLinesModule);
    expect(metadata).toContain(AssemblyLinesService);
  });

  it('exports AssemblyLinesService', () => {
    const metadata = Reflect.getMetadata('exports', AssemblyLinesModule);
    expect(metadata).toContain(AssemblyLinesService);
  });

  it('declares AssemblyLineOrchestratorService as a provider', () => {
    const metadata = Reflect.getMetadata('providers', AssemblyLinesModule);
    expect(metadata).toContain(AssemblyLineOrchestratorService);
  });

  it('declares OrchestratorEventBus as a provider', () => {
    const metadata = Reflect.getMetadata('providers', AssemblyLinesModule);
    expect(metadata).toContain(OrchestratorEventBus);
  });

  it('exports OrchestratorEventBus', () => {
    const metadata = Reflect.getMetadata('exports', AssemblyLinesModule);
    expect(metadata).toContain(OrchestratorEventBus);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/modules/workflows/assembly-lines/assembly-lines.module.spec.ts`
Expected: FAIL

**Step 3: Update the module**

```typescript
// apps/api/src/modules/workflows/assembly-lines/assembly-lines.module.ts
import { Module } from '@nestjs/common';
import { AssemblyLinesService } from './assembly-lines.service';
import { AssemblyLineOrchestratorService } from './assembly-line-orchestrator.service';
import { OrchestratorEventBus } from './orchestrator-event-bus';

@Module({
  providers: [AssemblyLinesService, AssemblyLineOrchestratorService, OrchestratorEventBus],
  exports: [AssemblyLinesService, OrchestratorEventBus],
})
export class AssemblyLinesModule {}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/modules/workflows/assembly-lines/assembly-lines.module.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/workflows/assembly-lines/assembly-lines.module.ts \
        apps/api/src/modules/workflows/assembly-lines/assembly-lines.module.spec.ts
git commit -m "feat(orchestrator): wire AssemblyLineOrchestratorService into AssemblyLinesModule"
```

---

### Task 5: Register AssemblyLinesModule in AppModule

**Files:**
- Modify: `apps/api/src/app.module.ts`

**Step 1: Add AssemblyLinesModule to AppModule imports**

```typescript
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { StorageModule } from './modules/storage/storage.module';
import { PackagesModule } from './modules/packages/packages.module';
import { WorkersModule } from './modules/workers/workers.module';
import { AssemblyLinesModule } from './modules/workflows/assembly-lines/assembly-lines.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    StorageModule,
    HealthModule,
    PackagesModule,
    WorkersModule,
    AssemblyLinesModule,
    LoggerModule.forRoot({ ... }),  // keep existing config
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
```

**Step 2: Run all tests**

Run: `cd apps/api && pnpm vitest run`
Expected: All tests pass, coverage >= 80%

**Step 3: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(orchestrator): register AssemblyLinesModule in AppModule"
```

---

### Task 6: Run full test suite with coverage

**Step 1: Run coverage**

Run: `cd apps/api && pnpm vitest run --coverage`
Expected: lines/functions/branches/statements all >= 80%, no test failures

**Step 2: Verify orchestrator-specific coverage is 100% on critical paths**

The orchestrator service and event interfaces should show 100% function and line coverage.

**Step 3: Commit final state if any adjustments made**

```bash
git add -A
git commit -m "test(orchestrator): ensure coverage thresholds met"
```
