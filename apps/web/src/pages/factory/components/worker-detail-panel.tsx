import { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useFactoryStore } from '@/stores/factory.store';
import type { WorkerState } from '@smithy/shared';

// ---------------------------------------------------------------------------
// State → badge variant mapping
// ---------------------------------------------------------------------------

const STATE_VARIANT: Record<WorkerState, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  WAITING: 'secondary',
  WORKING: 'default',
  STUCK: 'outline',
  ERROR: 'destructive',
  DONE: 'default',
};

const STATE_EXTRA_CLASS: Record<WorkerState, string> = {
  WAITING: '',
  WORKING: '',
  STUCK: 'border-amber-400 bg-amber-100 text-amber-800',
  ERROR: '',
  DONE: 'border-green-400 bg-green-100 text-green-800',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkerDetailPanel() {
  const selectedMachine = useFactoryStore((s) => s.selectedMachine);
  const workerMachines = useFactoryStore((s) => s.workerMachines);
  const selectMachine = useFactoryStore((s) => s.selectMachine);
  const panelRef = useRef<HTMLDivElement>(null);

  const machine = selectedMachine ? workerMachines.get(selectedMachine) : undefined;

  const handleClose = useCallback(() => {
    selectMachine(null);
  }, [selectMachine]);

  useEffect(() => {
    if (!machine) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [machine, handleClose]);

  if (!machine) return null;

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto absolute right-0 top-0 h-full w-full sm:w-96 bg-background/90 backdrop-blur-sm border-l shadow-lg overflow-y-auto transition-transform duration-300"
      data-testid="worker-detail-panel"
      role="dialog"
      aria-label={`Worker details: ${machine.name}`}
    >
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-semibold truncate pr-2">
            {machine.name}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={handleClose}
            data-testid="close-worker-panel"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* State badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">State</span>
            <Badge
              variant={STATE_VARIANT[machine.state]}
              className={STATE_EXTRA_CLASS[machine.state]}
              data-testid="worker-state-badge"
            >
              {machine.state}
            </Badge>
          </div>

          {/* Progress bar for WORKING state */}
          {machine.state === 'WORKING' && (
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">Progress</span>
              <Progress indeterminate />
            </div>
          )}

          <Separator />

          {/* Worker details */}
          <div className="space-y-3">
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Worker ID
              </span>
              <p className="text-sm font-mono mt-0.5">{machine.workerId}</p>
            </div>

            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Position
              </span>
              <p className="text-sm font-mono mt-0.5">
                ({machine.position.tileX}, {machine.position.tileY})
              </p>
            </div>
          </div>

          <Separator />

          {/* Configuration summary */}
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Configuration
            </span>
            <div className="mt-1 rounded-md bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Machine ID</span>
                <span className="font-mono text-xs">{selectedMachine}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
