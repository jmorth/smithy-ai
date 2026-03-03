import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkerPoolCreatePage from '../worker-pool-create';
import * as client from '@/api/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  workerPools: {
    create: vi.fn(),
  },
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

const WORKERS = [
  { id: 'w1', name: 'Summarizer', slug: 'summarizer', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'w2', name: 'Reviewer', slug: 'reviewer', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'w3', name: 'Translator', slug: 'translator', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/worker-pools/create']}>
        <WorkerPoolCreatePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerPoolCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.workers.list).mockResolvedValue(WORKERS as never);
  });

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------

  describe('Header', () => {
    it('renders the "Create Worker Pool" heading', async () => {
      renderPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Create Worker Pool' }),
      ).toBeInTheDocument();
    });

    it('has a back button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: /Back to Worker Pools/i }),
      ).toBeInTheDocument();
    });

    it('navigates back to list on back button click', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        screen.getByRole('button', { name: /Back to Worker Pools/i }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/worker-pools');
    });
  });

  // -----------------------------------------------------------------------
  // Form fields
  // -----------------------------------------------------------------------

  describe('Form fields', () => {
    it('renders name input', () => {
      renderPage();
      expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    });

    it('renders description textarea', () => {
      renderPage();
      expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    });

    it('renders worker member search input', () => {
      renderPage();
      expect(screen.getByLabelText(/Search workers/)).toBeInTheDocument();
    });

    it('renders max concurrency slider', () => {
      renderPage();
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('renders max concurrency number input defaulting to 5', () => {
      renderPage();
      const input = screen.getByLabelText(/Max concurrency value/);
      expect(input).toHaveValue(5);
    });
  });

  // -----------------------------------------------------------------------
  // Worker member selector
  // -----------------------------------------------------------------------

  describe('Worker member selector', () => {
    it('shows dropdown with workers when search input is focused', async () => {
      const user = userEvent.setup();
      renderPage();

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.click(searchInput);

      expect(await screen.findByText('Summarizer')).toBeInTheDocument();
      expect(screen.getByText('Reviewer')).toBeInTheDocument();
      expect(screen.getByText('Translator')).toBeInTheDocument();
    });

    it('filters workers by search term', async () => {
      const user = userEvent.setup();
      renderPage();

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.type(searchInput, 'sum');

      expect(await screen.findByText('Summarizer')).toBeInTheDocument();
      expect(screen.queryByText('Reviewer')).not.toBeInTheDocument();
    });

    it('adds a worker as a chip when clicked', async () => {
      const user = userEvent.setup();
      renderPage();

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.click(searchInput);

      await user.click(await screen.findByText('Summarizer'));

      expect(screen.getByTestId('selected-members')).toHaveTextContent('Summarizer');
    });

    it('shows remove button on selected chip', async () => {
      const user = userEvent.setup();
      renderPage();

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.click(searchInput);
      await user.click(await screen.findByText('Summarizer'));

      expect(
        screen.getByRole('button', { name: /Remove Summarizer/i }),
      ).toBeInTheDocument();
    });

    it('removes a worker when chip remove button is clicked', async () => {
      const user = userEvent.setup();
      renderPage();

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.click(searchInput);
      await user.click(await screen.findByText('Summarizer'));

      await user.click(
        screen.getByRole('button', { name: /Remove Summarizer/i }),
      );

      expect(screen.queryByTestId('selected-members')).not.toBeInTheDocument();
    });

    it('disables already-selected workers in dropdown', async () => {
      const user = userEvent.setup();
      renderPage();

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.click(searchInput);
      await user.click(await screen.findByText('Summarizer'));

      // Re-open dropdown
      await user.click(searchInput);

      // Summarizer should show "Selected" text
      expect(await screen.findByText('Selected')).toBeInTheDocument();
    });

    it('shows "No workers found" for non-matching search', async () => {
      const user = userEvent.setup();
      renderPage();

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.type(searchInput, 'zzzznonexistent');

      expect(await screen.findByText('No workers found')).toBeInTheDocument();
    });

    it('shows loading state while workers are loading', async () => {
      vi.mocked(client.workers.list).mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      renderPage();

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.click(searchInput);

      expect(await screen.findByText('Loading workers...')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  describe('Validation', () => {
    it('shows error when name is empty on submit', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: /Create Worker Pool/i }));

      expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    });

    it('shows error when no members selected on submit', async () => {
      const user = userEvent.setup();
      renderPage();

      const nameInput = screen.getByLabelText(/Name/);
      await user.type(nameInput, 'Test Pool');

      await user.click(screen.getByRole('button', { name: /Create Worker Pool/i }));

      expect(await screen.findByText('At least 1 Worker member is required.')).toBeInTheDocument();
    });

    it('clears name error when user starts typing', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: /Create Worker Pool/i }));
      expect(await screen.findByText('Name is required.')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/Name/), 'A');
      expect(screen.queryByText('Name is required.')).not.toBeInTheDocument();
    });

    it('clears members error when a member is selected', async () => {
      const user = userEvent.setup();
      renderPage();

      const nameInput = screen.getByLabelText(/Name/);
      await user.type(nameInput, 'Test Pool');

      await user.click(screen.getByRole('button', { name: /Create Worker Pool/i }));
      expect(await screen.findByText('At least 1 Worker member is required.')).toBeInTheDocument();

      // Select a worker
      const searchInput = screen.getByLabelText(/Search workers/);
      await user.click(searchInput);
      await user.click(await screen.findByText('Summarizer'));

      expect(screen.queryByText('At least 1 Worker member is required.')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  describe('Submit', () => {
    it('calls create mutation with correct data on valid submit', async () => {
      const user = userEvent.setup();
      vi.mocked(client.workerPools.create).mockResolvedValue({
        id: 'new-pool',
        name: 'Test Pool',
        slug: 'test-pool',
        maxConcurrency: 5,
      } as never);

      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'Test Pool');

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.click(searchInput);
      await user.click(await screen.findByText('Summarizer'));

      await user.click(screen.getByRole('button', { name: /Create Worker Pool/i }));

      expect(client.workerPools.create).toHaveBeenCalledWith({
        name: 'Test Pool',
        members: [{ workerVersionId: 'w1' }],
        maxConcurrency: 5,
      });
    });

    it('navigates to detail page on success', async () => {
      const user = userEvent.setup();
      vi.mocked(client.workerPools.create).mockResolvedValue({
        id: 'new-pool',
        name: 'Test Pool',
        slug: 'test-pool',
        maxConcurrency: 5,
      } as never);

      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'Test Pool');

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.click(searchInput);
      await user.click(await screen.findByText('Summarizer'));

      await user.click(screen.getByRole('button', { name: /Create Worker Pool/i }));

      await vi.waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/worker-pools/test-pool');
      });
    });

    it('shows API error on failure', async () => {
      const user = userEvent.setup();
      vi.mocked(client.workerPools.create).mockRejectedValue(
        new client.ApiError(422, 'Name already taken'),
      );

      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'Duplicate Pool');

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.click(searchInput);
      await user.click(await screen.findByText('Summarizer'));

      await user.click(screen.getByRole('button', { name: /Create Worker Pool/i }));

      expect(await screen.findByText('Name already taken')).toBeInTheDocument();
    });

    it('shows loading spinner while creating', async () => {
      const user = userEvent.setup();
      vi.mocked(client.workerPools.create).mockReturnValue(new Promise(() => {}));

      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'Test Pool');

      const searchInput = screen.getByLabelText(/Search workers/);
      await user.click(searchInput);
      await user.click(await screen.findByText('Summarizer'));

      await user.click(screen.getByRole('button', { name: /Create Worker Pool/i }));

      expect(await screen.findByText('Creating...')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Cancel
  // -----------------------------------------------------------------------

  describe('Cancel', () => {
    it('navigates back to list on cancel', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockNavigate).toHaveBeenCalledWith('/worker-pools');
    });
  });
});
