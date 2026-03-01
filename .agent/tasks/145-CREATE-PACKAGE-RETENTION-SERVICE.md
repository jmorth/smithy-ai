# Task 145: Create Package Retention Service

## Summary
Create a `RetentionService` in NestJS that runs as a daily scheduled task (cron) to clean up expired Packages — soft-deleted Packages past the retention period and completed Packages past the retention period. The service deletes associated S3 files via `StorageService`, hard-deletes `package_files` rows, and hard-deletes the Package row itself.

## Phase
Phase 8: Quality, Polish & Deployment

## Dependencies
- **Depends on**: 032 (Package Service — Package queries and types), 029 (Storage Service — S3 file deletion), 023 (Config Module — `RETENTION_DAYS` env var)
- **Blocks**: None

## Architecture Reference
Data retention is critical for keeping storage costs and database size manageable. The `RetentionService` runs on a cron schedule inside the API process (NestJS `@nestjs/schedule`). It queries for Packages that are eligible for permanent deletion and removes both their S3 files and database records.

Two categories of Packages are eligible for cleanup:
1. **Soft-deleted**: `deleted_at` is not null and `deleted_at < NOW() - RETENTION_DAYS`
2. **Completed and stale**: `status = COMPLETED` and `updated_at < NOW() - RETENTION_DAYS`

The cleanup order is important: delete S3 files first, then `package_files` rows, then the `packages` row. This ensures that if the process crashes mid-cleanup, orphaned DB rows can be retried (but orphaned S3 files without DB references are harder to find).

## Files and Folders
- `/apps/api/src/modules/packages/retention.service.ts` — `RetentionService` with `@Cron` scheduled task
- `/apps/api/src/modules/packages/__tests__/retention.service.spec.ts` — Unit tests for retention logic

## Acceptance Criteria
- [ ] `@Cron('0 2 * * *')` — runs daily at 2:00 AM UTC
- [ ] Queries Packages where `deleted_at IS NOT NULL AND deleted_at < NOW() - RETENTION_DAYS`
- [ ] Queries Packages where `status = 'COMPLETED' AND updated_at < NOW() - RETENTION_DAYS`
- [ ] For each eligible Package: deletes S3 files via `StorageService.deleteByPrefix('packages/{packageId}/')`, hard-deletes `package_files` rows, hard-deletes the `packages` row
- [ ] Cleanup order: S3 files → `package_files` rows → `packages` row (per Package)
- [ ] `RETENTION_DAYS` is configurable via environment variable (default: 30)
- [ ] Dry-run mode: when `RETENTION_DRY_RUN=true`, logs what would be deleted without actually deleting
- [ ] Logs all actions: Package IDs processed, file counts deleted, errors encountered
- [ ] Handles errors gracefully: if one Package fails cleanup, continues with the next (does not abort the entire run)
- [ ] Unit tests verify: query logic for both deletion categories, dry-run skips actual deletion, cleanup ordering, error handling for individual Package failures

## Implementation Notes
- Implementation pattern:
  ```ts
  import { Injectable, Logger } from "@nestjs/common";
  import { Cron, CronExpression } from "@nestjs/schedule";
  import { ConfigService } from "@nestjs/config";
  import { and, lt, eq, isNotNull, or, sql } from "drizzle-orm";

  @Injectable()
  export class RetentionService {
    private readonly logger = new Logger(RetentionService.name);
    private readonly retentionDays: number;
    private readonly dryRun: boolean;

    constructor(
      private readonly configService: ConfigService,
      private readonly storageService: StorageService,
      @Inject("DATABASE") private readonly db: DrizzleDatabase,
    ) {
      this.retentionDays = this.configService.get<number>("RETENTION_DAYS", 30);
      this.dryRun = this.configService.get<boolean>("RETENTION_DRY_RUN", false);
    }

    @Cron("0 2 * * *")
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
    }

    private async findExpiredPackages(cutoff: Date) {
      return this.db
        .select()
        .from(packages)
        .where(
          or(
            // Soft-deleted past retention
            and(isNotNull(packages.deletedAt), lt(packages.deletedAt, cutoff)),
            // Completed and stale
            and(eq(packages.status, "COMPLETED"), lt(packages.updatedAt, cutoff)),
          ),
        );
    }

    private async cleanupPackage(pkg: Package): Promise<void> {
      if (this.dryRun) {
        this.logger.log(`[DRY RUN] Would delete package ${pkg.id}`);
        return;
      }

      // 1. Delete S3 files
      const deletedFiles = await this.storageService.deleteByPrefix(
        `packages/${pkg.id}/`,
      );
      this.logger.log(`Deleted ${deletedFiles} S3 files for package ${pkg.id}`);

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
  ```
- Install `@nestjs/schedule` and `cron` if not already present: `pnpm --filter api add @nestjs/schedule`.
- Register `ScheduleModule.forRoot()` in the app module if not already registered.
- The `StorageService.deleteByPrefix()` method should exist from task 029. If it does not exist, it needs to be added — it lists all objects with the given prefix and deletes them in batch.
- For unit tests, mock `StorageService`, `ConfigService`, and the database. Verify:
  - `findExpiredPackages` builds the correct query with the cutoff date
  - `cleanupPackage` calls S3 delete, then `package_files` delete, then `packages` delete in order
  - Dry-run mode logs but does not call delete methods
  - When one Package cleanup fails, the next Package is still processed
- Consider adding a metric or notification for the retention run summary (Package count, error count) for observability. Not required for MVP but worth a TODO comment.
- The cron expression `0 2 * * *` runs at 2:00 AM UTC. This should be during low-traffic hours. Document that the timezone is UTC.
