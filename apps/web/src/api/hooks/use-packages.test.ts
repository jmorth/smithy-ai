import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import {
  usePackages,
  usePackage,
  packageKeys,
} from './use-packages';
import * as client from '@/api/client';

vi.mock('@/api/client', () => ({
  packages: {
    list: vi.fn(),
    get: vi.fn(),
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

describe('packageKeys', () => {
  it('builds base key', () => {
    expect(packageKeys.all).toEqual(['packages']);
  });

  it('builds lists key', () => {
    expect(packageKeys.lists()).toEqual(['packages', 'list']);
  });

  it('builds list key with params', () => {
    const params = { page: 1, limit: 10, type: 'CODE' };
    expect(packageKeys.list(params)).toEqual(['packages', 'list', params]);
  });

  it('builds list key without params', () => {
    expect(packageKeys.list()).toEqual(['packages', 'list', undefined]);
  });

  it('builds details key', () => {
    expect(packageKeys.details()).toEqual(['packages', 'detail']);
  });

  it('builds detail key with id', () => {
    expect(packageKeys.detail('pkg-123')).toEqual([
      'packages',
      'detail',
      'pkg-123',
    ]);
  });
});

// ---------------------------------------------------------------------------
// usePackages
// ---------------------------------------------------------------------------

describe('usePackages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches paginated package list successfully', async () => {
    const mockResponse = {
      data: [
        { id: 'pkg-1', type: 'CODE', status: 'PENDING', metadata: {}, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 'pkg-2', type: 'IMAGE', status: 'COMPLETED', metadata: {}, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
      ],
      meta: { page: 1, limit: 10, total: 2 },
    };
    vi.mocked(client.packages.list).mockResolvedValue(mockResponse as never);

    const { result } = renderHook(() => usePackages(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockResponse);
    expect(client.packages.list).toHaveBeenCalledWith(
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('passes filter params to API client', async () => {
    const mockResponse = { data: [], meta: { page: 1, limit: 10, total: 0 } };
    vi.mocked(client.packages.list).mockResolvedValue(mockResponse);

    const params = { page: 2, limit: 25, type: 'CODE', status: 'PENDING' };
    const { result } = renderHook(() => usePackages(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.packages.list).toHaveBeenCalledWith(
      params,
      expect.any(AbortSignal),
    );
  });

  it('returns loading state initially', () => {
    vi.mocked(client.packages.list).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePackages(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error state when API call fails', async () => {
    vi.mocked(client.packages.list).mockRejectedValue(
      new client.ApiError(500, 'Internal server error'),
    );

    const { result } = renderHook(() => usePackages(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBe('Internal server error');
  });

  it('caches different filter params separately', async () => {
    const response1 = { data: [{ id: 'pkg-1' }], meta: { page: 1, limit: 10, total: 1 } };
    const response2 = { data: [{ id: 'pkg-2' }], meta: { page: 1, limit: 10, total: 1 } };
    vi.mocked(client.packages.list)
      .mockResolvedValueOnce(response1 as never)
      .mockResolvedValueOnce(response2 as never);

    const wrapper = createWrapper();
    const { result: result1 } = renderHook(
      () => usePackages({ page: 1, type: 'CODE' }),
      { wrapper },
    );
    const { result: result2 } = renderHook(
      () => usePackages({ page: 1, type: 'IMAGE' }),
      { wrapper },
    );

    await waitFor(() => expect(result1.current.isSuccess).toBe(true));
    await waitFor(() => expect(result2.current.isSuccess).toBe(true));

    expect(client.packages.list).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// usePackage
// ---------------------------------------------------------------------------

describe('usePackage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a single package', async () => {
    const mockPkg = {
      id: 'pkg-123',
      type: 'CODE',
      status: 'COMPLETED',
      metadata: { key: 'value' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    vi.mocked(client.packages.get).mockResolvedValue(mockPkg as never);

    const { result } = renderHook(() => usePackage('pkg-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockPkg);
    expect(client.packages.get).toHaveBeenCalledWith(
      'pkg-123',
      expect.any(AbortSignal),
    );
  });

  it('does not fetch when id is undefined', () => {
    const { result } = renderHook(() => usePackage(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(client.packages.get).not.toHaveBeenCalled();
  });

  it('does not fetch when id is empty string', () => {
    const { result } = renderHook(() => usePackage(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(client.packages.get).not.toHaveBeenCalled();
  });

  it('returns loading state initially', () => {
    vi.mocked(client.packages.get).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePackage('pkg-123'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error state when API call fails', async () => {
    vi.mocked(client.packages.get).mockRejectedValue(
      new client.ApiError(404, 'Not found'),
    );

    const { result } = renderHook(() => usePackage('bad-id'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Not found');
  });
});
