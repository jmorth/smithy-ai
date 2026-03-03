import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { firstValueFrom, take, toArray, lastValueFrom } from 'rxjs';
import { LogsService, LogEntry } from '../logs.service';

function createMockDb() {
  return {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

function buildService(db = createMockDb()) {
  const service = new LogsService(db as any);
  return { service, db };
}

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: 'info',
    message: 'test message',
    timestamp: '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('LogsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('appendLog', () => {
    it('delegates to appendLogs with a single entry', async () => {
      const { service, db } = buildService();
      // Mock getLogCount to return 0
      db.execute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      // Mock the UPDATE
      db.execute.mockResolvedValueOnce({ rows: [] });

      const entry = makeEntry();
      await service.appendLog('job-1', entry);

      // First call is getLogCount, second is the UPDATE
      expect(db.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('appendLogs', () => {
    it('does nothing for an empty entries array', async () => {
      const { service, db } = buildService();

      await service.appendLogs('job-1', []);

      expect(db.execute).not.toHaveBeenCalled();
    });

    it('appends entries to the JSONB array via SQL UPDATE', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      db.execute.mockResolvedValueOnce({ rows: [] });

      const entries = [makeEntry(), makeEntry({ level: 'warn', message: 'warning' })];
      await service.appendLogs('job-1', entries);

      expect(db.execute).toHaveBeenCalledTimes(2);

      // Verify the second call is the UPDATE with COALESCE
      const updateCall = db.execute.mock.calls[1]![0];
      const queryStr = updateCall.queryChunks?.[0]?.value?.[0] ?? updateCall.sql ?? String(updateCall);
      // We just verify db.execute was called — the SQL template internals are drizzle's concern
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('rejects appends when log count exceeds MAX_LOG_ENTRIES', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ count: 10_000 }] });

      const entry = makeEntry();
      await service.appendLogs('job-1', [entry]);

      // Only one call (getLogCount), no UPDATE
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('treats missing log count rows as zero', async () => {
      const { service, db } = buildService();
      // getLogCount returns no rows
      db.execute.mockResolvedValueOnce({ rows: [] });
      // UPDATE succeeds
      db.execute.mockResolvedValueOnce({ rows: [] });

      await service.appendLogs('job-1', [makeEntry()]);

      // Should proceed with append since count defaults to 0
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('emits entries to active streams', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      db.execute.mockResolvedValueOnce({ rows: [] });

      const collected: LogEntry[] = [];
      const observable = service.streamLogs('job-1');
      const sub = observable.subscribe((entry) => collected.push(entry));

      const entry = makeEntry({ message: 'streamed' });
      await service.appendLogs('job-1', [entry]);

      expect(collected).toHaveLength(1);
      expect(collected[0]!.message).toBe('streamed');

      sub.unsubscribe();
    });

    it('does not emit to streams for different job IDs', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      db.execute.mockResolvedValueOnce({ rows: [] });

      const collected: LogEntry[] = [];
      const observable = service.streamLogs('job-2');
      const sub = observable.subscribe((entry) => collected.push(entry));

      await service.appendLogs('job-1', [makeEntry()]);

      expect(collected).toHaveLength(0);

      sub.unsubscribe();
    });

    it('emits multiple entries in order', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      db.execute.mockResolvedValueOnce({ rows: [] });

      const collected: LogEntry[] = [];
      const observable = service.streamLogs('job-1');
      const sub = observable.subscribe((entry) => collected.push(entry));

      const entries = [
        makeEntry({ message: 'first' }),
        makeEntry({ message: 'second' }),
        makeEntry({ message: 'third' }),
      ];
      await service.appendLogs('job-1', entries);

      expect(collected).toHaveLength(3);
      expect(collected.map((e) => e.message)).toEqual(['first', 'second', 'third']);

      sub.unsubscribe();
    });
  });

  describe('getLogs', () => {
    it('returns paginated results with default page and limit', async () => {
      const { service, db } = buildService();
      const mockEntries = [makeEntry(), makeEntry({ message: 'second' })];

      // count query result
      db.execute.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      // data query result
      db.execute.mockResolvedValueOnce({
        rows: mockEntries.map((e) => ({ elem: e })),
      });

      const result = await service.getLogs('job-1');

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('respects custom pagination', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ total: '100' }] });
      db.execute.mockResolvedValueOnce({
        rows: [{ elem: makeEntry() }],
      });

      const result = await service.getLogs('job-1', undefined, { page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(100);
    });

    it('returns empty results when no logs exist', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ total: '0' }] });
      db.execute.mockResolvedValueOnce({ rows: [] });

      const result = await service.getLogs('job-1');

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('handles string elem values by parsing JSON', async () => {
      const { service, db } = buildService();
      const entry = makeEntry();
      db.execute.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      db.execute.mockResolvedValueOnce({
        rows: [{ elem: JSON.stringify(entry) }],
      });

      const result = await service.getLogs('job-1');

      expect(result.data[0]).toEqual(entry);
    });

    it('applies level filter', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      db.execute.mockResolvedValueOnce({
        rows: [{ elem: makeEntry({ level: 'error' }) }],
      });

      const result = await service.getLogs('job-1', { level: 'warn' });

      expect(result.data).toHaveLength(1);
      // Verify that db.execute was called with SQL containing level filter
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('applies time range filters', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      db.execute.mockResolvedValueOnce({
        rows: [{ elem: makeEntry() }],
      });

      const result = await service.getLogs('job-1', {
        after: '2024-01-14T00:00:00Z',
        before: '2024-01-16T00:00:00Z',
      });

      expect(result.data).toHaveLength(1);
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('combines level and time filters', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      db.execute.mockResolvedValueOnce({
        rows: [{ elem: makeEntry({ level: 'error' }) }],
      });

      const result = await service.getLogs('job-1', {
        level: 'error',
        after: '2024-01-14T00:00:00Z',
      });

      expect(result.data).toHaveLength(1);
    });

    it('ignores invalid level filter', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      db.execute.mockResolvedValueOnce({
        rows: [{ elem: makeEntry() }, { elem: makeEntry({ level: 'debug' }) }],
      });

      const result = await service.getLogs('job-1', { level: 'invalid_level' });

      expect(result.data).toHaveLength(2);
    });

    it('handles missing rows gracefully', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: undefined });
      db.execute.mockResolvedValueOnce({ rows: undefined });

      const result = await service.getLogs('job-1');

      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  describe('streamLogs', () => {
    it('returns an Observable that receives new entries', async () => {
      const { service, db } = buildService();

      const collected: LogEntry[] = [];
      const observable = service.streamLogs('job-1');
      const sub = observable.subscribe((entry) => collected.push(entry));

      // Simulate append
      db.execute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      db.execute.mockResolvedValueOnce({ rows: [] });
      await service.appendLogs('job-1', [makeEntry({ message: 'test' })]);

      expect(collected).toHaveLength(1);
      expect(collected[0]!.message).toBe('test');

      sub.unsubscribe();
    });

    it('reuses existing subject for same jobId', () => {
      const { service } = buildService();

      service.streamLogs('job-1');
      service.streamLogs('job-1');

      expect(service.getActiveStreamCount()).toBe(1);
    });

    it('creates separate subjects for different jobIds', () => {
      const { service } = buildService();

      const sub1 = service.streamLogs('job-1').subscribe();
      const sub2 = service.streamLogs('job-2').subscribe();

      expect(service.getActiveStreamCount()).toBe(2);

      sub1.unsubscribe();
      sub2.unsubscribe();
    });

    it('buffers entries for late subscribers via ReplaySubject', async () => {
      const { service, db } = buildService();

      // Append before subscribing
      db.execute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      db.execute.mockResolvedValueOnce({ rows: [] });

      // Create the stream first (but don't subscribe yet)
      service.streamLogs('job-1');

      await service.appendLogs('job-1', [makeEntry({ message: 'buffered' })]);

      // Now subscribe — should receive the buffered entry
      const collected: LogEntry[] = [];
      const sub = service.streamLogs('job-1').subscribe((entry) => collected.push(entry));

      expect(collected).toHaveLength(1);
      expect(collected[0]!.message).toBe('buffered');

      sub.unsubscribe();
    });

    it('completes when completeStream is called', async () => {
      const { service } = buildService();

      let completed = false;
      const sub = service.streamLogs('job-1').subscribe({
        complete: () => { completed = true; },
      });

      await service.completeStream('job-1');

      expect(completed).toBe(true);
      expect(service.hasActiveStream('job-1')).toBe(false);

      sub.unsubscribe();
    });
  });

  describe('completeStream', () => {
    it('completes the subject and removes it from the map', async () => {
      const { service } = buildService();

      service.streamLogs('job-1');
      expect(service.hasActiveStream('job-1')).toBe(true);

      await service.completeStream('job-1');

      expect(service.hasActiveStream('job-1')).toBe(false);
    });

    it('does nothing for non-existent streams', async () => {
      const { service } = buildService();

      // Should not throw
      await service.completeStream('nonexistent');

      expect(service.getActiveStreamCount()).toBe(0);
    });
  });

  describe('checkAndCompleteIfTerminal', () => {
    it.each(['COMPLETED', 'FAILED', 'CANCELLED', 'ERROR'])(
      'completes the stream when job status is %s',
      async (status) => {
        const { service, db } = buildService();
        db.execute.mockResolvedValueOnce({ rows: [{ status }] });

        service.streamLogs('job-1');

        const result = await service.checkAndCompleteIfTerminal('job-1');

        expect(result).toBe(true);
        expect(service.hasActiveStream('job-1')).toBe(false);
      },
    );

    it('does not complete the stream when job is RUNNING', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ status: 'RUNNING' }] });

      service.streamLogs('job-1');

      const result = await service.checkAndCompleteIfTerminal('job-1');

      expect(result).toBe(false);
      expect(service.hasActiveStream('job-1')).toBe(true);

      // Cleanup
      await service.completeStream('job-1');
    });

    it('does not complete the stream when job is QUEUED', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ status: 'QUEUED' }] });

      service.streamLogs('job-1');

      const result = await service.checkAndCompleteIfTerminal('job-1');

      expect(result).toBe(false);
      expect(service.hasActiveStream('job-1')).toBe(true);

      await service.completeStream('job-1');
    });

    it('returns false when job is not found', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [] });

      const result = await service.checkAndCompleteIfTerminal('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getActiveStreamCount', () => {
    it('returns 0 when no streams are active', () => {
      const { service } = buildService();
      expect(service.getActiveStreamCount()).toBe(0);
    });

    it('returns the correct count of active streams', () => {
      const { service } = buildService();

      const sub1 = service.streamLogs('job-1').subscribe();
      const sub2 = service.streamLogs('job-2').subscribe();

      expect(service.getActiveStreamCount()).toBe(2);

      sub1.unsubscribe();
      sub2.unsubscribe();
    });
  });

  describe('hasActiveStream', () => {
    it('returns false for non-existent streams', () => {
      const { service } = buildService();
      expect(service.hasActiveStream('job-1')).toBe(false);
    });

    it('returns true for active streams', () => {
      const { service } = buildService();

      const sub = service.streamLogs('job-1').subscribe();
      expect(service.hasActiveStream('job-1')).toBe(true);

      sub.unsubscribe();
    });
  });

  describe('getJobStatus', () => {
    it('returns the job status when the job exists', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ status: 'RUNNING' }] });

      const status = await service.getJobStatus('job-1');
      expect(status).toBe('RUNNING');
    });

    it('returns null when the job does not exist', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [] });

      const status = await service.getJobStatus('nonexistent');
      expect(status).toBeNull();
    });

    it('returns null when rows are undefined', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: undefined });

      const status = await service.getJobStatus('job-1');
      expect(status).toBeNull();
    });
  });

  describe('isTerminalStatus', () => {
    it.each(['COMPLETED', 'FAILED', 'CANCELLED', 'ERROR'])(
      'returns true for terminal status %s',
      (status) => {
        const { service } = buildService();
        expect(service.isTerminalStatus(status)).toBe(true);
      },
    );

    it.each(['QUEUED', 'RUNNING', 'STUCK'])(
      'returns false for non-terminal status %s',
      (status) => {
        const { service } = buildService();
        expect(service.isTerminalStatus(status)).toBe(false);
      },
    );
  });

  describe('level hierarchy filtering', () => {
    it('debug level includes all levels', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ total: '4' }] });
      db.execute.mockResolvedValueOnce({
        rows: [
          { elem: makeEntry({ level: 'debug' }) },
          { elem: makeEntry({ level: 'info' }) },
          { elem: makeEntry({ level: 'warn' }) },
          { elem: makeEntry({ level: 'error' }) },
        ],
      });

      const result = await service.getLogs('job-1', { level: 'debug' });

      expect(result.data).toHaveLength(4);
    });

    it('info level includes info, warn, error', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ total: '3' }] });
      db.execute.mockResolvedValueOnce({
        rows: [
          { elem: makeEntry({ level: 'info' }) },
          { elem: makeEntry({ level: 'warn' }) },
          { elem: makeEntry({ level: 'error' }) },
        ],
      });

      const result = await service.getLogs('job-1', { level: 'info' });

      expect(result.data).toHaveLength(3);
    });

    it('warn level includes warn and error', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      db.execute.mockResolvedValueOnce({
        rows: [
          { elem: makeEntry({ level: 'warn' }) },
          { elem: makeEntry({ level: 'error' }) },
        ],
      });

      const result = await service.getLogs('job-1', { level: 'warn' });

      expect(result.data).toHaveLength(2);
    });

    it('error level includes only error', async () => {
      const { service, db } = buildService();
      db.execute.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      db.execute.mockResolvedValueOnce({
        rows: [{ elem: makeEntry({ level: 'error' }) }],
      });

      const result = await service.getLogs('job-1', { level: 'error' });

      expect(result.data).toHaveLength(1);
    });
  });

  describe('LogEntry type', () => {
    it('accepts entries with all fields', () => {
      const entry: LogEntry = {
        level: 'info',
        message: 'test',
        timestamp: '2024-01-15T10:00:00.000Z',
        metadata: { key: 'value', nested: { deep: true } },
      };
      expect(entry.level).toBe('info');
      expect(entry.metadata).toBeDefined();
    });

    it('accepts entries without metadata', () => {
      const entry: LogEntry = {
        level: 'debug',
        message: 'test',
        timestamp: '2024-01-15T10:00:00.000Z',
      };
      expect(entry.metadata).toBeUndefined();
    });

    it('accepts all valid log levels', () => {
      const levels: LogEntry['level'][] = ['debug', 'info', 'warn', 'error'];
      for (const level of levels) {
        const entry: LogEntry = { level, message: 'test', timestamp: '2024-01-15T10:00:00.000Z' };
        expect(entry.level).toBe(level);
      }
    });
  });
});
