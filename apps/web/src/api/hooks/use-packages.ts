import { useQuery, useMutation } from '@tanstack/react-query';
import { packages, jobs } from '@/api/client';
import type { PackagePaginationParams, PaginatedResponse, ApiError, JobQueryParams } from '@/api/client';
import type { Package, PackageFile, JobExecution } from '@smithy/shared';

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
  files: (id: string) => [...packageKeys.detail(id), 'files'] as const,
  jobs: (id: string) => [...packageKeys.detail(id), 'jobs'] as const,
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

export function usePackageFiles(id: string | undefined) {
  return useQuery<PackageFile[], ApiError>({
    queryKey: packageKeys.files(id!),
    queryFn: ({ signal }) => packages.listFiles(id!, signal),
    enabled: !!id,
  });
}

export function usePackageJobs(packageId: string | undefined) {
  return useQuery<PaginatedResponse<JobExecution>, ApiError>({
    queryKey: packageKeys.jobs(packageId!),
    queryFn: ({ signal }) =>
      jobs.list({ packageId: packageId!, limit: 50 } as JobQueryParams, signal),
    enabled: !!packageId,
  });
}

export function useDownloadFile() {
  return useMutation<void, ApiError, { packageId: string; fileId: string }>({
    mutationFn: async ({ packageId, fileId }) => {
      const { downloadUrl } = await packages.getDownloadUrl(packageId, fileId);
      window.open(downloadUrl, '_blank');
    },
  });
}
