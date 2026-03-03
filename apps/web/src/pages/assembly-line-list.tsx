import { useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  RefreshCw,
  Factory,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useAssemblyLines,
  useUpdateAssemblyLine,
} from '@/api/hooks/use-assembly-lines';
import type { AssemblyLine } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

type SortDirection = 'asc' | 'desc';
type SortField = 'name' | 'status' | 'createdAt';

interface SortState {
  field: SortField;
  direction: SortDirection;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
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
// Skeleton loading rows
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-8 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-8 animate-pulse rounded bg-muted" />
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
// Actions dropdown with confirmation dialog
// ---------------------------------------------------------------------------

function RowActions({ line }: { line: AssemblyLine }) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    'pause' | 'resume' | 'archive' | null
  >(null);

  const upperStatus = line.status.toUpperCase();
  const isPaused = upperStatus === 'PAUSED';
  const isArchived = upperStatus === 'ARCHIVED';

  const mutation = useUpdateAssemblyLine(line.slug);

  const handleConfirm = useCallback(() => {
    if (!pendingAction) return;

    const statusMap = {
      pause: 'PAUSED' as const,
      resume: 'ACTIVE' as const,
      archive: 'ARCHIVED' as const,
    };

    mutation.mutate(
      { status: statusMap[pendingAction] },
      {
        onSettled: () => {
          setConfirmOpen(false);
          setPendingAction(null);
        },
      },
    );
  }, [pendingAction, mutation]);

  const openConfirm = useCallback(
    (action: 'pause' | 'resume' | 'archive') => {
      setPendingAction(action);
      setConfirmOpen(true);
    },
    [],
  );

  const actionLabel =
    pendingAction === 'pause'
      ? 'Pause'
      : pendingAction === 'resume'
        ? 'Resume'
        : 'Archive';

  const actionDescription =
    pendingAction === 'pause'
      ? `Pausing "${line.name}" will stop processing new packages. Existing packages in progress will complete.`
      : pendingAction === 'resume'
        ? `Resuming "${line.name}" will allow it to process packages again.`
        : `Archiving "${line.name}" will remove it from the active list. This action can be reversed.`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open actions for {line.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => navigate(`/assembly-lines/${line.slug}`)}>
            View
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {!isArchived && (
            <DropdownMenuItem onClick={() => openConfirm(isPaused ? 'resume' : 'pause')}>
              {isPaused ? 'Resume' : 'Pause'}
            </DropdownMenuItem>
          )}
          {!isArchived && (
            <DropdownMenuItem onClick={() => openConfirm('archive')}>
              Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionLabel} Assembly Line</DialogTitle>
            <DialogDescription>{actionDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={pendingAction === 'archive' ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {`${actionLabel}ing\u2026`}
                </>
              ) : (
                actionLabel
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Factory className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="text-lg font-semibold">No Assembly Lines yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Assembly Lines define the sequence of workers that process your packages.
        Create your first one to get started.
      </p>
      <Button asChild className="mt-4">
        <Link to="/assembly-lines/create">
          <Plus className="mr-2 h-4 w-4" />
          Create your first Assembly Line
        </Link>
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
    <div role="alert" className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
      <h3 className="text-lg font-semibold">Failed to load Assembly Lines</h3>
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

function Pagination({
  page,
  hasNext,
  onPageChange,
}: {
  page: number;
  hasNext: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      <p className="text-sm text-muted-foreground">Page {page}</p>
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
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function AssemblyLineListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const page = Number(searchParams.get('page')) || DEFAULT_PAGE;
  const limit = Number(searchParams.get('limit')) || DEFAULT_LIMIT;

  const [sort, setSort] = useState<SortState | null>(null);

  const { data, isLoading, error, refetch } = useAssemblyLines({
    page,
    limit,
    sort: sort ? `${sort.field}:${sort.direction}` : undefined,
  });

  const handlePageChange = useCallback(
    (newPage: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', String(newPage));
        if (!next.has('limit')) next.set('limit', String(DEFAULT_LIMIT));
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

  const hasNext = (data?.length ?? 0) >= limit;
  const isEmpty = !isLoading && !error && data?.length === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Assembly Lines</h2>
        <Button onClick={() => navigate('/assembly-lines/create')}>
          <Plus className="mr-2 h-4 w-4" />
          Create Assembly Line
        </Button>
      </div>

      {/* Error */}
      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      {/* Empty */}
      {isEmpty && <EmptyState />}

      {/* Table */}
      {!error && !isEmpty && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader
                    label="Name"
                    field="name"
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
                <TableHead>Steps</TableHead>
                <TableHead>Active Packages</TableHead>
                <TableHead className="w-[50px]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : (
                data?.map((line) => (
                  <AssemblyLineRow key={line.id} line={line} />
                ))
              )}
            </TableBody>
          </Table>

          {!isLoading && (
            <Pagination
              page={page}
              hasNext={hasNext}
              onPageChange={handlePageChange}
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

function AssemblyLineRow({ line }: { line: AssemblyLine }) {
  // The AssemblyLine type may include stepCount and activePackageCount from
  // the API even though the shared type doesn't declare them yet.
  const extended = line as AssemblyLine & {
    stepCount?: number;
    activePackageCount?: number;
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link
          to={`/assembly-lines/${line.slug}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {line.name}
        </Link>
      </TableCell>
      <TableCell>
        <StatusBadge status={line.status} />
      </TableCell>
      <TableCell>{extended.stepCount ?? '—'}</TableCell>
      <TableCell>{extended.activePackageCount ?? '—'}</TableCell>
      <TableCell>
        <RowActions line={line} />
      </TableCell>
    </TableRow>
  );
}
