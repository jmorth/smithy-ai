// ---------------------------------------------------------------------------
// Pool utilization visualization
//
// Horizontal progress bar with color coding:
//   green  (< 70%) | yellow (70-90%) | red (> 90%)
// Shows "activeJobs / maxConcurrency" as text with percentage.
// ---------------------------------------------------------------------------

export interface PoolStatusProps {
  activeJobs: number;
  maxConcurrency: number;
}

function getColorClass(pct: number): string {
  if (pct > 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

function getTrackClass(pct: number): string {
  if (pct > 90) return 'bg-red-100';
  if (pct >= 70) return 'bg-yellow-100';
  return 'bg-green-100';
}

export function PoolStatus({ activeJobs, maxConcurrency }: PoolStatusProps) {
  const pct = maxConcurrency > 0
    ? Math.min(Math.round((activeJobs / maxConcurrency) * 100), 100)
    : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {activeJobs} / {maxConcurrency}
        </span>
        <span className="text-muted-foreground" data-testid="pool-pct">
          {pct}%
        </span>
      </div>
      <div
        className={`h-2 w-full overflow-hidden rounded-full ${getTrackClass(pct)}`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Pool utilization"
      >
        <div
          className={`h-full rounded-full transition-all ${getColorClass(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
