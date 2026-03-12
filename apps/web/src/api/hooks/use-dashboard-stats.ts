import { useQuery } from '@tanstack/react-query';
import { assemblyLines, workerPools, packages } from '@/api/client';
import type { ApiError } from '@/api/client';

export interface DashboardStats {
  activeAssemblyLines: number;
  activeWorkerPools: number;
  inTransitPackages: number;
  runningContainers: { used: number; max: number };
}

async function fetchDashboardStats(
  signal?: AbortSignal,
): Promise<DashboardStats> {
  const [alResult, wpResult, pkgResult] = await Promise.all([
    assemblyLines.list(undefined, signal),
    workerPools.list(undefined, signal),
    packages.list({ status: 'IN_TRANSIT' as never, limit: 1 }, signal),
  ]);

  const activeALs = Array.isArray(alResult) ? alResult : [];
  const activeWPs = Array.isArray(wpResult) ? wpResult : [];

  const inTransitCount = pkgResult.total ?? pkgResult.data.length;

  const totalMaxConcurrency = activeWPs.reduce(
    (sum, wp) => sum + (wp.maxConcurrency ?? 0),
    0,
  );
  const totalActiveJobs = activeWPs.reduce(
    (sum, wp) => sum + (wp.activeJobCount ?? 0),
    0,
  );

  return {
    activeAssemblyLines: activeALs.length,
    activeWorkerPools: activeWPs.length,
    inTransitPackages: inTransitCount,
    runningContainers: {
      used: totalActiveJobs,
      max: totalMaxConcurrency,
    },
  };
}

export function useDashboardStats() {
  return useQuery<DashboardStats, ApiError>({
    queryKey: ['dashboard-stats'],
    queryFn: ({ signal }) => fetchDashboardStats(signal),
    refetchInterval: 30_000,
  });
}
