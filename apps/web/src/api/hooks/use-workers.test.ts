import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import {
  useWorkers,
  useWorker,
  useCreateWorker,
  useCreateWorkerVersion,
  useDeprecateWorkerVersion,
  workerKeys,
} from './use-workers';
import * as client from '@/api/client';
import type { WorkerDetail } from '@/api/client';
import type { Worker } from '@smithy/shared';

vi.mock('@/api/client', () => ({
  workers: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    createVersion: vi.fn(),
    deprecateVersion: vi.fn(),
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

const WORKERS: Worker[] = [
  {
    id: 'w-1',
    name: 'Summarizer',
    slug: 'summarizer',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const WORKER_DETAIL: WorkerDetail = {
  ...WORKERS[0]!,
  versions: [
    {
      id: 'wv-1',
      workerId: 'w-1',
      version: '1',
      yamlConfig: {
        name: 'Summarizer',
        inputTypes: ['text'],
        outputType: 'text',
        provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'KEY' },
      },
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
};

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

describe('workerKeys', () => {
  it('builds base key', () => {
    expect(workerKeys.all).toEqual(['workers']);
  });

  it('builds lists key', () => {
    expect(workerKeys.lists()).toEqual(['workers', 'list']);
  });

  it('builds list key with params', () => {
    const params = { name: 'sum' };
    expect(workerKeys.list(params)).toEqual(['workers', 'list', params]);
  });

  it('builds list key without params', () => {
    expect(workerKeys.list()).toEqual(['workers', 'list', undefined]);
  });

  it('builds details key', () => {
    expect(workerKeys.details()).toEqual(['workers', 'detail']);
  });

  it('builds detail key with slug', () => {
    expect(workerKeys.detail('summarizer')).toEqual([
      'workers',
      'detail',
      'summarizer',
    ]);
  });
});

// ---------------------------------------------------------------------------
// useWorkers
// ---------------------------------------------------------------------------

describe('useWorkers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches workers list', async () => {
    vi.mocked(client.workers.list).mockResolvedValue(WORKERS as never);
    const { result } = renderHook(() => useWorkers(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(WORKERS);
  });

  it('passes query params to list', async () => {
    vi.mocked(client.workers.list).mockResolvedValue([] as never);
    renderHook(() => useWorkers({ name: 'sum' }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(client.workers.list).toHaveBeenCalledWith(
        { name: 'sum' },
        expect.anything(),
      );
    });
  });

  it('returns loading state initially', () => {
    vi.mocked(client.workers.list).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useWorkers(), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error state when API call fails', async () => {
    vi.mocked(client.workers.list).mockRejectedValue(
      new client.ApiError(500, 'Internal server error'),
    );
    const { result } = renderHook(() => useWorkers(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Internal server error');
  });
});

// ---------------------------------------------------------------------------
// useWorker
// ---------------------------------------------------------------------------

describe('useWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a single worker by slug', async () => {
    vi.mocked(client.workers.get).mockResolvedValue(WORKER_DETAIL as never);
    const { result } = renderHook(() => useWorker('summarizer'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(WORKER_DETAIL);
  });

  it('does not fetch when slug is undefined', () => {
    const { result } = renderHook(() => useWorker(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(client.workers.get).not.toHaveBeenCalled();
  });

  it('does not fetch when slug is empty string', () => {
    const { result } = renderHook(() => useWorker(''), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(client.workers.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useCreateWorker
// ---------------------------------------------------------------------------

describe('useCreateWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a worker and invalidates list cache', async () => {
    const created = { id: 'w-2', name: 'Reviewer', slug: 'reviewer' };
    vi.mocked(client.workers.create).mockResolvedValue(created as never);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useCreateWorker(), { wrapper });

    await act(async () => {
      result.current.mutate({ name: 'Reviewer' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(created);
    expect(client.workers.create).toHaveBeenCalledWith({ name: 'Reviewer' });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['workers', 'list'],
    });
  });

  it('returns error state on failure', async () => {
    vi.mocked(client.workers.create).mockRejectedValue(
      new client.ApiError(409, 'Worker already exists'),
    );

    const { result } = renderHook(() => useCreateWorker(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: 'Dupe' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Worker already exists');
  });
});

// ---------------------------------------------------------------------------
// useCreateWorkerVersion
// ---------------------------------------------------------------------------

describe('useCreateWorkerVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a version and invalidates list and detail caches', async () => {
    const version = {
      id: 'wv-2',
      workerId: 'w-1',
      version: '2',
      yamlConfig: { name: 'Summarizer', inputTypes: ['text'], outputType: 'text', provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'KEY' } },
      status: 'ACTIVE',
      createdAt: '2026-02-01T00:00:00Z',
    };
    vi.mocked(client.workers.createVersion).mockResolvedValue(
      version as never,
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(
      () => useCreateWorkerVersion('summarizer'),
      { wrapper },
    );

    await act(async () => {
      result.current.mutate({
        yamlConfig: { name: 'Summarizer', inputTypes: ['text'], outputType: 'text', provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'KEY' } },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(version);
    expect(client.workers.createVersion).toHaveBeenCalledWith(
      'summarizer',
      expect.objectContaining({ yamlConfig: expect.any(Object) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['workers', 'list'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['workers', 'detail', 'summarizer'],
    });
  });

  it('returns error state on failure', async () => {
    vi.mocked(client.workers.createVersion).mockRejectedValue(
      new client.ApiError(400, 'Invalid YAML'),
    );

    const { result } = renderHook(
      () => useCreateWorkerVersion('summarizer'),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate({ yamlConfig: {} });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Invalid YAML');
  });
});

// ---------------------------------------------------------------------------
// useDeprecateWorkerVersion
// ---------------------------------------------------------------------------

describe('useDeprecateWorkerVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deprecates a version and invalidates detail cache', async () => {
    const deprecated = {
      id: 'wv-1',
      workerId: 'w-1',
      version: '1',
      yamlConfig: { name: 'Summarizer', inputTypes: ['text'], outputType: 'text', provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'KEY' } },
      status: 'DEPRECATED',
      createdAt: '2026-01-01T00:00:00Z',
    };
    vi.mocked(client.workers.deprecateVersion).mockResolvedValue(
      deprecated as never,
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(
      () => useDeprecateWorkerVersion('summarizer'),
      { wrapper },
    );

    await act(async () => {
      result.current.mutate(1);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(deprecated);
    expect(client.workers.deprecateVersion).toHaveBeenCalledWith(
      'summarizer',
      1,
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['workers', 'detail', 'summarizer'],
    });
  });

  it('returns error state on failure', async () => {
    vi.mocked(client.workers.deprecateVersion).mockRejectedValue(
      new client.ApiError(404, 'Version not found'),
    );

    const { result } = renderHook(
      () => useDeprecateWorkerVersion('summarizer'),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(99);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Version not found');
  });
});
