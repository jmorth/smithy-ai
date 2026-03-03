import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LogViewerPage from '../index';
import * as client from '@/api/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  jobs: {
    list: vi.fn(),
    getLogs: vi.fn(),
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

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 28,
        size: 28,
        key: i,
      })),
    getTotalSize: () => count * 28,
    scrollToIndex: vi.fn(),
    measureElement: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const JOBS = [
  {
    id: 'job-aaaa1111-2222-3333-4444-555555555555',
    packageId: 'pkg-1',
    workerVersionId: 'wv-summarizer-v1',
    status: 'RUNNING',
    retryCount: 0,
    logs: [],
    createdAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'job-bbbb1111-2222-3333-4444-555555555555',
    packageId: 'pkg-2',
    workerVersionId: 'wv-reviewer-v2',
    status: 'COMPLETED',
    retryCount: 0,
    logs: [],
    createdAt: '2026-01-14T08:00:00Z',
  },
  {
    id: 'job-cccc1111-2222-3333-4444-555555555555',
    packageId: 'pkg-3',
    workerVersionId: 'wv-writer-v1',
    status: 'ERROR',
    retryCount: 2,
    logs: [],
    createdAt: '2026-01-13T14:00:00Z',
  },
];

const LOG_ENTRIES = [
  { timestamp: '2026-01-15T10:00:01.000Z', level: 'info', message: 'Starting job execution' },
  { timestamp: '2026-01-15T10:00:02.000Z', level: 'debug', message: 'Loading configuration' },
  { timestamp: '2026-01-15T10:00:03.000Z', level: 'warning', message: 'Deprecated API usage' },
  { timestamp: '2026-01-15T10:00:04.000Z', level: 'error', message: 'Failed to process item' },
];

function makeJobsResponse(items = JOBS) {
  return { data: items, meta: { page: 1, limit: 50, total: items.length } };
}

function makeLogsResponse(entries = LOG_ENTRIES) {
  return {
    data: entries,
    meta: { page: 1, limit: 100, total: entries.length, jobId: 'job-1', jobState: 'COMPLETED' },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(initialEntries: string[] = ['/logs']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <LogViewerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LogViewerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.jobs.list).mockResolvedValue(makeJobsResponse() as never);
    vi.mocked(client.jobs.getLogs).mockResolvedValue(makeLogsResponse() as never);

    // Stub EventSource and RAF
    vi.stubGlobal('EventSource', vi.fn(() => ({
      onmessage: null,
      onerror: null,
      addEventListener: vi.fn(),
      close: vi.fn(),
      readyState: 1,
    })));
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: () => void) => { cb(); return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  // -------------------------------------------------------------------------
  // Header
  // -------------------------------------------------------------------------

  describe('Header', () => {
    it('renders the "Log Viewer" heading', () => {
      renderPage();
      expect(
        screen.getByRole('heading', { level: 2, name: 'Log Viewer' }),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Job selector
  // -------------------------------------------------------------------------

  describe('Job selector', () => {
    it('renders job list after loading', async () => {
      renderPage();
      // Truncated IDs
      expect(await screen.findByText('job-aaaa')).toBeInTheDocument();
      expect(screen.getByText('job-bbbb')).toBeInTheDocument();
      expect(screen.getByText('job-cccc')).toBeInTheDocument();
    });

    it('groups jobs by status', async () => {
      renderPage();
      await screen.findByText('job-aaaa');
      // "Running" appears as both group header and badge; "Completed" also as badge
      expect(screen.getAllByText('Running').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Failed / Other')).toBeInTheDocument();
    });

    it('renders job search input', async () => {
      renderPage();
      await screen.findByText('job-aaaa');
      expect(screen.getByLabelText('Search jobs')).toBeInTheDocument();
    });

    it('filters jobs by search text', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('job-aaaa');

      await user.type(screen.getByLabelText('Search jobs'), 'summarizer');

      // Only the summarizer job should match
      expect(screen.getByText('job-aaaa')).toBeInTheDocument();
      expect(screen.queryByText('job-bbbb')).not.toBeInTheDocument();
    });

    it('shows "No matching jobs" when search has no results', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('job-aaaa');

      await user.type(screen.getByLabelText('Search jobs'), 'nonexistent');

      expect(screen.getByText('No matching jobs')).toBeInTheDocument();
    });

    it('shows loading skeletons while jobs are loading', () => {
      vi.mocked(client.jobs.list).mockReturnValue(new Promise(() => {}) as never);
      const { container } = renderPage();
      expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });

    it('shows "No jobs found" when no jobs exist', async () => {
      vi.mocked(client.jobs.list).mockResolvedValue(
        makeJobsResponse([]) as never,
      );
      renderPage();
      expect(await screen.findByText('No jobs found')).toBeInTheDocument();
    });

    it('selects a job when clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('job-bbbb');

      await user.click(screen.getByText('job-bbbb'));

      // Should fetch logs for the selected job
      await waitFor(() => {
        expect(client.jobs.getLogs).toHaveBeenCalledWith(
          'job-bbbb1111-2222-3333-4444-555555555555',
          undefined,
          expect.any(AbortSignal),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Initial state (no job selected)
  // -------------------------------------------------------------------------

  describe('No job selected', () => {
    it('shows prompt to select a job', async () => {
      renderPage();
      await screen.findByText('job-aaaa');
      expect(
        screen.getByText('Select a job from the sidebar to view its logs'),
      ).toBeInTheDocument();
    });

    it('does not show Copy button', () => {
      renderPage();
      expect(screen.queryByLabelText('Copy logs')).not.toBeInTheDocument();
    });

    it('does not show Download button', () => {
      renderPage();
      expect(screen.queryByLabelText('Download logs')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Pre-selected job via URL
  // -------------------------------------------------------------------------

  describe('URL jobId param', () => {
    it('pre-selects job from URL param', async () => {
      renderPage(['/logs?jobId=job-bbbb1111-2222-3333-4444-555555555555']);

      await waitFor(() => {
        expect(client.jobs.getLogs).toHaveBeenCalledWith(
          'job-bbbb1111-2222-3333-4444-555555555555',
          undefined,
          expect.any(AbortSignal),
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Log display after selecting a job
  // -------------------------------------------------------------------------

  describe('Log display', () => {
    async function selectJob() {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('job-bbbb');
      await user.click(screen.getByText('job-bbbb'));
      await screen.findByText('Starting job execution');
    }

    it('renders log entries after selecting a job', async () => {
      await selectJob();
      expect(screen.getByText('Starting job execution')).toBeInTheDocument();
      expect(screen.getByText('Loading configuration')).toBeInTheDocument();
      expect(screen.getByText('Deprecated API usage')).toBeInTheDocument();
      expect(screen.getByText('Failed to process item')).toBeInTheDocument();
    });

    it('shows Copy and Download buttons after selecting job', async () => {
      await selectJob();
      expect(screen.getByLabelText('Copy logs')).toBeInTheDocument();
      expect(screen.getByLabelText('Download logs')).toBeInTheDocument();
    });

    it('renders level filter checkboxes', async () => {
      await selectJob();
      expect(screen.getByRole('checkbox', { name: 'Debug level' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Info level' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Warning level' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Error level' })).toBeInTheDocument();
    });

    it('renders search input for logs', async () => {
      await selectJob();
      expect(screen.getByLabelText('Search logs')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  describe('Error state', () => {
    it('shows error message when log fetch fails', async () => {
      const user = userEvent.setup();
      vi.mocked(client.jobs.getLogs).mockRejectedValue(
        new client.ApiError(500, 'Internal server error'),
      );
      renderPage();
      await screen.findByText('job-bbbb');
      await user.click(screen.getByText('job-bbbb'));

      expect(await screen.findByText('Failed to fetch logs')).toBeInTheDocument();
      expect(screen.getByText('Internal server error')).toBeInTheDocument();
    });

    it('shows retry button on error', async () => {
      const user = userEvent.setup();
      vi.mocked(client.jobs.getLogs).mockRejectedValue(
        new client.ApiError(500, 'Oops'),
      );
      renderPage();
      await screen.findByText('job-bbbb');
      await user.click(screen.getByText('job-bbbb'));

      expect(await screen.findByText('Retry')).toBeInTheDocument();
    });

    it('has role="alert" on the error container', async () => {
      const user = userEvent.setup();
      vi.mocked(client.jobs.getLogs).mockRejectedValue(
        new client.ApiError(500, 'Error'),
      );
      renderPage();
      await screen.findByText('job-bbbb');
      await user.click(screen.getByText('job-bbbb'));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('retries fetch when retry button is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(client.jobs.getLogs)
        .mockRejectedValueOnce(new client.ApiError(500, 'Error'))
        .mockResolvedValueOnce(makeLogsResponse() as never);

      renderPage();
      await screen.findByText('job-bbbb');
      await user.click(screen.getByText('job-bbbb'));

      const retryBtn = await screen.findByText('Retry');
      await user.click(retryBtn);

      expect(client.jobs.getLogs).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('Loading state', () => {
    it('shows loading spinner while fetching logs', async () => {
      const user = userEvent.setup();
      vi.mocked(client.jobs.getLogs).mockReturnValue(new Promise(() => {}) as never);
      renderPage();
      await screen.findByText('job-bbbb');
      await user.click(screen.getByText('job-bbbb'));

      expect(screen.getByText('Fetching logs…')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Copy and Download
  // -------------------------------------------------------------------------

  describe('Copy and Download', () => {
    it('copies visible logs to clipboard', async () => {
      const user = userEvent.setup();
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      renderPage();
      await screen.findByText('job-bbbb');
      await user.click(screen.getByText('job-bbbb'));
      await screen.findByText('Starting job execution');

      await user.click(screen.getByLabelText('Copy logs'));

      expect(mockWriteText).toHaveBeenCalledWith(
        expect.stringContaining('Starting job execution'),
      );
    });

    it('triggers download of log file', async () => {
      const user = userEvent.setup();
      const mockClick = vi.fn();
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test');
      const mockRevokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL });

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          const el = origCreateElement('a') as HTMLAnchorElement & { click: ReturnType<typeof vi.fn> };
          el.click = mockClick;
          return el;
        }
        return origCreateElement(tag);
      });

      renderPage();
      await screen.findByText('job-bbbb');
      await user.click(screen.getByText('job-bbbb'));
      await screen.findByText('Starting job execution');

      await user.click(screen.getByLabelText('Download logs'));

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('disables Copy button when no visible logs', async () => {
      const user = userEvent.setup();
      vi.mocked(client.jobs.getLogs).mockResolvedValue(
        makeLogsResponse([]) as never,
      );
      renderPage();
      await screen.findByText('job-bbbb');
      await user.click(screen.getByText('job-bbbb'));

      await waitFor(() => {
        expect(screen.getByLabelText('Copy logs')).toBeDisabled();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  describe('Filtering', () => {
    it('hides debug logs when debug level is unchecked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('job-bbbb');
      await user.click(screen.getByText('job-bbbb'));
      await screen.findByText('Loading configuration');

      // Uncheck debug
      await user.click(screen.getByRole('checkbox', { name: 'Debug level' }));

      await waitFor(() => {
        expect(screen.queryByText('Loading configuration')).not.toBeInTheDocument();
      });
    });

    it('shows search input that filters logs', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('job-bbbb');
      await user.click(screen.getByText('job-bbbb'));
      await screen.findByText('Starting job execution');

      await user.type(screen.getByLabelText('Search logs'), 'Failed');

      // With search but hideNonMatching=false (default), all logs still shown
      expect(screen.getByText('Starting job execution')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // SSE Streaming
  // -------------------------------------------------------------------------

  describe('SSE Streaming', () => {
    it('connects to SSE when running job is selected', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('job-aaaa');

      await user.click(screen.getByText('job-aaaa'));

      // Should attempt SSE connection for running job
      await waitFor(() => {
        expect(EventSource).toHaveBeenCalledWith(
          expect.stringContaining('/jobs/job-aaaa'),
        );
      });
    });
  });
});
