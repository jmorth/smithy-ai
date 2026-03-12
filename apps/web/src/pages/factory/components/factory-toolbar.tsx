import { useState, useCallback } from 'react';
import {
  Plus,
  Minus,
  Home,
  Package,
  ChevronDown,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFactoryStore, useTargetZoom } from '@/stores/factory.store';
import { useAssemblyLines } from '@/api/hooks/use-assembly-lines';
import { useWorkerPools } from '@/api/hooks/use-worker-pools';
import {
  PackageSubmitDialog,
  type PackageSubmitTarget,
} from '@/components/package-submit-dialog';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.25;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FactoryToolbar() {
  const zoomTo = useFactoryStore((s) => s.zoomTo);
  const centerOn = useFactoryStore((s) => s.centerOn);
  const resetView = useFactoryStore((s) => s.resetView);
  const layoutData = useFactoryStore((s) => s.layoutData);
  const targetZoom = useTargetZoom();

  const { data: assemblyLines } = useAssemblyLines();
  const { data: workerPools } = useWorkerPools();

  const [submitTarget, setSubmitTarget] = useState<PackageSubmitTarget | null>(
    null,
  );
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const zoomPercent = Math.round(targetZoom * 100);
  const canZoomIn = targetZoom + ZOOM_STEP <= MAX_ZOOM;
  const canZoomOut = targetZoom - ZOOM_STEP >= MIN_ZOOM;

  const handleZoomIn = useCallback(() => {
    const next = Math.min(targetZoom + ZOOM_STEP, MAX_ZOOM);
    zoomTo(next);
  }, [targetZoom, zoomTo]);

  const handleZoomOut = useCallback(() => {
    const next = Math.max(targetZoom - ZOOM_STEP, MIN_ZOOM);
    zoomTo(next);
  }, [targetZoom, zoomTo]);

  const handleResetView = useCallback(() => {
    resetView();
  }, [resetView]);

  const handleSelectEntity = useCallback(
    (type: 'assembly-line' | 'worker-pool', slug: string) => {
      if (!layoutData) return;
      const room = layoutData.rooms.find((r) => r.id === slug);
      if (room) {
        const centerX = room.x + Math.floor(room.width / 2);
        const centerY = room.y + Math.floor(room.height / 2);
        centerOn(centerX, centerY);
      }
    },
    [layoutData, centerOn],
  );

  const handleSubmitPackage = useCallback(
    (target: PackageSubmitTarget) => {
      setSubmitTarget(target);
      setSubmitDialogOpen(true);
    },
    [],
  );

  const handleOpenGenericSubmit = useCallback(() => {
    const firstLine = assemblyLines?.[0];
    const firstPool = workerPools?.[0];
    if (firstLine) {
      setSubmitTarget({ type: 'assembly-line', slug: firstLine.slug });
    } else if (firstPool) {
      setSubmitTarget({ type: 'worker-pool', slug: firstPool.slug });
    }
    setSubmitDialogOpen(true);
  }, [assemblyLines, workerPools]);

  const hasEntities =
    (assemblyLines && assemblyLines.length > 0) ||
    (workerPools && workerPools.length > 0);

  return (
    <>
      <div
        className="pointer-events-auto absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-2 bg-background/80 backdrop-blur-sm border-b px-3 py-2 shadow-sm"
        data-testid="factory-toolbar"
        role="toolbar"
        aria-label="Factory controls"
      >
        {/* Left: Zoom controls */}
        <div className="flex items-center gap-1" data-testid="zoom-controls">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleZoomOut}
            disabled={!canZoomOut}
            aria-label="Zoom out"
            data-testid="zoom-out-btn"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Badge
            variant="secondary"
            className="min-w-[3.5rem] justify-center tabular-nums"
            data-testid="zoom-level"
          >
            {zoomPercent}%
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleZoomIn}
            disabled={!canZoomIn}
            aria-label="Zoom in"
            data-testid="zoom-in-btn"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleResetView}
            aria-label="Reset view"
            data-testid="reset-view-btn"
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>

        {/* Center: Assembly Line / Worker Pool selector (hidden on small screens) */}
        <div className="hidden md:flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                data-testid="entity-selector-btn"
              >
                <span className="truncate max-w-[200px]">
                  Select Line / Pool
                </span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56">
              {assemblyLines && assemblyLines.length > 0 && (
                <>
                  <DropdownMenuLabel>Assembly Lines</DropdownMenuLabel>
                  {assemblyLines.map((line) => (
                    <DropdownMenuItem
                      key={line.slug}
                      onClick={() =>
                        handleSelectEntity('assembly-line', line.slug)
                      }
                      data-testid={`entity-item-${line.slug}`}
                    >
                      {line.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {assemblyLines &&
                assemblyLines.length > 0 &&
                workerPools &&
                workerPools.length > 0 && <DropdownMenuSeparator />}
              {workerPools && workerPools.length > 0 && (
                <>
                  <DropdownMenuLabel>Worker Pools</DropdownMenuLabel>
                  {workerPools.map((pool) => (
                    <DropdownMenuItem
                      key={pool.slug}
                      onClick={() =>
                        handleSelectEntity('worker-pool', pool.slug)
                      }
                      data-testid={`entity-item-${pool.slug}`}
                    >
                      {pool.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {!hasEntities && (
                <DropdownMenuItem disabled>
                  No lines or pools available
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: Submit + Dashboard (hidden on small screens) */}
        <div className="hidden md:flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="gap-1"
                data-testid="submit-package-btn"
              >
                <Package className="h-4 w-4" />
                <span>Submit Package</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {assemblyLines && assemblyLines.length > 0 && (
                <>
                  <DropdownMenuLabel>To Assembly Line</DropdownMenuLabel>
                  {assemblyLines.map((line) => (
                    <DropdownMenuItem
                      key={line.slug}
                      onClick={() =>
                        handleSubmitPackage({
                          type: 'assembly-line',
                          slug: line.slug,
                        })
                      }
                      data-testid={`submit-to-${line.slug}`}
                    >
                      {line.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {assemblyLines &&
                assemblyLines.length > 0 &&
                workerPools &&
                workerPools.length > 0 && <DropdownMenuSeparator />}
              {workerPools && workerPools.length > 0 && (
                <>
                  <DropdownMenuLabel>To Worker Pool</DropdownMenuLabel>
                  {workerPools.map((pool) => (
                    <DropdownMenuItem
                      key={pool.slug}
                      onClick={() =>
                        handleSubmitPackage({
                          type: 'worker-pool',
                          slug: pool.slug,
                        })
                      }
                      data-testid={`submit-to-${pool.slug}`}
                    >
                      {pool.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {!hasEntities && (
                <DropdownMenuItem disabled>
                  No targets available
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile: collapsed menu (visible on small screens) */}
        <div className="flex md:hidden">
          <DropdownMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="More actions"
                data-testid="mobile-menu-btn"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {assemblyLines && assemblyLines.length > 0 && (
                <>
                  <DropdownMenuLabel>Assembly Lines</DropdownMenuLabel>
                  {assemblyLines.map((line) => (
                    <DropdownMenuItem
                      key={line.slug}
                      onClick={() =>
                        handleSelectEntity('assembly-line', line.slug)
                      }
                    >
                      {line.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {workerPools && workerPools.length > 0 && (
                <>
                  <DropdownMenuLabel>Worker Pools</DropdownMenuLabel>
                  {workerPools.map((pool) => (
                    <DropdownMenuItem
                      key={pool.slug}
                      onClick={() =>
                        handleSelectEntity('worker-pool', pool.slug)
                      }
                    >
                      {pool.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {hasEntities && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={handleOpenGenericSubmit}>
                <Package className="mr-2 h-4 w-4" />
                Submit Package
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Package submit dialog */}
      {submitTarget && (
        <PackageSubmitDialog
          target={submitTarget}
          open={submitDialogOpen}
          onOpenChange={setSubmitDialogOpen}
        />
      )}
    </>
  );
}
