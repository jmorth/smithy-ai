import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Ban,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { JobExecution } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const JOB_STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  QUEUED: {
    label: 'Queued',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: Clock,
  },
  RUNNING: {
    label: 'Running',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Loader2,
  },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle2,
  },
  STUCK: {
    label: 'Stuck',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: AlertTriangle,
  },
  ERROR: {
    label: 'Error',
    className: 'bg-red-100 text-red-800 border-red-200',
    icon: XCircle,
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: Ban,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(startedAt: string, completedAt?: string): string {
  const startMs = new Date(startedAt).getTime();
  const endMs = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Job entry
// ---------------------------------------------------------------------------

interface JobEntryProps {
  job: JobExecution;
  isLatest: boolean;
}

function JobEntry({ job, isLatest }: JobEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const [, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRunning = job.status === 'RUNNING';

  const statusConfig = JOB_STATUS_CONFIG[job.status] ?? {
    label: job.status,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: Clock,
  };
  const StatusIcon = statusConfig.icon;

  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  return (
    <div
      className="relative pl-8"
      data-testid={`job-${job.id}`}
    >
      {/* Timeline dot */}
      <div
        className={`absolute left-0 top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background ${
          isRunning
            ? 'border-blue-500 animate-pulse'
            : job.status === 'COMPLETED'
              ? 'border-green-500'
              : job.status === 'ERROR'
                ? 'border-red-500'
                : job.status === 'STUCK'
                  ? 'border-amber-500'
                  : 'border-gray-300'
        }`}
        data-testid={`job-dot-${job.id}`}
      >
        <StatusIcon className={`h-3 w-3 ${isRunning ? 'animate-spin' : ''}`} />
      </div>

      {/* Content */}
      <button
        type="button"
        className="w-full rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid={`job-toggle-${job.id}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {job.id.slice(0, 8)}
            </span>
            <span className="text-sm font-medium">
              {job.workerVersionId.split(':')[0] ?? job.workerVersionId}
            </span>
            {isLatest && (
              <Badge variant="outline" className="text-xs">
                Latest
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          {job.startedAt && (
            <span>Started: {formatTimestamp(job.startedAt)}</span>
          )}
          {job.startedAt && (
            <span data-testid={`job-duration-${job.id}`}>
              Duration: {formatDuration(job.startedAt, job.completedAt ?? undefined)}
              {isRunning && ' (running)'}
            </span>
          )}
          {job.retryCount > 0 && <span>Retries: {job.retryCount}</span>}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div
          className="mt-1 ml-0 rounded-lg border bg-muted/30 p-3 text-sm"
          data-testid={`job-details-${job.id}`}
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Job ID</dt>
            <dd className="font-mono">{job.id}</dd>
            <dt className="text-muted-foreground">Worker Version</dt>
            <dd>{job.workerVersionId}</dd>
            {job.containerId && (
              <>
                <dt className="text-muted-foreground">Container</dt>
                <dd className="font-mono">{job.containerId.slice(0, 12)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Created</dt>
            <dd>{formatTimestamp(job.createdAt)}</dd>
          </dl>

          {job.errorMessage && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {job.errorMessage}
            </div>
          )}

          {job.logs && Array.isArray(job.logs) && job.logs.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Log output:
              </p>
              <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs font-mono">
                {job.logs
                  .slice(-20)
                  .map((entry) =>
                    typeof entry === 'string' ? entry : JSON.stringify(entry),
                  )
                  .join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface JobHistoryProps {
  jobs: JobExecution[];
}

export function JobHistory({ jobs }: JobHistoryProps) {
  if (jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="no-jobs">
        No job executions for this package.
      </p>
    );
  }

  // Sort newest first
  const sorted = [...jobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="relative space-y-3" data-testid="job-history">
      {/* Connecting line */}
      <div className="absolute left-3 top-3 bottom-3 w-px bg-border" />

      {sorted.map((job, idx) => (
        <JobEntry key={job.id} job={job} isLatest={idx === 0} />
      ))}
    </div>
  );
}
