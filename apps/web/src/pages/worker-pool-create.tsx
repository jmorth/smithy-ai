import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCreateWorkerPool } from '@/api/hooks/use-worker-pools';
import { useWorkers } from '@/api/hooks/use-workers';
import type { Worker } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectedWorker {
  workerId: string;
  workerName: string;
  versionId: string;
}

interface FormErrors {
  name?: string;
  members?: string;
  maxConcurrency?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(
  name: string,
  members: SelectedWorker[],
  maxConcurrency: number,
): FormErrors {
  const errors: FormErrors = {};
  if (!name.trim()) {
    errors.name = 'Name is required.';
  }
  if (members.length === 0) {
    errors.members = 'At least 1 Worker member is required.';
  }
  if (maxConcurrency < 1 || maxConcurrency > 50) {
    errors.maxConcurrency = 'Concurrency must be between 1 and 50.';
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Worker member selector component
// ---------------------------------------------------------------------------

export function WorkerMemberSelector({
  workers,
  isLoadingWorkers,
  selected,
  onSelect,
  onRemove,
  error,
}: {
  workers: Worker[];
  isLoadingWorkers: boolean;
  selected: SelectedWorker[];
  onSelect: (worker: SelectedWorker) => void;
  onRemove: (versionId: string) => void;
  error?: string;
}) {
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedVersionIds = useMemo(
    () => new Set(selected.map((s) => s.versionId)),
    [selected],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return workers;
    const term = search.toLowerCase();
    return workers.filter((w) => w.name.toLowerCase().includes(term));
  }, [workers, search]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        Worker Members <span className="text-destructive">*</span>
      </label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="selected-members">
          {selected.map((s) => (
            <Badge key={s.versionId} variant="secondary" className="gap-1">
              {s.workerName}
              <button
                type="button"
                onClick={() => onRemove(s.versionId)}
                className="ml-1 rounded-full hover:bg-muted-foreground/20"
                aria-label={`Remove ${s.workerName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search input + dropdown */}
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search workers..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            className="pl-9"
            aria-label="Search workers"
            aria-invalid={!!error}
            aria-describedby={error ? 'members-error' : undefined}
          />
        </div>

        {dropdownOpen && (
          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md" data-testid="worker-dropdown">
            {isLoadingWorkers ? (
              <div className="p-3 text-center text-sm text-muted-foreground">
                Loading workers...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-center text-sm text-muted-foreground">
                No workers found
              </div>
            ) : (
              filtered.map((worker) => {
                const versionId = worker.id;
                const isSelected = selectedVersionIds.has(versionId);
                return (
                  <button
                    key={worker.id}
                    type="button"
                    disabled={isSelected}
                    className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent ${
                      isSelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    onClick={() => {
                      if (!isSelected) {
                        onSelect({
                          workerId: worker.id,
                          workerName: worker.name,
                          versionId,
                        });
                        setSearch('');
                      }
                    }}
                  >
                    <span className="flex-1">{worker.name}</span>
                    {isSelected && (
                      <span className="text-xs text-muted-foreground">Selected</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {error && (
        <p id="members-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WorkerPoolCreatePage() {
  const navigate = useNavigate();
  const createMutation = useCreateWorkerPool();
  const { data: workerList = [], isLoading: isLoadingWorkers } = useWorkers();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<SelectedWorker[]>([]);
  const [maxConcurrency, setMaxConcurrency] = useState(5);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSelectWorker = useCallback((worker: SelectedWorker) => {
    setMembers((prev) => [...prev, worker]);
    setErrors((prev) => ({ ...prev, members: undefined }));
  }, []);

  const handleRemoveWorker = useCallback((versionId: string) => {
    setMembers((prev) => prev.filter((m) => m.versionId !== versionId));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);

      const validationErrors = validate(name, members, maxConcurrency);
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length > 0) return;

      createMutation.mutate(
        {
          name: name.trim(),
          members: members.map((m) => ({
            workerVersionId: m.versionId,
          })),
          maxConcurrency,
        },
        {
          onSuccess: (pool) => {
            navigate(`/worker-pools/${pool.slug}`);
          },
          onError: (error) => {
            setSubmitError(error.message);
          },
        },
      );
    },
    [name, members, maxConcurrency, createMutation, navigate],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/worker-pools')}
          aria-label="Back to Worker Pools"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-bold tracking-tight">
          Create Worker Pool
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Name */}
        <div className="space-y-1">
          <label htmlFor="wp-name" className="text-sm font-medium">
            Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="wp-name"
            placeholder="My Worker Pool"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'wp-name-error' : undefined}
          />
          {errors.name && (
            <p id="wp-name-error" className="text-sm text-destructive" role="alert">
              {errors.name}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label htmlFor="wp-description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="wp-description"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Describe what this worker pool does..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Worker Members */}
        <WorkerMemberSelector
          workers={workerList}
          isLoadingWorkers={isLoadingWorkers}
          selected={members}
          onSelect={handleSelectWorker}
          onRemove={handleRemoveWorker}
          error={errors.members}
        />

        {/* Max Concurrency */}
        <div className="space-y-1">
          <label htmlFor="wp-concurrency" className="text-sm font-medium">
            Max Concurrency
          </label>
          <div className="flex items-center gap-4">
            <input
              id="wp-concurrency"
              type="range"
              min={1}
              max={50}
              value={maxConcurrency}
              onChange={(e) => {
                setMaxConcurrency(Number(e.target.value));
                if (errors.maxConcurrency)
                  setErrors((prev) => ({ ...prev, maxConcurrency: undefined }));
              }}
              className="flex-1"
              aria-valuenow={maxConcurrency}
              aria-valuemin={1}
              aria-valuemax={50}
            />
            <Input
              type="number"
              min={1}
              max={50}
              value={maxConcurrency}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val >= 1 && val <= 50) {
                  setMaxConcurrency(val);
                  if (errors.maxConcurrency)
                    setErrors((prev) => ({ ...prev, maxConcurrency: undefined }));
                }
              }}
              className="w-20"
              aria-label="Max concurrency value"
            />
          </div>
          {errors.maxConcurrency && (
            <p className="text-sm text-destructive" role="alert">
              {errors.maxConcurrency}
            </p>
          )}
        </div>

        {/* Submit Error */}
        {submitError && (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Worker Pool'
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/worker-pools')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
