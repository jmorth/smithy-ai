import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Pause,
  Play,
  Pencil,
  AlertCircle,
  RefreshCw,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PackageSubmitDialog } from '@/components/package-submit-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useAssemblyLine,
  useAssemblyLinePackages,
  useUpdateAssemblyLine,
  assemblyLineKeys,
} from '@/api/hooks/use-assembly-lines';
import { socketManager } from '@/api/socket';
import { RoutingKeys } from '@smithy/shared';
import type { Package } from '@smithy/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  PipelineVisualization,
  type PipelineStep,
  type StepStatus,
} from './assembly-lines/components/pipeline-visualization';
import { PackageTracker } from './assembly-lines/components/package-tracker';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const LINE_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  PAUSED: {
    label: 'Paused',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  ARCHIVED: {
    label: 'Archived',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
  ERROR: {
    label: 'Error',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveStepStatus(
  stepNumber: number,
  processingSteps: Set<number>,
  errorSteps: Set<number>,
  completedSteps: Set<number>,
): StepStatus {
  if (errorSteps.has(stepNumber)) return 'error';
  if (processingSteps.has(stepNumber)) return 'processing';
  if (completedSteps.has(stepNumber)) return 'completed';
  return 'idle';
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
      <div className="flex items-center gap-2 py-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <div className="h-4 w-6 animate-pulse rounded bg-muted" />}
            <div className="h-24 w-36 animate-pulse rounded-lg bg-muted" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
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
      <h3 className="text-lg font-semibold">
        Failed to load Assembly Line
      </h3>
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

export default function AssemblyLineDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Data fetching
  const {
    data: assemblyLine,
    isLoading: lineLoading,
    error: lineError,
    refetch: refetchLine,
  } = useAssemblyLine(slug);

  const {
    data: packagesData,
    isLoading: packagesLoading,
    refetch: refetchPackages,
  } = useAssemblyLinePackages(slug);

  // Local real-time state
  const [realtimePackages, setRealtimePackages] = useState<Map<string, Partial<Package>>>(new Map());
  const [processingSteps, setProcessingSteps] = useState<Set<number>>(new Set());
  const [errorSteps, setErrorSteps] = useState<Set<number>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [compact, setCompact] = useState(false);

  // Submit package dialog
  const [submitOpen, setSubmitOpen] = useState(false);

  // Pause/Resume confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'pause' | 'resume' | null>(null);
  const updateMutation = useUpdateAssemblyLine(slug ?? '');

  // -------------------------------------------------------------------------
  // Socket.IO subscription
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!slug) return;

    const unsubscribers: (() => void)[] = [];

    try {
      socketManager.subscribeAssemblyLine(slug);

      // Package position changes
      unsubscribers.push(
        socketManager.onEvent(
          '/workflows',
          RoutingKeys.PACKAGE_CREATED,
          (event) => {
            const { packageId } = event.payload;
            setRealtimePackages((prev) => {
              const next = new Map(prev);
              next.set(packageId, { id: packageId, status: 'PENDING' as const });
              return next;
            });
            queryClient.invalidateQueries({
              queryKey: [...assemblyLineKeys.all, slug, 'packages'],
            });
          },
        ),
      );

      unsubscribers.push(
        socketManager.onEvent(
          '/workflows',
          RoutingKeys.PACKAGE_PROCESSED,
          (event) => {
            const { packageId } = event.payload;
            setRealtimePackages((prev) => {
              const next = new Map(prev);
              next.set(packageId, {
                ...prev.get(packageId),
                id: packageId,
                status: 'COMPLETED' as const,
              });
              return next;
            });
            queryClient.invalidateQueries({
              queryKey: [...assemblyLineKeys.all, slug, 'packages'],
            });
          },
        ),
      );

      // Step completed
      unsubscribers.push(
        socketManager.onEvent(
          '/workflows',
          RoutingKeys.ASSEMBLY_LINE_STEP_COMPLETED,
          (event) => {
            const { stepIndex } = event.payload;
            setProcessingSteps((prev) => {
              const next = new Set(prev);
              next.delete(stepIndex);
              return next;
            });
            setCompletedSteps((prev) => new Set(prev).add(stepIndex));
          },
        ),
      );

      // Assembly line completed
      unsubscribers.push(
        socketManager.onEvent(
          '/workflows',
          RoutingKeys.ASSEMBLY_LINE_COMPLETED,
          () => {
            queryClient.invalidateQueries({
              queryKey: assemblyLineKeys.detail(slug),
            });
            queryClient.invalidateQueries({
              queryKey: [...assemblyLineKeys.all, slug, 'packages'],
            });
          },
        ),
      );

      // Job state changes (started, completed, failed)
      unsubscribers.push(
        socketManager.onEvent(
          '/workflows',
          RoutingKeys.JOB_STATE_CHANGED,
          (event) => {
            const { newState, packageId } = event.payload;

            // Update package status via real-time overlay
            if (newState === 'WORKING') {
              setRealtimePackages((prev) => {
                const next = new Map(prev);
                next.set(packageId, {
                  ...prev.get(packageId),
                  id: packageId,
                  status: 'PROCESSING' as const,
                });
                return next;
              });
            } else if (newState === 'ERROR') {
              setRealtimePackages((prev) => {
                const next = new Map(prev);
                next.set(packageId, {
                  ...prev.get(packageId),
                  id: packageId,
                  status: 'FAILED' as const,
                });
                return next;
              });
            }

            // Find which step corresponds to this package
            const pkg = packagesData?.data.find((p) => p.id === packageId);
            const step = pkg?.currentStep;

            if (step != null) {
              if (newState === 'WORKING') {
                setProcessingSteps((prev) => new Set(prev).add(step));
                setErrorSteps((prev) => {
                  const next = new Set(prev);
                  next.delete(step);
                  return next;
                });
              } else if (newState === 'ERROR') {
                setErrorSteps((prev) => new Set(prev).add(step));
                setProcessingSteps((prev) => {
                  const next = new Set(prev);
                  next.delete(step);
                  return next;
                });
              } else if (newState === 'DONE') {
                setProcessingSteps((prev) => {
                  const next = new Set(prev);
                  next.delete(step);
                  return next;
                });
                setCompletedSteps((prev) => new Set(prev).add(step));
              }
            }
          },
        ),
      );
    } catch {
      // Socket not connected yet — silently ignore
    }

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
      socketManager.unsubscribe(`assembly-line:${slug}`);
    };
  }, [slug, queryClient, packagesData]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const pipelineSteps: PipelineStep[] = useMemo(() => {
    if (!assemblyLine?.steps) return [];
    return assemblyLine.steps
      .slice()
      .sort((a, b) => a.stepNumber - b.stepNumber)
      .map((step) => ({
        id: step.id,
        stepNumber: step.stepNumber,
        workerName: step.workerVersionId.split(':')[0] ?? step.workerVersionId,
        workerVersion: step.workerVersionId.split(':')[1] ?? '1',
        status: deriveStepStatus(
          step.stepNumber,
          processingSteps,
          errorSteps,
          completedSteps,
        ),
      }));
  }, [assemblyLine, processingSteps, errorSteps, completedSteps]);

  const stepNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const step of pipelineSteps) {
      map.set(step.stepNumber, step.workerName);
    }
    return map;
  }, [pipelineSteps]);

  // Merge real-time overlay with fetched packages
  const mergedPackages: Package[] = useMemo(() => {
    const base = packagesData?.data ?? [];
    if (realtimePackages.size === 0) return base;

    return base.map((pkg) => {
      const overlay = realtimePackages.get(pkg.id);
      if (!overlay) return pkg;
      return { ...pkg, ...overlay } as Package;
    });
  }, [packagesData, realtimePackages]);

  // -------------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------------

  const handleConfirmAction = useCallback(() => {
    if (!confirmAction) return;
    const status = confirmAction === 'pause' ? 'PAUSED' : 'ACTIVE';
    updateMutation.mutate(
      { status: status as 'PAUSED' | 'ACTIVE' },
      {
        onSettled: () => {
          setConfirmOpen(false);
          setConfirmAction(null);
        },
      },
    );
  }, [confirmAction, updateMutation]);

  const openConfirm = useCallback((action: 'pause' | 'resume') => {
    setConfirmAction(action);
    setConfirmOpen(true);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (lineLoading) {
    return <DetailSkeleton />;
  }

  if (lineError) {
    return (
      <ErrorState
        message={lineError.message}
        onRetry={() => refetchLine()}
      />
    );
  }

  if (!assemblyLine) {
    return null;
  }

  const upperStatus = assemblyLine.status.toUpperCase();
  const isPaused = upperStatus === 'PAUSED';
  const isArchived = upperStatus === 'ARCHIVED';
  const statusConfig = LINE_STATUS_CONFIG[upperStatus] ?? {
    label: assemblyLine.status,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  const confirmLabel = confirmAction === 'pause' ? 'Pause' : 'Resume';
  const confirmDescription =
    confirmAction === 'pause'
      ? `Pausing "${assemblyLine.name}" will stop processing new packages. Existing packages in progress will complete.`
      : `Resuming "${assemblyLine.name}" will allow it to process packages again.`;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => navigate('/assembly-lines')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Assembly Lines
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">
              {assemblyLine.name}
            </h2>
            <Badge variant="outline" className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          </div>
          {assemblyLine.description && (
            <p className="text-sm text-muted-foreground">
              {assemblyLine.description}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate(`/assembly-lines/${assemblyLine.slug}/edit`)
            }
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          {!isArchived && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openConfirm(isPaused ? 'resume' : 'pause')}
            >
              {isPaused ? (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </>
              )}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setSubmitOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Submit Package
          </Button>
        </div>
      </div>

      {/* Pipeline visualization */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Pipeline</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCompact((prev) => !prev)}
            aria-label={compact ? 'Expand pipeline' : 'Collapse pipeline'}
          >
            {compact ? (
              <Maximize2 className="h-4 w-4" />
            ) : (
              <Minimize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
        <PipelineVisualization
          steps={pipelineSteps}
          isLoading={lineLoading}
          compact={compact}
        />
      </div>

      {/* Package tracker */}
      <PackageTracker
        packages={mergedPackages}
        stepNames={stepNames}
        isLoading={packagesLoading}
        hasMore={
          packagesData
            ? packagesData.data.length < packagesData.total
            : false
        }
        onLoadMore={() => refetchPackages()}
      />

      {/* Submit package dialog */}
      {slug && (
        <PackageSubmitDialog
          target={{ type: 'assembly-line', slug }}
          open={submitOpen}
          onOpenChange={setSubmitOpen}
        />
      )}

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmLabel} Assembly Line</DialogTitle>
            <DialogDescription>{confirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {`${confirmLabel}ing\u2026`}
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
