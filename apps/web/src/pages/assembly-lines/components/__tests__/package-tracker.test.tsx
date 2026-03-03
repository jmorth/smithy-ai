import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PackageTracker } from '../package-tracker';
import type { Package } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePackage(overrides: Partial<Package> = {}): Package {
  return {
    id: 'pkg-12345678-abcd',
    type: 'CODE',
    status: 'PROCESSING',
    metadata: {},
    assemblyLineId: 'line-1',
    currentStep: 1,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Package;
}

const PACKAGES: Package[] = [
  makePackage({
    id: 'pkg-aaaa1111-xxxx',
    type: 'USER_INPUT',
    status: 'PENDING',
    currentStep: 1,
    createdAt: new Date(Date.now() - 300_000).toISOString(),
  }),
  makePackage({
    id: 'pkg-bbbb2222-yyyy',
    type: 'CODE',
    status: 'PROCESSING',
    currentStep: 2,
    createdAt: new Date(Date.now() - 120_000).toISOString(),
  }),
  makePackage({
    id: 'pkg-cccc3333-zzzz',
    type: 'SPECIFICATION',
    status: 'COMPLETED',
    currentStep: 3,
    createdAt: new Date(Date.now() - 600_000).toISOString(),
  }),
  makePackage({
    id: 'pkg-dddd4444-wwww',
    type: 'IMAGE',
    status: 'FAILED',
    currentStep: 1,
    createdAt: new Date(Date.now() - 30_000).toISOString(),
  }),
];

const STEP_NAMES = new Map<number, string>([
  [1, 'Summarizer'],
  [2, 'Reviewer'],
  [3, 'Builder'],
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTracker(props: Partial<React.ComponentProps<typeof PackageTracker>> = {}) {
  return render(
    <MemoryRouter>
      <PackageTracker
        packages={PACKAGES}
        stepNames={STEP_NAMES}
        {...props}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PackageTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  describe('Loading state', () => {
    it('shows skeleton rows while loading', () => {
      const { container } = renderTracker({ isLoading: true, packages: [] });
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show package data while loading', () => {
      renderTracker({ isLoading: true });
      expect(screen.queryByText('pkg-aaaa')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  describe('Empty state', () => {
    it('shows empty message when no packages', () => {
      renderTracker({ packages: [] });
      expect(
        screen.getByText('No packages in this assembly line.'),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Table rendering
  // -----------------------------------------------------------------------

  describe('Table rendering', () => {
    it('renders table headers', () => {
      renderTracker();
      expect(screen.getByText('Package ID')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Current Step')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Duration')).toBeInTheDocument();
    });

    it('renders package IDs as links (truncated to 8 chars)', () => {
      renderTracker();
      const link = screen.getByRole('link', { name: 'pkg-aaaa' });
      expect(link).toHaveAttribute('href', '/packages/pkg-aaaa1111-xxxx');
    });

    it('renders type badges', () => {
      renderTracker();
      expect(screen.getByText('USER_INPUT')).toBeInTheDocument();
      expect(screen.getByText('CODE')).toBeInTheDocument();
      expect(screen.getByText('SPECIFICATION')).toBeInTheDocument();
      expect(screen.getByText('IMAGE')).toBeInTheDocument();
    });

    it('renders current step name from stepNames map', () => {
      renderTracker();
      // Step names appear in the "Current Step" column cells
      const rows = screen.getAllByRole('row');
      // Find rows containing the step names (skip header row)
      const cellTexts = rows.slice(1).map((row) => {
        const cells = within(row).getAllByRole('cell');
        return cells[2]!.textContent; // Current Step is the 3rd column
      });
      expect(cellTexts).toContain('Summarizer');
      expect(cellTexts).toContain('Reviewer');
      expect(cellTexts).toContain('Builder');
    });

    it('renders status badges', () => {
      renderTracker();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('shows package count in header', () => {
      renderTracker();
      expect(screen.getByText('Packages (4)')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Status badges colors
  // -----------------------------------------------------------------------

  describe('Status badge colors', () => {
    it('applies correct color for PENDING', () => {
      renderTracker();
      const badge = screen.getByText('Pending');
      expect(badge.className).toContain('bg-gray-100');
    });

    it('applies correct color for PROCESSING', () => {
      renderTracker();
      const badge = screen.getByText('Processing');
      expect(badge.className).toContain('bg-indigo-100');
    });

    it('applies correct color for COMPLETED', () => {
      renderTracker();
      const badge = screen.getByText('Completed');
      expect(badge.className).toContain('bg-green-100');
    });

    it('applies correct color for FAILED', () => {
      renderTracker();
      const badge = screen.getByText('Failed');
      expect(badge.className).toContain('bg-red-100');
    });
  });

  // -----------------------------------------------------------------------
  // Type badge colors
  // -----------------------------------------------------------------------

  describe('Type badge colors', () => {
    it('applies purple for USER_INPUT', () => {
      renderTracker();
      const badge = screen.getByText('USER_INPUT');
      expect(badge.className).toContain('bg-purple-100');
    });

    it('applies emerald for CODE', () => {
      renderTracker();
      const badge = screen.getByText('CODE');
      expect(badge.className).toContain('bg-emerald-100');
    });
  });

  // -----------------------------------------------------------------------
  // Sorting
  // -----------------------------------------------------------------------

  describe('Sorting', () => {
    it('sorts by entered at descending by default (most recent first)', () => {
      renderTracker();
      const rows = screen.getAllByRole('row');
      // Row 0 is header, row 1 is most recent
      // pkg-dddd (30s ago) should be first
      const firstDataRow = rows[1]!;
      expect(firstDataRow).toHaveTextContent('pkg-dddd');
    });

    it('toggles sort direction on click', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderTracker();

      const sortBtn = screen.getByRole('button', { name: /Entered At/i });
      await user.click(sortBtn);

      // Now ascending — oldest first (pkg-cccc, 600s ago)
      const rows = screen.getAllByRole('row');
      const firstDataRow = rows[1]!;
      expect(firstDataRow).toHaveTextContent('pkg-cccc');
    });
  });

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  describe('Filtering', () => {
    it('shows "All statuses" filter button by default', () => {
      renderTracker();
      expect(
        screen.getByRole('button', { name: /All statuses/i }),
      ).toBeInTheDocument();
    });

    it('filters packages by status when filter selected', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderTracker();

      // Open the filter dropdown
      await user.click(
        screen.getByRole('button', { name: /All statuses/i }),
      );
      // Select COMPLETED from the dropdown menu items
      const menuItems = screen.getAllByRole('menuitem');
      const completedItem = menuItems.find(
        (item) => item.textContent === 'Completed',
      );
      await user.click(completedItem!);

      // Should only show one package
      expect(screen.getByText('Packages (1)')).toBeInTheDocument();
      expect(screen.getByText('pkg-cccc')).toBeInTheDocument();
      expect(screen.queryByText('pkg-aaaa')).not.toBeInTheDocument();
    });

    it('shows "All statuses" option to clear filter', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderTracker();

      // Open filter and select FAILED
      await user.click(
        screen.getByRole('button', { name: /All statuses/i }),
      );
      const failedItems = screen.getAllByRole('menuitem');
      const failedItem = failedItems.find(
        (item) => item.textContent === 'Failed',
      );
      await user.click(failedItem!);

      expect(screen.getByText('Packages (1)')).toBeInTheDocument();

      // Open again and select All
      await user.click(
        screen.getByRole('button', { name: /Failed/i }),
      );
      const allItems = screen.getAllByRole('menuitem');
      const allItem = allItems.find(
        (item) => item.textContent === 'All statuses',
      );
      await user.click(allItem!);

      expect(screen.getByText('Packages (4)')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Step name fallback
  // -----------------------------------------------------------------------

  describe('Step name fallback', () => {
    it('shows "Step N" when step name not in map', () => {
      const packages = [
        makePackage({ id: 'pkg-test1234-xxxx', currentStep: 99 }),
      ];
      renderTracker({ packages });
      expect(screen.getByText('Step 99')).toBeInTheDocument();
    });

    it('shows dash when currentStep is null', () => {
      const packages = [
        makePackage({
          id: 'pkg-test1234-xxxx',
          currentStep: undefined,
        }),
      ];
      renderTracker({ packages });
      // The cell should contain "—"
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Duration
  // -----------------------------------------------------------------------

  describe('Duration', () => {
    it('renders elapsed duration for packages', () => {
      renderTracker();
      // At least some duration text should be visible (e.g., "1m 0s", "5m 0s")
      // We just check it doesn't crash and has rows
      const rows = screen.getAllByRole('row');
      expect(rows.length).toBeGreaterThan(1);
    });

    it('renders seconds format for recent packages', () => {
      const packages = [
        makePackage({
          id: 'pkg-recent11-xxxx',
          createdAt: new Date(Date.now() - 5_000).toISOString(),
        }),
      ];
      renderTracker({ packages });
      expect(screen.getByText('5s')).toBeInTheDocument();
    });

    it('renders minutes format for older packages', () => {
      const packages = [
        makePackage({
          id: 'pkg-minutes1-xxxx',
          createdAt: new Date(Date.now() - 180_000).toISOString(),
        }),
      ];
      renderTracker({ packages });
      expect(screen.getByText('3m 0s')).toBeInTheDocument();
    });

    it('renders hours format for very old packages', () => {
      const packages = [
        makePackage({
          id: 'pkg-hours111-xxxx',
          createdAt: new Date(Date.now() - 7_200_000).toISOString(),
        }),
      ];
      renderTracker({ packages });
      expect(screen.getByText('2h 0m')).toBeInTheDocument();
    });

    it('renders 0s for future timestamps', () => {
      const packages = [
        makePackage({
          id: 'pkg-future11-xxxx',
          createdAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      ];
      renderTracker({ packages });
      expect(screen.getByText('0s')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Load more
  // -----------------------------------------------------------------------

  describe('Load more', () => {
    it('shows Load more button when hasMore is true', () => {
      renderTracker({ hasMore: true });
      expect(
        screen.getByRole('button', { name: 'Load more' }),
      ).toBeInTheDocument();
    });

    it('does not show Load more when hasMore is false', () => {
      renderTracker({ hasMore: false });
      expect(
        screen.queryByRole('button', { name: 'Load more' }),
      ).not.toBeInTheDocument();
    });

    it('calls onLoadMore when Load more is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onLoadMore = vi.fn();
      renderTracker({ hasMore: true, onLoadMore });

      await user.click(screen.getByRole('button', { name: 'Load more' }));
      expect(onLoadMore).toHaveBeenCalledOnce();
    });

    it('does not show Load more while loading', () => {
      renderTracker({ hasMore: true, isLoading: true });
      expect(
        screen.queryByRole('button', { name: 'Load more' }),
      ).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Unknown status
  // -----------------------------------------------------------------------

  describe('Unknown status', () => {
    it('renders unknown status as-is with gray styling', () => {
      const packages = [
        makePackage({
          id: 'pkg-unknown1-xxxx',
          status: 'CUSTOM' as Package['status'],
        }),
      ];
      renderTracker({ packages });
      const badge = screen.getByText('CUSTOM');
      expect(badge.className).toContain('bg-gray-100');
    });
  });
});
