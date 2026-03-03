import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assemblyLines } from '@/api/client';
import type {
  PaginationParams,
  PackagePaginationParams,
  CreateAssemblyLineBody,
  UpdateAssemblyLineBody,
  SubmitPackageBody,
  ApiError,
  AssemblyLineDetail,
  PaginatedResponse,
} from '@/api/client';
import type { AssemblyLine, Package } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const assemblyLineKeys = {
  all: ['assembly-lines'] as const,
  lists: () => [...assemblyLineKeys.all, 'list'] as const,
  list: (params?: PaginationParams) =>
    [...assemblyLineKeys.lists(), params] as const,
  details: () => [...assemblyLineKeys.all, 'detail'] as const,
  detail: (slug: string) => [...assemblyLineKeys.details(), slug] as const,
  packages: (slug: string, params?: PackagePaginationParams) =>
    [...assemblyLineKeys.all, slug, 'packages', params] as const,
};

// ---------------------------------------------------------------------------
// Query Hooks
// ---------------------------------------------------------------------------

export function useAssemblyLines(params?: PaginationParams) {
  return useQuery<AssemblyLine[], ApiError>({
    queryKey: assemblyLineKeys.list(params),
    queryFn: ({ signal }) => assemblyLines.list(params, signal),
  });
}

export function useAssemblyLine(slug: string | undefined) {
  return useQuery<AssemblyLineDetail, ApiError>({
    queryKey: assemblyLineKeys.detail(slug!),
    queryFn: ({ signal }) => assemblyLines.get(slug!, signal),
    enabled: !!slug,
  });
}

export function useAssemblyLinePackages(
  slug: string | undefined,
  params?: PackagePaginationParams,
) {
  return useQuery<PaginatedResponse<Package>, ApiError>({
    queryKey: assemblyLineKeys.packages(slug!, params),
    queryFn: ({ signal }) => assemblyLines.listPackages(slug!, params, signal),
    enabled: !!slug,
  });
}

// ---------------------------------------------------------------------------
// Mutation Hooks
// ---------------------------------------------------------------------------

export function useCreateAssemblyLine() {
  const queryClient = useQueryClient();

  return useMutation<AssemblyLine, ApiError, CreateAssemblyLineBody>({
    mutationFn: (data) => assemblyLines.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assemblyLineKeys.lists() });
    },
  });
}

export function useUpdateAssemblyLine(slug: string) {
  const queryClient = useQueryClient();

  return useMutation<AssemblyLine, ApiError, UpdateAssemblyLineBody>({
    mutationFn: (data) => assemblyLines.update(slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assemblyLineKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: assemblyLineKeys.detail(slug),
      });
    },
  });
}

export function useSubmitPackageToLine(slug: string) {
  const queryClient = useQueryClient();

  return useMutation<Package, ApiError, SubmitPackageBody>({
    mutationFn: (data) => assemblyLines.submitPackage(slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: assemblyLineKeys.detail(slug),
      });
      queryClient.invalidateQueries({
        queryKey: [...assemblyLineKeys.all, slug, 'packages'],
      });
    },
  });
}
