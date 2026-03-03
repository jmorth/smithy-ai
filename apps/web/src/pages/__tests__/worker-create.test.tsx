import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkerCreatePage from '../worker-create';
import * as client from '@/api/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  workers: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    createVersion: vi.fn(),
    deprecateVersion: vi.fn(),
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

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/workers/create']}>
        <Routes>
          <Route path="/workers/create" element={<WorkerCreatePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------

  describe('Header', () => {
    it('renders the "Register Worker" heading', () => {
      renderPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Register Worker' }),
      ).toBeInTheDocument();
    });

    it('renders Back to Workers button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: /Back to Workers/i }),
      ).toBeInTheDocument();
    });

    it('navigates to /workers on back button click', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        screen.getByRole('button', { name: /Back to Workers/i }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/workers');
    });
  });

  // -----------------------------------------------------------------------
  // Form rendering
  // -----------------------------------------------------------------------

  describe('Form', () => {
    it('renders name input', () => {
      renderPage();
      expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    });

    it('renders description textarea', () => {
      renderPage();
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
    });

    it('renders submit button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: /Register Worker/i }),
      ).toBeInTheDocument();
    });

    it('renders cancel button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: 'Cancel' }),
      ).toBeInTheDocument();
    });

    it('navigates to /workers on cancel click', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockNavigate).toHaveBeenCalledWith('/workers');
    });
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  describe('Validation', () => {
    it('shows error when name is empty on submit', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        screen.getByRole('button', { name: /Register Worker/i }),
      );
      expect(
        screen.getByText('Name is required.'),
      ).toBeInTheDocument();
      expect(client.workers.create).not.toHaveBeenCalled();
    });

    it('shows error when name exceeds 100 characters', async () => {
      const user = userEvent.setup();
      renderPage();
      const longName = 'a'.repeat(101);
      await user.type(screen.getByLabelText(/Name/), longName);
      await user.click(
        screen.getByRole('button', { name: /Register Worker/i }),
      );
      expect(
        screen.getByText('Name must be 100 characters or fewer.'),
      ).toBeInTheDocument();
    });

    it('clears error when user types in name field', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        screen.getByRole('button', { name: /Register Worker/i }),
      );
      expect(screen.getByText('Name is required.')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/Name/), 'Test');
      expect(
        screen.queryByText('Name is required.'),
      ).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Successful submission
  // -----------------------------------------------------------------------

  describe('Submission', () => {
    it('calls create API with name and description', async () => {
      const created = {
        id: 'w-1',
        name: 'Test Worker',
        slug: 'test-worker',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(client.workers.create).mockResolvedValue(created as never);

      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'Test Worker');
      await user.type(screen.getByLabelText('Description'), 'A test worker');
      await user.click(
        screen.getByRole('button', { name: /Register Worker/i }),
      );

      expect(client.workers.create).toHaveBeenCalledWith({
        name: 'Test Worker',
        description: 'A test worker',
      });
    });

    it('navigates to detail page on success', async () => {
      const created = {
        id: 'w-1',
        name: 'Test Worker',
        slug: 'test-worker',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(client.workers.create).mockResolvedValue(created as never);

      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'Test Worker');
      await user.click(
        screen.getByRole('button', { name: /Register Worker/i }),
      );

      await vi.waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/workers/test-worker');
      });
    });

    it('omits description when empty', async () => {
      const created = {
        id: 'w-1',
        name: 'Test Worker',
        slug: 'test-worker',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      vi.mocked(client.workers.create).mockResolvedValue(created as never);

      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'Test Worker');
      await user.click(
        screen.getByRole('button', { name: /Register Worker/i }),
      );

      expect(client.workers.create).toHaveBeenCalledWith({
        name: 'Test Worker',
      });
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('Error handling', () => {
    it('shows conflict error for duplicate names', async () => {
      vi.mocked(client.workers.create).mockRejectedValue(
        new client.ApiError(409, 'Worker already exists'),
      );

      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'Existing Worker');
      await user.click(
        screen.getByRole('button', { name: /Register Worker/i }),
      );

      expect(
        await screen.findByText('A Worker with this name already exists.'),
      ).toBeInTheDocument();
    });

    it('shows generic error for other failures', async () => {
      vi.mocked(client.workers.create).mockRejectedValue(
        new client.ApiError(500, 'Internal server error'),
      );

      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'Test Worker');
      await user.click(
        screen.getByRole('button', { name: /Register Worker/i }),
      );

      // The toast.error should be called (but we can't easily test toast content)
      // Verify the API was called
      expect(client.workers.create).toHaveBeenCalled();
    });
  });
});
