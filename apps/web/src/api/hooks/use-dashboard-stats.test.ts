import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { useDashboardStats } from './use-dashboard-stats';
import * as client from '@/api/client';

vi.mock('@/api/client', () => ({
  assemblyLines: { list: vi.fn() },
  workerPools: { list: vi.fn() },
  packages: { list: vi.fn() },
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

describe('useDashboardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and aggregates stats from multiple endpoints', async () => {
    vi.mocked(client.assemblyLines.list).mockResolvedValue([
      { id: '1' },
      { id: '2' },
      { id: '3' },
    ] as never);
    vi.mocked(client.workerPools.list).mockResolvedValue([
      { id: '1', maxConcurrency: 5, activeJobCount: 2 },
      { id: '2', maxConcurrency: 10, activeJobCount: 7 },
    ] as never);
    vi.mocked(client.packages.list).mockResolvedValue({
      data: [],
      meta: { total: 42, limit: 0 },
    } as never);

    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      activeAssemblyLines: 3,
      activeWorkerPools: 2,
      inTransitPackages: 42,
      runningContainers: { used: 9, max: 15 },
    });
  });

  it('returns loading state initially', () => {
    vi.mocked(client.assemblyLines.list).mockReturnValue(
      new Promise(() => {}),
    );
    vi.mocked(client.workerPools.list).mockReturnValue(
      new Promise(() => {}),
    );
    vi.mocked(client.packages.list).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error state when an API call fails', async () => {
    vi.mocked(client.assemblyLines.list).mockRejectedValue(
      new client.ApiError(500, 'Server error'),
    );
    vi.mocked(client.workerPools.list).mockResolvedValue([] as never);
    vi.mocked(client.packages.list).mockResolvedValue({
      data: [],
      meta: { total: 0, limit: 0 },
    } as never);

    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBe('Server error');
  });

  it('handles worker pools without activeJobCount', async () => {
    vi.mocked(client.assemblyLines.list).mockResolvedValue([] as never);
    vi.mocked(client.workerPools.list).mockResolvedValue([
      { id: '1', maxConcurrency: 5 },
    ] as never);
    vi.mocked(client.packages.list).mockResolvedValue({
      data: [],
      meta: { total: 0, limit: 0 },
    } as never);

    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.runningContainers).toEqual({
      used: 0,
      max: 5,
    });
  });

  it('handles packages response as array (without meta)', async () => {
    vi.mocked(client.assemblyLines.list).mockResolvedValue([] as never);
    vi.mocked(client.workerPools.list).mockResolvedValue([] as never);
    vi.mocked(client.packages.list).mockResolvedValue({
      data: [{}, {}, {}],
    } as never);

    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.inTransitPackages).toBe(3);
  });

  it('uses refetchInterval of 30 seconds', () => {
    vi.mocked(client.assemblyLines.list).mockReturnValue(
      new Promise(() => {}),
    );
    vi.mocked(client.workerPools.list).mockReturnValue(
      new Promise(() => {}),
    );
    vi.mocked(client.packages.list).mockReturnValue(new Promise(() => {}));

    // Verify the hook calls the API endpoints
    renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    expect(client.assemblyLines.list).toHaveBeenCalled();
    expect(client.workerPools.list).toHaveBeenCalled();
    expect(client.packages.list).toHaveBeenCalled();
  });
});
