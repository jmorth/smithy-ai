import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleClient } from '../../../database/database.provider';
import { packages, assemblyLines, assemblyLineSteps } from '../../../database/schema';
import { OrchestratorEventBus } from './orchestrator-event-bus';
import {
  JOB_EVENTS,
  ASSEMBLY_LINE_EVENTS,
  WORKER_QUEUE_PUBLISH,
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

    if (!pkg.assemblyLineId) {
      this.logger.error(
        `job.completed: package ${packageId} has no assembly line assigned — ignoring (job=${jobExecutionId})`,
      );
      return;
    }

    const currentStep = pkg.currentStep ?? 0;

    if (currentStep > completedStep) {
      this.logger.warn(
        `job.completed: stale event for package ${packageId} — currentStep=${currentStep} > completedStep=${completedStep} (job=${jobExecutionId})`,
      );
      return;
    }

    if (currentStep < completedStep) {
      this.logger.error(
        `job.completed: out-of-order event for package ${packageId} — currentStep=${currentStep} < completedStep=${completedStep} (job=${jobExecutionId})`,
      );
      return;
    }

    // Collect events to emit after the transaction commits
    let pendingEvent: { name: string; data: unknown } | null = null;

    const assemblyLineId = pkg.assemblyLineId;

    // currentStep === completedStep — proceed
    await this.db.transaction(async (tx) => {
      const [line] = await tx
        .select({ id: assemblyLines.id, slug: assemblyLines.slug })
        .from(assemblyLines)
        .where(eq(assemblyLines.id, assemblyLineId))
        .limit(1);

      if (!line) {
        this.logger.error(
          `job.completed: assembly line not found for package ${packageId} (assemblyLineId=${assemblyLineId})`,
        );
        return;
      }

      const steps = await tx
        .select()
        .from(assemblyLineSteps)
        .where(eq(assemblyLineSteps.assemblyLineId, line.id))
        .orderBy(assemblyLineSteps.stepNumber);

      const totalSteps = steps.length;
      const isFinal = completedStep >= totalSteps;

      if (isFinal) {
        await tx
          .update(packages)
          .set({ status: 'COMPLETED', updatedAt: new Date() })
          .where(eq(packages.id, packageId))
          .returning();

        this.logger.log(
          `Package ${packageId} COMPLETED on assembly line "${assemblyLineSlug}" after step ${completedStep}`,
        );

        pendingEvent = {
          name: ASSEMBLY_LINE_EVENTS.COMPLETED,
          data: { packageId, assemblyLineSlug, totalSteps },
        };
      } else {
        const nextStep = completedStep + 1;

        await tx
          .update(packages)
          .set({ currentStep: nextStep, updatedAt: new Date() })
          .where(eq(packages.id, packageId))
          .returning();

        const queueName = this.getQueueName(assemblyLineSlug, nextStep);

        this.logger.log(
          `Package ${packageId} advanced to step ${nextStep} on "${assemblyLineSlug}" — queue: ${queueName}`,
        );

        pendingEvent = {
          name: WORKER_QUEUE_PUBLISH,
          data: { queueName, packageId, assemblyLineSlug, stepNumber: nextStep },
        };
      }
    });

    // Emit after transaction commits to avoid notifying consumers of uncommitted state
    if (pendingEvent) {
      this.eventBus.emit(
        (pendingEvent as { name: string; data: unknown }).name,
        (pendingEvent as { name: string; data: unknown }).data,
      );
    }
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

    await this.db.transaction(async (tx) => {
      await tx
        .update(packages)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(packages.id, packageId))
        .returning();
    });

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

    // No STUCK status exists in the package enum; FAILED is used to ensure the
    // package surfaces in monitoring and is not confused with a healthy in-flight
    // package. The log message clearly identifies this as a stuck (not errored) state.
    await this.db.transaction(async (tx) => {
      await tx
        .update(packages)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(packages.id, packageId))
        .returning();
    });

    this.logger.warn(
      `Package ${packageId} is STUCK on assembly line "${assemblyLineSlug}" at step ${stuckStep} (job=${jobExecutionId}) — marked FAILED, manual intervention required`,
    );
  }

  private getQueueName(assemblyLineSlug: string, stepNumber: number): string {
    return `assembly.${assemblyLineSlug}.step.${stepNumber}`;
  }
}
