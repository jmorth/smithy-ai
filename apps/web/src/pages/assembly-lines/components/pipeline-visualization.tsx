import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StepStatus = 'idle' | 'processing' | 'completed' | 'error';

export interface PipelineStep {
  id: string;
  stepNumber: number;
  workerName: string;
  workerVersion: string;
  status: StepStatus;
}

interface PipelineVisualizationProps {
  steps: PipelineStep[];
  isLoading?: boolean;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Status color map
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<
  StepStatus,
  { border: string; bg: string; text: string; dot: string }
> = {
  idle: {
    border: 'border-gray-200',
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
  },
  processing: {
    border: 'border-blue-300',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  completed: {
    border: 'border-green-300',
    bg: 'bg-green-50',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
  error: {
    border: 'border-red-300',
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
};

const STATUS_LABELS: Record<StepStatus, string> = {
  idle: 'Idle',
  processing: 'Processing',
  completed: 'Completed',
  error: 'Error',
};

// ---------------------------------------------------------------------------
// Arrow connector between steps
// ---------------------------------------------------------------------------

function StepArrow() {
  return (
    <div className="flex shrink-0 items-center px-1" aria-hidden="true">
      <svg width="24" height="16" viewBox="0 0 24 16" fill="none">
        <path
          d="M0 8h20M16 3l5 5-5 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step box
// ---------------------------------------------------------------------------

function StepBox({ step }: { step: PipelineStep }) {
  const styles = STATUS_STYLES[step.status];

  return (
    <div
      data-testid={`step-${step.stepNumber}`}
      className={cn(
        'flex min-w-[140px] shrink-0 flex-col rounded-lg border-2 p-3',
        styles.border,
        styles.bg,
        step.status === 'processing' && 'animate-pulse',
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Step {step.stepNumber}
        </span>
        <span
          className={cn('h-2 w-2 rounded-full', styles.dot)}
          aria-label={`Status: ${STATUS_LABELS[step.status]}`}
        />
      </div>
      <span className={cn('text-sm font-semibold', styles.text)}>
        {step.workerName}
      </span>
      <span className="text-xs text-muted-foreground">
        v{step.workerVersion}
      </span>
      <span className={cn('mt-1 text-xs font-medium', styles.text)}>
        {STATUS_LABELS[step.status]}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact step (mini-map mode)
// ---------------------------------------------------------------------------

function CompactStep({ step }: { step: PipelineStep }) {
  const styles = STATUS_STYLES[step.status];

  return (
    <div
      data-testid={`compact-step-${step.stepNumber}`}
      title={`Step ${step.stepNumber}: ${step.workerName} (${STATUS_LABELS[step.status]})`}
      className={cn(
        'h-6 w-10 rounded border',
        styles.border,
        styles.bg,
        step.status === 'processing' && 'animate-pulse',
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PipelineSkeleton() {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 && (
            <div className="h-4 w-6 animate-pulse rounded bg-muted" />
          )}
          <div className="h-24 w-36 animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PipelineVisualization({
  steps,
  isLoading,
  compact = false,
}: PipelineVisualizationProps) {
  if (isLoading) {
    return <PipelineSkeleton />;
  }

  if (steps.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No steps configured for this assembly line.
      </p>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1 overflow-x-auto py-1">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-1">
            {i > 0 && (
              <div className="h-px w-3 bg-muted-foreground/40" aria-hidden="true" />
            )}
            <CompactStep step={step} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex items-center overflow-x-auto py-2"
      role="list"
      aria-label="Pipeline steps"
    >
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center" role="listitem">
          {i > 0 && <StepArrow />}
          <StepBox step={step} />
        </div>
      ))}
    </div>
  );
}
