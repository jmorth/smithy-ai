import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Package } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PackageTrackerProps {
  packages: Package[];
  stepNames: Map<number, string>;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

type SortDirection = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const PACKAGE_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
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
    className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
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
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
};

const PACKAGE_TYPE_CONFIG: Record<string, { className: string }> = {
  USER_INPUT: { className: 'bg-purple-100 text-purple-800 border-purple-200' },
  SPECIFICATION: { className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  CODE: { className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  IMAGE: { className: 'bg-orange-100 text-orange-800 border-orange-200' },
  PULL_REQUEST: { className: 'bg-pink-100 text-pink-800 border-pink-200' },
};

// ---------------------------------------------------------------------------
// Elapsed duration hook
// ---------------------------------------------------------------------------

function useElapsedDuration(dateString: string): string {
  const [elapsed, setElapsed] = useState(() => computeElapsed(dateString));
  const dateRef = useRef(dateString);

  useEffect(() => {
    dateRef.current = dateString;
    setElapsed(computeElapsed(dateString));
  }, [dateString]);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(computeElapsed(dateRef.current));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return elapsed;
}

function computeElapsed(dateString: string): string {
  const ms = Date.now() - new Date(dateString).getTime();
  if (ms < 0) return '0s';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

// ---------------------------------------------------------------------------
// Filter statuses
// ---------------------------------------------------------------------------

const FILTER_STATUSES = [
  'ALL',
  'PENDING',
  'IN_TRANSIT',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
] as const;

// ---------------------------------------------------------------------------
// Duration cell (ticking)
// ---------------------------------------------------------------------------

function DurationCell({ createdAt }: { createdAt: string }) {
  const elapsed = useElapsedDuration(createdAt);
  return <span>{elapsed}</span>;
}

// ---------------------------------------------------------------------------
// Skeleton rows
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-12 animate-pulse rounded bg-muted" />
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
  active,
  direction,
  onSort,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
}) {
  const Icon = active
    ? direction === 'asc'
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={onSort}>
      {label}
      <Icon className="ml-2 h-4 w-4" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PackageTracker({
  packages,
  stepNames,
  isLoading,
  hasMore,
  onLoadMore,
}: PackageTrackerProps) {
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const handleSort = useCallback(() => {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }, []);

  const filtered =
    statusFilter === 'ALL'
      ? packages
      : packages.filter((p) => p.status === statusFilter);

  const sorted = [...filtered].sort((a, b) => {
    const diff =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortDirection === 'asc' ? diff : -diff;
  });

  return (
    <div className="space-y-2">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Packages ({filtered.length})
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-3 w-3" />
              {statusFilter === 'ALL'
                ? 'All statuses'
                : PACKAGE_STATUS_CONFIG[statusFilter]?.label ?? statusFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
            {FILTER_STATUSES.map((s) => (
              <DropdownMenuItem
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(statusFilter === s && 'font-semibold')}
              >
                {s === 'ALL'
                  ? 'All statuses'
                  : PACKAGE_STATUS_CONFIG[s]?.label ?? s}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Package ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Current Step</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <SortableHeader
                label="Entered At"
                active={true}
                direction={sortDirection}
                onSort={handleSort}
              />
            </TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton />
          ) : sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No packages in this assembly line.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((pkg) => (
              <PackageRow key={pkg.id} pkg={pkg} stepNames={stepNames} />
            ))
          )}
        </TableBody>
      </Table>

      {hasMore && !isLoading && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={onLoadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Package row
// ---------------------------------------------------------------------------

function PackageRow({
  pkg,
  stepNames,
}: {
  pkg: Package;
  stepNames: Map<number, string>;
}) {
  const statusConfig = PACKAGE_STATUS_CONFIG[pkg.status] ?? {
    label: pkg.status,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  const typeConfig = PACKAGE_TYPE_CONFIG[pkg.type] ?? {
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  const currentStepName =
    pkg.currentStep != null
      ? stepNames.get(pkg.currentStep) ?? `Step ${pkg.currentStep}`
      : '—';

  const enteredAt = new Date(pkg.createdAt).toLocaleString();

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">
        <Link
          to={`/packages/${pkg.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {pkg.id.slice(0, 8)}
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={typeConfig.className}>
          {pkg.type}
        </Badge>
      </TableCell>
      <TableCell>{currentStepName}</TableCell>
      <TableCell>
        <Badge variant="outline" className={statusConfig.className}>
          {statusConfig.label}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{enteredAt}</TableCell>
      <TableCell>
        <DurationCell createdAt={pkg.createdAt} />
      </TableCell>
    </TableRow>
  );
}
