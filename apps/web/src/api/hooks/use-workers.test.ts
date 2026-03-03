import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkers, useWorker } from './use-workers';
import * as client from '@/api/client';
import type { WorkerDetail } from '@/api/client';
import type { Worker } from '@smithy/shared';
import React from 'react';

vi.mock('@/api/client', () => ({
  workers: {
    list: vi.fn(),
    get: vi.fn(),
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
      version: '1.0.0',
      yamlConfig: { name: 'Summarizer', inputTypes: ['text'], outputType: 'text', provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'KEY' } },
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useWorkers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches workers list', async () => {
    vi.mocked(client.workers.list).mockResolvedValue(WORKERS as never);
    const { result } = renderHook(() => useWorkers(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(WORKERS);
  });

  it('passes query params to list', async () => {
    vi.mocked(client.workers.list).mockResolvedValue([] as never);
    renderHook(() => useWorkers({ name: 'sum' }), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(client.workers.list).toHaveBeenCalledWith(
        { name: 'sum' },
        expect.anything(),
      );
    });
  });
});

describe('useWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a single worker by slug', async () => {
    vi.mocked(client.workers.get).mockResolvedValue(WORKER_DETAIL as never);
    const { result } = renderHook(() => useWorker('summarizer'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(WORKER_DETAIL);
  });

  it('does not fetch when slug is undefined', () => {
    const { result } = renderHook(() => useWorker(undefined), { wrapper: createWrapper() });
    expect(result.current.isFetching).toBe(false);
    expect(client.workers.get).not.toHaveBeenCalled();
  });
});
