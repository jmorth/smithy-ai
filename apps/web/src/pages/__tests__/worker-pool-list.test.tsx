import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkerPoolListPage from '../worker-pool-list';
import * as client from '@/api/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  workerPools: {
    list: vi.fn(),
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

function makePool(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pool-1',
    name: 'GPU Pool',
    slug: 'gpu-pool',
    description: 'A GPU worker pool',
    status: 'ACTIVE',
    maxConcurrency: 10,
    members: [
      { id: 'm1', poolId: 'pool-1', workerVersionId: 'summarizer:1', priority: 1 },
      { id: 'm2', poolId: 'pool-1', workerVersionId: 'reviewer:1', priority: 2 },
    ],
    activeJobCount: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const POOLS = [
  makePool({ id: 'pool-1', name: 'GPU Pool', slug: 'gpu-pool', status: 'ACTIVE', maxConcurrency: 10, activeJobCount: 3 }),
  makePool({ id: 'pool-2', name: 'CPU Pool', slug: 'cpu-pool', status: 'PAUSED', maxConcurrency: 5, activeJobCount: 0, members: [] }),
  makePool({ id: 'pool-3', name: 'Staging Pool', slug: 'staging-pool', status: 'ERROR', maxConcurrency: 8, activeJobCount: 1, members: [{ id: 'm3', poolId: 'pool-3', workerVersionId: 'test:1', priority: 1 }] }),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(initialEntries: string[] = ['/worker-pools']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <WorkerPoolListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerPoolListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.workerPools.list).mockResolvedValue(POOLS as never);
  });

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------

  describe('Header', () => {
    it('renders the "Worker Pools" heading', async () => {
      renderPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Worker Pools' }),
      ).toBeInTheDocument();
    });

    it('renders the "Create Pool" button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: /Create Pool/i }),
      ).toBeInTheDocument();
    });

    it('navigates to /worker-pools/create on button click', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        screen.getByRole('button', { name: /Create Pool/i }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/worker-pools/create');
    });
  });

  // -----------------------------------------------------------------------
  // Table rendering
  // -----------------------------------------------------------------------

  describe('Table rendering', () => {
    it('renders all worker pool rows after loading', async () => {
      renderPage();
      for (const pool of POOLS) {
        expect(
          await screen.findByText((pool as { name: string }).name),
        ).toBeInTheDocument();
      }
    });

    it('renders name as a link to the detail page', async () => {
      renderPage();
      const link = await screen.findByRole('link', { name: 'GPU Pool' });
      expect(link).toHaveAttribute('href', '/worker-pools/gpu-pool');
    });

    it('renders status badges with correct labels', async () => {
      renderPage();
      expect(await screen.findByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Paused')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('renders member count column', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      const rows = screen.getAllByRole('row');
      const gpuRow = rows[1]!;
      const cells = within(gpuRow).getAllByRole('cell');
      // Member count column (index 1)
      expect(cells[1]!).toHaveTextContent('2');
    });

    it('renders concurrency column as used/max', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      const rows = screen.getAllByRole('row');
      const gpuRow = rows[1]!;
      const cells = within(gpuRow).getAllByRole('cell');
      // Concurrency column (index 3)
      expect(cells[3]!).toHaveTextContent('3/10');
    });

    it('renders sortable column headers', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: /Name/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Status/i }),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Status badge color classes
  // -----------------------------------------------------------------------

  describe('Status badge colors', () => {
    it('applies green classes for ACTIVE status', async () => {
      renderPage();
      const badge = await screen.findByText('Active');
      expect(badge.className).toContain('bg-green-100');
    });

    it('applies yellow classes for PAUSED status', async () => {
      renderPage();
      const badge = await screen.findByText('Paused');
      expect(badge.className).toContain('bg-yellow-100');
    });

    it('applies red classes for ERROR status', async () => {
      renderPage();
      const badge = await screen.findByText('Error');
      expect(badge.className).toContain('bg-red-100');
    });
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  describe('Loading state', () => {
    it('shows skeleton rows while loading', () => {
      vi.mocked(client.workerPools.list).mockReturnValue(
        new Promise(() => {}),
      );
      const { container } = renderPage();
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show pagination while loading', () => {
      vi.mocked(client.workerPools.list).mockReturnValue(
        new Promise(() => {}),
      );
      renderPage();
      expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  describe('Empty state', () => {
    beforeEach(() => {
      vi.mocked(client.workerPools.list).mockResolvedValue([] as never);
    });

    it('shows empty state message when no worker pools exist', async () => {
      renderPage();
      expect(
        await screen.findByText('No Worker Pools yet'),
      ).toBeInTheDocument();
    });

    it('shows a CTA link to create the first worker pool', async () => {
      renderPage();
      const link = await screen.findByRole('link', {
        name: /Create your first Worker Pool/i,
      });
      expect(link).toHaveAttribute('href', '/worker-pools/create');
    });

    it('does not render the table when empty', async () => {
      renderPage();
      await screen.findByText('No Worker Pools yet');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  describe('Error state', () => {
    it('shows error message when API fails', async () => {
      vi.mocked(client.workerPools.list).mockRejectedValue(
        new Error('Service unavailable'),
      );
      renderPage();
      expect(
        await screen.findByText('Failed to load Worker Pools'),
      ).toBeInTheDocument();
      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });

    it('has role="alert" on the error container', async () => {
      vi.mocked(client.workerPools.list).mockRejectedValue(
        new Error('Network error'),
      );
      renderPage();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('shows a retry button that refetches data', async () => {
      const user = userEvent.setup();
      vi.mocked(client.workerPools.list)
        .mockRejectedValueOnce(new Error('Oops'))
        .mockResolvedValueOnce(POOLS as never);

      renderPage();
      const retryBtn = await screen.findByRole('button', { name: /Retry/i });
      await user.click(retryBtn);
      expect(client.workerPools.list).toHaveBeenCalledTimes(2);
    });

    it('does not render the table when errored', async () => {
      vi.mocked(client.workerPools.list).mockRejectedValue(
        new Error('fail'),
      );
      renderPage();
      await screen.findByRole('alert');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Actions dropdown
  // -----------------------------------------------------------------------

  describe('Actions dropdown', () => {
    it('opens a dropdown with View action', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('GPU Pool');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!);

      expect(screen.getByText('View')).toBeInTheDocument();
    });

    it('navigates to detail page when View is clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('GPU Pool');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!);
      await user.click(screen.getByText('View'));

      expect(mockNavigate).toHaveBeenCalledWith('/worker-pools/gpu-pool');
    });
  });

  // -----------------------------------------------------------------------
  // Sorting
  // -----------------------------------------------------------------------

  describe('Sorting', () => {
    it('passes sort param to API hook when column header clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('GPU Pool');

      await user.click(screen.getByRole('button', { name: /Name/i }));

      expect(client.workerPools.list).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'name:asc' }),
        expect.anything(),
      );
    });

    it('toggles sort direction on second click', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('GPU Pool');

      const nameBtn = screen.getByRole('button', { name: /Name/i });
      await user.click(nameBtn);
      await user.click(nameBtn);

      expect(client.workerPools.list).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'name:desc' }),
        expect.anything(),
      );
    });

    it('clears sort on third click', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('GPU Pool');

      const nameBtn = screen.getByRole('button', { name: /Name/i });
      await user.click(nameBtn);
      await user.click(nameBtn);
      await user.click(nameBtn);

      const lastCall = vi.mocked(client.workerPools.list).mock.calls.at(-1);
      expect(lastCall?.[0]).toEqual(
        expect.objectContaining({ sort: undefined }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------

  describe('Pagination', () => {
    it('shows page number', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      expect(screen.getByText('Page 1')).toBeInTheDocument();
    });

    it('disables Previous button on first page', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      expect(
        screen.getByRole('button', { name: 'Previous' }),
      ).toBeDisabled();
    });

    it('enables Next when results fill the page', async () => {
      const tenPools = Array.from({ length: 10 }, (_, i) =>
        makePool({ id: `pool-${i}`, name: `Pool ${i}`, slug: `pool-${i}` }),
      );
      vi.mocked(client.workerPools.list).mockResolvedValue(
        tenPools as never,
      );

      renderPage();
      await screen.findByText('Pool 0');
      expect(
        screen.getByRole('button', { name: 'Next' }),
      ).not.toBeDisabled();
    });

    it('disables Next when results are fewer than limit', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });

    it('passes page and limit to API hook', async () => {
      renderPage(['/worker-pools?page=3&limit=5']);
      await screen.findByText('GPU Pool');

      expect(client.workerPools.list).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3, limit: 5 }),
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Unknown status handling
  // -----------------------------------------------------------------------

  describe('Unknown status', () => {
    it('renders unknown status as-is with gray styling', async () => {
      vi.mocked(client.workerPools.list).mockResolvedValue([
        makePool({ status: 'CUSTOM_STATUS' }),
      ] as never);
      renderPage();
      const badge = await screen.findByText('CUSTOM_STATUS');
      expect(badge.className).toContain('bg-gray-100');
    });
  });
});
