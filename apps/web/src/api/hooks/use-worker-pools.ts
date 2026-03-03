import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workerPools } from '@/api/client';
import type {
  PaginationParams,
  CreateWorkerPoolBody,
  UpdateWorkerPoolBody,
  SubmitPackageBody,
  ApiError,
  WorkerPoolDetail,
} from '@/api/client';
import type { WorkerPool, Package } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const workerPoolKeys = {
  all: ['worker-pools'] as const,
  lists: () => [...workerPoolKeys.all, 'list'] as const,
  list: (params?: PaginationParams) =>
    [...workerPoolKeys.lists(), params] as const,
  details: () => [...workerPoolKeys.all, 'detail'] as const,
  detail: (slug: string) => [...workerPoolKeys.details(), slug] as const,
};

// ---------------------------------------------------------------------------
// Query Hooks
// ---------------------------------------------------------------------------

export function useWorkerPools(params?: PaginationParams) {
  return useQuery<WorkerPoolDetail[], ApiError>({
    queryKey: workerPoolKeys.list(params),
    queryFn: ({ signal }) => workerPools.list(params, signal),
  });
}

export function useWorkerPool(slug: string | undefined) {
  return useQuery<WorkerPoolDetail, ApiError>({
    queryKey: workerPoolKeys.detail(slug!),
    queryFn: ({ signal }) => workerPools.get(slug!, signal),
    enabled: !!slug,
  });
}

// ---------------------------------------------------------------------------
// Mutation Hooks
// ---------------------------------------------------------------------------

export function useCreateWorkerPool() {
  const queryClient = useQueryClient();

  return useMutation<WorkerPool, ApiError, CreateWorkerPoolBody>({
    mutationFn: (data) => workerPools.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerPoolKeys.lists() });
    },
  });
}

export function useUpdateWorkerPool(slug: string) {
  const queryClient = useQueryClient();

  return useMutation<WorkerPool, ApiError, UpdateWorkerPoolBody>({
    mutationFn: (data) => workerPools.update(slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerPoolKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: workerPoolKeys.detail(slug),
      });
    },
  });
}

export function useSubmitPackageToPool(slug: string) {
  const queryClient = useQueryClient();

  return useMutation<Package, ApiError, SubmitPackageBody>({
    mutationFn: (data) => workerPools.submitPackage(slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workerPoolKeys.detail(slug),
      });
    },
  });
}
