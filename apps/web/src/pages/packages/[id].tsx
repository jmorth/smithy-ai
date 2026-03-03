import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  usePackage,
  usePackageFiles,
  usePackageJobs,
  packageKeys,
} from '@/api/hooks/use-packages';
import { socketManager } from '@/api/socket';
import { RoutingKeys } from '@smithy/shared';
import { useQueryClient } from '@tanstack/react-query';
import { PackageFiles } from './components/package-files';
import { JobHistory } from './components/job-history';
import { InteractiveResponse } from './components/interactive-response';
import type { JobExecution } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'Pending',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
  IN_TRANSIT: {
    label: 'In Transit',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  PROCESSING: {
    label: 'Processing',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  EXPIRED: {
    label: 'Expired',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
};

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  USER_INPUT: {
    label: 'User Input',
    className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  SPECIFICATION: {
    label: 'Specification',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  CODE: {
    label: 'Code',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  IMAGE: {
    label: 'Image',
    className: 'bg-pink-100 text-pink-800 border-pink-200',
  },
  PULL_REQUEST: {
    label: 'Pull Request',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
};

// ---------------------------------------------------------------------------
// Status timeline
// ---------------------------------------------------------------------------

const STATUS_ORDER = ['PENDING', 'IN_TRANSIT', 'PROCESSING', 'COMPLETED'];
const TERMINAL_STATES = ['FAILED', 'EXPIRED'];

interface StatusTimelineProps {
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
}

function StatusTimeline({ currentStatus, createdAt, updatedAt }: StatusTimelineProps) {
  const upper = currentStatus.toUpperCase();
  const isFailed = TERMINAL_STATES.includes(upper);

  // Build timeline steps
  const steps = isFailed
    ? [...STATUS_ORDER.slice(0, STATUS_ORDER.indexOf('COMPLETED')), upper]
    : STATUS_ORDER;

  const currentIdx = steps.indexOf(upper);

  return (
    <div className="space-y-0" data-testid="status-timeline">
      {steps.map((step, idx) => {
        const config = STATUS_CONFIG[step] ?? {
          label: step,
          className: 'bg-gray-100 text-gray-800 border-gray-200',
        };
        const isActive = idx === currentIdx;
        const isPast = idx < currentIdx;
        const isFutureOrCurrent = idx >= currentIdx;

        return (
          <div key={step} className="flex items-start gap-3">
            {/* Vertical line + dot */}
            <div className="flex flex-col items-center">
              <div
                className={`h-4 w-4 rounded-full border-2 shrink-0 ${
                  isActive
                    ? 'border-primary bg-primary animate-pulse'
                    : isPast
                      ? 'border-green-500 bg-green-500'
                      : 'border-gray-300 bg-background'
                }`}
                data-testid={`timeline-dot-${step}`}
              />
              {idx < steps.length - 1 && (
                <div
                  className={`w-px h-8 ${
                    isPast ? 'bg-green-500' : 'bg-border'
                  }`}
                />
              )}
            </div>

            {/* Label */}
            <div className={`pb-2 ${isFutureOrCurrent && !isActive ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-medium ${
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {config.label}
                </span>
                {isActive && (
                  <Badge variant="outline" className={config.className}>
                    Current
                  </Badge>
                )}
              </div>
              {isActive && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Since {new Date(updatedAt).toLocaleString()}
                </p>
              )}
              {idx === 0 && isPast && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(createdAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata table
// ---------------------------------------------------------------------------

function MetadataTable({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="no-metadata">
        No custom metadata.
      </p>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border"
      data-testid="metadata-table"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Key
            </th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-b last:border-b-0">
              <td className="px-3 py-2 font-mono text-xs">{key}</td>
              <td className="px-3 py-2 text-xs">
                {typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-24 animate-pulse rounded bg-muted" />
      <div className="flex items-center gap-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
        <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-muted" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
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
      <h3 className="text-lg font-semibold">Failed to load Package</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Data fetching
  const {
    data: pkg,
    isLoading,
    error,
    refetch,
  } = usePackage(id);

  const { data: files } = usePackageFiles(id);
  const { data: jobsResponse } = usePackageJobs(id);

  const jobsList: JobExecution[] = jobsResponse?.data ?? [];

  // Interactive question state (from Socket.IO)
  const [interactiveQuestion, setInteractiveQuestion] = useState<{
    jobId: string;
    questionId: string;
    prompt: string;
    options?: string[];
  } | null>(null);

  // Find the current active job (latest RUNNING or STUCK)
  const activeJob = jobsList.find(
    (j) => j.status === 'RUNNING' || j.status === 'STUCK',
  );

  // -------------------------------------------------------------------------
  // Socket.IO subscription
  // -------------------------------------------------------------------------

  const handleInteractiveSubmit = useCallback(
    (jobId: string, response: { questionId: string; answer: string }) => {
      socketManager.sendInteractiveResponse(jobId, response);
      setInteractiveQuestion(null);
    },
    [],
  );

  useEffect(() => {
    if (!activeJob) return;

    const unsubscribers: (() => void)[] = [];

    try {
      socketManager.subscribeJob(activeJob.id);

      // Listen for STUCK events (interactive question)
      unsubscribers.push(
        socketManager.onEvent('/jobs', RoutingKeys.JOB_STUCK, (event) => {
          if (event.payload.jobExecutionId === activeJob.id) {
            setInteractiveQuestion({
              jobId: activeJob.id,
              questionId: event.payload.jobExecutionId,
              prompt: event.payload.reason,
            });
          }
        }),
      );

      // Listen for completion/error (clear interactive)
      unsubscribers.push(
        socketManager.onEvent('/jobs', RoutingKeys.JOB_COMPLETED, (event) => {
          if (event.payload.jobExecutionId === activeJob.id) {
            setInteractiveQuestion(null);
            queryClient.invalidateQueries({
              queryKey: packageKeys.detail(id!),
            });
            queryClient.invalidateQueries({
              queryKey: packageKeys.jobs(id!),
            });
          }
        }),
      );

      unsubscribers.push(
        socketManager.onEvent('/jobs', RoutingKeys.JOB_ERROR, (event) => {
          if (event.payload.jobExecutionId === activeJob.id) {
            setInteractiveQuestion(null);
            queryClient.invalidateQueries({
              queryKey: packageKeys.detail(id!),
            });
            queryClient.invalidateQueries({
              queryKey: packageKeys.jobs(id!),
            });
          }
        }),
      );

      // Listen for state changes
      unsubscribers.push(
        socketManager.onEvent('/jobs', RoutingKeys.JOB_STATE_CHANGED, (event) => {
          if (event.payload.jobExecutionId === activeJob.id) {
            if (event.payload.newState !== 'STUCK') {
              setInteractiveQuestion(null);
            }
            queryClient.invalidateQueries({
              queryKey: packageKeys.jobs(id!),
            });
          }
        }),
      );
    } catch {
      // Socket not connected yet
    }

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
      socketManager.unsubscribe(`job:${activeJob.id}`);
    };
  }, [activeJob?.id, id, queryClient]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  if (!pkg) {
    return null;
  }

  const upperStatus = pkg.status.toUpperCase();
  const statusConfig = STATUS_CONFIG[upperStatus] ?? {
    label: pkg.status,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  const typeConfig = TYPE_CONFIG[pkg.type.toUpperCase()] ?? {
    label: pkg.type,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => navigate('/packages')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Packages
      </Button>

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-2xl font-bold tracking-tight">
            Package
          </h2>
          <Badge variant="outline" className={typeConfig.className}>
            {typeConfig.label}
          </Badge>
          <Badge variant="outline" className={statusConfig.className}>
            {statusConfig.label}
          </Badge>
        </div>
        <p
          className="font-mono text-sm text-muted-foreground"
          data-testid="package-id"
        >
          {pkg.id}
        </p>
      </div>

      {/* Interactive Response (prominent when STUCK) */}
      {(interactiveQuestion || activeJob?.status === 'STUCK') && (
        <InteractiveResponse
          question={
            interactiveQuestion ?? {
              jobId: activeJob!.id,
              questionId: activeJob!.id,
              prompt:
                activeJob?.errorMessage ??
                'This worker is stuck and needs your input to continue.',
            }
          }
          onSubmit={handleInteractiveSubmit}
        />
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Files and Jobs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Package Info */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Package Info</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Created</dt>
              <dd data-testid="created-date">
                {new Date(pkg.createdAt).toLocaleString()}
              </dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd data-testid="updated-date">
                {new Date(pkg.updatedAt).toLocaleString()}
              </dd>
              {pkg.createdBy && (
                <>
                  <dt className="text-muted-foreground">Created By</dt>
                  <dd>{pkg.createdBy}</dd>
                </>
              )}
              {pkg.assemblyLineId && (
                <>
                  <dt className="text-muted-foreground">Assembly Line</dt>
                  <dd>
                    <Link
                      to={`/assembly-lines/${pkg.assemblyLineId}`}
                      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      data-testid="assembly-line-link"
                    >
                      {pkg.assemblyLineId.slice(0, 8)}…
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </dd>
                </>
              )}
              {pkg.currentStep !== undefined && pkg.currentStep !== null && (
                <>
                  <dt className="text-muted-foreground">Current Step</dt>
                  <dd>Step {pkg.currentStep}</dd>
                </>
              )}
            </dl>
          </section>

          {/* Custom Metadata */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Metadata</h3>
            <MetadataTable metadata={pkg.metadata} />
          </section>

          {/* Files */}
          <section>
            <h3 className="text-sm font-semibold mb-3">
              Files ({files?.length ?? 0})
            </h3>
            <PackageFiles files={files ?? []} packageId={pkg.id} />
          </section>

          {/* Job History */}
          <section>
            <h3 className="text-sm font-semibold mb-3">
              Job History ({jobsList.length})
            </h3>
            <JobHistory jobs={jobsList} />
          </section>
        </div>

        {/* Right column: Status Timeline */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Status Timeline</h3>
          <StatusTimeline
            currentStatus={pkg.status}
            createdAt={pkg.createdAt}
            updatedAt={pkg.updatedAt}
          />
        </div>
      </div>
    </div>
  );
}
