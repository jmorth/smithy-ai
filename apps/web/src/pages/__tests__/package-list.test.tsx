import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PackageListPage from '../package-list';
import * as client from '@/api/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  packages: {
    list: vi.fn(),
    get: vi.fn(),
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

function makePkg(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pkg-abcdef12-3456-7890-abcd-ef1234567890',
    type: 'CODE',
    status: 'PENDING',
    metadata: {},
    assemblyLineId: 'al-1',
    createdAt: '2026-01-15T10:30:00Z',
    updatedAt: '2026-01-15T10:30:00Z',
    ...overrides,
  };
}

const PACKAGES = [
  makePkg({
    id: 'pkg-aaaaaaaa-1111-2222-3333-444444444444',
    type: 'CODE',
    status: 'COMPLETED',
    assemblyLineId: 'al-1',
    createdAt: '2026-01-15T10:30:00Z',
  }),
  makePkg({
    id: 'pkg-bbbbbbbb-5555-6666-7777-888888888888',
    type: 'USER_INPUT',
    status: 'PROCESSING',
    assemblyLineId: undefined,
    createdAt: '2026-01-14T08:00:00Z',
  }),
  makePkg({
    id: 'pkg-cccccccc-9999-0000-1111-222222222222',
    type: 'IMAGE',
    status: 'FAILED',
    assemblyLineId: 'al-2',
    createdAt: '2026-01-13T14:15:00Z',
  }),
];

function makePaginatedResponse(
  items = PACKAGES,
  { total, cursor }: { total?: number; cursor?: string } = {},
) {
  return { data: items, total: total ?? items.length, cursor };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(initialEntries: string[] = ['/packages']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <PackageListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PackageListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.packages.list).mockResolvedValue(
      makePaginatedResponse() as never,
    );
  });

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------

  describe('Header', () => {
    it('renders the "Packages" heading', async () => {
      renderPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Packages' }),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Table rendering
  // -----------------------------------------------------------------------

  describe('Table rendering', () => {
    it('renders all package rows after loading', async () => {
      renderPage();
      // IDs are truncated to 8 chars
      expect(await screen.findByText('pkg-aaaa')).toBeInTheDocument();
      expect(screen.getByText('pkg-bbbb')).toBeInTheDocument();
      expect(screen.getByText('pkg-cccc')).toBeInTheDocument();
    });

    it('renders truncated ID as a link to detail page', async () => {
      renderPage();
      const link = await screen.findByRole('link', { name: 'pkg-aaaa' });
      expect(link).toHaveAttribute(
        'href',
        '/packages/pkg-aaaaaaaa-1111-2222-3333-444444444444',
      );
    });

    it('shows full ID in title attribute', async () => {
      renderPage();
      const link = await screen.findByRole('link', { name: 'pkg-aaaa' });
      expect(link).toHaveAttribute(
        'title',
        'pkg-aaaaaaaa-1111-2222-3333-444444444444',
      );
    });

    it('renders type badges', async () => {
      renderPage();
      expect(await screen.findByText('Code')).toBeInTheDocument();
      expect(screen.getByText('User Input')).toBeInTheDocument();
      expect(screen.getByText('Image')).toBeInTheDocument();
    });

    it('renders status badges with correct labels', async () => {
      renderPage();
      expect(await screen.findByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('renders workflow link for packages with assemblyLineId', async () => {
      renderPage();
      const links = await screen.findAllByRole('link', {
        name: 'Assembly Line',
      });
      expect(links.length).toBeGreaterThan(0);
      expect(links[0]).toHaveAttribute('href', '/assembly-lines/al-1');
    });

    it('renders dash for packages without workflow', async () => {
      renderPage();
      await screen.findByText('pkg-aaaa');
      const rows = screen.getAllByRole('row');
      // Row 2 is the USER_INPUT package with no assemblyLineId
      const row2 = rows[2]!;
      const cells = within(row2).getAllByRole('cell');
      expect(cells[3]).toHaveTextContent('—');
    });

    it('renders formatted dates', async () => {
      renderPage();
      await screen.findByText('pkg-aaaa');
      // Dates should be formatted (locale-dependent, so just check they're present)
      const rows = screen.getAllByRole('row');
      const firstDataRow = rows[1]!;
      const cells = within(firstDataRow).getAllByRole('cell');
      // Created At column (index 4)
      expect(cells[4]!.textContent).toBeTruthy();
    });

    it('renders sortable column headers', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: /Type/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Status/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Created/i }),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Status badge color classes
  // -----------------------------------------------------------------------

  describe('Status badge colors', () => {
    it('applies green classes for COMPLETED status', async () => {
      renderPage();
      await screen.findByText('pkg-aaaa');
      const table = screen.getByRole('table');
      const badge = within(table).getByText('Completed');
      expect(badge.className).toContain('bg-green-100');
    });

    it('applies yellow classes for PROCESSING status', async () => {
      renderPage();
      await screen.findByText('pkg-aaaa');
      const table = screen.getByRole('table');
      const badge = within(table).getByText('Processing');
      expect(badge.className).toContain('bg-yellow-100');
    });

    it('applies red classes for FAILED status', async () => {
      renderPage();
      await screen.findByText('pkg-aaaa');
      const table = screen.getByRole('table');
      const badge = within(table).getByText('Failed');
      expect(badge.className).toContain('bg-red-100');
    });

    it('applies gray classes for PENDING status', async () => {
      vi.mocked(client.packages.list).mockResolvedValue(
        makePaginatedResponse([makePkg({ id: 'pkg-pend1234', status: 'PENDING' })]) as never,
      );
      renderPage();
      await screen.findByText('pkg-pend');
      const table = screen.getByRole('table');
      const badge = within(table).getByText('Pending');
      expect(badge.className).toContain('bg-gray-100');
    });

    it('applies blue classes for IN_TRANSIT status', async () => {
      vi.mocked(client.packages.list).mockResolvedValue(
        makePaginatedResponse([makePkg({ id: 'pkg-tran1234', status: 'IN_TRANSIT' })]) as never,
      );
      renderPage();
      await screen.findByText('pkg-tran');
      const table = screen.getByRole('table');
      const badge = within(table).getByText('In Transit');
      expect(badge.className).toContain('bg-blue-100');
    });

    it('applies line-through for EXPIRED status', async () => {
      vi.mocked(client.packages.list).mockResolvedValue(
        makePaginatedResponse([makePkg({ id: 'pkg-exp11234', status: 'EXPIRED' })]) as never,
      );
      renderPage();
      await screen.findByText('pkg-exp1');
      const table = screen.getByRole('table');
      const badge = within(table).getByText('Expired');
      expect(badge.className).toContain('line-through');
    });
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  describe('Loading state', () => {
    it('shows skeleton rows while loading', () => {
      vi.mocked(client.packages.list).mockReturnValue(
        new Promise(() => {}) as never,
      );
      const { container } = renderPage();
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show pagination while loading', () => {
      vi.mocked(client.packages.list).mockReturnValue(
        new Promise(() => {}) as never,
      );
      renderPage();
      expect(screen.queryByText('First')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Empty states
  // -----------------------------------------------------------------------

  describe('Empty state', () => {
    it('shows "No Packages yet" when no data exists', async () => {
      vi.mocked(client.packages.list).mockResolvedValue(
        makePaginatedResponse([]) as never,
      );
      renderPage();
      expect(
        await screen.findByText('No Packages yet'),
      ).toBeInTheDocument();
    });

    it('does not render the table when empty', async () => {
      vi.mocked(client.packages.list).mockResolvedValue(
        makePaginatedResponse([]) as never,
      );
      renderPage();
      await screen.findByText('No Packages yet');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('No results state (with filters)', () => {
    it('shows "No Packages match your filters" when filters return nothing', async () => {
      vi.mocked(client.packages.list).mockResolvedValue(
        makePaginatedResponse([]) as never,
      );
      renderPage(['/packages?type=CODE']);
      expect(
        await screen.findByText('No Packages match your filters'),
      ).toBeInTheDocument();
    });

    it('shows clear filters button in no-results state', async () => {
      vi.mocked(client.packages.list).mockResolvedValue(
        makePaginatedResponse([]) as never,
      );
      renderPage(['/packages?status=FAILED']);
      expect(
        await screen.findByRole('button', { name: /Clear filters/i }),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  describe('Error state', () => {
    it('shows error message when API fails', async () => {
      vi.mocked(client.packages.list).mockRejectedValue(
        new Error('Service unavailable'),
      );
      renderPage();
      expect(
        await screen.findByText('Failed to load Packages'),
      ).toBeInTheDocument();
      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });

    it('has role="alert" on the error container', async () => {
      vi.mocked(client.packages.list).mockRejectedValue(
        new Error('Network error'),
      );
      renderPage();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('shows a retry button that refetches data', async () => {
      const user = userEvent.setup();
      vi.mocked(client.packages.list)
        .mockRejectedValueOnce(new Error('Oops'))
        .mockResolvedValueOnce(makePaginatedResponse() as never);

      renderPage();
      const retryBtn = await screen.findByRole('button', { name: /Retry/i });
      await user.click(retryBtn);
      expect(client.packages.list).toHaveBeenCalledTimes(2);
    });

    it('does not render the table when errored', async () => {
      vi.mocked(client.packages.list).mockRejectedValue(
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
      await screen.findByText('pkg-aaaa');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!);

      expect(screen.getByText('View')).toBeInTheDocument();
    });

    it('navigates to detail page when View is clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('pkg-aaaa');

      const actionButtons = screen.getAllByRole('button', {
        name: /Open actions for/i,
      });
      await user.click(actionButtons[0]!);
      await user.click(screen.getByText('View'));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/packages/pkg-aaaaaaaa-1111-2222-3333-444444444444',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Sorting
  // -----------------------------------------------------------------------

  describe('Sorting', () => {
    it('passes sort param to API hook when column header clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('pkg-aaaa');

      await user.click(screen.getByRole('button', { name: /Type/i }));

      expect(client.packages.list).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'type:asc' }),
        expect.anything(),
      );
    });

    it('toggles sort direction on second click', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('pkg-aaaa');

      const typeBtn = screen.getByRole('button', { name: /Type/i });
      await user.click(typeBtn);
      await user.click(typeBtn);

      expect(client.packages.list).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'type:desc' }),
        expect.anything(),
      );
    });

    it('clears sort on third click', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('pkg-aaaa');

      const typeBtn = screen.getByRole('button', { name: /Type/i });
      await user.click(typeBtn);
      await user.click(typeBtn);
      await user.click(typeBtn);

      const lastCall = vi.mocked(client.packages.list).mock.calls.at(-1);
      expect(lastCall?.[0]).not.toHaveProperty('sort');
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------

  describe('Pagination', () => {
    it('shows total count info', async () => {
      renderPage();
      await screen.findByText('pkg-aaaa');
      expect(screen.getByText(/Showing 3 of 3 Packages/)).toBeInTheDocument();
    });

    it('disables First button when no cursor', async () => {
      renderPage();
      await screen.findByText('pkg-aaaa');
      expect(
        screen.getByRole('button', { name: 'First' }),
      ).toBeDisabled();
    });

    it('disables Next when no next cursor', async () => {
      renderPage();
      await screen.findByText('pkg-aaaa');
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });

    it('enables Next when cursor is present in response', async () => {
      vi.mocked(client.packages.list).mockResolvedValue(
        makePaginatedResponse(PACKAGES, { total: 30, cursor: 'next-cursor-id' }) as never,
      );
      renderPage();
      await screen.findByText('pkg-aaaa');
      expect(
        screen.getByRole('button', { name: 'Next' }),
      ).not.toBeDisabled();
    });

    it('passes cursor and limit to API hook', async () => {
      renderPage(['/packages?cursor=some-cursor&limit=25']);
      await screen.findByText('pkg-aaaa');

      expect(client.packages.list).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 'some-cursor', limit: 25 }),
        expect.anything(),
      );
    });

    it('renders items per page selector', async () => {
      renderPage();
      await screen.findByText('pkg-aaaa');
      const select = screen.getByLabelText('Per page:');
      expect(select).toBeInTheDocument();
    });

    it('changes limit when items per page selector is changed', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('pkg-aaaa');
      const select = screen.getByLabelText('Per page:');
      await user.selectOptions(select, '25');

      expect(client.packages.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25 }),
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Filter bar
  // -----------------------------------------------------------------------

  describe('Filter bar', () => {
    it('renders search input', () => {
      renderPage();
      expect(screen.getByLabelText('Search')).toBeInTheDocument();
    });

    it('renders type dropdown', () => {
      renderPage();
      expect(screen.getByLabelText('Type')).toBeInTheDocument();
    });

    it('renders status filter buttons', () => {
      renderPage();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('In Transit')).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Expired')).toBeInTheDocument();
    });

    it('renders date range inputs', () => {
      renderPage();
      expect(screen.getByLabelText('Created after')).toBeInTheDocument();
      expect(screen.getByLabelText('Created before')).toBeInTheDocument();
    });

    it('passes type filter to API when changed', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('pkg-aaaa');

      const select = screen.getByLabelText('Type');
      await user.selectOptions(select, 'CODE');

      expect(client.packages.list).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CODE' }),
        expect.anything(),
      );
    });

    it('passes status filter to API when toggled', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('pkg-aaaa');

      // The status filter buttons - click "Failed"
      const failedBtn = screen.getAllByText('Failed').find(
        (el) => el.tagName === 'BUTTON',
      )!;
      await user.click(failedBtn);

      expect(client.packages.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
        expect.anything(),
      );
    });

    it('supports multi-select for status filter', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('pkg-aaaa');

      const failedBtn = screen.getAllByText('Failed').find(
        (el) => el.tagName === 'BUTTON',
      )!;
      const pendingBtn = screen.getAllByText('Pending').find(
        (el) => el.tagName === 'BUTTON',
      )!;
      await user.click(failedBtn);
      await user.click(pendingBtn);

      expect(client.packages.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED,PENDING' }),
        expect.anything(),
      );
    });

    it('shows clear filters button when filters are active', async () => {
      renderPage(['/packages?type=CODE']);
      expect(
        await screen.findByRole('button', { name: /Clear filters/i }),
      ).toBeInTheDocument();
    });

    it('hides clear filters button when no filters are active', () => {
      renderPage();
      const clearBtns = screen.queryAllByRole('button', {
        name: /Clear filters/i,
      });
      expect(clearBtns.length).toBe(0);
    });

    it('clears all filters when clear button is clicked', async () => {
      const user = userEvent.setup();
      renderPage(['/packages?type=CODE&status=FAILED']);
      const clearBtn = await screen.findByRole('button', {
        name: /Clear filters/i,
      });
      await user.click(clearBtn);

      // After clearing, should fetch without filters
      expect(client.packages.list).toHaveBeenCalledWith(
        expect.not.objectContaining({ type: 'CODE' }),
        expect.anything(),
      );
    });

    it('debounces search input', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        renderPage();
        await screen.findByText('pkg-aaaa');

        const searchInput = screen.getByLabelText('Search');
        await user.type(searchInput, 'test');

        // Advance past debounce delay
        await vi.advanceTimersByTimeAsync(400);

        // Wait for React to process the state update and re-render
        await waitFor(() => {
          expect(client.packages.list).toHaveBeenCalledWith(
            expect.objectContaining({ search: 'test' }),
            expect.anything(),
          );
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // -----------------------------------------------------------------------
  // URL search params persistence
  // -----------------------------------------------------------------------

  describe('URL search params', () => {
    it('reads type filter from URL', async () => {
      renderPage(['/packages?type=IMAGE']);

      expect(client.packages.list).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'IMAGE' }),
        expect.anything(),
      );
    });

    it('reads status filter from URL', async () => {
      renderPage(['/packages?status=FAILED,COMPLETED']);

      expect(client.packages.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED,COMPLETED' }),
        expect.anything(),
      );
    });

    it('reads date range from URL', async () => {
      renderPage(['/packages?createdAfter=2026-01-01&createdBefore=2026-01-31']);

      expect(client.packages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAfter: expect.stringContaining('2026-01-01'),
          createdBefore: expect.stringContaining('2026-01-31'),
        }),
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Unknown status/type handling
  // -----------------------------------------------------------------------

  describe('Unknown status/type handling', () => {
    it('renders unknown status as-is with gray styling', async () => {
      vi.mocked(client.packages.list).mockResolvedValue(
        makePaginatedResponse([makePkg({ id: 'pkg-unk11234', status: 'CUSTOM_STATUS' })]) as never,
      );
      renderPage();
      await screen.findByText('pkg-unk1');
      const table = screen.getByRole('table');
      const badge = within(table).getByText('CUSTOM_STATUS');
      expect(badge.className).toContain('bg-gray-100');
    });

    it('renders unknown type as-is with gray styling', async () => {
      vi.mocked(client.packages.list).mockResolvedValue(
        makePaginatedResponse([makePkg({ id: 'pkg-unk21234', type: 'CUSTOM_TYPE' })]) as never,
      );
      renderPage();
      await screen.findByText('pkg-unk2');
      const table = screen.getByRole('table');
      const badge = within(table).getByText('CUSTOM_TYPE');
      expect(badge.className).toContain('bg-gray-100');
    });
  });
});
