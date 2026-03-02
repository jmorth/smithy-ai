import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleClient } from '../../../database/database.provider';
import { packages, assemblyLines, assemblyLineSteps } from '../../../database/schema';
import { OrchestratorEventBus } from './orchestrator-event-bus';
import {
  JOB_EVENTS,
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

    const currentStep = pkg.currentStep ?? 0;

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

        // Placeholder for RabbitMQ publish (task 067). Emits a dispatch event
        // that future consumers (e.g. the event bus bridge) will forward to the
        // actual worker queue.
        this.eventBus.emit(WORKER_QUEUE_PUBLISH, {
          queueName,
          packageId,
          assemblyLineSlug,
          stepNumber: nextStep,
        });
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
