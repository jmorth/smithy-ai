import { useQuery } from '@tanstack/react-query';
import { packages } from '@/api/client';
import type { PackagePaginationParams, PaginatedResponse, ApiError } from '@/api/client';
import type { Package } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const packageKeys = {
  all: ['packages'] as const,
  lists: () => [...packageKeys.all, 'list'] as const,
  list: (params?: PackagePaginationParams) =>
    [...packageKeys.lists(), params] as const,
  details: () => [...packageKeys.all, 'detail'] as const,
  detail: (id: string) => [...packageKeys.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Query Hooks
// ---------------------------------------------------------------------------

export function usePackages(params?: PackagePaginationParams) {
  return useQuery<PaginatedResponse<Package>, ApiError>({
    queryKey: packageKeys.list(params),
    queryFn: ({ signal }) => packages.list(params, signal),
  });
}

export function usePackage(id: string | undefined) {
  return useQuery<Package, ApiError>({
    queryKey: packageKeys.detail(id!),
    queryFn: ({ signal }) => packages.get(id!, signal),
    enabled: !!id,
  });
}
