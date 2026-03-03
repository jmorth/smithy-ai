import { useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { WorkerVersion } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  DEPRECATED: {
    label: 'Deprecated',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
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
// Props
// ---------------------------------------------------------------------------

interface VersionHistoryProps {
  versions: WorkerVersion[];
  onDeprecate: (version: number) => void;
  isDeprecating?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VersionHistory({
  versions,
  onDeprecate,
  isDeprecating = false,
}: VersionHistoryProps) {
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);

  const sorted = [...versions].sort(
    (a, b) => Number(b.version) - Number(a.version),
  );

  if (sorted.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">No versions yet</p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead className="w-[100px]">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((v) => (
            <TableRow key={v.id} data-testid={`version-row-${v.version}`}>
              <TableCell className="font-medium">v{v.version}</TableCell>
              <TableCell>
                <StatusBadge status={v.status} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(v.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </TableCell>
              <TableCell>
                {v.status.toUpperCase() === 'ACTIVE' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmVersion(Number(v.version))}
                    disabled={isDeprecating}
                  >
                    Deprecate
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Confirmation dialog */}
      <Dialog
        open={confirmVersion !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmVersion(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deprecate Version</DialogTitle>
            <DialogDescription>
              Are you sure you want to deprecate version v{confirmVersion}? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmVersion(null)}
              disabled={isDeprecating}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmVersion !== null) {
                  onDeprecate(confirmVersion);
                  setConfirmVersion(null);
                }
              }}
              disabled={isDeprecating}
            >
              {isDeprecating ? 'Deprecating…' : 'Deprecate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
