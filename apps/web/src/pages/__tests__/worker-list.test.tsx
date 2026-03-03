import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkerListPage from '../worker-list';
import * as client from '@/api/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  workers: {
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

function makeWorker(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'w-1',
    name: 'Summarizer',
    slug: 'summarizer',
    description: 'Summarizes text documents',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    versions: [
      {
        id: 'wv-1',
        workerId: 'w-1',
        version: '3',
        status: 'ACTIVE',
        yamlConfig: {
          name: 'Summarizer',
          inputTypes: ['text', 'pdf'],
          outputType: 'text',
          provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'KEY' },
        },
        createdAt: '2026-01-15T00:00:00Z',
      },
    ],
    ...overrides,
  };
}

const WORKERS = [
  makeWorker(),
  makeWorker({
    id: 'w-2',
    name: 'Code Reviewer',
    slug: 'code-reviewer',
    description: 'Reviews code for quality',
    versions: [
      {
        id: 'wv-2',
        workerId: 'w-2',
        version: '1',
        status: 'ACTIVE',
        yamlConfig: {
          name: 'Code Reviewer',
          inputTypes: ['code'],
          outputType: 'review',
          provider: { name: 'anthropic', model: 'claude-3', apiKeyEnv: 'KEY' },
        },
        createdAt: '2026-01-10T00:00:00Z',
      },
    ],
  }),
  makeWorker({
    id: 'w-3',
    name: 'Deprecated Worker',
    slug: 'deprecated-worker',
    description: null,
    versions: [
      {
        id: 'wv-3',
        workerId: 'w-3',
        version: '2',
        status: 'DEPRECATED',
        yamlConfig: {
          name: 'Deprecated Worker',
          inputTypes: ['text'],
          outputType: 'text',
          provider: { name: 'openai', model: 'gpt-3.5', apiKeyEnv: 'KEY' },
        },
        createdAt: '2026-01-05T00:00:00Z',
      },
    ],
  }),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(initialEntries: string[] = ['/workers']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <WorkerListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.workers.list).mockResolvedValue(WORKERS as never);
  });

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------

  describe('Header', () => {
    it('renders the "Workers" heading', async () => {
      renderPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Workers' }),
      ).toBeInTheDocument();
    });

    it('renders the "Register Worker" button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: /Register Worker/i }),
      ).toBeInTheDocument();
    });

    it('navigates to /workers/create on button click', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        screen.getByRole('button', { name: /Register Worker/i }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/workers/create');
    });
  });

  // -----------------------------------------------------------------------
  // Card grid rendering
  // -----------------------------------------------------------------------

  describe('Card grid rendering', () => {
    it('renders all worker cards after loading', async () => {
      renderPage();
      expect(await screen.findByText('Summarizer')).toBeInTheDocument();
      expect(screen.getByText('Code Reviewer')).toBeInTheDocument();
      expect(screen.getByText('Deprecated Worker')).toBeInTheDocument();
    });

    it('renders worker name as heading', async () => {
      renderPage();
      expect(await screen.findByText('Summarizer')).toBeInTheDocument();
    });

    it('renders version badge', async () => {
      renderPage();
      expect(await screen.findByText('v3')).toBeInTheDocument();
      expect(screen.getByText('v1')).toBeInTheDocument();
    });

    it('renders input type badges', async () => {
      renderPage();
      await screen.findByText('Summarizer');
      // "text" appears as both input and output type for multiple workers
      const textBadges = screen.getAllByText('text');
      expect(textBadges.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('pdf')).toBeInTheDocument();
      expect(screen.getByText('code')).toBeInTheDocument();
    });

    it('renders output type badges', async () => {
      renderPage();
      await screen.findByText('Summarizer');
      expect(screen.getByText('review')).toBeInTheDocument();
    });

    it('renders status badge with correct label', async () => {
      renderPage();
      const activeBadges = await screen.findAllByText('Active');
      expect(activeBadges.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Deprecated')).toBeInTheDocument();
    });

    it('renders description when present', async () => {
      renderPage();
      expect(
        await screen.findByText('Summarizes text documents'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Reviews code for quality'),
      ).toBeInTheDocument();
    });

    it('renders cards as links to detail page', async () => {
      renderPage();
      await screen.findByText('Summarizer');
      const card = screen.getByTestId('worker-card-summarizer');
      expect(card).toHaveAttribute('href', '/workers/summarizer');
    });

    it('uses responsive grid classes', async () => {
      renderPage();
      await screen.findByText('Summarizer');
      const grid = screen.getByTestId('worker-card-summarizer').parentElement;
      expect(grid?.className).toContain('grid-cols-1');
      expect(grid?.className).toContain('sm:grid-cols-2');
      expect(grid?.className).toContain('lg:grid-cols-3');
    });
  });

  // -----------------------------------------------------------------------
  // Worker without versions
  // -----------------------------------------------------------------------

  describe('Worker without versions', () => {
    it('renders card without version badge', async () => {
      vi.mocked(client.workers.list).mockResolvedValue([
        makeWorker({ versions: [] }),
      ] as never);
      renderPage();
      expect(await screen.findByText('Summarizer')).toBeInTheDocument();
      expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Status badge colors
  // -----------------------------------------------------------------------

  describe('Status badge colors', () => {
    it('applies green classes for ACTIVE status', async () => {
      renderPage();
      const activeBadges = await screen.findAllByText('Active');
      expect(activeBadges[0]!.className).toContain('bg-green-100');
    });

    it('applies gray classes for DEPRECATED status', async () => {
      renderPage();
      const badge = await screen.findByText('Deprecated');
      expect(badge.className).toContain('bg-gray-100');
    });
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  describe('Loading state', () => {
    it('shows skeleton cards while loading', () => {
      vi.mocked(client.workers.list).mockReturnValue(new Promise(() => {}));
      const { container } = renderPage();
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  describe('Empty state', () => {
    beforeEach(() => {
      vi.mocked(client.workers.list).mockResolvedValue([] as never);
    });

    it('shows empty state message when no Workers exist', async () => {
      renderPage();
      expect(
        await screen.findByText('No Workers yet'),
      ).toBeInTheDocument();
    });

    it('shows a CTA link to register the first Worker', async () => {
      renderPage();
      const link = await screen.findByRole('link', {
        name: /Register your first Worker/i,
      });
      expect(link).toHaveAttribute('href', '/workers/create');
    });

    it('does not render the card grid when empty', async () => {
      renderPage();
      await screen.findByText('No Workers yet');
      expect(
        screen.queryByTestId('worker-card-summarizer'),
      ).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  describe('Error state', () => {
    it('shows error message when API fails', async () => {
      vi.mocked(client.workers.list).mockRejectedValue(
        new Error('Service unavailable'),
      );
      renderPage();
      expect(
        await screen.findByText('Failed to load Workers'),
      ).toBeInTheDocument();
      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });

    it('has role="alert" on the error container', async () => {
      vi.mocked(client.workers.list).mockRejectedValue(
        new Error('Network error'),
      );
      renderPage();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('shows a retry button that refetches data', async () => {
      const user = userEvent.setup();
      vi.mocked(client.workers.list)
        .mockRejectedValueOnce(new Error('Oops'))
        .mockResolvedValueOnce(WORKERS as never);

      renderPage();
      const retryBtn = await screen.findByRole('button', { name: /Retry/i });
      await user.click(retryBtn);
      expect(client.workers.list).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Search/filter
  // -----------------------------------------------------------------------

  describe('Search', () => {
    it('renders search input', async () => {
      renderPage();
      await screen.findByText('Summarizer');
      expect(
        screen.getByPlaceholderText('Search Workers by name…'),
      ).toBeInTheDocument();
    });

    it('passes name param to API when searching', async () => {
      const user = userEvent.setup();

      renderPage();
      await screen.findByText('Summarizer');

      const input = screen.getByPlaceholderText('Search Workers by name…');
      await user.clear(input);
      await user.type(input, 'sum');

      // Wait for debounce and re-query
      await vi.waitFor(() => {
        expect(client.workers.list).toHaveBeenCalledWith(
          { name: 'sum' },
          expect.anything(),
        );
      }, { timeout: 2000 });
    });

    it('shows no results state when search returns empty', async () => {
      vi.mocked(client.workers.list)
        .mockResolvedValueOnce(WORKERS as never) // initial load
        .mockResolvedValue([] as never); // search results

      const user = userEvent.setup();

      renderPage();
      await screen.findByText('Summarizer');

      const input = screen.getByPlaceholderText('Search Workers by name…');
      await user.type(input, 'nonexistent');

      expect(
        await screen.findByText('No Workers found', {}, { timeout: 2000 }),
      ).toBeInTheDocument();
    });
  });
});
