import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { Worker, WorkerVersion } from '@smithy/shared';
import type { WorkerDetail } from '@/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StepItem {
  id: string;
  workerId: string;
  workerSlug: string;
  workerName: string;
  versionId: string;
  version: string;
}

interface StepEditorProps {
  steps: StepItem[];
  onStepsChange: (steps: StepItem[]) => void;
  workers: WorkerDetail[] | Worker[];
  isLoadingWorkers: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Sortable Step Card
// ---------------------------------------------------------------------------

function SortableStepCard({
  step,
  index,
  onRemove,
}: {
  step: StepItem;
  index: number;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border bg-card p-3"
      data-testid={`step-card-${index}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label={`Drag to reorder step ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{step.workerName}</p>
        <p className="text-sm text-muted-foreground">v{step.version}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(step.id)}
        aria-label={`Remove step ${index + 1}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Worker Selector Dialog
// ---------------------------------------------------------------------------

function WorkerSelectorDialog({
  open,
  onOpenChange,
  workers,
  isLoading,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workers: WorkerDetail[] | Worker[];
  isLoading: boolean;
  onSelect: (worker: WorkerDetail | Worker, version: WorkerVersion) => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedWorker, setSelectedWorker] = useState<
    (WorkerDetail | Worker) | null
  >(null);
  const [selectedVersion, setSelectedVersion] = useState<WorkerVersion | null>(
    null,
  );

  const filteredWorkers = useMemo(() => {
    if (!search.trim()) return workers;
    const term = search.toLowerCase();
    return workers.filter((w) => w.name.toLowerCase().includes(term));
  }, [workers, search]);

  const versions = useMemo(() => {
    if (!selectedWorker) return [];
    return (selectedWorker as WorkerDetail).versions ?? [];
  }, [selectedWorker]);

  const handleWorkerClick = useCallback(
    (worker: WorkerDetail | Worker) => {
      setSelectedWorker(worker);
      const workerVersions = (worker as WorkerDetail).versions ?? [];
      if (workerVersions.length > 0) {
        setSelectedVersion(workerVersions[0]!);
      } else {
        setSelectedVersion(null);
      }
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    if (selectedWorker && selectedVersion) {
      onSelect(selectedWorker, selectedVersion);
      setSearch('');
      setSelectedWorker(null);
      setSelectedVersion(null);
      onOpenChange(false);
    }
  }, [selectedWorker, selectedVersion, onSelect, onOpenChange]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setSearch('');
        setSelectedWorker(null);
        setSelectedVersion(null);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[80vh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Worker</DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Search workers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search workers"
        />

        <div className="max-h-60 overflow-y-auto">
          {isLoading && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Loading workers...
            </p>
          )}

          {!isLoading && filteredWorkers.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No workers found
            </p>
          )}

          {!isLoading &&
            filteredWorkers.map((worker) => (
              <button
                type="button"
                key={worker.id}
                className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent ${
                  selectedWorker?.id === worker.id
                    ? 'bg-accent font-medium'
                    : ''
                }`}
                onClick={() => handleWorkerClick(worker)}
              >
                {worker.name}
              </button>
            ))}
        </div>

        {selectedWorker && versions.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium">Version</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedVersion?.id ?? ''}
              onChange={(e) => {
                const v = versions.find((ver) => ver.id === e.target.value);
                if (v) setSelectedVersion(v);
              }}
              aria-label="Select version"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedWorker && versions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No versions available for this worker.
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            type="button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedWorker || !selectedVersion}
            type="button"
          >
            Add Step
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Step Editor
// ---------------------------------------------------------------------------

let nextStepId = 1;

function generateStepId(): string {
  return `step-${nextStepId++}`;
}

export { generateStepId as _generateStepId };

export default function StepEditor({
  steps,
  onStepsChange,
  workers,
  isLoadingWorkers,
  error,
}: StepEditorProps) {
  const [selectorOpen, setSelectorOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = steps.findIndex((s) => s.id === active.id);
        const newIndex = steps.findIndex((s) => s.id === over.id);
        onStepsChange(arrayMove(steps, oldIndex, newIndex));
      }
    },
    [steps, onStepsChange],
  );

  const handleRemove = useCallback(
    (id: string) => {
      onStepsChange(steps.filter((s) => s.id !== id));
    },
    [steps, onStepsChange],
  );

  const handleWorkerSelect = useCallback(
    (worker: WorkerDetail | Worker, version: WorkerVersion) => {
      const newStep: StepItem = {
        id: generateStepId(),
        workerId: worker.id,
        workerSlug: worker.slug,
        workerName: worker.name,
        versionId: version.id,
        version: version.version,
      };
      onStepsChange([...steps, newStep]);
    },
    [steps, onStepsChange],
  );

  const stepIds = useMemo(() => steps.map((s) => s.id), [steps]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Steps</label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSelectorOpen(true)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add Step
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {steps.length === 0 && (
        <div className="rounded-lg border border-dashed py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No steps added yet. Click "Add Step" to add workers to the pipeline.
          </p>
        </div>
      )}

      {steps.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={stepIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2" role="list" aria-label="Pipeline steps">
              {steps.map((step, i) => (
                <div role="listitem" key={step.id}>
                  <SortableStepCard
                    step={step}
                    index={i}
                    onRemove={handleRemove}
                  />
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <WorkerSelectorDialog
        open={selectorOpen}
        onOpenChange={setSelectorOpen}
        workers={workers}
        isLoading={isLoadingWorkers}
        onSelect={handleWorkerSelect}
      />
    </div>
  );
}
