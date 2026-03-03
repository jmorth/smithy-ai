import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import {
  useJobLogs,
  useJobs,
  useLogStream,
  logKeys,
  jobKeys,
} from './use-logs';
import * as client from '@/api/client';

vi.mock('@/api/client', () => ({
  jobs: {
    list: vi.fn(),
    getLogs: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

// ---------------------------------------------------------------------------
// Query Key Tests
// ---------------------------------------------------------------------------

describe('logKeys', () => {
  it('builds base key', () => {
    expect(logKeys.all).toEqual(['logs']);
  });

  it('builds lists key', () => {
    expect(logKeys.lists()).toEqual(['logs', 'list']);
  });

  it('builds list key with jobId', () => {
    expect(logKeys.list('job-1')).toEqual(['logs', 'list', 'job-1', undefined]);
  });

  it('builds list key with jobId and params', () => {
    const params = { level: 'error' as const };
    expect(logKeys.list('job-1', params)).toEqual(['logs', 'list', 'job-1', params]);
  });
});

describe('jobKeys', () => {
  it('builds base key', () => {
    expect(jobKeys.all).toEqual(['jobs']);
  });

  it('builds lists key', () => {
    expect(jobKeys.lists()).toEqual(['jobs', 'list']);
  });

  it('builds list key with params', () => {
    const params = { limit: 50 };
    expect(jobKeys.list(params)).toEqual(['jobs', 'list', params]);
  });
});

// ---------------------------------------------------------------------------
// useJobs
// ---------------------------------------------------------------------------

describe('useJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches jobs list successfully', async () => {
    const mockResponse = {
      data: [
        { id: 'job-1', status: 'RUNNING', packageId: 'pkg-1', workerVersionId: 'wv-1', retryCount: 0, logs: [], createdAt: '2026-01-01T00:00:00Z' },
      ],
      meta: { page: 1, limit: 50, total: 1 },
    };
    vi.mocked(client.jobs.list).mockResolvedValue(mockResponse as never);

    const { result } = renderHook(() => useJobs({ limit: 50 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockResponse);
  });

  it('passes params to API', async () => {
    vi.mocked(client.jobs.list).mockResolvedValue({ data: [], meta: { page: 1, limit: 10, total: 0 } } as never);

    const params = { limit: 50, status: 'RUNNING' };
    const { result } = renderHook(() => useJobs(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.jobs.list).toHaveBeenCalledWith(
      params,
      expect.any(AbortSignal),
    );
  });

  it('returns error state on failure', async () => {
    vi.mocked(client.jobs.list).mockRejectedValue(new client.ApiError(500, 'Internal error'));

    const { result } = renderHook(() => useJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Internal error');
  });
});

// ---------------------------------------------------------------------------
// useJobLogs
// ---------------------------------------------------------------------------

describe('useJobLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches logs for a job', async () => {
    const mockResponse = {
      data: [
        { timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'Hello' },
      ],
      meta: { page: 1, limit: 100, total: 1, jobId: 'job-1', jobState: 'COMPLETED' },
    };
    vi.mocked(client.jobs.getLogs).mockResolvedValue(mockResponse as never);

    const { result } = renderHook(() => useJobLogs('job-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockResponse);
    expect(client.jobs.getLogs).toHaveBeenCalledWith(
      'job-1',
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('does not fetch when jobId is undefined', () => {
    const { result } = renderHook(() => useJobLogs(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(client.jobs.getLogs).not.toHaveBeenCalled();
  });

  it('passes query params to API', async () => {
    vi.mocked(client.jobs.getLogs).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 100, total: 0, jobId: 'job-1', jobState: 'COMPLETED' },
    } as never);

    const params = { level: 'error' as const };
    const { result } = renderHook(() => useJobLogs('job-1', params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.jobs.getLogs).toHaveBeenCalledWith(
      'job-1',
      params,
      expect.any(AbortSignal),
    );
  });

  it('returns error on failure', async () => {
    vi.mocked(client.jobs.getLogs).mockRejectedValue(new client.ApiError(404, 'Not found'));

    const { result } = renderHook(() => useJobLogs('bad-id'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Not found');
  });

  it('returns loading state initially', () => {
    vi.mocked(client.jobs.getLogs).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useJobLogs('job-1'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// useLogStream
// ---------------------------------------------------------------------------

describe('useLogStream', () => {
  let mockEventSource: {
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: (() => void) | null;
    addEventListener: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    readyState: number;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventSource = {
      onmessage: null,
      onerror: null,
      addEventListener: vi.fn(),
      close: vi.fn(),
      readyState: 1, // OPEN
    };

    vi.stubGlobal('EventSource', vi.fn(() => mockEventSource));
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: () => void) => {
      cb();
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not connect when disabled', () => {
    renderHook(() => useLogStream({ jobId: 'job-1', enabled: false }));
    expect(EventSource).not.toHaveBeenCalled();
  });

  it('does not connect when jobId is undefined', () => {
    renderHook(() => useLogStream({ jobId: undefined, enabled: true }));
    expect(EventSource).not.toHaveBeenCalled();
  });

  it('connects to SSE endpoint when enabled with jobId', () => {
    renderHook(() => useLogStream({ jobId: 'job-1', enabled: true }));
    expect(EventSource).toHaveBeenCalledWith('/api/jobs/job-1/logs/stream');
  });

  it('returns isStreaming true when connected', () => {
    const { result } = renderHook(() =>
      useLogStream({ jobId: 'job-1', enabled: true }),
    );
    expect(result.current.isStreaming).toBe(true);
  });

  it('appends log entries from SSE messages', async () => {
    const { result } = renderHook(() =>
      useLogStream({ jobId: 'job-1', enabled: true }),
    );

    act(() => {
      mockEventSource.onmessage?.({
        data: JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'test' }),
      } as MessageEvent);
    });

    await waitFor(() => {
      expect(result.current.streamedLogs).toHaveLength(1);
      expect(result.current.streamedLogs[0]!.message).toBe('test');
    });
  });

  it('closes connection on unmount', () => {
    const { unmount } = renderHook(() =>
      useLogStream({ jobId: 'job-1', enabled: true }),
    );
    unmount();
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it('sets isStreaming false when done event received', () => {
    const { result } = renderHook(() =>
      useLogStream({ jobId: 'job-1', enabled: true }),
    );

    // Find the 'done' event listener
    const doneHandler = mockEventSource.addEventListener.mock.calls.find(
      (call: unknown[]) => call[0] === 'done',
    )?.[1];

    act(() => {
      doneHandler?.();
    });

    expect(result.current.isStreaming).toBe(false);
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it('sets streamError when connection errors with open state', () => {
    const { result } = renderHook(() =>
      useLogStream({ jobId: 'job-1', enabled: true }),
    );

    // Simulate error with readyState still OPEN (reconnecting)
    mockEventSource.readyState = 0; // CONNECTING
    act(() => {
      mockEventSource.onerror?.();
    });

    expect(result.current.streamError).toBe('Connection lost — retrying…');
  });

  it('sets isStreaming false when connection closes', () => {
    const { result } = renderHook(() =>
      useLogStream({ jobId: 'job-1', enabled: true }),
    );

    // Simulate closed
    mockEventSource.readyState = 2; // CLOSED
    Object.defineProperty(mockEventSource, 'readyState', { value: 2 });
    // Also need EventSource.CLOSED
    (EventSource as unknown as Record<string, number>).CLOSED = 2;

    act(() => {
      mockEventSource.onerror?.();
    });

    expect(result.current.isStreaming).toBe(false);
  });

  it('resets state when jobId changes', async () => {
    const { result, rerender } = renderHook(
      ({ jobId }: { jobId: string }) => useLogStream({ jobId, enabled: true }),
      { initialProps: { jobId: 'job-1' } },
    );

    // Add a log
    act(() => {
      mockEventSource.onmessage?.({
        data: JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'test' }),
      } as MessageEvent);
    });

    await waitFor(() => {
      expect(result.current.streamedLogs).toHaveLength(1);
    });

    // Change job
    rerender({ jobId: 'job-2' });

    // Previous connection should be closed
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it('ignores malformed SSE messages', () => {
    const { result } = renderHook(() =>
      useLogStream({ jobId: 'job-1', enabled: true }),
    );

    act(() => {
      mockEventSource.onmessage?.({
        data: 'not valid json',
      } as MessageEvent);
    });

    expect(result.current.streamedLogs).toHaveLength(0);
  });
});
