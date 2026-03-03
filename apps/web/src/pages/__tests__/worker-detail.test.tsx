import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkerDetailPage from '../worker-detail';
import * as client from '@/api/client';
import type { WorkerDetail } from '@/api/client';

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
// Fixtures
// ---------------------------------------------------------------------------

const WORKER_DETAIL: WorkerDetail = {
  id: 'w-1',
  name: 'Summarizer',
  slug: 'summarizer',
  description: 'Summarizes text documents',
  createdAt: '2026-01-01T12:00:00Z',
  updatedAt: '2026-01-15T12:00:00Z',
  versions: [
    {
      id: 'wv-1',
      workerId: 'w-1',
      version: '1',
      yamlConfig: {
        name: 'Summarizer',
        inputTypes: ['text'],
        outputType: 'text',
        provider: { name: 'openai', model: 'gpt-3.5', apiKeyEnv: 'KEY' },
      },
      status: 'DEPRECATED',
      createdAt: '2026-01-01T12:00:00Z',
    },
    {
      id: 'wv-2',
      workerId: 'w-1',
      version: '2',
      yamlConfig: {
        name: 'Summarizer',
        inputTypes: ['text', 'pdf'],
        outputType: 'summary',
        provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'OPENAI_API_KEY' },
        timeout: 300,
      },
      status: 'ACTIVE',
      createdAt: '2026-01-15T12:00:00Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(slug = 'summarizer') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/workers/${slug}`]}>
        <Routes>
          <Route path="/workers/:slug" element={<WorkerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.workers.get).mockResolvedValue(WORKER_DETAIL as never);
  });

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------

  describe('Header', () => {
    it('renders the worker name', async () => {
      renderPage();
      expect(
        await screen.findByRole('heading', { level: 2, name: 'Summarizer' }),
      ).toBeInTheDocument();
    });

    it('renders Back to Workers button', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      expect(
        screen.getByRole('button', { name: /Back to Workers/i }),
      ).toBeInTheDocument();
    });

    it('navigates to /workers on back button click', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(
        screen.getByRole('button', { name: /Back to Workers/i }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/workers');
    });

    it('renders latest version badge', async () => {
      renderPage();
      expect(await screen.findByText('v2')).toBeInTheDocument();
    });

    it('renders status badge', async () => {
      renderPage();
      expect(await screen.findByText('Active')).toBeInTheDocument();
    });

    it('renders description', async () => {
      renderPage();
      expect(
        await screen.findByText('Summarizes text documents'),
      ).toBeInTheDocument();
    });

    it('renders input type badges', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      // "text" and "pdf" appear in both header badges and YAML viewer
      const pdfBadges = screen.getAllByText('pdf');
      expect(pdfBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('renders output type badge', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      // "summary" appears in header badge and YAML viewer
      const summaryBadges = screen.getAllByText('summary');
      expect(summaryBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // Tabs
  // -----------------------------------------------------------------------

  describe('Tabs', () => {
    it('renders Configuration, Version History, and Upload New Version tabs', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      expect(screen.getByText('Configuration')).toBeInTheDocument();
      expect(screen.getByText('Version History')).toBeInTheDocument();
      expect(screen.getByText('Upload New Version')).toBeInTheDocument();
    });

    it('defaults to Configuration tab', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      // YAML viewer should be visible with config keys
      expect(screen.getByTestId('yaml-viewer')).toBeInTheDocument();
    });

    it('switches to Version History tab', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(screen.getByText('Version History'));
      // Should see version rows — v2 appears in header badge too, so use getAllByText
      const v2Elements = screen.getAllByText('v2');
      expect(v2Elements.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('v1')).toBeInTheDocument();
    });

    it('switches to Upload New Version tab', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(screen.getByText('Upload New Version'));
      expect(
        screen.getByLabelText('YAML Configuration'),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Configuration tab
  // -----------------------------------------------------------------------

  describe('Configuration tab', () => {
    it('renders YAML viewer with latest config', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      expect(screen.getByTestId('yaml-viewer')).toBeInTheDocument();
      // Should show config keys from v2 (latest)
      expect(screen.getByText('timeout')).toBeInTheDocument();
    });

    it('shows message when no config available', async () => {
      vi.mocked(client.workers.get).mockResolvedValue({
        ...WORKER_DETAIL,
        versions: [],
      } as never);
      renderPage();
      expect(
        await screen.findByText(/No configuration available/),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Version History tab
  // -----------------------------------------------------------------------

  describe('Version History tab', () => {
    it('renders version history table', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(screen.getByText('Version History'));
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('shows deprecate button for active versions', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(screen.getByText('Version History'));
      expect(
        screen.getByRole('button', { name: 'Deprecate' }),
      ).toBeInTheDocument();
    });

    it('calls deprecate API when confirmed', async () => {
      vi.mocked(client.workers.deprecateVersion).mockResolvedValue({
        ...WORKER_DETAIL.versions![1]!,
        status: 'DEPRECATED',
      } as never);

      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(screen.getByText('Version History'));

      // Click deprecate
      await user.click(screen.getByRole('button', { name: 'Deprecate' }));

      // Confirm in dialog
      const dialogButtons = screen.getAllByRole('button', {
        name: 'Deprecate',
      });
      const confirmBtn = dialogButtons.find((btn) =>
        btn.className.includes('destructive'),
      );
      await user.click(confirmBtn!);

      expect(client.workers.deprecateVersion).toHaveBeenCalledWith(
        'summarizer',
        2,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Upload form
  // -----------------------------------------------------------------------

  describe('Upload form', () => {
    it('renders YAML editor textarea', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(screen.getByText('Upload New Version'));
      expect(screen.getByLabelText('YAML Configuration')).toBeInTheDocument();
    });

    it('shows error for empty YAML submission', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(screen.getByText('Upload New Version'));

      // Type and then clear to make button enabled temporarily — but button should be disabled
      const btn = screen.getByRole('button', { name: /Create New Version/i });
      expect(btn).toBeDisabled();
    });

    it('shows error for invalid YAML syntax', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(screen.getByText('Upload New Version'));

      const textarea = screen.getByLabelText('YAML Configuration');
      await user.type(textarea, 'invalid: yaml: {{broken');

      await user.click(
        screen.getByRole('button', { name: /Create New Version/i }),
      );

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('submits valid YAML', async () => {
      vi.mocked(client.workers.createVersion).mockResolvedValue({
        id: 'wv-3',
        workerId: 'w-1',
        version: '3',
        yamlConfig: { name: 'Summarizer', inputTypes: ['text'], outputType: 'text', provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'KEY' } },
        status: 'ACTIVE',
        createdAt: '2026-02-01T12:00:00Z',
      } as never);

      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(screen.getByText('Upload New Version'));

      const textarea = screen.getByLabelText('YAML Configuration');
      await user.type(
        textarea,
        'name: Summarizer\ninputTypes:\n  - text\noutputType: text\nprovider:\n  name: openai\n  model: gpt-4\n  apiKeyEnv: KEY',
      );

      await user.click(
        screen.getByRole('button', { name: /Create New Version/i }),
      );

      expect(client.workers.createVersion).toHaveBeenCalledWith(
        'summarizer',
        expect.objectContaining({
          yamlConfig: expect.objectContaining({ name: 'Summarizer' }),
        }),
      );
    });

    it('shows validation error for non-object YAML', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(screen.getByText('Upload New Version'));

      const textarea = screen.getByLabelText('YAML Configuration');
      await user.type(textarea, '- just\n- a\n- list');

      await user.click(
        screen.getByRole('button', { name: /Create New Version/i }),
      );

      expect(
        await screen.findByText('YAML must be an object (key-value pairs)'),
      ).toBeInTheDocument();
    });

    it('renders file upload button', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Summarizer' });
      await user.click(screen.getByText('Upload New Version'));
      expect(screen.getByText(/Upload .yaml file/i)).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  describe('Loading state', () => {
    it('shows skeleton while loading', () => {
      vi.mocked(client.workers.get).mockReturnValue(new Promise(() => {}));
      const { container } = renderPage();
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders back button during loading', () => {
      vi.mocked(client.workers.get).mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(
        screen.getByRole('button', { name: /Back to Workers/i }),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  describe('Error state', () => {
    it('shows error message when API fails', async () => {
      vi.mocked(client.workers.get).mockRejectedValue(
        new Error('Not found'),
      );
      renderPage();
      expect(
        await screen.findByText('Failed to load Worker'),
      ).toBeInTheDocument();
      expect(screen.getByText('Not found')).toBeInTheDocument();
    });

    it('has role="alert" on the error container', async () => {
      vi.mocked(client.workers.get).mockRejectedValue(
        new Error('Network error'),
      );
      renderPage();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('shows retry button that refetches', async () => {
      const user = userEvent.setup();
      vi.mocked(client.workers.get)
        .mockRejectedValueOnce(new Error('Oops'))
        .mockResolvedValueOnce(WORKER_DETAIL as never);

      renderPage();
      const retryBtn = await screen.findByRole('button', { name: /Retry/i });
      await user.click(retryBtn);
      expect(client.workers.get).toHaveBeenCalledTimes(2);
    });
  });
});
