import { Injectable, Inject, Logger } from '@nestjs/common';
import { sql, SQL } from 'drizzle-orm';
import { Subject, Observable, ReplaySubject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { DRIZZLE } from '../../database/database.constants';
import type { DrizzleClient } from '../../database/database.provider';
import { jobExecutions } from '../../database/schema';

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface LogFilters {
  level?: string;
  after?: string;
  before?: string;
}

export interface LogPagination {
  page: number;
  limit: number;
}

export interface LogQueryResult {
  data: LogEntry[];
  total: number;
  page: number;
  limit: number;
}

const LEVEL_HIERARCHY: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const VALID_LEVELS = new Set(Object.keys(LEVEL_HIERARCHY));

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'ERROR']);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LOG_ENTRIES = 10_000;
const STREAM_BUFFER_SIZE = 100;

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);
  private readonly streams = new Map<string, Subject<LogEntry>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleClient,
  ) {}

  async appendLog(jobId: string, entry: LogEntry): Promise<void> {
    await this.appendLogs(jobId, [entry]);
  }

  async appendLogs(jobId: string, entries: LogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const currentLength = await this.getLogCount(jobId);

    if (currentLength >= MAX_LOG_ENTRIES) {
      this.logger.warn(
        `Job ${jobId} has reached the maximum log entry limit (${MAX_LOG_ENTRIES}). Rejecting append.`,
      );
      return;
    }

    const entriesJson = JSON.stringify(entries);

    await this.db.execute(
      sql`UPDATE ${jobExecutions}
          SET logs = COALESCE(logs, '[]'::jsonb) || ${entriesJson}::jsonb
          WHERE id = ${jobId}`,
    );

    const subject = this.streams.get(jobId);
    if (subject) {
      for (const entry of entries) {
        subject.next(entry);
      }
    }
  }

  async getLogs(
    jobId: string,
    filters?: LogFilters,
    pagination?: LogPagination,
  ): Promise<LogQueryResult> {
    const page = pagination?.page ?? DEFAULT_PAGE;
    const limit = pagination?.limit ?? DEFAULT_LIMIT;
    const offset = (page - 1) * limit;

    const filterFragments = this.buildFilterFragments(filters);

    const countQuery = this.buildCountQuery(jobId, filterFragments);
    const dataQuery = this.buildDataQuery(jobId, filterFragments, offset, limit);

    const [countResult, dataResult] = await Promise.all([
      this.db.execute(countQuery),
      this.db.execute(dataQuery),
    ]);

    const total = parseInt(String((countResult as any).rows?.[0]?.total ?? '0'), 10);
    const data: LogEntry[] = (dataResult as any).rows?.map((row: any) => {
      const elem = typeof row.elem === 'string' ? JSON.parse(row.elem) : row.elem;
      return elem as LogEntry;
    }) ?? [];

    return { data, total, page, limit };
  }

  streamLogs(jobId: string): Observable<LogEntry> {
    if (!this.streams.has(jobId)) {
      const subject = new ReplaySubject<LogEntry>(STREAM_BUFFER_SIZE);
      this.streams.set(jobId, subject);
    }

    const subject = this.streams.get(jobId)!;

    return subject.asObservable().pipe(
      finalize(() => {
        if (!subject.observed) {
          this.streams.delete(jobId);
        }
      }),
    );
  }

  async completeStream(jobId: string): Promise<void> {
    const subject = this.streams.get(jobId);
    if (subject) {
      subject.complete();
      this.streams.delete(jobId);
    }
  }

  async checkAndCompleteIfTerminal(jobId: string): Promise<boolean> {
    const result = await this.db.execute(
      sql`SELECT status FROM ${jobExecutions} WHERE id = ${jobId}`,
    );

    const status = (result as any).rows?.[0]?.status;
    if (status && TERMINAL_STATUSES.has(status)) {
      await this.completeStream(jobId);
      return true;
    }
    return false;
  }

  getActiveStreamCount(): number {
    return this.streams.size;
  }

  hasActiveStream(jobId: string): boolean {
    return this.streams.has(jobId);
  }

  async getJobStatus(jobId: string): Promise<string | null> {
    const result = await this.db.execute(
      sql`SELECT status FROM ${jobExecutions} WHERE id = ${jobId}`,
    );

    return (result as any).rows?.[0]?.status ?? null;
  }

  isTerminalStatus(status: string): boolean {
    return TERMINAL_STATUSES.has(status);
  }

  private async getLogCount(jobId: string): Promise<number> {
    const result = await this.db.execute(
      sql`SELECT jsonb_array_length(COALESCE(logs, '[]'::jsonb)) AS count
          FROM ${jobExecutions}
          WHERE id = ${jobId}`,
    );

    return parseInt(String((result as any).rows?.[0]?.count ?? '0'), 10);
  }

  private buildFilterFragments(filters?: LogFilters): SQL[] {
    const fragments: SQL[] = [];

    if (filters?.level && VALID_LEVELS.has(filters.level)) {
      const threshold = LEVEL_HIERARCHY[filters.level]!;
      const includedLevels = Object.entries(LEVEL_HIERARCHY)
        .filter(([, value]) => value >= threshold)
        .map(([key]) => key);

      // Build a parameterized IN clause
      const levelParams = includedLevels.map((l) => sql`${l}`);
      fragments.push(sql`elem->>'level' IN (${sql.join(levelParams, sql`, `)})`);
    }

    if (filters?.after) {
      fragments.push(sql`(elem->>'timestamp')::timestamptz > ${filters.after}::timestamptz`);
    }

    if (filters?.before) {
      fragments.push(sql`(elem->>'timestamp')::timestamptz < ${filters.before}::timestamptz`);
    }

    return fragments;
  }

  private buildCountQuery(jobId: string, filterFragments: SQL[]): SQL {
    const baseQuery = sql`SELECT COUNT(*) AS total
      FROM ${jobExecutions},
        jsonb_array_elements(COALESCE(logs, '[]'::jsonb)) AS elem
      WHERE id = ${jobId}`;

    if (filterFragments.length === 0) return baseQuery;

    return sql`${baseQuery} AND ${sql.join(filterFragments, sql` AND `)}`;
  }

  private buildDataQuery(jobId: string, filterFragments: SQL[], offset: number, limit: number): SQL {
    const baseQuery = sql`SELECT elem
      FROM ${jobExecutions},
        jsonb_array_elements(COALESCE(logs, '[]'::jsonb)) AS elem
      WHERE id = ${jobId}`;

    const filtered = filterFragments.length > 0
      ? sql`${baseQuery} AND ${sql.join(filterFragments, sql` AND `)}`
      : baseQuery;

    return sql`${filtered} ORDER BY (elem->>'timestamp')::timestamptz ASC OFFSET ${offset} LIMIT ${limit}`;
  }
}
