import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Pencil,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PackageSubmitDialog } from '@/components/package-submit-dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  useWorkerPool,
  workerPoolKeys,
} from '@/api/hooks/use-worker-pools';
import { socketManager } from '@/api/socket';
import { RoutingKeys } from '@smithy/shared';
import { useQueryClient } from '@tanstack/react-query';
import { PoolStatus } from './worker-pools/components/pool-status';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveJob {
  jobId: string;
  workerName: string;
  packageId: string;
  status: string;
  startedAt: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const POOL_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  PAUSED: {
    label: 'Paused',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  DRAINING: {
    label: 'Draining',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  ERROR: {
    label: 'Error',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
};

const MEMBER_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  idle: {
    label: 'Idle',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
  busy: {
    label: 'Busy',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  error: {
    label: 'Error',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
};

function MemberStatusBadge({ status }: { status: string }) {
  const config = MEMBER_STATUS_CONFIG[status.toLowerCase()] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Duration helper
// ---------------------------------------------------------------------------

function formatDuration(startedAt: string): string {
  const startMs = new Date(startedAt).getTime();
  const nowMs = Date.now();
  const diffSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="h-4 w-72 animate-pulse rounded bg-muted" />
      <div className="h-12 w-full animate-pulse rounded bg-muted" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
      <h3 className="text-lg font-semibold">Failed to load Worker Pool</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active jobs table with auto-updating durations
// ---------------------------------------------------------------------------

function ActiveJobsTable({ jobs }: { jobs: ActiveJob[] }) {
  const [, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (jobs.length === 0) return;
    intervalRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobs.length]);

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No active jobs.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job ID</TableHead>
          <TableHead>Worker</TableHead>
          <TableHead>Package</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Started At</TableHead>
          <TableHead>Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.jobId}>
            <TableCell className="font-mono text-xs">{job.jobId.slice(0, 8)}</TableCell>
            <TableCell>{job.workerName}</TableCell>
            <TableCell>
              <Link
                to={`/packages/${job.packageId}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {job.packageId.slice(0, 8)}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{job.status}</Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(job.startedAt).toLocaleTimeString()}
            </TableCell>
            <TableCell data-testid={`duration-${job.jobId}`}>
              {formatDuration(job.startedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function WorkerPoolDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Data fetching
  const {
    data: pool,
    isLoading,
    error,
    refetch,
  } = useWorkerPool(slug);

  // Real-time state overlays
  const [memberStatuses, setMemberStatuses] = useState<Map<string, string>>(new Map());
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [queueDepth, setQueueDepth] = useState<number | null>(null);

  // Submit package dialog
  const [submitOpen, setSubmitOpen] = useState(false);

  // -------------------------------------------------------------------------
  // Socket.IO subscription
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!slug) return;

    const unsubscribers: (() => void)[] = [];

    try {
      socketManager.subscribeWorkerPool(slug);

      // Job started — add to active jobs list
      unsubscribers.push(
        socketManager.onEvent(
          '/workflows',
          RoutingKeys.JOB_STATE_CHANGED,
          (event) => {
            const { newState, jobExecutionId, packageId, workerVersionId } = event.payload;
            const workerName = workerVersionId?.split(':')[0] ?? null;

            if (newState === 'WORKING') {
              setActiveJobs((prev) => {
                if (prev.some((j) => j.jobId === jobExecutionId)) return prev;
                return [
                  ...prev,
                  {
                    jobId: jobExecutionId,
                    workerName: workerName ?? 'Unknown',
                    packageId: packageId ?? '',
                    status: 'WORKING',
                    startedAt: new Date().toISOString(),
                  },
                ];
              });
              // Update member status to busy
              if (workerName) {
                setMemberStatuses((prev) => new Map(prev).set(workerName, 'busy'));
              }
            } else if (newState === 'DONE' || newState === 'ERROR') {
              setActiveJobs((prev) => prev.filter((j) => j.jobId !== jobExecutionId));
              if (workerName) {
                setMemberStatuses((prev) => {
                  const next = new Map(prev);
                  next.set(workerName, newState === 'ERROR' ? 'error' : 'idle');
                  return next;
                });
              }
              // Invalidate pool detail to refresh counts
              queryClient.invalidateQueries({
                queryKey: workerPoolKeys.detail(slug),
              });
            }
          },
        ),
      );

      // Package created — increment queue indicator
      unsubscribers.push(
        socketManager.onEvent(
          '/workflows',
          RoutingKeys.PACKAGE_CREATED,
          () => {
            setQueueDepth((prev) => (prev ?? 0) + 1);
          },
        ),
      );

      // Package processed — decrement queue
      unsubscribers.push(
        socketManager.onEvent(
          '/workflows',
          RoutingKeys.PACKAGE_PROCESSED,
          () => {
            setQueueDepth((prev) => Math.max(0, (prev ?? 1) - 1));
            queryClient.invalidateQueries({
              queryKey: workerPoolKeys.detail(slug),
            });
          },
        ),
      );
    } catch {
      // Socket not connected yet
    }

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
      socketManager.unsubscribe(`worker-pool:${slug}`);
    };
  }, [slug, queryClient]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const activeJobCount = useMemo(() => {
    if (activeJobs.length > 0) return activeJobs.length;
    return pool?.activeJobCount ?? 0;
  }, [activeJobs, pool]);

  const effectiveQueueDepth = useMemo(() => {
    if (queueDepth !== null) return queueDepth;
    // Pool detail from API may include queueDepth
    const extended = pool as typeof pool & { queueDepth?: number };
    return extended?.queueDepth ?? 0;
  }, [queueDepth, pool]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  if (!pool) {
    return null;
  }

  const upperStatus = pool.status.toUpperCase();
  const statusConfig = POOL_STATUS_CONFIG[upperStatus] ?? {
    label: pool.status,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => navigate('/worker-pools')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Worker Pools
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">{pool.name}</h2>
            <Badge variant="outline" className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          </div>
          {pool.description && (
            <p className="text-sm text-muted-foreground">{pool.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/worker-pools/${pool.slug}/edit`)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button size="sm" onClick={() => setSubmitOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Submit Package
          </Button>
        </div>
      </div>

      {/* Pool utilization */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Pool Utilization</h3>
        <PoolStatus
          activeJobs={activeJobCount}
          maxConcurrency={pool.maxConcurrency}
        />
      </div>

      {/* Queue depth */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Queue Depth:</span>
        <Badge variant="outline" data-testid="queue-depth">
          {effectiveQueueDepth}
        </Badge>
      </div>

      {/* Member list */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Members ({pool.members?.length ?? 0})</h3>
        {pool.members && pool.members.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pool.members.map((member) => {
              const memberName = member.workerVersionId.split(':')[0] ?? member.workerVersionId;
              const version = member.workerVersionId.split(':')[1] ?? '—';
              const realtimeStatus = memberStatuses.get(memberName);
              const status = realtimeStatus ?? 'idle';

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                  data-testid={`member-${member.id}`}
                >
                  <div>
                    <p className="font-medium text-sm">{memberName}</p>
                    <p className="text-xs text-muted-foreground">v{version}</p>
                  </div>
                  <MemberStatusBadge status={status} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No members in this pool.</p>
        )}
      </div>

      {/* Active jobs */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Active Jobs</h3>
        <ActiveJobsTable jobs={activeJobs} />
      </div>

      {/* Submit package dialog */}
      {slug && (
        <PackageSubmitDialog
          target={{ type: 'worker-pool', slug }}
          open={submitOpen}
          onOpenChange={setSubmitOpen}
        />
      )}
    </div>
  );
}
