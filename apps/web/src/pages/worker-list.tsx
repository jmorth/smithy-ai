import { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  AlertCircle,
  RefreshCw,
  Cpu,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useWorkers } from '@/api/hooks/use-workers';
import type { Worker } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const VERSION_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  DEPRECATED: {
    label: 'Deprecated',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
};

function VersionStatusBadge({ status }: { status: string }) {
  const config = VERSION_STATUS_CONFIG[status.toUpperCase()] ?? {
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
// Skeleton cards
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <Card className="p-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-5 w-12 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="flex gap-1">
          <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </Card>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Cpu className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="text-lg font-semibold">No Workers yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Workers are AI-powered processing units that handle Packages. Register
        your first Worker to get started.
      </p>
      <Button asChild className="mt-4">
        <Link to="/workers/create">
          <Plus className="mr-2 h-4 w-4" />
          Register your first Worker
        </Link>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// No results state
// ---------------------------------------------------------------------------

function NoResultsState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Search className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="text-lg font-semibold">No Workers found</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        No Workers match your search criteria. Try a different search term.
      </p>
      <Button variant="outline" className="mt-4" onClick={onClear}>
        Clear search
      </Button>
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
      <h3 className="text-lg font-semibold">Failed to load Workers</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Worker card
// ---------------------------------------------------------------------------

interface WorkerWithVersions extends Worker {
  versions?: Array<{
    id: string;
    version: string;
    status: string;
    yamlConfig: {
      name?: string;
      inputTypes?: string[];
      outputType?: string;
      [key: string]: unknown;
    };
  }>;
}

function WorkerCard({ worker }: { worker: WorkerWithVersions }) {
  const latestVersion = worker.versions?.[0];
  const inputTypes = latestVersion?.yamlConfig?.inputTypes ?? [];
  const outputType = latestVersion?.yamlConfig?.outputType;
  const versionStatus = latestVersion?.status ?? 'ACTIVE';

  return (
    <Link
      to={`/workers/${worker.slug}`}
      className="block transition-shadow hover:shadow-md"
      data-testid={`worker-card-${worker.slug}`}
    >
      <Card className="h-full p-5">
        <div className="space-y-3">
          {/* Name + version */}
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold truncate">{worker.name}</h3>
            {latestVersion && (
              <Badge variant="outline" className="ml-2 shrink-0">
                v{latestVersion.version}
              </Badge>
            )}
          </div>

          {/* Description */}
          {worker.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {worker.description}
            </p>
          )}

          {/* Input types */}
          {inputTypes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1">In:</span>
              {inputTypes.map((type) => (
                <Badge
                  key={type}
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-200 text-xs"
                >
                  {type}
                </Badge>
              ))}
            </div>
          )}

          {/* Output type */}
          {outputType && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Out:</span>
              <Badge
                variant="outline"
                className="bg-purple-50 text-purple-700 border-purple-200 text-xs"
              >
                {outputType}
              </Badge>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center justify-end pt-1">
            <VersionStatusBadge status={versionStatus} />
          </div>
        </div>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function WorkerListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlSearch = searchParams.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(urlSearch);
  const debouncedSearch = useDebouncedValue(searchInput, DEBOUNCE_MS);

  // Sync debounced search to URL params
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (debouncedSearch) {
        next.set('search', debouncedSearch);
      } else {
        next.delete('search');
      }
      return next;
    });
  }, [debouncedSearch, setSearchParams]);

  const { data, isLoading, error, refetch } = useWorkers(
    debouncedSearch ? { name: debouncedSearch } : undefined,
  );

  const workers = (data ?? []) as WorkerWithVersions[];
  const isEmpty = !isLoading && !error && workers.length === 0;
  const isNoResults = isEmpty && !!debouncedSearch;
  const isEmptyState = isEmpty && !debouncedSearch;

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Workers</h2>
        <Button onClick={() => navigate('/workers/create')}>
          <Plus className="mr-2 h-4 w-4" />
          Register Worker
        </Button>
      </div>

      {/* Search */}
      {!isEmptyState && (
        <div className="flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search Workers by name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      {/* Loading */}
      {isLoading && <CardGridSkeleton />}

      {/* Empty */}
      {isEmptyState && <EmptyState />}

      {/* No results */}
      {isNoResults && <NoResultsState onClear={handleClearSearch} />}

      {/* Card grid */}
      {!isLoading && !error && workers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} />
          ))}
        </div>
      )}
    </div>
  );
}
