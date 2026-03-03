import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import {
  useWorkerPools,
  useWorkerPool,
  useCreateWorkerPool,
  useUpdateWorkerPool,
  useSubmitPackageToPool,
  workerPoolKeys,
} from './use-worker-pools';
import * as client from '@/api/client';

vi.mock('@/api/client', () => ({
  workerPools: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    submitPackage: vi.fn(),
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
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

// ---------------------------------------------------------------------------
// Query Key Tests
// ---------------------------------------------------------------------------

describe('workerPoolKeys', () => {
  it('builds base key', () => {
    expect(workerPoolKeys.all).toEqual(['worker-pools']);
  });

  it('builds lists key', () => {
    expect(workerPoolKeys.lists()).toEqual(['worker-pools', 'list']);
  });

  it('builds list key with params', () => {
    const params = { page: 1, limit: 10 };
    expect(workerPoolKeys.list(params)).toEqual([
      'worker-pools',
      'list',
      params,
    ]);
  });

  it('builds list key without params', () => {
    expect(workerPoolKeys.list()).toEqual([
      'worker-pools',
      'list',
      undefined,
    ]);
  });

  it('builds details key', () => {
    expect(workerPoolKeys.details()).toEqual(['worker-pools', 'detail']);
  });

  it('builds detail key with slug', () => {
    expect(workerPoolKeys.detail('gpu-pool')).toEqual([
      'worker-pools',
      'detail',
      'gpu-pool',
    ]);
  });
});

// ---------------------------------------------------------------------------
// useWorkerPools
// ---------------------------------------------------------------------------

describe('useWorkerPools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches worker pools list successfully', async () => {
    const mockData = [
      { id: '1', name: 'GPU Pool', slug: 'gpu-pool', maxConcurrency: 5, members: [] },
      { id: '2', name: 'CPU Pool', slug: 'cpu-pool', maxConcurrency: 10, members: [] },
    ];
    vi.mocked(client.workerPools.list).mockResolvedValue(mockData as never);

    const { result } = renderHook(() => useWorkerPools(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockData);
    expect(client.workerPools.list).toHaveBeenCalledWith(
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('passes pagination params to API client', async () => {
    vi.mocked(client.workerPools.list).mockResolvedValue([] as never);

    const params = { page: 2, limit: 10 };
    const { result } = renderHook(() => useWorkerPools(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.workerPools.list).toHaveBeenCalledWith(
      params,
      expect.any(AbortSignal),
    );
  });

  it('returns loading state initially', () => {
    vi.mocked(client.workerPools.list).mockReturnValue(
      new Promise(() => {}),
    );

    const { result } = renderHook(() => useWorkerPools(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error state when API call fails', async () => {
    vi.mocked(client.workerPools.list).mockRejectedValue(
      new client.ApiError(500, 'Internal server error'),
    );

    const { result } = renderHook(() => useWorkerPools(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBe('Internal server error');
  });
});

// ---------------------------------------------------------------------------
// useWorkerPool
// ---------------------------------------------------------------------------

describe('useWorkerPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a single worker pool with members', async () => {
    const mockDetail = {
      id: '1',
      name: 'GPU Pool',
      slug: 'gpu-pool',
      maxConcurrency: 5,
      members: [{ id: 'm1', poolId: '1', workerVersionId: 'wv1', priority: 1 }],
    };
    vi.mocked(client.workerPools.get).mockResolvedValue(mockDetail as never);

    const { result } = renderHook(() => useWorkerPool('gpu-pool'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockDetail);
    expect(client.workerPools.get).toHaveBeenCalledWith(
      'gpu-pool',
      expect.any(AbortSignal),
    );
  });

  it('does not fetch when slug is undefined', () => {
    const { result } = renderHook(() => useWorkerPool(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(client.workerPools.get).not.toHaveBeenCalled();
  });

  it('does not fetch when slug is empty string', () => {
    const { result } = renderHook(() => useWorkerPool(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(client.workerPools.get).not.toHaveBeenCalled();
  });

  it('returns loading state initially', () => {
    vi.mocked(client.workerPools.get).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useWorkerPool('gpu-pool'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error state when API call fails', async () => {
    vi.mocked(client.workerPools.get).mockRejectedValue(
      new client.ApiError(404, 'Not found'),
    );

    const { result } = renderHook(() => useWorkerPool('bad-slug'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// useCreateWorkerPool
// ---------------------------------------------------------------------------

describe('useCreateWorkerPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a worker pool and invalidates list cache', async () => {
    const created = { id: '1', name: 'New Pool', slug: 'new-pool', maxConcurrency: 5 };
    vi.mocked(client.workerPools.create).mockResolvedValue(created as never);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useCreateWorkerPool(), { wrapper });

    await act(async () => {
      result.current.mutate({
        name: 'New Pool',
        members: [{ workerVersionId: 'wv1' }],
        maxConcurrency: 5,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(created);
    expect(client.workerPools.create).toHaveBeenCalledWith({
      name: 'New Pool',
      members: [{ workerVersionId: 'wv1' }],
      maxConcurrency: 5,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['worker-pools', 'list'],
    });
  });

  it('returns error state on failure', async () => {
    vi.mocked(client.workerPools.create).mockRejectedValue(
      new client.ApiError(422, 'Validation failed'),
    );

    const { result } = renderHook(() => useCreateWorkerPool(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        name: '',
        members: [],
        maxConcurrency: 5,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Validation failed');
  });
});

// ---------------------------------------------------------------------------
// useUpdateWorkerPool
// ---------------------------------------------------------------------------

describe('useUpdateWorkerPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a worker pool and invalidates list and detail caches', async () => {
    const updated = {
      id: '1',
      name: 'Updated Pool',
      slug: 'gpu-pool',
      maxConcurrency: 10,
    };
    vi.mocked(client.workerPools.update).mockResolvedValue(updated as never);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useUpdateWorkerPool('gpu-pool'), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ name: 'Updated Pool' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(updated);
    expect(client.workerPools.update).toHaveBeenCalledWith('gpu-pool', {
      name: 'Updated Pool',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['worker-pools', 'list'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['worker-pools', 'detail', 'gpu-pool'],
    });
  });

  it('returns error state on failure', async () => {
    vi.mocked(client.workerPools.update).mockRejectedValue(
      new client.ApiError(404, 'Not found'),
    );

    const { result } = renderHook(() => useUpdateWorkerPool('bad-slug'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: 'Updated' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// useSubmitPackageToPool
// ---------------------------------------------------------------------------

describe('useSubmitPackageToPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits a package and invalidates detail cache', async () => {
    const pkg = { id: 'p1', type: 'text', status: 'PENDING' };
    vi.mocked(client.workerPools.submitPackage).mockResolvedValue(
      pkg as never,
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useSubmitPackageToPool('gpu-pool'), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ type: 'text', metadata: { key: 'val' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(pkg);
    expect(client.workerPools.submitPackage).toHaveBeenCalledWith('gpu-pool', {
      type: 'text',
      metadata: { key: 'val' },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['worker-pools', 'detail', 'gpu-pool'],
    });
  });

  it('returns error state on failure', async () => {
    vi.mocked(client.workerPools.submitPackage).mockRejectedValue(
      new client.ApiError(400, 'Bad request'),
    );

    const { result } = renderHook(() => useSubmitPackageToPool('gpu-pool'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ type: 'text' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Bad request');
  });
});
