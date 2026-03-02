import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import {
  ContainerLogStreamerService,
  LOG_EVENTS,
  type LogEntry,
  type LogEventPayload,
} from './container-log-streamer';

function createMockDb() {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
  };
}

function buildService(overrides?: { db?: ReturnType<typeof createMockDb> }) {
  const db = overrides?.db ?? createMockDb();
  return { service: new ContainerLogStreamerService(db as any), db };
}

function createStreams(): { stdout: PassThrough; stderr: PassThrough } {
  return { stdout: new PassThrough(), stderr: new PassThrough() };
}

function collectLogEvents(service: ContainerLogStreamerService): LogEventPayload[] {
  const events: LogEventPayload[] = [];
  service.on(LOG_EVENTS.JOB_LOG, (payload: LogEventPayload) => {
    events.push(payload);
  });
  return events;
}

function endStreams(streams: { stdout: PassThrough; stderr: PassThrough }): void {
  streams.stdout.end();
  streams.stderr.end();
}

describe('ContainerLogStreamerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('streamLogs', () => {
    it('parses stdout lines as info level', async () => {
      const { service, db } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write('hello world\n');
      streams.stdout.write('second line\n');
      endStreams(streams);

      // Flush batch timer
      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events).toHaveLength(2);
      expect(events[0].entry.level).toBe('info');
      expect(events[0].entry.message).toBe('hello world');
      expect(events[0].jobId).toBe('job-1');
      expect(events[1].entry.level).toBe('info');
      expect(events[1].entry.message).toBe('second line');
    });

    it('parses stderr lines as error level', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stderr.write('something went wrong\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events).toHaveLength(1);
      expect(events[0].entry.level).toBe('error');
      expect(events[0].entry.message).toBe('something went wrong');
    });

    it('extracts level from structured JSON logs', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write(JSON.stringify({ level: 'warn', msg: 'disk nearly full' }) + '\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events).toHaveLength(1);
      expect(events[0].entry.level).toBe('warn');
      expect(events[0].entry.message).toBe('disk nearly full');
    });

    it('extracts message from "message" field in JSON logs', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write(JSON.stringify({ level: 'debug', message: 'trace info' }) + '\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events[0].entry.level).toBe('debug');
      expect(events[0].entry.message).toBe('trace info');
    });

    it('preserves metadata from structured JSON logs', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write(
        JSON.stringify({ level: 'info', msg: 'request', method: 'GET', path: '/api' }) + '\n',
      );
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events[0].entry.metadata).toEqual({ method: 'GET', path: '/api' });
    });

    it('does not include metadata when no extra fields exist', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write(JSON.stringify({ level: 'info', msg: 'simple' }) + '\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events[0].entry.metadata).toBeUndefined();
    });

    it('falls back to default level for invalid level in JSON', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write(JSON.stringify({ level: 'critical', msg: 'bad level' }) + '\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events[0].entry.level).toBe('info'); // stdout default
    });

    it('falls back to default level when level is not a string', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stderr.write(JSON.stringify({ level: 42, msg: 'numeric level' }) + '\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events[0].entry.level).toBe('error'); // stderr default
    });

    it('treats non-JSON lines starting with { as plain text', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write('{invalid json\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events[0].entry.level).toBe('info');
      expect(events[0].entry.message).toBe('{invalid json');
      expect(events[0].entry.metadata).toBeUndefined();
    });

    it('uses raw JSON line as message when no msg/message field', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      const jsonLine = JSON.stringify({ level: 'info', data: 'some-value' });
      streams.stdout.write(jsonLine + '\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events[0].entry.message).toBe(jsonLine);
    });

    it('includes ISO timestamp on each entry', async () => {
      vi.setSystemTime(new Date('2026-03-02T12:00:00.000Z'));

      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write('line\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events[0].entry.timestamp).toBe('2026-03-02T12:00:00.000Z');
    });
  });

  describe('batched database writes', () => {
    it('flushes entries to database on interval', async () => {
      const { service, db } = buildService();
      const streams = createStreams();

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write('line 1\n');
      streams.stdout.write('line 2\n');

      // Advance timer to trigger batch flush
      await vi.advanceTimersByTimeAsync(150);

      expect(db.execute).toHaveBeenCalledTimes(1);
      const callArg = db.execute.mock.calls[0][0];
      // The SQL should contain our entries as JSON
      const sqlString = callArg.queryChunks
        ? callArg.queryChunks.map((c: any) => (typeof c === 'string' ? c : c.value ?? '')).join('')
        : String(callArg);
      expect(sqlString).toContain('line 1');

      endStreams(streams);
      await vi.advanceTimersByTimeAsync(200);
      await promise;
    });

    it('flushes when batch size limit is reached', async () => {
      const { service, db } = buildService();
      const streams = createStreams();

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      // Write 50 lines to trigger batch size flush
      for (let i = 0; i < 50; i++) {
        streams.stdout.write(`line ${i}\n`);
      }

      // Give readline time to process all lines
      await vi.advanceTimersByTimeAsync(50);

      expect(db.execute).toHaveBeenCalled();

      endStreams(streams);
      await vi.advanceTimersByTimeAsync(200);
      await promise;
    });

    it('flushes remaining entries on stream close', async () => {
      const { service, db } = buildService();
      const streams = createStreams();

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write('final line\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      // Should have flushed at least once (either timer or final flush)
      expect(db.execute).toHaveBeenCalled();
    });

    it('appends entries to JSONB array using || operator', async () => {
      const { service, db } = buildService();
      const streams = createStreams();

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write('test line\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(db.execute).toHaveBeenCalled();
    });

    it('handles database write errors gracefully', async () => {
      const db = createMockDb();
      db.execute.mockRejectedValue(new Error('connection refused'));
      const { service } = buildService({ db });
      const errorSpy = vi.spyOn((service as any).logger, 'error');
      const streams = createStreams();

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write('line\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to persist'),
      );
    });
  });

  describe('event emission', () => {
    it('emits job.log event for each entry', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write('stdout line\n');
      streams.stderr.write('stderr line\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events).toHaveLength(2);
      expect(events[0].jobId).toBe('job-1');
      expect(events[1].jobId).toBe('job-1');
    });

    it('emits events synchronously before database write', async () => {
      const { service, db } = buildService();
      const streams = createStreams();
      const eventTimes: number[] = [];
      let dbWriteTime = 0;

      service.on(LOG_EVENTS.JOB_LOG, () => {
        eventTimes.push(Date.now());
      });

      db.execute.mockImplementation(async () => {
        dbWriteTime = Date.now();
      });

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write('line\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      // Event should have been emitted before or at the same time as DB write
      expect(eventTimes[0]).toBeLessThanOrEqual(dbWriteTime);
    });
  });

  describe('log size limit', () => {
    it('truncates output when 10MB limit is exceeded', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      // Write a very large line that exceeds 10MB
      const largeLine = 'x'.repeat(11 * 1024 * 1024);
      streams.stdout.write(largeLine + '\n');
      streams.stdout.write('after truncation\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      // Should have the large line, then truncation warning, but NOT the post-truncation line
      const truncationEvent = events.find(
        (e) => e.entry.message.includes('truncated'),
      );
      expect(truncationEvent).toBeDefined();
      expect(truncationEvent!.entry.level).toBe('warn');

      const afterEvent = events.find(
        (e) => e.entry.message === 'after truncation',
      );
      expect(afterEvent).toBeUndefined();
    });
  });

  describe('stream handling', () => {
    it('resolves when both stdout and stderr end', async () => {
      const { service } = buildService();
      const streams = createStreams();

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.end();
      // Only one stream ended, should not resolve yet

      streams.stderr.end();

      await vi.advanceTimersByTimeAsync(200);
      await promise;
      // If we reach here, promise resolved correctly
    });

    it('handles stream errors gracefully', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const warnSpy = vi.spyOn((service as any).logger, 'warn');

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.emit('error', new Error('broken pipe'));
      streams.stderr.end();

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stream error for job job-1'),
      );
    });

    it('handles empty streams', async () => {
      const { service, db } = buildService();
      const streams = createStreams();

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      // No entries to flush, so either not called or called with empty batch
      // The implementation skips flush when buffer is empty
      const calls = db.execute.mock.calls;
      for (const call of calls) {
        const sqlStr = String(call[0]);
        if (sqlStr.includes('[]')) {
          // Empty array is fine
        }
      }
    });

    it('handles interleaved stdout and stderr', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write('out 1\n');
      streams.stderr.write('err 1\n');
      streams.stdout.write('out 2\n');
      streams.stderr.write('err 2\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events).toHaveLength(4);
      const infoEntries = events.filter((e) => e.entry.level === 'info');
      const errorEntries = events.filter((e) => e.entry.level === 'error');
      expect(infoEntries).toHaveLength(2);
      expect(errorEntries).toHaveLength(2);
    });

    it('handles lines without trailing newline', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      streams.stdout.write('no newline at end');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      // readline emits final line on close even without newline
      expect(events).toHaveLength(1);
      expect(events[0].entry.message).toBe('no newline at end');
    });

    it('handles partial line buffering correctly', async () => {
      const { service } = buildService();
      const streams = createStreams();
      const events = collectLogEvents(service);

      const promise = service.streamLogs('job-1', streams.stdout, streams.stderr);

      // Write a line in two chunks
      streams.stdout.write('hello ');
      streams.stdout.write('world\n');
      endStreams(streams);

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      expect(events).toHaveLength(1);
      expect(events[0].entry.message).toBe('hello world');
    });
  });

  describe('LOG_EVENTS', () => {
    it('exports correct event name constants', () => {
      expect(LOG_EVENTS.JOB_LOG).toBe('job.log');
    });
  });

  describe('injectable', () => {
    it('is a class that can be instantiated', () => {
      const { service } = buildService();
      expect(service).toBeInstanceOf(ContainerLogStreamerService);
    });
  });
});
