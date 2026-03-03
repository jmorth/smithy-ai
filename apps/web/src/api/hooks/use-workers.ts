import { useQuery } from '@tanstack/react-query';
import { workers } from '@/api/client';
import type { WorkerQueryParams, WorkerDetail, ApiError } from '@/api/client';
import type { Worker } from '@smithy/shared';

export const workerKeys = {
  all: ['workers'] as const,
  lists: () => [...workerKeys.all, 'list'] as const,
  list: (params?: WorkerQueryParams) =>
    [...workerKeys.lists(), params] as const,
  details: () => [...workerKeys.all, 'detail'] as const,
  detail: (slug: string) => [...workerKeys.details(), slug] as const,
};

export function useWorkers(params?: WorkerQueryParams) {
  return useQuery<Worker[], ApiError>({
    queryKey: workerKeys.list(params),
    queryFn: ({ signal }) => workers.list(params, signal),
  });
}

export function useWorker(slug: string | undefined) {
  return useQuery<WorkerDetail, ApiError>({
    queryKey: workerKeys.detail(slug!),
    queryFn: ({ signal }) => workers.get(slug!, signal),
    enabled: !!slug,
  });
}
