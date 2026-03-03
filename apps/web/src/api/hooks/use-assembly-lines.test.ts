import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import {
  useAssemblyLines,
  useAssemblyLine,
  useAssemblyLinePackages,
  useCreateAssemblyLine,
  useUpdateAssemblyLine,
  useSubmitPackageToLine,
  assemblyLineKeys,
} from './use-assembly-lines';
import * as client from '@/api/client';

vi.mock('@/api/client', () => ({
  assemblyLines: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    submitPackage: vi.fn(),
    listPackages: vi.fn(),
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

describe('assemblyLineKeys', () => {
  it('builds base key', () => {
    expect(assemblyLineKeys.all).toEqual(['assembly-lines']);
  });

  it('builds lists key', () => {
    expect(assemblyLineKeys.lists()).toEqual(['assembly-lines', 'list']);
  });

  it('builds list key with params', () => {
    const params = { page: 1, limit: 10 };
    expect(assemblyLineKeys.list(params)).toEqual([
      'assembly-lines',
      'list',
      params,
    ]);
  });

  it('builds list key without params', () => {
    expect(assemblyLineKeys.list()).toEqual([
      'assembly-lines',
      'list',
      undefined,
    ]);
  });

  it('builds details key', () => {
    expect(assemblyLineKeys.details()).toEqual(['assembly-lines', 'detail']);
  });

  it('builds detail key with slug', () => {
    expect(assemblyLineKeys.detail('my-line')).toEqual([
      'assembly-lines',
      'detail',
      'my-line',
    ]);
  });

  it('builds packages key with slug', () => {
    expect(assemblyLineKeys.packages('my-line')).toEqual([
      'assembly-lines',
      'my-line',
      'packages',
      undefined,
    ]);
  });

  it('builds packages key with slug and params', () => {
    const params = { limit: 5 };
    expect(assemblyLineKeys.packages('my-line', params)).toEqual([
      'assembly-lines',
      'my-line',
      'packages',
      params,
    ]);
  });
});

// ---------------------------------------------------------------------------
// useAssemblyLines
// ---------------------------------------------------------------------------

describe('useAssemblyLines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches assembly lines list successfully', async () => {
    const mockData = [
      { id: '1', name: 'Line A', slug: 'line-a' },
      { id: '2', name: 'Line B', slug: 'line-b' },
    ];
    vi.mocked(client.assemblyLines.list).mockResolvedValue(mockData as never);

    const { result } = renderHook(() => useAssemblyLines(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockData);
    expect(client.assemblyLines.list).toHaveBeenCalledWith(
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('passes pagination params to API client', async () => {
    vi.mocked(client.assemblyLines.list).mockResolvedValue([] as never);

    const params = { page: 2, limit: 10 };
    const { result } = renderHook(() => useAssemblyLines(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.assemblyLines.list).toHaveBeenCalledWith(
      params,
      expect.any(AbortSignal),
    );
  });

  it('returns loading state initially', () => {
    vi.mocked(client.assemblyLines.list).mockReturnValue(
      new Promise(() => {}),
    );

    const { result } = renderHook(() => useAssemblyLines(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error state when API call fails', async () => {
    vi.mocked(client.assemblyLines.list).mockRejectedValue(
      new client.ApiError(500, 'Internal server error'),
    );

    const { result } = renderHook(() => useAssemblyLines(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBe('Internal server error');
  });
});

// ---------------------------------------------------------------------------
// useAssemblyLine
// ---------------------------------------------------------------------------

describe('useAssemblyLine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a single assembly line with steps', async () => {
    const mockDetail = {
      id: '1',
      name: 'Line A',
      slug: 'line-a',
      steps: [{ id: 's1', stepNumber: 1, workerVersionId: 'wv1' }],
    };
    vi.mocked(client.assemblyLines.get).mockResolvedValue(mockDetail as never);

    const { result } = renderHook(() => useAssemblyLine('line-a'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockDetail);
    expect(client.assemblyLines.get).toHaveBeenCalledWith(
      'line-a',
      expect.any(AbortSignal),
    );
  });

  it('does not fetch when slug is undefined', () => {
    const { result } = renderHook(() => useAssemblyLine(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(client.assemblyLines.get).not.toHaveBeenCalled();
  });

  it('does not fetch when slug is empty string', () => {
    const { result } = renderHook(() => useAssemblyLine(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(client.assemblyLines.get).not.toHaveBeenCalled();
  });

  it('returns loading state initially', () => {
    vi.mocked(client.assemblyLines.get).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAssemblyLine('line-a'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('returns error state when API call fails', async () => {
    vi.mocked(client.assemblyLines.get).mockRejectedValue(
      new client.ApiError(404, 'Not found'),
    );

    const { result } = renderHook(() => useAssemblyLine('bad-slug'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// useAssemblyLinePackages
// ---------------------------------------------------------------------------

describe('useAssemblyLinePackages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches packages for a given assembly line', async () => {
    const mockResponse = {
      data: [
        { id: 'p1', type: 'text', status: 'PENDING' },
        { id: 'p2', type: 'code', status: 'IN_TRANSIT' },
      ],
      meta: { total: 2, limit: 10 },
    };
    vi.mocked(client.assemblyLines.listPackages).mockResolvedValue(
      mockResponse as never,
    );

    const { result } = renderHook(
      () => useAssemblyLinePackages('line-a'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockResponse);
    expect(client.assemblyLines.listPackages).toHaveBeenCalledWith(
      'line-a',
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('passes pagination params to API client', async () => {
    vi.mocked(client.assemblyLines.listPackages).mockResolvedValue({
      data: [],
      meta: { total: 0, limit: 5 },
    } as never);

    const params = { limit: 5 };
    const { result } = renderHook(
      () => useAssemblyLinePackages('line-a', params),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.assemblyLines.listPackages).toHaveBeenCalledWith(
      'line-a',
      params,
      expect.any(AbortSignal),
    );
  });

  it('does not fetch when slug is undefined', () => {
    const { result } = renderHook(
      () => useAssemblyLinePackages(undefined),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(client.assemblyLines.listPackages).not.toHaveBeenCalled();
  });

  it('returns error state when API call fails', async () => {
    vi.mocked(client.assemblyLines.listPackages).mockRejectedValue(
      new client.ApiError(500, 'Server error'),
    );

    const { result } = renderHook(
      () => useAssemblyLinePackages('line-a'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Server error');
  });
});

// ---------------------------------------------------------------------------
// useCreateAssemblyLine
// ---------------------------------------------------------------------------

describe('useCreateAssemblyLine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an assembly line and invalidates list cache', async () => {
    const created = { id: '1', name: 'New Line', slug: 'new-line' };
    vi.mocked(client.assemblyLines.create).mockResolvedValue(created as never);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useCreateAssemblyLine(), { wrapper });

    await act(async () => {
      result.current.mutate({
        name: 'New Line',
        steps: [{ workerVersionId: 'wv1' }],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(created);
    expect(client.assemblyLines.create).toHaveBeenCalledWith({
      name: 'New Line',
      steps: [{ workerVersionId: 'wv1' }],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['assembly-lines', 'list'],
    });
  });

  it('returns error state on failure', async () => {
    vi.mocked(client.assemblyLines.create).mockRejectedValue(
      new client.ApiError(422, 'Validation failed'),
    );

    const { result } = renderHook(() => useCreateAssemblyLine(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        name: '',
        steps: [],
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Validation failed');
  });
});

// ---------------------------------------------------------------------------
// useUpdateAssemblyLine
// ---------------------------------------------------------------------------

describe('useUpdateAssemblyLine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates an assembly line and invalidates list and detail caches', async () => {
    const updated = {
      id: '1',
      name: 'Updated Line',
      slug: 'my-line',
    };
    vi.mocked(client.assemblyLines.update).mockResolvedValue(updated as never);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useUpdateAssemblyLine('my-line'), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ name: 'Updated Line' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(updated);
    expect(client.assemblyLines.update).toHaveBeenCalledWith('my-line', {
      name: 'Updated Line',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['assembly-lines', 'list'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['assembly-lines', 'detail', 'my-line'],
    });
  });

  it('returns error state on failure', async () => {
    vi.mocked(client.assemblyLines.update).mockRejectedValue(
      new client.ApiError(404, 'Not found'),
    );

    const { result } = renderHook(() => useUpdateAssemblyLine('bad-slug'), {
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
// useSubmitPackageToLine
// ---------------------------------------------------------------------------

describe('useSubmitPackageToLine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits a package and invalidates detail and packages caches', async () => {
    const pkg = { id: 'p1', type: 'text', status: 'PENDING' };
    vi.mocked(client.assemblyLines.submitPackage).mockResolvedValue(
      pkg as never,
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useSubmitPackageToLine('line-a'), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ type: 'text', metadata: { key: 'val' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(pkg);
    expect(client.assemblyLines.submitPackage).toHaveBeenCalledWith('line-a', {
      type: 'text',
      metadata: { key: 'val' },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['assembly-lines', 'detail', 'line-a'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['assembly-lines', 'line-a', 'packages'],
    });
  });

  it('returns error state on failure', async () => {
    vi.mocked(client.assemblyLines.submitPackage).mockRejectedValue(
      new client.ApiError(400, 'Bad request'),
    );

    const { result } = renderHook(() => useSubmitPackageToLine('line-a'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ type: 'text' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Bad request');
  });
});
