import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFactoryStore } from '@/stores/factory.store';
import { useAppStore } from '@/stores/app.store';
import { FactoryToolbar } from '../factory-toolbar';
import * as client from '@/api/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  assemblyLines: {
    list: vi.fn(),
    submitPackage: vi.fn(),
  },
  workerPools: {
    list: vi.fn(),
    submitPackage: vi.fn(),
  },
  packages: {
    create: vi.fn(),
    getUploadUrl: vi.fn(),
    confirmUpload: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  },
}));

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLine(
  overrides: Partial<{ id: string; name: string; slug: string }> = {},
) {
  return {
    id: overrides.id ?? 'line-1',
    name: overrides.name ?? 'My Line',
    slug: overrides.slug ?? 'my-line',
    description: 'A test assembly line',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makePool(
  overrides: Partial<{ id: string; name: string; slug: string }> = {},
) {
  return {
    id: overrides.id ?? 'pool-1',
    name: overrides.name ?? 'My Pool',
    slug: overrides.slug ?? 'my-pool',
    description: 'A test worker pool',
    status: 'ACTIVE',
    maxConcurrency: 5,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    members: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function renderToolbar(options?: { lines?: unknown[]; pools?: unknown[] }) {
  const lines = options?.lines ?? [makeLine()];
  const pools = options?.pools ?? [makePool()];

  (client.assemblyLines.list as ReturnType<typeof vi.fn>).mockResolvedValue(
    lines,
  );
  (client.workerPools.list as ReturnType<typeof vi.fn>).mockResolvedValue(
    pools,
  );

  const qc = createQueryClient();

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FactoryToolbar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockNavigate.mockClear();

  useFactoryStore.setState({
    workerMachines: new Map(),
    packageCrates: new Map(),
    activeAnimations: new Set(),
    layoutData: null,
    selectedMachine: null,
    selectedCrate: null,
    targetZoom: 1,
    zoomGeneration: 0,
    centerTarget: null,
    centerGeneration: 0,
    resetViewGeneration: 0,
  });

  useAppStore.setState({
    viewMode: 'factory',
    socketState: 'connected',
    unreadNotificationCount: 0,
    selectedWorkerId: null,
    selectedPackageId: null,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FactoryToolbar', () => {
  // ---- Rendering & Positioning ----

  it('renders the toolbar', () => {
    renderToolbar();
    expect(screen.getByTestId('factory-toolbar')).toBeInTheDocument();
  });

  it('is positioned at the top with absolute positioning', () => {
    renderToolbar();
    const toolbar = screen.getByTestId('factory-toolbar');
    expect(toolbar.className).toContain('absolute');
    expect(toolbar.className).toContain('top-0');
    expect(toolbar.className).toContain('left-0');
    expect(toolbar.className).toContain('right-0');
  });

  it('has pointer-events-auto so buttons are clickable', () => {
    renderToolbar();
    const toolbar = screen.getByTestId('factory-toolbar');
    expect(toolbar.className).toContain('pointer-events-auto');
  });

  it('has a semi-transparent background with backdrop blur', () => {
    renderToolbar();
    const toolbar = screen.getByTestId('factory-toolbar');
    expect(toolbar.className).toMatch(/bg-background\/80/);
    expect(toolbar.className).toContain('backdrop-blur-sm');
  });

  it('has border-b for visual separation from canvas', () => {
    renderToolbar();
    const toolbar = screen.getByTestId('factory-toolbar');
    expect(toolbar.className).toContain('border-b');
  });

  it('has correct ARIA role and label', () => {
    renderToolbar();
    const toolbar = screen.getByTestId('factory-toolbar');
    expect(toolbar).toHaveAttribute('role', 'toolbar');
    expect(toolbar).toHaveAttribute('aria-label', 'Factory controls');
  });

  // ---- Zoom Controls ----

  it('displays the current zoom level as percentage', () => {
    renderToolbar();
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('100%');
  });

  it('displays zoom level matching store state', () => {
    useFactoryStore.setState({ targetZoom: 1.5 });
    renderToolbar();
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('150%');
  });

  it('zoom in button increases zoom by 0.25', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('zoom-in-btn'));
    expect(useFactoryStore.getState().targetZoom).toBe(1.25);
  });

  it('zoom out button decreases zoom by 0.25', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('zoom-out-btn'));
    expect(useFactoryStore.getState().targetZoom).toBe(0.75);
  });

  it('zoom in button is disabled at max zoom', () => {
    useFactoryStore.setState({ targetZoom: 2.0 });
    renderToolbar();
    expect(screen.getByTestId('zoom-in-btn')).toBeDisabled();
  });

  it('zoom out button is disabled at min zoom', () => {
    useFactoryStore.setState({ targetZoom: 0.5 });
    renderToolbar();
    expect(screen.getByTestId('zoom-out-btn')).toBeDisabled();
  });

  it('zoom in is enabled when not at max', () => {
    useFactoryStore.setState({ targetZoom: 1.0 });
    renderToolbar();
    expect(screen.getByTestId('zoom-in-btn')).not.toBeDisabled();
  });

  it('zoom out is enabled when not at min', () => {
    useFactoryStore.setState({ targetZoom: 1.0 });
    renderToolbar();
    expect(screen.getByTestId('zoom-out-btn')).not.toBeDisabled();
  });

  it('zoom in does not exceed max zoom', async () => {
    useFactoryStore.setState({ targetZoom: 1.75 });
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('zoom-in-btn'));
    expect(useFactoryStore.getState().targetZoom).toBe(2.0);
  });

  it('zoom out does not go below min zoom', async () => {
    useFactoryStore.setState({ targetZoom: 0.75 });
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('zoom-out-btn'));
    expect(useFactoryStore.getState().targetZoom).toBe(0.5);
  });

  it('zoom in button has aria-label', () => {
    renderToolbar();
    expect(screen.getByTestId('zoom-in-btn')).toHaveAttribute(
      'aria-label',
      'Zoom in',
    );
  });

  it('zoom out button has aria-label', () => {
    renderToolbar();
    expect(screen.getByTestId('zoom-out-btn')).toHaveAttribute(
      'aria-label',
      'Zoom out',
    );
  });

  // ---- Reset View ----

  it('reset view button resets zoom and view', async () => {
    useFactoryStore.setState({ targetZoom: 1.5, resetViewGeneration: 0 });
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('reset-view-btn'));
    const state = useFactoryStore.getState();
    expect(state.targetZoom).toBe(1);
    expect(state.resetViewGeneration).toBe(1);
  });

  it('reset view button has aria-label', () => {
    renderToolbar();
    expect(screen.getByTestId('reset-view-btn')).toHaveAttribute(
      'aria-label',
      'Reset view',
    );
  });

  // ---- Entity Selector ----

  it('shows entity selector button', () => {
    renderToolbar();
    expect(screen.getByTestId('entity-selector-btn')).toBeInTheDocument();
  });

  it('entity selector opens dropdown with assembly lines', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('entity-selector-btn'));
    expect(await screen.findByText('Assembly Lines')).toBeInTheDocument();
    expect(screen.getByText('My Line')).toBeInTheDocument();
  });

  it('entity selector opens dropdown with worker pools', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('entity-selector-btn'));
    expect(await screen.findByText('Worker Pools')).toBeInTheDocument();
    expect(screen.getByText('My Pool')).toBeInTheDocument();
  });

  it('selecting an entity centers the camera on its room', async () => {
    useFactoryStore.setState({
      layoutData: {
        rooms: [
          { id: 'my-line', name: 'My Line', x: 4, y: 6, width: 10, height: 5 },
        ],
        machinePositions: [],
        conveyorPaths: [],
        floorBounds: { width: 20, height: 20 },
      },
    });

    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('entity-selector-btn'));
    await user.click(await screen.findByTestId('entity-item-my-line'));

    const state = useFactoryStore.getState();
    expect(state.centerTarget).toEqual({ tileX: 9, tileY: 8 });
    expect(state.centerGeneration).toBeGreaterThan(0);
  });

  it('selecting a worker pool entity centers the camera on its room', async () => {
    useFactoryStore.setState({
      layoutData: {
        rooms: [
          { id: 'my-pool', name: 'My Pool', x: 2, y: 2, width: 6, height: 6 },
        ],
        machinePositions: [],
        conveyorPaths: [],
        floorBounds: { width: 20, height: 20 },
      },
    });

    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('entity-selector-btn'));
    await user.click(await screen.findByTestId('entity-item-my-pool'));

    const state = useFactoryStore.getState();
    expect(state.centerTarget).toEqual({ tileX: 5, tileY: 5 });
  });

  it('shows "No lines or pools available" when none exist', async () => {
    const user = userEvent.setup();
    renderToolbar({ lines: [], pools: [] });

    await user.click(screen.getByTestId('entity-selector-btn'));
    expect(
      await screen.findByText('No lines or pools available'),
    ).toBeInTheDocument();
  });

  // ---- Submit Package ----

  it('shows submit package button', () => {
    renderToolbar();
    expect(screen.getByTestId('submit-package-btn')).toBeInTheDocument();
  });

  it('submit package dropdown shows assembly lines', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('submit-package-btn'));
    expect(await screen.findByText('To Assembly Line')).toBeInTheDocument();
  });

  it('submit package dropdown shows worker pools', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('submit-package-btn'));
    expect(await screen.findByText('To Worker Pool')).toBeInTheDocument();
  });

  it('clicking a submit target opens the submit dialog', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('submit-package-btn'));
    await user.click(await screen.findByTestId('submit-to-my-line'));

    // The dialog renders a DialogTitle with "Submit Package" and a description
    // referencing the target slug
    expect(await screen.findByText('my-line')).toBeInTheDocument();
  });

  it('shows "No targets available" when no lines or pools', async () => {
    const user = userEvent.setup();
    renderToolbar({ lines: [], pools: [] });

    await user.click(screen.getByTestId('submit-package-btn'));
    expect(
      await screen.findByText('No targets available'),
    ).toBeInTheDocument();
  });

  // ---- Responsive / Mobile Menu ----

  it('mobile menu button is present', () => {
    renderToolbar();
    expect(screen.getByTestId('mobile-menu-btn')).toBeInTheDocument();
  });

  it('mobile menu button has aria-label', () => {
    renderToolbar();
    expect(screen.getByTestId('mobile-menu-btn')).toHaveAttribute(
      'aria-label',
      'More actions',
    );
  });

  it('mobile menu opens with entity items and actions', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('mobile-menu-btn'));

    // The mobile menu has items for Assembly Lines, Worker Pools, Submit Package, Dashboard
    // "My Line" and "My Pool" are the entity items shown in mobile menu
    expect(await screen.findByText('My Line')).toBeInTheDocument();
    expect(screen.getByText('My Pool')).toBeInTheDocument();
  });

  // ---- Uses shadcn/ui components ----

  it('uses Badge component for zoom level display', () => {
    renderToolbar();
    const badge = screen.getByTestId('zoom-level');
    // Badge renders as a div with specific badge classes
    expect(badge).toBeInTheDocument();
  });

  it('uses Button components for all actions', () => {
    renderToolbar();
    expect(screen.getByTestId('zoom-in-btn').tagName).toBe('BUTTON');
    expect(screen.getByTestId('zoom-out-btn').tagName).toBe('BUTTON');
    expect(screen.getByTestId('reset-view-btn').tagName).toBe('BUTTON');
  });

  // ---- Multiple assembly lines and pools ----

  it('renders multiple assembly lines in entity selector', async () => {
    const user = userEvent.setup();
    renderToolbar({
      lines: [
        makeLine({ slug: 'line-a', name: 'Line Alpha' }),
        makeLine({ slug: 'line-b', name: 'Line Beta', id: 'line-2' }),
      ],
    });

    await user.click(screen.getByTestId('entity-selector-btn'));
    expect(await screen.findByText('Line Alpha')).toBeInTheDocument();
    expect(screen.getByText('Line Beta')).toBeInTheDocument();
  });

  it('renders multiple worker pools in entity selector', async () => {
    const user = userEvent.setup();
    renderToolbar({
      pools: [
        makePool({ slug: 'pool-a', name: 'Pool Alpha' }),
        makePool({ slug: 'pool-b', name: 'Pool Beta', id: 'pool-2' }),
      ],
    });

    await user.click(screen.getByTestId('entity-selector-btn'));
    expect(await screen.findByText('Pool Alpha')).toBeInTheDocument();
    expect(screen.getByText('Pool Beta')).toBeInTheDocument();
  });

  // ---- Zoom state increments generation correctly ----

  it('zoom in increments zoomGeneration', async () => {
    const user = userEvent.setup();
    renderToolbar();
    const initialGen = useFactoryStore.getState().zoomGeneration;

    await user.click(screen.getByTestId('zoom-in-btn'));
    expect(useFactoryStore.getState().zoomGeneration).toBe(initialGen + 1);
  });

  it('zoom out increments zoomGeneration', async () => {
    const user = userEvent.setup();
    renderToolbar();
    const initialGen = useFactoryStore.getState().zoomGeneration;

    await user.click(screen.getByTestId('zoom-out-btn'));
    expect(useFactoryStore.getState().zoomGeneration).toBe(initialGen + 1);
  });

  // ---- Submit to worker pool ----

  it('clicking a worker pool submit target opens the submit dialog', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('submit-package-btn'));
    await user.click(await screen.findByTestId('submit-to-my-pool'));

    expect(await screen.findByText('my-pool')).toBeInTheDocument();
  });

  // ---- Mobile menu entity selection ----

  it('mobile menu entity selection centers camera for assembly line', async () => {
    useFactoryStore.setState({
      layoutData: {
        rooms: [
          { id: 'my-line', name: 'My Line', x: 2, y: 4, width: 8, height: 6 },
        ],
        machinePositions: [],
        conveyorPaths: [],
        floorBounds: { width: 20, height: 20 },
      },
    });

    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('mobile-menu-btn'));
    // Find "My Line" in the mobile menu (it appears multiple times — entity selector + mobile menu)
    const items = await screen.findAllByText('My Line');
    await user.click(items[items.length - 1]!);

    const state = useFactoryStore.getState();
    expect(state.centerTarget).toEqual({ tileX: 6, tileY: 7 });
  });

  it('mobile menu entity selection centers camera for worker pool', async () => {
    useFactoryStore.setState({
      layoutData: {
        rooms: [
          { id: 'my-pool', name: 'My Pool', x: 0, y: 0, width: 6, height: 4 },
        ],
        machinePositions: [],
        conveyorPaths: [],
        floorBounds: { width: 20, height: 20 },
      },
    });

    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('mobile-menu-btn'));
    const items = await screen.findAllByText('My Pool');
    await user.click(items[items.length - 1]!);

    const state = useFactoryStore.getState();
    expect(state.centerTarget).toEqual({ tileX: 3, tileY: 2 });
  });

  // ---- Mobile menu submit package ----

  it('mobile menu submit package opens dialog with first assembly line', async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('mobile-menu-btn'));
    // Find the "Submit Package" in the mobile menu — it comes after entity items
    const items = await screen.findAllByText('Submit Package');
    // Click the last one (mobile menu item)
    await user.click(items[items.length - 1]!);

    // Dialog should open with my-line as target
    expect(await screen.findByText('my-line')).toBeInTheDocument();
  });

  it('mobile menu submit package uses first pool when no assembly lines', async () => {
    const user = userEvent.setup();
    renderToolbar({ lines: [], pools: [makePool()] });

    await user.click(screen.getByTestId('mobile-menu-btn'));
    const items = await screen.findAllByText('Submit Package');
    await user.click(items[items.length - 1]!);

    expect(await screen.findByText('my-pool')).toBeInTheDocument();
  });

  // ---- Entity selector without layout data (no centering) ----

  it('selecting entity without layout data does not crash', async () => {
    useFactoryStore.setState({ layoutData: null });
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByTestId('entity-selector-btn'));
    await user.click(await screen.findByTestId('entity-item-my-line'));

    // Should not throw; centerTarget stays null
    expect(useFactoryStore.getState().centerTarget).toBeNull();
  });
});
