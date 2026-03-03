import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  RefreshCw,
  Package as PackageIcon,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { PackageStatus } from '@smithy/shared';
import { PackageType } from '@smithy/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { usePackages } from '@/api/hooks/use-packages';
import type { Package } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const LIMIT_OPTIONS = [10, 25, 50];
const DEBOUNCE_MS = 300;

type SortDirection = 'asc' | 'desc';
type SortField = 'type' | 'status' | 'createdAt';

interface SortState {
  field: SortField;
  direction: SortDirection;
}

// ---------------------------------------------------------------------------
// Status helpers
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
    className: 'bg-gray-100 text-gray-800 border-gray-200 line-through',
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status.toUpperCase()] ?? {
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
// Type badge
// ---------------------------------------------------------------------------

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

function TypeBadge({ type }: { type: string }) {
  const config = TYPE_CONFIG[type.toUpperCase()] ?? {
    label: type,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loading rows
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-8 w-8 animate-pulse rounded bg-muted" />
      </TableCell>
    </TableRow>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sort header
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: SortField;
  sort: SortState | null;
  onSort: (field: SortField) => void;
}) {
  const isActive = sort?.field === field;
  const Icon = isActive
    ? sort.direction === 'asc'
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => onSort(field)}
    >
      {label}
      <Icon className="ml-2 h-4 w-4" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------

function RowActions({ pkg }: { pkg: Package }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open actions for {pkg.id}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => navigate(`/packages/${pkg.id}`)}>
          View
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <PackageIcon className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="text-lg font-semibold">No Packages yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Packages are units of work that flow through Assembly Lines and Worker
        Pools. Submit a Package to an Assembly Line or Worker Pool to get
        started.
      </p>
    </div>
  );
}

function NoResultsState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <PackageIcon className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="text-lg font-semibold">No Packages match your filters</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Try adjusting your search or filter criteria.
      </p>
      <Button variant="outline" className="mt-4" onClick={onClear}>
        <X className="mr-2 h-4 w-4" />
        Clear filters
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
      <h3 className="text-lg font-semibold">Failed to load Packages</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function PaginationControls({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      <p className="text-sm text-muted-foreground">
        {total > 0
          ? `Showing ${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total} Packages`
          : `Page ${page}`}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="limit-select" className="text-sm text-muted-foreground">
            Per page:
          </label>
          <select
            id="limit-select"
            className="rounded border bg-background px-2 py-1 text-sm"
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
          >
            {LIMIT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages || 1}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

function FilterBar({
  search,
  onSearchChange,
  typeFilter,
  onTypeChange,
  statusFilters,
  onStatusChange,
  createdAfter,
  onCreatedAfterChange,
  createdBefore,
  onCreatedBeforeChange,
  hasActiveFilters,
  onClearFilters,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  typeFilter: string;
  onTypeChange: (v: string) => void;
  statusFilters: string[];
  onStatusChange: (statuses: string[]) => void;
  createdAfter: string;
  onCreatedAfterChange: (v: string) => void;
  createdBefore: string;
  onCreatedBeforeChange: (v: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) {
  const allStatuses = Object.values(PackageStatus);

  const handleStatusToggle = (status: string) => {
    if (statusFilters.includes(status)) {
      onStatusChange(statusFilters.filter((s) => s !== status));
    } else {
      onStatusChange([...statusFilters, status]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="min-w-[200px] flex-1">
          <label htmlFor="pkg-search" className="mb-1 block text-sm font-medium">
            Search
          </label>
          <Input
            id="pkg-search"
            placeholder="Search by ID or metadata…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Type filter */}
        <div className="w-[180px]">
          <label htmlFor="type-filter" className="mb-1 block text-sm font-medium">
            Type
          </label>
          <select
            id="type-filter"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={typeFilter}
            onChange={(e) => onTypeChange(e.target.value)}
          >
            <option value="">All types</option>
            {Object.entries(PackageType).map(([key, value]) => (
              <option key={key} value={value}>
                {TYPE_CONFIG[value]?.label ?? value}
              </option>
            ))}
          </select>
        </div>

        {/* Created after */}
        <div className="w-[180px]">
          <label htmlFor="created-after" className="mb-1 block text-sm font-medium">
            Created after
          </label>
          <Input
            id="created-after"
            type="date"
            value={createdAfter}
            onChange={(e) => onCreatedAfterChange(e.target.value)}
          />
        </div>

        {/* Created before */}
        <div className="w-[180px]">
          <label htmlFor="created-before" className="mb-1 block text-sm font-medium">
            Created before
          </label>
          <Input
            id="created-before"
            type="date"
            value={createdBefore}
            onChange={(e) => onCreatedBeforeChange(e.target.value)}
          />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="mr-1 h-4 w-4" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Status multi-select */}
      <div>
        <p className="mb-1 text-sm font-medium">Status</p>
        <div className="flex flex-wrap gap-2">
          {allStatuses.map((status) => {
            const config = STATUS_CONFIG[status] ?? { label: status, className: '' };
            const selected = statusFilters.includes(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => handleStatusToggle(status)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selected
                    ? config.className
                    : 'border-border bg-background text-muted-foreground hover:bg-accent'
                }`}
                aria-pressed={selected}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncateId(id: string): string {
  return id.slice(0, 8);
}

// ---------------------------------------------------------------------------
// useDebouncedValue hook
// ---------------------------------------------------------------------------

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function PackageListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read filter state from URL
  const page = Number(searchParams.get('page')) || DEFAULT_PAGE;
  const limit = Number(searchParams.get('limit')) || DEFAULT_LIMIT;
  const urlSearch = searchParams.get('search') ?? '';
  const urlType = searchParams.get('type') ?? '';
  const urlStatus = searchParams.get('status') ?? '';
  const urlCreatedAfter = searchParams.get('createdAfter') ?? '';
  const urlCreatedBefore = searchParams.get('createdBefore') ?? '';

  // Local search state for debouncing
  const [searchInput, setSearchInput] = useState(urlSearch);
  const debouncedSearch = useDebouncedValue(searchInput, DEBOUNCE_MS);
  const isInitialMount = useRef(true);

  // Sync debounced search to URL params (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (debouncedSearch) {
        next.set('search', debouncedSearch);
      } else {
        next.delete('search');
      }
      next.set('page', '1');
      return next;
    });
  }, [debouncedSearch, setSearchParams]);

  const statusFilters = urlStatus ? urlStatus.split(',') : [];

  const [sort, setSort] = useState<SortState | null>(null);

  // Build query params
  const queryParams = {
    page,
    limit,
    ...(urlSearch ? { search: urlSearch } : {}),
    ...(urlType ? { type: urlType } : {}),
    ...(urlStatus ? { status: urlStatus } : {}),
    ...(urlCreatedAfter ? { createdAfter: new Date(urlCreatedAfter).toISOString() } : {}),
    ...(urlCreatedBefore ? { createdBefore: new Date(urlCreatedBefore).toISOString() } : {}),
    ...(sort ? { sort: `${sort.field}:${sort.direction}` } : {}),
  };

  const { data, isLoading, error, refetch } = usePackages(queryParams);

  const items = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.ceil(total / limit) || 1;

  const hasActiveFilters =
    !!urlSearch || !!urlType || !!urlStatus || !!urlCreatedAfter || !!urlCreatedBefore;
  const isEmpty = !isLoading && !error && items.length === 0;
  const isNoResults = isEmpty && hasActiveFilters;
  const isNoData = isEmpty && !hasActiveFilters;

  // --- Handlers ---

  const updateParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        next.set('page', '1');
        return next;
      });
    },
    [setSearchParams],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', String(newPage));
        return next;
      });
    },
    [setSearchParams],
  );

  const handleLimitChange = useCallback(
    (newLimit: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('limit', String(newLimit));
        next.set('page', '1');
        return next;
      });
    },
    [setSearchParams],
  );

  const handleSort = useCallback((field: SortField) => {
    setSort((prev) => {
      if (prev?.field === field) {
        return prev.direction === 'asc'
          ? { field, direction: 'desc' }
          : null;
      }
      return { field, direction: 'asc' };
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchInput('');
    setSearchParams((prev) => {
      const next = new URLSearchParams();
      const currentLimit = prev.get('limit');
      if (currentLimit) next.set('limit', currentLimit);
      return next;
    });
  }, [setSearchParams]);

  const handleStatusChange = useCallback(
    (statuses: string[]) => {
      updateParam('status', statuses.join(','));
    },
    [updateParam],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Packages</h2>
      </div>

      {/* Filter bar */}
      <FilterBar
        search={searchInput}
        onSearchChange={setSearchInput}
        typeFilter={urlType}
        onTypeChange={(v) => updateParam('type', v)}
        statusFilters={statusFilters}
        onStatusChange={handleStatusChange}
        createdAfter={urlCreatedAfter}
        onCreatedAfterChange={(v) => updateParam('createdAfter', v)}
        createdBefore={urlCreatedBefore}
        onCreatedBeforeChange={(v) => updateParam('createdBefore', v)}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
      />

      {/* Error */}
      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      {/* Empty: no data at all */}
      {isNoData && <EmptyState />}

      {/* Empty: filters returned nothing */}
      {isNoResults && <NoResultsState onClear={handleClearFilters} />}

      {/* Table */}
      {!error && !isEmpty && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>
                  <SortableHeader
                    label="Type"
                    field="type"
                    sort={sort}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    label="Status"
                    field="status"
                    sort={sort}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>Workflow</TableHead>
                <TableHead>
                  <SortableHeader
                    label="Created"
                    field="createdAt"
                    sort={sort}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="w-[50px]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : (
                items.map((pkg) => (
                  <PackageRow key={pkg.id} pkg={pkg} />
                ))
              )}
            </TableBody>
          </Table>

          {!isLoading && (
            <PaginationControls
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table row
// ---------------------------------------------------------------------------

function PackageRow({ pkg }: { pkg: Package }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">
        <Link
          to={`/packages/${pkg.id}`}
          className="text-primary underline-offset-4 hover:underline"
          title={pkg.id}
        >
          {truncateId(pkg.id)}
        </Link>
      </TableCell>
      <TableCell>
        <TypeBadge type={pkg.type} />
      </TableCell>
      <TableCell>
        <StatusBadge status={pkg.status} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {pkg.assemblyLineId ? (
          <Link
            to={`/assembly-lines/${pkg.assemblyLineId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Assembly Line
          </Link>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(pkg.createdAt)}
      </TableCell>
      <TableCell>
        <RowActions pkg={pkg} />
      </TableCell>
    </TableRow>
  );
}
