import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Subject } from 'rxjs';
import { take, toArray, firstValueFrom } from 'rxjs';
import { LogsController } from './logs.controller';
import { LogsService, LogEntry } from './logs.service';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: 'info',
    message: 'test message',
    timestamp: '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

function createMockLogsService() {
  return {
    getJobStatus: vi.fn(),
    getLogs: vi.fn(),
    streamLogs: vi.fn(),
    isTerminalStatus: vi.fn((status: string) =>
      new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'ERROR']).has(status),
    ),
    appendLog: vi.fn(),
    appendLogs: vi.fn(),
    completeStream: vi.fn(),
    checkAndCompleteIfTerminal: vi.fn(),
    getActiveStreamCount: vi.fn(),
    hasActiveStream: vi.fn(),
  };
}

function buildController(mockService = createMockLogsService()) {
  const controller = new LogsController(mockService as unknown as LogsService);
  return { controller, mockService };
}

/**
 * Flush microtask queue so the async validateAndStream completes
 * before we emit on subjects.
 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('LogsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/jobs/:jobId/logs', () => {
    it('returns paginated log entries with meta information', async () => {
      const { controller, mockService } = buildController();
      const entries = [makeEntry(), makeEntry({ message: 'second' })];

      mockService.getJobStatus.mockResolvedValue('RUNNING');
      mockService.getLogs.mockResolvedValue({
        data: entries,
        total: 2,
        page: 1,
        limit: 100,
      });

      const result = await controller.getLogs('job-uuid', {
        page: 1,
        limit: 100,
      });

      expect(result).toEqual({
        data: entries,
        meta: {
          page: 1,
          limit: 100,
          total: 2,
          jobId: 'job-uuid',
          jobState: 'RUNNING',
        },
      });
    });

    it('passes filter parameters to the service', async () => {
      const { controller, mockService } = buildController();

      mockService.getJobStatus.mockResolvedValue('COMPLETED');
      mockService.getLogs.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 100,
      });

      await controller.getLogs('job-uuid', {
        level: 'warn',
        after: '2024-01-01T00:00:00Z',
        before: '2024-12-31T23:59:59Z',
        page: 2,
        limit: 50,
      });

      expect(mockService.getLogs).toHaveBeenCalledWith(
        'job-uuid',
        {
          level: 'warn',
          after: '2024-01-01T00:00:00Z',
          before: '2024-12-31T23:59:59Z',
        },
        {
          page: 2,
          limit: 50,
        },
      );
    });

    it('throws NotFoundException when job does not exist', async () => {
      const { controller, mockService } = buildController();
      mockService.getJobStatus.mockResolvedValue(null);

      await expect(
        controller.getLogs('nonexistent-uuid', { page: 1, limit: 100 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns empty data with correct meta when no logs exist', async () => {
      const { controller, mockService } = buildController();

      mockService.getJobStatus.mockResolvedValue('QUEUED');
      mockService.getLogs.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 100,
      });

      const result = await controller.getLogs('job-uuid', {
        page: 1,
        limit: 100,
      });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.jobState).toBe('QUEUED');
    });

    it('includes jobId in the meta response', async () => {
      const { controller, mockService } = buildController();

      mockService.getJobStatus.mockResolvedValue('RUNNING');
      mockService.getLogs.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 50,
      });

      const result = await controller.getLogs('specific-job-id', {
        page: 1,
        limit: 50,
      });

      expect(result.meta.jobId).toBe('specific-job-id');
    });

    it('passes default pagination when no query params provided', async () => {
      const { controller, mockService } = buildController();

      mockService.getJobStatus.mockResolvedValue('RUNNING');
      mockService.getLogs.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 100,
      });

      await controller.getLogs('job-uuid', { page: 1, limit: 100 });

      expect(mockService.getLogs).toHaveBeenCalledWith(
        'job-uuid',
        { level: undefined, after: undefined, before: undefined },
        { page: 1, limit: 100 },
      );
    });

    it('returns logs for completed jobs (historical access)', async () => {
      const { controller, mockService } = buildController();
      const entries = [makeEntry({ level: 'error', message: 'fatal error' })];

      mockService.getJobStatus.mockResolvedValue('COMPLETED');
      mockService.getLogs.mockResolvedValue({
        data: entries,
        total: 1,
        page: 1,
        limit: 100,
      });

      const result = await controller.getLogs('job-uuid', {
        page: 1,
        limit: 100,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.jobState).toBe('COMPLETED');
    });
  });

  describe('SSE /api/jobs/:jobId/logs/stream', () => {
    it('streams log entries as SSE events with type "log"', async () => {
      const { controller, mockService } = buildController();
      const subject = new Subject<LogEntry>();

      mockService.getJobStatus.mockResolvedValue('RUNNING');
      mockService.streamLogs.mockReturnValue(subject.asObservable());

      const observable = controller.streamLogs('job-uuid');
      const collected = firstValueFrom(observable.pipe(take(1)));

      // Wait for async validation to complete before emitting
      await flushMicrotasks();
      subject.next(makeEntry({ message: 'streamed entry' }));

      const event = await collected;
      expect(event.type).toBe('log');
      expect(JSON.parse(event.data as string)).toEqual(
        makeEntry({ message: 'streamed entry' }),
      );
    });

    it('includes retry field on the first SSE event', async () => {
      const { controller, mockService } = buildController();
      const subject = new Subject<LogEntry>();

      mockService.getJobStatus.mockResolvedValue('RUNNING');
      mockService.streamLogs.mockReturnValue(subject.asObservable());

      const observable = controller.streamLogs('job-uuid');
      const collected = firstValueFrom(observable.pipe(take(1)));

      await flushMicrotasks();
      subject.next(makeEntry());

      const event = await collected;
      expect(event.retry).toBe(3000);
    });

    it('does not include retry on subsequent events', async () => {
      const { controller, mockService } = buildController();
      const subject = new Subject<LogEntry>();

      mockService.getJobStatus.mockResolvedValue('RUNNING');
      mockService.streamLogs.mockReturnValue(subject.asObservable());

      const observable = controller.streamLogs('job-uuid');
      const collected = firstValueFrom(observable.pipe(take(2), toArray()));

      await flushMicrotasks();
      subject.next(makeEntry({ message: 'first' }));
      subject.next(makeEntry({ message: 'second' }));

      const events = await collected;
      expect(events[0]!.retry).toBe(3000);
      expect(events[1]!.retry).toBeUndefined();
    });

    it('sends "complete" event when stream completes', async () => {
      const { controller, mockService } = buildController();
      const subject = new Subject<LogEntry>();

      mockService.getJobStatus.mockResolvedValue('RUNNING');
      mockService.streamLogs.mockReturnValue(subject.asObservable());

      const observable = controller.streamLogs('job-uuid');
      const collected = firstValueFrom(observable.pipe(take(2), toArray()));

      await flushMicrotasks();
      subject.next(makeEntry());
      subject.complete();

      const events = await collected;
      expect(events[1]!.type).toBe('complete');
      expect(JSON.parse(events[1]!.data as string)).toEqual({
        message: 'Job completed',
      });
    });

    it('errors with NotFoundException when job does not exist', async () => {
      const { controller, mockService } = buildController();
      mockService.getJobStatus.mockResolvedValue(null);

      const observable = controller.streamLogs('nonexistent-uuid');

      await expect(firstValueFrom(observable)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('errors with BadRequestException when job is in terminal state', async () => {
      const { controller, mockService } = buildController();
      mockService.getJobStatus.mockResolvedValue('COMPLETED');

      const observable = controller.streamLogs('job-uuid');

      await expect(firstValueFrom(observable)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('includes helpful message when rejecting terminal job stream', async () => {
      const { controller, mockService } = buildController();
      mockService.getJobStatus.mockResolvedValue('COMPLETED');

      const observable = controller.streamLogs('job-uuid');

      try {
        await firstValueFrom(observable);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('already completed');
        expect(err.message).toContain('GET /api/jobs/job-uuid/logs');
      }
    });

    it('rejects stream for FAILED jobs', async () => {
      const { controller, mockService } = buildController();
      mockService.getJobStatus.mockResolvedValue('FAILED');

      const observable = controller.streamLogs('job-uuid');

      await expect(firstValueFrom(observable)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects stream for CANCELLED jobs', async () => {
      const { controller, mockService } = buildController();
      mockService.getJobStatus.mockResolvedValue('CANCELLED');

      const observable = controller.streamLogs('job-uuid');

      await expect(firstValueFrom(observable)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects stream for ERROR jobs', async () => {
      const { controller, mockService } = buildController();
      mockService.getJobStatus.mockResolvedValue('ERROR');

      const observable = controller.streamLogs('job-uuid');

      await expect(firstValueFrom(observable)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows streaming for QUEUED jobs', async () => {
      const { controller, mockService } = buildController();
      const subject = new Subject<LogEntry>();

      mockService.getJobStatus.mockResolvedValue('QUEUED');
      mockService.streamLogs.mockReturnValue(subject.asObservable());

      const observable = controller.streamLogs('job-uuid');
      const collected = firstValueFrom(observable.pipe(take(1)));

      await flushMicrotasks();
      subject.next(makeEntry());

      const event = await collected;
      expect(event.type).toBe('log');
    });

    it('allows streaming for RUNNING jobs', async () => {
      const { controller, mockService } = buildController();
      const subject = new Subject<LogEntry>();

      mockService.getJobStatus.mockResolvedValue('RUNNING');
      mockService.streamLogs.mockReturnValue(subject.asObservable());

      const observable = controller.streamLogs('job-uuid');
      const collected = firstValueFrom(observable.pipe(take(1)));

      await flushMicrotasks();
      subject.next(makeEntry());

      const event = await collected;
      expect(event.type).toBe('log');
    });

    it('streams multiple entries in order', async () => {
      const { controller, mockService } = buildController();
      const subject = new Subject<LogEntry>();

      mockService.getJobStatus.mockResolvedValue('RUNNING');
      mockService.streamLogs.mockReturnValue(subject.asObservable());

      const observable = controller.streamLogs('job-uuid');
      const collected = firstValueFrom(observable.pipe(take(3), toArray()));

      await flushMicrotasks();
      subject.next(makeEntry({ message: 'first' }));
      subject.next(makeEntry({ message: 'second' }));
      subject.next(makeEntry({ message: 'third' }));

      const events = await collected;
      expect(events).toHaveLength(3);
      expect(JSON.parse(events[0]!.data as string).message).toBe('first');
      expect(JSON.parse(events[1]!.data as string).message).toBe('second');
      expect(JSON.parse(events[2]!.data as string).message).toBe('third');
    });

    it('serializes log entry data as JSON string', async () => {
      const { controller, mockService } = buildController();
      const subject = new Subject<LogEntry>();

      mockService.getJobStatus.mockResolvedValue('RUNNING');
      mockService.streamLogs.mockReturnValue(subject.asObservable());

      const observable = controller.streamLogs('job-uuid');
      const collected = firstValueFrom(observable.pipe(take(1)));

      await flushMicrotasks();
      const entry = makeEntry({
        metadata: { key: 'value', nested: { deep: true } },
      });
      subject.next(entry);

      const event = await collected;
      expect(typeof event.data).toBe('string');
      const parsed = JSON.parse(event.data as string);
      expect(parsed.metadata.key).toBe('value');
      expect(parsed.metadata.nested.deep).toBe(true);
    });
  });
});
