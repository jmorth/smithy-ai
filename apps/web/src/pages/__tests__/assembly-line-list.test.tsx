import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AssemblyLineListPage from '../assembly-line-list';
import * as client from '@/api/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  assemblyLines: {
    list: vi.fn(),
    update: vi.fn(),
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

function makeLine(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'line-1',
    name: 'Test Line',
    slug: 'test-line',
    description: 'A test assembly line',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    stepCount: 3,
    activePackageCount: 5,
    ...overrides,
  };
}

const LINES = [
  makeLine({ id: 'line-1', name: 'Alpha Line', slug: 'alpha-line', status: 'ACTIVE' }),
  makeLine({ id: 'line-2', name: 'Beta Line', slug: 'beta-line', status: 'PAUSED', stepCount: 2, activePackageCount: 0 }),
  makeLine({ id: 'line-3', name: 'Gamma Line', slug: 'gamma-line', status: 'ARCHIVED', stepCount: 5, activePackageCount: 0 }),
  makeLine({ id: 'line-4', name: 'Delta Line', slug: 'delta-line', status: 'ERROR', stepCount: 1, activePackageCount: 2 }),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(initialEntries: string[] = ['/assembly-lines']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AssemblyLineListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssemblyLineListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.assemblyLines.list).mockResolvedValue(LINES as never);
  });

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------

  describe('Header', () => {
    it('renders the "Assembly Lines" heading', async () => {
      renderPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Assembly Lines' }),
      ).toBeInTheDocument();
    });

    it('renders the "Create Assembly Line" button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: /Create Assembly Line/i }),
      ).toBeInTheDocument();
    });

    it('navigates to /assembly-lines/create on button click', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        screen.getByRole('button', { name: /Create Assembly Line/i }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/assembly-lines/create');
    });
  });

  // -----------------------------------------------------------------------
  // Table rendering
  // -----------------------------------------------------------------------

  describe('Table rendering', () => {
    it('renders all assembly line rows after loading', async () => {
      renderPage();
      for (const line of LINES) {
        expect(
          await screen.findByText((line as { name: string }).name),
        ).toBeInTheDocument();
      }
    });

    it('renders name as a link to the detail page', async () => {
      renderPage();
      const link = await screen.findByRole('link', { name: 'Alpha Line' });
      expect(link).toHaveAttribute('href', '/assembly-lines/alpha-line');
    });

    it('renders status badges with correct labels', async () => {
      renderPage();
      expect(await screen.findByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Paused')).toBeInTheDocument();
      expect(screen.getByText('Archived')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('renders step count column', async () => {
      renderPage();
      await screen.findByText('Alpha Line');
      // stepCount of 3 for Alpha Line
      const rows = screen.getAllByRole('row');
      // row[0] is header, row[1] is Alpha Line
      const alphaRow = rows[1]!;
      const cells = within(alphaRow).getAllByRole('cell');
      expect(cells[2]!).toHaveTextContent('3');
    });

    it('renders active package count column', async () => {
      renderPage();
      await screen.findByText('Alpha Line');
      const rows = screen.getAllByRole('row');
      const alphaRow = rows[1]!;
      const cells = within(alphaRow).getAllByRole('cell');
      expect(cells[3]!).toHaveTextContent('5');
    });

    it('renders dash for missing step count', async () => {
      vi.mocked(client.assemblyLines.list).mockResolvedValue([
        makeLine({ stepCount: undefined, activePackageCount: undefined }),
      ] as never);
      renderPage();
      await screen.findByText('Test Line');
      const rows = screen.getAllByRole('row');
      const dataRow = rows[1]!;
      const cells = within(dataRow).getAllByRole('cell');
      expect(cells[2]!).toHaveTextContent('—');
      expect(cells[3]!).toHaveTextContent('—');
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

    it('applies gray classes for ARCHIVED status', async () => {
      renderPage();
      const badge = await screen.findByText('Archived');
      expect(badge.className).toContain('bg-gray-100');
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
      vi.mocked(client.assemblyLines.list).mockReturnValue(
        new Promise(() => {}),
      );
      const { container } = renderPage();
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show pagination while loading', () => {
      vi.mocked(client.assemblyLines.list).mockReturnValue(
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
      vi.mocked(client.assemblyLines.list).mockResolvedValue([] as never);
    });

    it('shows empty state message when no assembly lines exist', async () => {
      renderPage();
      expect(
        await screen.findByText('No Assembly Lines yet'),
      ).toBeInTheDocument();
    });

    it('shows a description of what assembly lines are', async () => {
      renderPage();
      expect(
        await screen.findByText(/Assembly Lines define the sequence/),
      ).toBeInTheDocument();
    });

    it('shows a CTA link to create the first assembly line', async () => {
      renderPage();
      const link = await screen.findByRole('link', {
        name: /Create your first Assembly Line/i,
      });
      expect(link).toHaveAttribute('href', '/assembly-lines/create');
    });

    it('does not render the table when empty', async () => {
      renderPage();
      await screen.findByText('No Assembly Lines yet');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  describe('Error state', () => {
    it('shows error message when API fails', async () => {
      vi.mocked(client.assemblyLines.list).mockRejectedValue(
        new Error('Service unavailable'),
      );
      renderPage();
      expect(
        await screen.findByText('Failed to load Assembly Lines'),
      ).toBeInTheDocument();
      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });

    it('has role="alert" on the error container', async () => {
      vi.mocked(client.assemblyLines.list).mockRejectedValue(
        new Error('Network error'),
      );
      renderPage();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('shows a retry button that refetches data', async () => {
      const user = userEvent.setup();
      vi.mocked(client.assemblyLines.list)
        .mockRejectedValueOnce(new Error('Oops'))
        .mockResolvedValueOnce(LINES as never);

      renderPage();
      const retryBtn = await screen.findByRole('button', { name: /Retry/i });
      await user.click(retryBtn);
      expect(client.assemblyLines.list).toHaveBeenCalledTimes(2);
    });

    it('does not render the table when errored', async () => {
      vi.mocked(client.assemblyLines.list).mockRejectedValue(
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
    it('opens a dropdown with View, Pause, Archive for active lines', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha Line');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!); // Alpha Line (ACTIVE)

      expect(screen.getByText('View')).toBeInTheDocument();
      expect(screen.getByText('Pause')).toBeInTheDocument();
      expect(screen.getByText('Archive')).toBeInTheDocument();
    });

    it('shows Resume instead of Pause for paused lines', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Beta Line');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[1]!); // Beta Line (PAUSED)

      expect(screen.getByText('Resume')).toBeInTheDocument();
      expect(screen.queryByText('Pause')).not.toBeInTheDocument();
    });

    it('does not show Pause/Resume/Archive for archived lines', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Gamma Line');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[2]!); // Gamma Line (ARCHIVED)

      expect(screen.getByText('View')).toBeInTheDocument();
      // No Pause/Resume/Archive items for archived lines
      expect(screen.queryByText('Pause')).not.toBeInTheDocument();
      expect(screen.queryByText('Resume')).not.toBeInTheDocument();
      expect(screen.queryByText('Archive')).not.toBeInTheDocument();
    });

    it('navigates to detail page when View is clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha Line');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!);
      await user.click(screen.getByText('View'));

      expect(mockNavigate).toHaveBeenCalledWith('/assembly-lines/alpha-line');
    });
  });

  // -----------------------------------------------------------------------
  // Confirmation dialog
  // -----------------------------------------------------------------------

  describe('Confirmation dialog', () => {
    it('opens a confirmation dialog when Pause is clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha Line');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!);
      await user.click(screen.getByText('Pause'));

      expect(
        screen.getByText('Pause Assembly Line'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/will stop processing new packages/),
      ).toBeInTheDocument();
    });

    it('opens a confirmation dialog when Resume is clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Beta Line');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[1]!);
      await user.click(screen.getByText('Resume'));

      expect(
        screen.getByText('Resume Assembly Line'),
      ).toBeInTheDocument();
    });

    it('opens a confirmation dialog when Archive is clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha Line');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!);
      await user.click(screen.getByText('Archive'));

      expect(
        screen.getByText('Archive Assembly Line'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/will remove it from the active list/),
      ).toBeInTheDocument();
    });

    it('calls update mutation when confirmed', async () => {
      const user = userEvent.setup();
      vi.mocked(client.assemblyLines.update).mockResolvedValue(
        makeLine({ status: 'PAUSED' }) as never,
      );

      renderPage();
      await screen.findByText('Alpha Line');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!);
      await user.click(screen.getByText('Pause'));

      // Click the confirm button in the dialog
      const confirmBtn = screen.getByRole('button', { name: 'Pause' });
      await user.click(confirmBtn);

      expect(client.assemblyLines.update).toHaveBeenCalledWith(
        'alpha-line',
        { status: 'PAUSED' },
      );
    });

    it('closes dialog on cancel', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha Line');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!);
      await user.click(screen.getByText('Pause'));

      expect(screen.getByText('Pause Assembly Line')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      // Dialog should close (title no longer visible)
      expect(
        screen.queryByText('Pause Assembly Line'),
      ).not.toBeInTheDocument();
    });

    it('shows loading state during mutation', async () => {
      const user = userEvent.setup();
      // Never resolve so we can see loading state
      vi.mocked(client.assemblyLines.update).mockReturnValue(
        new Promise(() => {}),
      );

      renderPage();
      await screen.findByText('Alpha Line');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!);
      await user.click(screen.getByText('Pause'));

      // Find the confirm button inside the dialog (not the dropdown)
      const dialog = screen.getByRole('dialog');
      const confirmBtn = within(dialog).getByRole('button', { name: 'Pause' });
      await user.click(confirmBtn);

      // Should show spinner (animate-spin) in the dialog while mutation is pending
      const spinner = dialog.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      // Cancel button should be disabled during mutation
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    it('uses destructive variant for archive confirm button', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha Line');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!);
      await user.click(screen.getByText('Archive'));

      const archiveBtn = screen.getByRole('button', { name: 'Archive' });
      // destructive variant gives a specific class
      expect(archiveBtn.className).toContain('destructive');
    });
  });

  // -----------------------------------------------------------------------
  // Sorting
  // -----------------------------------------------------------------------

  describe('Sorting', () => {
    it('passes sort param to API hook when column header clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha Line');

      await user.click(screen.getByRole('button', { name: /Name/i }));

      // Refetches with sort parameter
      expect(client.assemblyLines.list).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'name:asc' }),
        expect.anything(),
      );
    });

    it('toggles sort direction on second click', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha Line');

      const nameBtn = screen.getByRole('button', { name: /Name/i });
      await user.click(nameBtn);
      await user.click(nameBtn);

      expect(client.assemblyLines.list).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'name:desc' }),
        expect.anything(),
      );
    });

    it('clears sort on third click', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Alpha Line');

      const nameBtn = screen.getByRole('button', { name: /Name/i });
      await user.click(nameBtn); // asc
      await user.click(nameBtn); // desc
      await user.click(nameBtn); // clear

      // The last call should have no sort
      const lastCall = vi.mocked(client.assemblyLines.list).mock.calls.at(-1);
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
      await screen.findByText('Alpha Line');
      expect(screen.getByText('Page 1')).toBeInTheDocument();
    });

    it('disables Previous button on first page', async () => {
      renderPage();
      await screen.findByText('Alpha Line');
      expect(
        screen.getByRole('button', { name: 'Previous' }),
      ).toBeDisabled();
    });

    it('enables Next when results fill the page', async () => {
      // Return exactly 10 items to indicate there might be more
      const tenLines = Array.from({ length: 10 }, (_, i) =>
        makeLine({ id: `line-${i}`, name: `Line ${i}`, slug: `line-${i}` }),
      );
      vi.mocked(client.assemblyLines.list).mockResolvedValue(
        tenLines as never,
      );

      renderPage();
      await screen.findByText('Line 0');
      expect(
        screen.getByRole('button', { name: 'Next' }),
      ).not.toBeDisabled();
    });

    it('disables Next when results are fewer than limit', async () => {
      // 4 items < default limit of 10
      renderPage();
      await screen.findByText('Alpha Line');
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });

    it('updates search params when Next is clicked', async () => {
      const user = userEvent.setup();
      const tenLines = Array.from({ length: 10 }, (_, i) =>
        makeLine({ id: `line-${i}`, name: `Line ${i}`, slug: `line-${i}` }),
      );
      vi.mocked(client.assemblyLines.list).mockResolvedValue(
        tenLines as never,
      );

      renderPage();
      await screen.findByText('Line 0');

      await user.click(screen.getByRole('button', { name: 'Next' }));

      // After clicking Next, the API should be called with page 2
      expect(client.assemblyLines.list).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything(),
      );
    });

    it('passes page and limit to API hook', async () => {
      renderPage(['/assembly-lines?page=3&limit=5']);
      await screen.findByText('Alpha Line');

      expect(client.assemblyLines.list).toHaveBeenCalledWith(
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
      vi.mocked(client.assemblyLines.list).mockResolvedValue([
        makeLine({ status: 'CUSTOM_STATUS' }),
      ] as never);
      renderPage();
      const badge = await screen.findByText('CUSTOM_STATUS');
      expect(badge.className).toContain('bg-gray-100');
    });
  });
});
