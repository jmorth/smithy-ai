import { useCallback, useEffect, useRef } from 'react';
import { X, FileDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useFactoryStore } from '@/stores/factory.store';
import type { PackageType, PackageStatus } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Type → badge styling
// ---------------------------------------------------------------------------

const TYPE_CLASS: Record<PackageType, string> = {
  USER_INPUT: 'border-blue-400 bg-blue-100 text-blue-800',
  SPECIFICATION: 'border-orange-400 bg-orange-100 text-orange-800',
  CODE: 'border-green-400 bg-green-100 text-green-800',
  IMAGE: 'border-purple-400 bg-purple-100 text-purple-800',
  PULL_REQUEST: 'border-gray-400 bg-gray-100 text-gray-800',
};

const STATUS_VARIANT: Record<PackageStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  IN_TRANSIT: 'outline',
  PROCESSING: 'default',
  COMPLETED: 'default',
  FAILED: 'destructive',
  EXPIRED: 'secondary',
};

const STATUS_EXTRA_CLASS: Record<PackageStatus, string> = {
  PENDING: '',
  IN_TRANSIT: 'border-blue-400 bg-blue-100 text-blue-800',
  PROCESSING: '',
  COMPLETED: 'border-green-400 bg-green-100 text-green-800',
  FAILED: '',
  EXPIRED: 'border-gray-400 bg-gray-100 text-gray-800',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PackageDetailPanel() {
  const selectedCrate = useFactoryStore((s) => s.selectedCrate);
  const packageCrates = useFactoryStore((s) => s.packageCrates);
  const selectCrate = useFactoryStore((s) => s.selectCrate);
  const panelRef = useRef<HTMLDivElement>(null);

  const crate = selectedCrate ? packageCrates.get(selectedCrate) : undefined;

  const handleClose = useCallback(() => {
    selectCrate(null);
  }, [selectCrate]);

  useEffect(() => {
    if (!crate) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [crate, handleClose]);

  if (!crate) return null;

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto absolute right-0 top-0 h-full w-full sm:w-96 bg-background/90 backdrop-blur-sm border-l shadow-lg overflow-y-auto transition-transform duration-300"
      data-testid="package-detail-panel"
      role="dialog"
      aria-label={`Package details: ${crate.type}`}
    >
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-semibold truncate pr-2">
            Package
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={handleClose}
            data-testid="close-package-panel"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Type badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Type</span>
            <Badge
              variant="outline"
              className={TYPE_CLASS[crate.type]}
              data-testid="package-type-badge"
            >
              {crate.type}
            </Badge>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge
              variant={STATUS_VARIANT[crate.status]}
              className={STATUS_EXTRA_CLASS[crate.status]}
              data-testid="package-status-badge"
            >
              {crate.status}
            </Badge>
          </div>

          <Separator />

          {/* Workflow position */}
          <div className="space-y-3">
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Current Step
              </span>
              <p className="text-sm font-mono mt-0.5">{crate.currentStep}</p>
            </div>

            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Position
              </span>
              <p className="text-sm font-mono mt-0.5">
                ({crate.position.tileX}, {crate.position.tileY})
              </p>
            </div>

            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Package ID
              </span>
              <p className="text-sm font-mono mt-0.5">{selectedCrate}</p>
            </div>
          </div>

          <Separator />

          {/* Files section */}
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Files
            </span>
            <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground flex items-center gap-2">
              <FileDown className="h-4 w-4" />
              <span>Select a package in the list view to manage files</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
