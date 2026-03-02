import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { sql } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import type { DrizzleClient } from '../../database/database.provider';
import { jobExecutions } from '../../database/schema/jobs';
import { eq } from 'drizzle-orm';

export const LOG_EVENTS = {
  JOB_LOG: 'job.log',
} as const;

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface LogEventPayload {
  jobId: string;
  entry: LogEntry;
}

const BATCH_INTERVAL_MS = 100;
const BATCH_SIZE_LIMIT = 50;
const MAX_LOG_BYTES_PER_JOB = 10 * 1024 * 1024; // 10MB
const VALID_LOG_LEVELS = new Set<string>(['info', 'warn', 'error', 'debug']);

@Injectable()
export class ContainerLogStreamerService extends EventEmitter {
  private readonly logger = new Logger(ContainerLogStreamerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
  ) {
    super();
  }

  streamLogs(
    jobId: string,
    stdout: Readable,
    stderr: Readable,
  ): Promise<void> {
    const buffer: LogEntry[] = [];
    let flushTimer: ReturnType<typeof setInterval> | undefined;
    let totalBytes = 0;
    let truncated = false;
    let streamsEnded = 0;
    let flushing: Promise<void> = Promise.resolve();

    const estimateEntrySize = (entry: LogEntry): number => {
      return entry.message.length + (entry.metadata ? JSON.stringify(entry.metadata).length : 0) + 80;
    };

    const flushBuffer = async (): Promise<void> => {
      if (buffer.length === 0) return;
      const batch = buffer.splice(0);
      try {
        await this.db.execute(
          sql`UPDATE ${jobExecutions} SET logs = logs || ${JSON.stringify(batch)}::jsonb WHERE ${eq(jobExecutions.id, jobId)}`,
        );
      } catch (err: unknown) {
        this.logger.error(
          `Failed to persist ${batch.length} log entries for job ${jobId}: ${String(err)}`,
        );
      }
    };

    const addEntry = (entry: LogEntry): void => {
      if (truncated) return;

      const entrySize = estimateEntrySize(entry);
      if (totalBytes + entrySize > MAX_LOG_BYTES_PER_JOB) {
        truncated = true;
        const truncationEntry: LogEntry = {
          level: 'warn',
          message: `Log output truncated: exceeded ${MAX_LOG_BYTES_PER_JOB / (1024 * 1024)}MB limit`,
          timestamp: new Date().toISOString(),
        };
        buffer.push(truncationEntry);
        this.emit(LOG_EVENTS.JOB_LOG, { jobId, entry: truncationEntry } satisfies LogEventPayload);
        return;
      }

      totalBytes += entrySize;
      buffer.push(entry);
      this.emit(LOG_EVENTS.JOB_LOG, { jobId, entry } satisfies LogEventPayload);

      if (buffer.length >= BATCH_SIZE_LIMIT) {
        flushing = flushing.then(() => flushBuffer());
      }
    };

    const parseLine = (line: string, defaultLevel: LogLevel): void => {
      const timestamp = new Date().toISOString();

      if (line.startsWith('{')) {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const level =
            typeof parsed.level === 'string' && VALID_LOG_LEVELS.has(parsed.level)
              ? (parsed.level as LogLevel)
              : defaultLevel;

          const message =
            typeof parsed.msg === 'string'
              ? parsed.msg
              : typeof parsed.message === 'string'
                ? parsed.message
                : line;

          const { level: _l, msg: _m, message: _msg, ...rest } = parsed;
          const metadata = Object.keys(rest).length > 0 ? rest : undefined;

          addEntry({ level, message, timestamp, metadata });
          return;
        } catch {
          // Not valid JSON — fall through to plain text
        }
      }

      addEntry({ level: defaultLevel, message: line, timestamp });
    };

    const attachStream = (stream: Readable, defaultLevel: LogLevel): Promise<void> => {
      return new Promise<void>((resolve) => {
        let resolved = false;
        const done = (): void => {
          if (resolved) return;
          resolved = true;
          resolve();
        };

        const rl = createInterface({ input: stream });

        rl.on('line', (line: string) => {
          parseLine(line, defaultLevel);
        });

        rl.on('close', () => {
          done();
        });

        // readline re-emits stream errors on the interface — handle to prevent uncaught exceptions
        rl.on('error', (err: Error) => {
          this.logger.warn(
            `Stream error for job ${jobId} (${defaultLevel === 'info' ? 'stdout' : 'stderr'}): ${err.message}`,
          );
          done();
        });
      });
    };

    return new Promise<void>((resolve) => {
      flushTimer = setInterval(() => {
        flushing = flushing.then(() => flushBuffer());
      }, BATCH_INTERVAL_MS);

      const onStreamDone = (): void => {
        streamsEnded++;
        if (streamsEnded >= 2) {
          clearInterval(flushTimer);
          flushing
            .then(() => flushBuffer())
            .then(() => resolve());
        }
      };

      attachStream(stdout, 'info').then(onStreamDone);
      attachStream(stderr, 'error').then(onStreamDone);
    });
  }
}
