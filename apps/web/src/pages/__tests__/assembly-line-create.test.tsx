import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AssemblyLineCreatePage from '../assembly-line-create';
import * as client from '@/api/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  assemblyLines: {
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
  },
  workers: {
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

const WORKERS = [
  {
    id: 'w-1',
    name: 'Summarizer',
    slug: 'summarizer',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    versions: [
      {
        id: 'wv-1',
        workerId: 'w-1',
        version: '1.0.0',
        yamlConfig: { name: 'Summarizer', inputTypes: ['text'], outputType: 'text', provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'KEY' } },
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  },
  {
    id: 'w-2',
    name: 'Code Reviewer',
    slug: 'code-reviewer',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    versions: [
      {
        id: 'wv-2',
        workerId: 'w-2',
        version: '1.0.0',
        yamlConfig: { name: 'Code Reviewer', inputTypes: ['code'], outputType: 'review', provider: { name: 'anthropic', model: 'claude-3', apiKeyEnv: 'KEY' } },
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  },
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
      <MemoryRouter initialEntries={['/assembly-lines/create']}>
        <AssemblyLineCreatePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function addStep(user: ReturnType<typeof userEvent.setup>, workerName: string) {
  // Click the "Add Step" button (the one on the main page, not in dialog)
  const addButtons = screen.getAllByRole('button', { name: /Add Step/i });
  await user.click(addButtons[0]!);

  // Select worker in dialog
  await user.click(screen.getByRole('button', { name: workerName }));

  // Confirm
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Add Step' }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssemblyLineCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.workers.list).mockResolvedValue(WORKERS as never);
  });

  // -----------------------------------------------------------------------
  // Layout
  // -----------------------------------------------------------------------

  describe('Layout', () => {
    it('renders the "Create Assembly Line" heading', async () => {
      renderPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Create Assembly Line' }),
      ).toBeInTheDocument();
    });

    it('renders back button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: /Back to Assembly Lines/i }),
      ).toBeInTheDocument();
    });

    it('navigates to /assembly-lines on back button click', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: /Back to Assembly Lines/i }));
      expect(mockNavigate).toHaveBeenCalledWith('/assembly-lines');
    });

    it('renders name input field', () => {
      renderPage();
      expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    });

    it('renders description textarea', () => {
      renderPage();
      expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    });

    it('renders "Create Assembly Line" submit button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: 'Create Assembly Line' }),
      ).toBeInTheDocument();
    });

    it('renders cancel button', () => {
      renderPage();
      expect(
        screen.getByRole('button', { name: 'Cancel' }),
      ).toBeInTheDocument();
    });

    it('navigates to /assembly-lines on cancel click', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockNavigate).toHaveBeenCalledWith('/assembly-lines');
    });
  });

  // -----------------------------------------------------------------------
  // Form validation
  // -----------------------------------------------------------------------

  describe('Form validation', () => {
    it('shows name error when submitting without a name', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      expect(screen.getByText('Name is required.')).toBeInTheDocument();
    });

    it('shows steps error when submitting without any steps', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'My Line');
      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      expect(screen.getByText('At least one step is required.')).toBeInTheDocument();
    });

    it('shows both errors when both fields are invalid', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      expect(screen.getByText('Name is required.')).toBeInTheDocument();
      expect(screen.getByText('At least one step is required.')).toBeInTheDocument();
    });

    it('clears name error when user starts typing', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));
      expect(screen.getByText('Name is required.')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/Name/), 'a');
      expect(screen.queryByText('Name is required.')).not.toBeInTheDocument();
    });

    it('clears steps error when a step is added', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'My Line');
      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));
      expect(screen.getByText('At least one step is required.')).toBeInTheDocument();

      // Wait for workers to load
      await waitFor(() => {
        expect(client.workers.list).toHaveBeenCalled();
      });

      await addStep(user, 'Summarizer');
      expect(screen.queryByText('At least one step is required.')).not.toBeInTheDocument();
    });

    it('sets aria-invalid on name input when error exists', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      const nameInput = screen.getByLabelText(/Name/);
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not call mutation when validation fails', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      expect(client.assemblyLines.create).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Successful submission
  // -----------------------------------------------------------------------

  describe('Successful submission', () => {
    it('calls create mutation with correct data', async () => {
      const user = userEvent.setup();
      vi.mocked(client.assemblyLines.create).mockResolvedValue({
        id: 'al-1',
        name: 'My Pipeline',
        slug: 'my-pipeline',
        description: 'A great pipeline',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      } as never);

      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'My Pipeline');
      await user.type(screen.getByLabelText(/Description/), 'A great pipeline');

      await waitFor(() => {
        expect(client.workers.list).toHaveBeenCalled();
      });

      await addStep(user, 'Summarizer');

      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      await waitFor(() => {
        expect(client.assemblyLines.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'My Pipeline',
            description: 'A great pipeline',
            steps: [{ workerVersionId: 'wv-1' }],
          }),
        );
      });
    });

    it('navigates to detail page on success', async () => {
      const user = userEvent.setup();
      vi.mocked(client.assemblyLines.create).mockResolvedValue({
        id: 'al-1',
        name: 'My Pipeline',
        slug: 'my-pipeline',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      } as never);

      renderPage();

      await user.type(screen.getByLabelText(/Name/), 'My Pipeline');

      await waitFor(() => {
        expect(client.workers.list).toHaveBeenCalled();
      });

      await addStep(user, 'Summarizer');
      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/assembly-lines/my-pipeline');
      });
    });

    it('omits description if empty', async () => {
      const user = userEvent.setup();
      vi.mocked(client.assemblyLines.create).mockResolvedValue({
        id: 'al-1',
        name: 'No Desc',
        slug: 'no-desc',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      } as never);

      renderPage();
      await user.type(screen.getByLabelText(/Name/), 'No Desc');

      await waitFor(() => {
        expect(client.workers.list).toHaveBeenCalled();
      });

      await addStep(user, 'Summarizer');
      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      await waitFor(() => {
        expect(client.assemblyLines.create).toHaveBeenCalledWith(
          expect.objectContaining({
            description: undefined,
          }),
        );
      });
    });

    it('shows loading spinner on submit button during mutation', async () => {
      const user = userEvent.setup();
      vi.mocked(client.assemblyLines.create).mockReturnValue(new Promise(() => {}));

      renderPage();
      await user.type(screen.getByLabelText(/Name/), 'My Line');

      await waitFor(() => {
        expect(client.workers.list).toHaveBeenCalled();
      });

      await addStep(user, 'Summarizer');
      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      await waitFor(() => {
        expect(screen.getByText('Creating...')).toBeInTheDocument();
      });
      const submitBtn = screen.getByRole('button', { name: /Creating/ });
      expect(submitBtn).toBeDisabled();
      expect(submitBtn.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('Error handling', () => {
    it('shows error message on mutation failure', async () => {
      const user = userEvent.setup();
      vi.mocked(client.assemblyLines.create).mockRejectedValue(
        new (client.ApiError as unknown as new (status: number, msg: string) => Error)(400, 'Name already exists'),
      );

      renderPage();
      await user.type(screen.getByLabelText(/Name/), 'Duplicate');

      await waitFor(() => {
        expect(client.workers.list).toHaveBeenCalled();
      });

      await addStep(user, 'Summarizer');
      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      await waitFor(() => {
        expect(screen.getByText('Name already exists')).toBeInTheDocument();
      });
    });

    it('does not navigate on failure', async () => {
      const user = userEvent.setup();
      vi.mocked(client.assemblyLines.create).mockRejectedValue(
        new (client.ApiError as unknown as new (status: number, msg: string) => Error)(500, 'Server error'),
      );

      renderPage();
      await user.type(screen.getByLabelText(/Name/), 'Fail Line');

      await waitFor(() => {
        expect(client.workers.list).toHaveBeenCalled();
      });

      await addStep(user, 'Summarizer');
      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });

      // Only the back/cancel navigate calls, not a success navigate
      const navigateCalls = mockNavigate.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('/assembly-lines/') && call[0] !== '/assembly-lines',
      );
      expect(navigateCalls).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple steps
  // -----------------------------------------------------------------------

  describe('Multiple steps', () => {
    it('can add multiple steps', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(client.workers.list).toHaveBeenCalled();
      });

      await addStep(user, 'Summarizer');
      await addStep(user, 'Code Reviewer');

      expect(screen.getByText('Summarizer')).toBeInTheDocument();
      expect(screen.getByText('Code Reviewer')).toBeInTheDocument();
    });

    it('submits all steps in order', async () => {
      const user = userEvent.setup();
      vi.mocked(client.assemblyLines.create).mockResolvedValue({
        id: 'al-1',
        name: 'Multi',
        slug: 'multi',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      } as never);

      renderPage();
      await user.type(screen.getByLabelText(/Name/), 'Multi');

      await waitFor(() => {
        expect(client.workers.list).toHaveBeenCalled();
      });

      await addStep(user, 'Summarizer');
      await addStep(user, 'Code Reviewer');

      await user.click(screen.getByRole('button', { name: 'Create Assembly Line' }));

      await waitFor(() => {
        expect(client.assemblyLines.create).toHaveBeenCalledWith(
          expect.objectContaining({
            steps: [
              { workerVersionId: 'wv-1' },
              { workerVersionId: 'wv-2' },
            ],
          }),
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // Step removal
  // -----------------------------------------------------------------------

  describe('Step removal', () => {
    it('removes a step when delete button is clicked', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(client.workers.list).toHaveBeenCalled();
      });

      await addStep(user, 'Summarizer');
      await addStep(user, 'Code Reviewer');

      expect(screen.getByText('Summarizer')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Remove step 1' }));

      expect(screen.queryByText('Summarizer')).not.toBeInTheDocument();
      expect(screen.getByText('Code Reviewer')).toBeInTheDocument();
    });
  });
});
