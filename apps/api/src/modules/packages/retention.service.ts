import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { and, lt, eq, isNotNull, or } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import type { DrizzleClient } from '../../database/database.provider';
import { packages, packageFiles } from '../../database/schema';
import { StorageService } from '../storage/storage.service';

export type RetentionPackage = typeof packages.$inferSelect;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private readonly retentionDays: number;
  private readonly dryRun: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
  ) {
    this.retentionDays = this.configService.get<number>('app.retentionDays', 30);
    this.dryRun = this.configService.get<boolean>('app.retentionDryRun', false);
  }

  /** Runs daily at 2:00 AM UTC to clean up expired packages. */
  @Cron('0 2 * * *')
  async handleRetention(): Promise<void> {
    this.logger.log(
      `Starting retention cleanup (retention=${this.retentionDays}d, dryRun=${this.dryRun})`,
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const expiredPackages = await this.findExpiredPackages(cutoffDate);
    this.logger.log(`Found ${expiredPackages.length} packages eligible for cleanup`);

    let successCount = 0;
    let errorCount = 0;

    for (const pkg of expiredPackages) {
      try {
        await this.cleanupPackage(pkg);
        successCount++;
      } catch (error) {
        errorCount++;
        this.logger.error(`Failed to clean up package ${pkg.id}`, error);
      }
    }

    this.logger.log(
      `Retention complete: ${successCount} cleaned, ${errorCount} errors`,
    );
    // TODO: Consider adding a metric or notification for the retention run summary for observability.
  }

  async findExpiredPackages(cutoff: Date): Promise<RetentionPackage[]> {
    return this.db
      .select()
      .from(packages)
      .where(
        or(
          // Soft-deleted past retention
          and(isNotNull(packages.deletedAt), lt(packages.deletedAt, cutoff)),
          // Completed and stale
          and(eq(packages.status, 'COMPLETED'), lt(packages.updatedAt, cutoff)),
        ),
      );
  }

  async cleanupPackage(pkg: RetentionPackage): Promise<void> {
    if (this.dryRun) {
      this.logger.log(`[DRY RUN] Would delete package ${pkg.id}`);
      return;
    }

    // 1. Delete S3 files
    await this.storageService.deleteByPrefix(`packages/${pkg.id}/`);
    this.logger.log(`Deleted S3 files for package ${pkg.id}`);

    // 2. Delete package_files rows
    await this.db
      .delete(packageFiles)
      .where(eq(packageFiles.packageId, pkg.id));

    // 3. Delete package row
    await this.db
      .delete(packages)
      .where(eq(packages.id, pkg.id));

    this.logger.log(`Hard-deleted package ${pkg.id}`);
  }
}
