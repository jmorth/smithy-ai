import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useJobs, useJobLogs, useLogStream } from '@/api/hooks/use-logs';
import type { LogEntry } from '@/api/client';
import type { JobExecution } from '@smithy/shared';
import LogFilters, { DEFAULT_FILTER_STATE, type LogFilterState } from './components/log-filters';
import LogStream, { filterLogs } from './components/log-stream';

// ---------------------------------------------------------------------------
// Job status helpers
// ---------------------------------------------------------------------------

const JOB_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  QUEUED: { label: 'Queued', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  RUNNING: { label: 'Running', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  COMPLETED: { label: 'Completed', className: 'bg-green-100 text-green-800 border-green-200' },
  STUCK: { label: 'Stuck', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  ERROR: { label: 'Error', className: 'bg-red-100 text-red-800 border-red-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-gray-100 text-gray-500 border-gray-200' },
};

function JobStatusBadge({ status }: { status: string }) {
  const config = JOB_STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-800 border-gray-200' };
  return (
    <Badge variant="outline" className={cn('text-[10px]', config.className)}>
      {config.label}
    </Badge>
  );
}

function isJobRunning(status: string): boolean {
  return status === 'RUNNING' || status === 'QUEUED';
}

// ---------------------------------------------------------------------------
// Job selector
// ---------------------------------------------------------------------------

interface JobSelectorProps {
  jobs: JobExecution[];
  selectedJobId: string | undefined;
  onSelect: (jobId: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  isLoading: boolean;
}

function JobSelector({ jobs: jobList, selectedJobId, onSelect, search, onSearchChange, isLoading }: JobSelectorProps) {
  const grouped = useMemo(() => {
    const running: JobExecution[] = [];
    const completed: JobExecution[] = [];
    const other: JobExecution[] = [];

    for (const job of jobList) {
      if (isJobRunning(job.status)) running.push(job);
      else if (job.status === 'COMPLETED') completed.push(job);
      else other.push(job);
    }

    return { running, completed, other };
  }, [jobList]);

  const filtered = useMemo(() => {
    if (!search) return grouped;
    const s = search.toLowerCase();
    const filter = (list: JobExecution[]) =>
      list.filter(
        (j) =>
          j.id.toLowerCase().includes(s) ||
          j.workerVersionId.toLowerCase().includes(s),
      );
    return {
      running: filter(grouped.running),
      completed: filter(grouped.completed),
      other: filter(grouped.other),
    };
  }, [grouped, search]);

  const renderGroup = (label: string, items: JobExecution[]) => {
    if (items.length === 0) return null;
    return (
      <div key={label}>
        <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {items.map((job) => (
          <button
            key={job.id}
            type="button"
            onClick={() => onSelect(job.id)}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent',
              selectedJobId === job.id && 'bg-accent font-medium',
            )}
          >
            <span className="truncate font-mono">{job.id.slice(0, 8)}</span>
            <JobStatusBadge status={job.status} />
            <span className="ml-auto truncate text-muted-foreground">
              {job.workerVersionId.slice(0, 8)}
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="flex w-64 shrink-0 flex-col border-r">
      <div className="border-b p-2">
        <Input
          aria-label="Search jobs"
          placeholder="Search jobs…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : jobList.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No jobs found
          </div>
        ) : (
          <>
            {renderGroup('Running', filtered.running)}
            {renderGroup('Completed', filtered.completed)}
            {renderGroup('Failed / Other', filtered.other)}
            {filtered.running.length === 0 &&
              filtered.completed.length === 0 &&
              filtered.other.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No matching jobs
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LogViewerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialJobId = searchParams.get('jobId') ?? undefined;

  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(initialJobId);
  const [jobSearch, setJobSearch] = useState('');
  const [filters, setFilters] = useState<LogFilterState>({ ...DEFAULT_FILTER_STATE });

  // Fetch jobs for selector
  const { data: jobsResponse, isLoading: jobsLoading } = useJobs({ limit: 50 });
  const jobList = jobsResponse?.data ?? [];

  // Determine if selected job is running
  const selectedJob = useMemo(
    () => jobList.find((j) => j.id === selectedJobId),
    [jobList, selectedJobId],
  );
  const jobRunning = selectedJob ? isJobRunning(selectedJob.status) : false;

  // Fetch historical logs
  const {
    data: logsResponse,
    isLoading: logsLoading,
    error: logsError,
    refetch,
  } = useJobLogs(selectedJobId);

  // SSE stream for running jobs
  const { streamedLogs, isStreaming, streamError } = useLogStream({
    jobId: selectedJobId,
    enabled: jobRunning,
  });

  // Merge historical + streamed logs
  const allLogs = useMemo<LogEntry[]>(() => {
    const historical = logsResponse?.data ?? [];
    if (!jobRunning) return historical;
    return [...historical, ...streamedLogs];
  }, [logsResponse?.data, streamedLogs, jobRunning]);

  // Filtered logs for copy/download
  const visibleLogs = useMemo(() => filterLogs(allLogs, filters), [allLogs, filters]);

  const handleSelectJob = useCallback(
    (jobId: string) => {
      setSelectedJobId(jobId);
      setSearchParams({ jobId });
    },
    [setSearchParams],
  );

  // Copy visible logs to clipboard
  const handleCopy = useCallback(async () => {
    const text = visibleLogs
      .map((l) => `${l.timestamp} [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
  }, [visibleLogs]);

  // Download full log as .log file
  const handleDownload = useCallback(() => {
    const text = visibleLogs
      .map((l) => `${l.timestamp} [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-${selectedJobId ?? 'unknown'}-logs.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [visibleLogs, selectedJobId]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-xl font-semibold">Log Viewer</h2>
        <div className="flex items-center gap-2">
          {selectedJobId && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={visibleLogs.length === 0}
                aria-label="Copy logs"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={visibleLogs.length === 0}
                aria-label="Download logs"
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Download
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Job selector sidebar */}
        <JobSelector
          jobs={jobList}
          selectedJobId={selectedJobId}
          onSelect={handleSelectJob}
          search={jobSearch}
          onSearchChange={setJobSearch}
          isLoading={jobsLoading}
        />

        {/* Log content */}
        <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
          {!selectedJobId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select a job from the sidebar to view its logs
            </div>
          ) : (
            <>
              {/* Filters */}
              <LogFilters filters={filters} onChange={setFilters} />

              {/* Stream error */}
              {streamError && (
                <div className="flex items-center gap-2 rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {streamError}
                </div>
              )}

              {/* Error state */}
              {logsError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3" role="alert">
                  <p className="text-sm font-medium text-destructive">Failed to fetch logs</p>
                  <p className="text-xs text-muted-foreground">{logsError.message}</p>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    Retry
                  </Button>
                </div>
              ) : (
                /* Log stream */
                <LogStream
                  logs={allLogs}
                  filters={filters}
                  isStreaming={isStreaming}
                  isLoading={logsLoading}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
