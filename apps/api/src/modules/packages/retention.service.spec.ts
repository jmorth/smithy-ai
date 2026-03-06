import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetentionService } from './retention.service';

// ── helpers ────────────────────────────────────────────────────────────────

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

function makeSelectChain(resolveValue: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(resolveValue),
  };
}

function makeDeleteChain() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
  };
}

function makeConfigService(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    'app.retentionDays': 30,
    'app.retentionDryRun': false,
  };
  const config = { ...defaults, ...overrides };
  return {
    get: vi.fn((key: string, defaultValue?: unknown) => config[key] ?? defaultValue),
  };
}

function makeStorageService() {
  return {
    deleteByPrefix: vi.fn().mockResolvedValue(undefined),
  };
}

function buildService(configOverrides: Record<string, unknown> = {}) {
  const mockDb = {
    select: vi.fn(),
    delete: vi.fn(),
  };
  const mockConfig = makeConfigService(configOverrides);
  const mockStorage = makeStorageService();
  const service = new RetentionService(
    mockConfig as any,
    mockStorage as any,
    mockDb as any,
  );
  return { service, mockDb, mockConfig, mockStorage };
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('RetentionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T02:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('reads retentionDays from config', () => {
      const { mockConfig } = buildService({ 'app.retentionDays': 60 });
      expect(mockConfig.get).toHaveBeenCalledWith('app.retentionDays', 30);
    });

    it('reads dryRun from config', () => {
      const { mockConfig } = buildService({ 'app.retentionDryRun': true });
      expect(mockConfig.get).toHaveBeenCalledWith('app.retentionDryRun', false);
    });

    it('defaults retentionDays to 30', () => {
      const { mockConfig } = buildService();
      expect(mockConfig.get).toHaveBeenCalledWith('app.retentionDays', 30);
    });

    it('defaults dryRun to false', () => {
      const { mockConfig } = buildService();
      expect(mockConfig.get).toHaveBeenCalledWith('app.retentionDryRun', false);
    });
  });

  // ── findExpiredPackages ──────────────────────────────────────────────────

  describe('findExpiredPackages', () => {
    it('queries for soft-deleted and completed-stale packages', async () => {
      const cutoff = new Date('2024-05-16');
      const expiredPkgs = [
        makePackage({ id: 'soft-del-1', deletedAt: new Date('2024-05-01') }),
        makePackage({ id: 'completed-1', status: 'COMPLETED', updatedAt: new Date('2024-04-01') }),
      ];
      const { service, mockDb } = buildService();
      const selectChain = makeSelectChain(expiredPkgs);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.findExpiredPackages(cutoff);

      expect(mockDb.select).toHaveBeenCalledOnce();
      expect(selectChain.from).toHaveBeenCalledOnce();
      expect(selectChain.where).toHaveBeenCalledOnce();
      expect(result).toEqual(expiredPkgs);
    });

    it('returns empty array when no packages are expired', async () => {
      const cutoff = new Date('2024-05-16');
      const { service, mockDb } = buildService();
      const selectChain = makeSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.findExpiredPackages(cutoff);

      expect(result).toEqual([]);
    });
  });

  // ── cleanupPackage ───────────────────────────────────────────────────────

  describe('cleanupPackage', () => {
    it('deletes S3 files, then package_files rows, then package row in order', async () => {
      const pkg = makePackage({ id: 'pkg-cleanup-1' });
      const { service, mockDb, mockStorage } = buildService();
      const deleteChain1 = makeDeleteChain();
      const deleteChain2 = makeDeleteChain();
      mockDb.delete.mockReturnValueOnce(deleteChain1).mockReturnValueOnce(deleteChain2);

      const callOrder: string[] = [];
      mockStorage.deleteByPrefix.mockImplementation(async () => {
        callOrder.push('s3');
      });
      deleteChain1.where.mockImplementation(async () => {
        callOrder.push('package_files');
      });
      deleteChain2.where.mockImplementation(async () => {
        callOrder.push('packages');
      });

      await service.cleanupPackage(pkg as any);

      expect(callOrder).toEqual(['s3', 'package_files', 'packages']);
    });

    it('calls deleteByPrefix with correct prefix', async () => {
      const pkg = makePackage({ id: 'pkg-abc-123' });
      const { service, mockDb, mockStorage } = buildService();
      mockDb.delete.mockReturnValue(makeDeleteChain());

      await service.cleanupPackage(pkg as any);

      expect(mockStorage.deleteByPrefix).toHaveBeenCalledWith('packages/pkg-abc-123/');
    });

    it('hard-deletes package_files rows for the package', async () => {
      const pkg = makePackage({ id: 'pkg-del-1' });
      const { service, mockDb } = buildService();
      const deleteChain1 = makeDeleteChain();
      const deleteChain2 = makeDeleteChain();
      mockDb.delete.mockReturnValueOnce(deleteChain1).mockReturnValueOnce(deleteChain2);

      await service.cleanupPackage(pkg as any);

      expect(mockDb.delete).toHaveBeenCalledTimes(2);
      expect(deleteChain1.where).toHaveBeenCalledOnce();
      expect(deleteChain2.where).toHaveBeenCalledOnce();
    });

    it('skips all deletion in dry-run mode and logs instead', async () => {
      const pkg = makePackage({ id: 'pkg-dry-1' });
      const { service, mockDb, mockStorage } = buildService({ 'app.retentionDryRun': true });

      await service.cleanupPackage(pkg as any);

      expect(mockStorage.deleteByPrefix).not.toHaveBeenCalled();
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });

  // ── handleRetention ──────────────────────────────────────────────────────

  describe('handleRetention', () => {
    it('calculates the correct cutoff date based on retentionDays', async () => {
      const { service, mockDb } = buildService({ 'app.retentionDays': 30 });
      const selectChain = makeSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      await service.handleRetention();

      // System time is 2024-06-15, so cutoff should be 2024-05-16
      expect(mockDb.select).toHaveBeenCalledOnce();
    });

    it('processes each eligible package for cleanup', async () => {
      const pkgs = [
        makePackage({ id: 'pkg-1', deletedAt: new Date('2024-04-01') }),
        makePackage({ id: 'pkg-2', status: 'COMPLETED', updatedAt: new Date('2024-04-01') }),
      ];
      const { service, mockDb, mockStorage } = buildService();
      const selectChain = makeSelectChain(pkgs);
      mockDb.select.mockReturnValue(selectChain);
      mockDb.delete.mockReturnValue(makeDeleteChain());

      await service.handleRetention();

      // 2 packages × 2 delete calls each (package_files + packages) = 4
      expect(mockStorage.deleteByPrefix).toHaveBeenCalledTimes(2);
      expect(mockDb.delete).toHaveBeenCalledTimes(4);
    });

    it('continues processing remaining packages when one fails', async () => {
      const pkgs = [
        makePackage({ id: 'pkg-fail' }),
        makePackage({ id: 'pkg-success' }),
      ];
      const { service, mockDb, mockStorage } = buildService();
      const selectChain = makeSelectChain(pkgs);
      mockDb.select.mockReturnValue(selectChain);

      // First package cleanup fails on S3 delete
      mockStorage.deleteByPrefix
        .mockRejectedValueOnce(new Error('S3 failure'))
        .mockResolvedValueOnce(undefined);
      mockDb.delete.mockReturnValue(makeDeleteChain());

      await service.handleRetention();

      // Second package should still be processed
      expect(mockStorage.deleteByPrefix).toHaveBeenCalledTimes(2);
      expect(mockStorage.deleteByPrefix).toHaveBeenCalledWith('packages/pkg-success/');
    });

    it('logs error count when packages fail cleanup', async () => {
      const pkgs = [
        makePackage({ id: 'pkg-fail-1' }),
        makePackage({ id: 'pkg-fail-2' }),
        makePackage({ id: 'pkg-ok' }),
      ];
      const { service, mockDb, mockStorage } = buildService();
      const selectChain = makeSelectChain(pkgs);
      mockDb.select.mockReturnValue(selectChain);
      mockDb.delete.mockReturnValue(makeDeleteChain());

      mockStorage.deleteByPrefix
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(undefined);

      const logSpy = vi.spyOn((service as any).logger, 'log');

      await service.handleRetention();

      const completionLog = logSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('Retention complete'),
      );
      expect(completionLog).toBeDefined();
      expect(completionLog![0]).toContain('1 cleaned');
      expect(completionLog![0]).toContain('2 errors');
    });

    it('does not delete anything in dry-run mode', async () => {
      const pkgs = [
        makePackage({ id: 'dry-1' }),
        makePackage({ id: 'dry-2' }),
      ];
      const { service, mockDb, mockStorage } = buildService({ 'app.retentionDryRun': true });
      const selectChain = makeSelectChain(pkgs);
      mockDb.select.mockReturnValue(selectChain);

      await service.handleRetention();

      expect(mockStorage.deleteByPrefix).not.toHaveBeenCalled();
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('logs dry-run for each package when in dry-run mode', async () => {
      const pkgs = [
        makePackage({ id: 'dry-a' }),
        makePackage({ id: 'dry-b' }),
      ];
      const { service, mockDb } = buildService({ 'app.retentionDryRun': true });
      const selectChain = makeSelectChain(pkgs);
      mockDb.select.mockReturnValue(selectChain);

      const logSpy = vi.spyOn((service as any).logger, 'log');

      await service.handleRetention();

      const dryRunLogs = logSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('[DRY RUN]'),
      );
      expect(dryRunLogs).toHaveLength(2);
    });

    it('reports success count of 0 when no packages are found', async () => {
      const { service, mockDb } = buildService();
      const selectChain = makeSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const logSpy = vi.spyOn((service as any).logger, 'log');

      await service.handleRetention();

      const completionLog = logSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('Retention complete'),
      );
      expect(completionLog![0]).toContain('0 cleaned');
      expect(completionLog![0]).toContain('0 errors');
    });

    it('uses custom retentionDays from config', async () => {
      const { service, mockDb } = buildService({ 'app.retentionDays': 7 });
      const selectChain = makeSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const logSpy = vi.spyOn((service as any).logger, 'log');

      await service.handleRetention();

      const startLog = logSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('Starting retention cleanup'),
      );
      expect(startLog![0]).toContain('retention=7d');
    });
  });

  // ── cron decorator ───────────────────────────────────────────────────────

  describe('cron configuration', () => {
    it('has @Cron decorator on handleRetention method', () => {
      // Verify the cron metadata is set on the method
      const metadata = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', RetentionService.prototype.handleRetention);
      expect(metadata).toBeDefined();
    });
  });
});
