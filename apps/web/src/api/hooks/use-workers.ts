import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workers } from '@/api/client';
import type {
  WorkerQueryParams,
  WorkerDetail,
  CreateWorkerBody,
  CreateWorkerVersionBody,
  ApiError,
} from '@/api/client';
import type { Worker, WorkerVersion } from '@smithy/shared';

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

export function useCreateWorker() {
  const queryClient = useQueryClient();
  return useMutation<Worker, ApiError, CreateWorkerBody>({
    mutationFn: (data) => workers.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerKeys.lists() });
    },
  });
}

export function useCreateWorkerVersion(slug: string) {
  const queryClient = useQueryClient();
  return useMutation<WorkerVersion, ApiError, CreateWorkerVersionBody>({
    mutationFn: (data) => workers.createVersion(slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerKeys.lists() });
      queryClient.invalidateQueries({ queryKey: workerKeys.detail(slug) });
    },
  });
}

export function useDeprecateWorkerVersion(slug: string) {
  const queryClient = useQueryClient();
  return useMutation<WorkerVersion, ApiError, number>({
    mutationFn: (version) => workers.deprecateVersion(slug, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerKeys.detail(slug) });
    },
  });
}
