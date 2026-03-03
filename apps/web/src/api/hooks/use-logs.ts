import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useCallback, useState } from 'react';
import { jobs, type LogQueryParams, type LogsResponse, type LogEntry, ApiError } from '@/api/client';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const logKeys = {
  all: ['logs'] as const,
  lists: () => [...logKeys.all, 'list'] as const,
  list: (jobId: string, params?: LogQueryParams) =>
    [...logKeys.lists(), jobId, params] as const,
};

// ---------------------------------------------------------------------------
// Job list hook (for job selector)
// ---------------------------------------------------------------------------

export const jobKeys = {
  all: ['jobs'] as const,
  lists: () => [...jobKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) =>
    [...jobKeys.lists(), params] as const,
};

export function useJobs(params?: { page?: number; limit?: number; status?: string; search?: string }) {
  return useQuery({
    queryKey: jobKeys.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => jobs.list(params as Record<string, unknown>, signal),
  });
}

// ---------------------------------------------------------------------------
// Job logs hook
// ---------------------------------------------------------------------------

export function useJobLogs(jobId: string | undefined, params?: LogQueryParams) {
  return useQuery<LogsResponse, ApiError>({
    queryKey: logKeys.list(jobId!, params),
    queryFn: ({ signal }) => jobs.getLogs(jobId!, params, signal),
    enabled: !!jobId,
  });
}

// ---------------------------------------------------------------------------
// SSE stream hook
// ---------------------------------------------------------------------------

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export interface UseLogStreamOptions {
  jobId: string | undefined;
  enabled: boolean;
}

export interface UseLogStreamResult {
  streamedLogs: LogEntry[];
  isStreaming: boolean;
  streamError: string | null;
}

export function useLogStream({ jobId, enabled }: UseLogStreamOptions): UseLogStreamResult {
  const [streamedLogs, setStreamedLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const bufferRef = useRef<LogEntry[]>([]);
  const rafRef = useRef<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const flushBuffer = useCallback(() => {
    if (bufferRef.current.length > 0) {
      const batch = bufferRef.current;
      bufferRef.current = [];
      setStreamedLogs((prev) => [...prev, ...batch]);
    }
    rafRef.current = null;
  }, []);

  useEffect(() => {
    if (!jobId || !enabled) {
      return;
    }

    setStreamedLogs([]);
    setStreamError(null);
    setIsStreaming(true);
    bufferRef.current = [];

    const url = `${BASE_URL}/jobs/${encodeURIComponent(jobId)}/logs/stream`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const entry: LogEntry = JSON.parse(event.data);
        bufferRef.current.push(entry);
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(flushBuffer);
        }
      } catch {
        // ignore malformed messages
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects on transient errors.
      // If readyState is CLOSED, the server ended the stream.
      if (es.readyState === EventSource.CLOSED) {
        setIsStreaming(false);
      } else {
        setStreamError('Connection lost — retrying…');
      }
    };

    es.addEventListener('done', () => {
      setIsStreaming(false);
      es.close();
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Flush remaining buffer synchronously on cleanup
      if (bufferRef.current.length > 0) {
        const remaining = bufferRef.current;
        bufferRef.current = [];
        setStreamedLogs((prev) => [...prev, ...remaining]);
      }
      setIsStreaming(false);
    };
  }, [jobId, enabled, flushBuffer]);

  return { streamedLogs, isStreaming, streamError };
}
