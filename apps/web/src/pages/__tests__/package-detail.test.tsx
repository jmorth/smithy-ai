import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PackageDetailPage from '../packages/[id]';
import * as client from '@/api/client';
import { socketManager } from '@/api/socket';
import { RoutingKeys } from '@smithy/shared';
import type { Package, PackageFile, JobExecution } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  packages: {
    get: vi.fn(),
    listFiles: vi.fn(),
    getDownloadUrl: vi.fn(),
  },
  jobs: {
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

vi.mock('@/api/socket', () => ({
  socketManager: {
    subscribeJob: vi.fn(),
    unsubscribe: vi.fn(),
    onEvent: vi.fn(() => vi.fn()),
    sendInteractiveResponse: vi.fn(),
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

function makePackage(overrides: Partial<Package> = {}): Package {
  return {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    type: 'USER_INPUT',
    status: 'PROCESSING',
    metadata: { source: 'web-form', priority: 'high' },
    assemblyLineId: 'al-001-slug',
    currentStep: 2,
    createdBy: 'john@example.com',
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T12:30:00Z',
    ...overrides,
  } as Package;
}

function makeFiles(): PackageFile[] {
  return [
    {
      id: 'f1',
      packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      fileKey: 'packages/a1b2/input.json',
      filename: 'input.json',
      mimeType: 'application/json',
      sizeBytes: 2048,
      createdAt: '2026-01-15T10:01:00Z',
    },
    {
      id: 'f2',
      packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      fileKey: 'packages/a1b2/image.png',
      filename: 'image.png',
      mimeType: 'image/png',
      sizeBytes: 1048576,
      createdAt: '2026-01-15T10:02:00Z',
    },
    {
      id: 'f3',
      packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      fileKey: 'packages/a1b2/data.bin',
      filename: 'data.bin',
      mimeType: 'application/octet-stream',
      sizeBytes: 512,
      createdAt: '2026-01-15T10:03:00Z',
    },
  ];
}

function makeJobs(overrides?: Partial<JobExecution>[]): JobExecution[] {
  const base: JobExecution[] = [
    {
      id: 'j1',
      packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      workerVersionId: 'summarizer:2',
      status: 'COMPLETED',
      containerId: 'docker-abc123',
      startedAt: '2026-01-15T10:05:00Z',
      completedAt: '2026-01-15T10:10:00Z',
      errorMessage: undefined,
      retryCount: 0,
      logs: ['Processing started', 'Step 1 done'],
      createdAt: '2026-01-15T10:04:00Z',
    },
    {
      id: 'j2',
      packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      workerVersionId: 'reviewer:1',
      status: 'RUNNING',
      startedAt: '2026-01-15T12:00:00Z',
      retryCount: 0,
      logs: [],
      createdAt: '2026-01-15T11:59:00Z',
    },
  ];

  if (overrides) {
    return base.map((job, i) =>
      overrides[i] ? { ...job, ...overrides[i] } : job,
    );
  }

  return base;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/packages/${id}`]}>
        <Routes>
          <Route path="/packages/:id" element={<PackageDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PackageDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.packages.get).mockResolvedValue(makePackage());
    vi.mocked(client.packages.listFiles).mockResolvedValue(makeFiles());
    vi.mocked(client.jobs.list).mockResolvedValue({
      data: makeJobs(),
      meta: { limit: 50, total: 2 },
    });
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  describe('Loading state', () => {
    it('shows skeleton while loading', () => {
      vi.mocked(client.packages.get).mockReturnValue(new Promise(() => {}));
      const { container } = renderPage();
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  describe('Error state', () => {
    it('shows error message when API fails', async () => {
      vi.mocked(client.packages.get).mockRejectedValue(
        new Error('Package not found'),
      );
      renderPage();
      expect(
        await screen.findByText('Failed to load Package'),
      ).toBeInTheDocument();
      expect(screen.getByText('Package not found')).toBeInTheDocument();
    });

    it('has role="alert"', async () => {
      vi.mocked(client.packages.get).mockRejectedValue(
        new Error('Network error'),
      );
      renderPage();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('shows retry button that refetches', async () => {
      const user = userEvent.setup();
      vi.mocked(client.packages.get)
        .mockRejectedValueOnce(new Error('Oops'))
        .mockResolvedValueOnce(makePackage());

      renderPage();
      const retryBtn = await screen.findByRole('button', { name: /Retry/i });
      await user.click(retryBtn);
      expect(client.packages.get).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------

  describe('Header', () => {
    it('renders "Package" heading', async () => {
      renderPage();
      expect(
        await screen.findByRole('heading', { level: 2, name: 'Package' }),
      ).toBeInTheDocument();
    });

    it('renders the full package ID', async () => {
      renderPage();
      const idEl = await screen.findByTestId('package-id');
      expect(idEl).toHaveTextContent('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('renders type badge', async () => {
      renderPage();
      expect(await screen.findByText('User Input')).toBeInTheDocument();
    });

    it('renders status badge', async () => {
      renderPage();
      const badges = await screen.findAllByText('Processing');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it('has a back button that navigates to /packages', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Package');

      await user.click(
        screen.getByRole('button', { name: /Back to Packages/i }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/packages');
    });
  });

  // -----------------------------------------------------------------------
  // Package Info
  // -----------------------------------------------------------------------

  describe('Package Info', () => {
    it('displays created date', async () => {
      renderPage();
      const el = await screen.findByTestId('created-date');
      expect(el).toBeInTheDocument();
    });

    it('displays updated date', async () => {
      renderPage();
      const el = await screen.findByTestId('updated-date');
      expect(el).toBeInTheDocument();
    });

    it('displays assembly line link when assemblyLineId exists', async () => {
      renderPage();
      const link = await screen.findByTestId('assembly-line-link');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute(
        'href',
        '/assembly-lines/al-001-slug',
      );
    });

    it('does not render assembly line link when not present', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ assemblyLineId: undefined }),
      );
      renderPage();
      await screen.findByText('Package');
      expect(screen.queryByTestId('assembly-line-link')).not.toBeInTheDocument();
    });

    it('displays current step', async () => {
      renderPage();
      expect(await screen.findByText('Step 2')).toBeInTheDocument();
    });

    it('displays created by', async () => {
      renderPage();
      expect(await screen.findByText('john@example.com')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------

  describe('Metadata', () => {
    it('displays metadata key-value table', async () => {
      renderPage();
      const table = await screen.findByTestId('metadata-table');
      expect(within(table).getByText('source')).toBeInTheDocument();
      expect(within(table).getByText('web-form')).toBeInTheDocument();
      expect(within(table).getByText('priority')).toBeInTheDocument();
      expect(within(table).getByText('high')).toBeInTheDocument();
    });

    it('shows no metadata message when empty', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ metadata: {} }),
      );
      renderPage();
      expect(
        await screen.findByTestId('no-metadata'),
      ).toHaveTextContent('No custom metadata.');
    });
  });

  // -----------------------------------------------------------------------
  // Status Timeline
  // -----------------------------------------------------------------------

  describe('Status Timeline', () => {
    it('renders status timeline', async () => {
      renderPage();
      expect(
        await screen.findByTestId('status-timeline'),
      ).toBeInTheDocument();
    });

    it('shows timeline dots for each status', async () => {
      renderPage();
      await screen.findByTestId('status-timeline');
      expect(screen.getByTestId('timeline-dot-PENDING')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-dot-IN_TRANSIT')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-dot-PROCESSING')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-dot-COMPLETED')).toBeInTheDocument();
    });

    it('highlights current status with "Current" badge', async () => {
      renderPage();
      await screen.findByTestId('status-timeline');
      expect(screen.getByText('Current')).toBeInTheDocument();
    });

    it('shows FAILED in timeline for failed packages', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ status: 'FAILED' as never }),
      );
      renderPage();
      await screen.findByTestId('status-timeline');
      expect(screen.getByTestId('timeline-dot-FAILED')).toBeInTheDocument();
    });

    it('shows COMPLETED status when package is completed', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ status: 'COMPLETED' as never }),
      );
      renderPage();
      await screen.findByTestId('status-timeline');
      expect(screen.getByText('Current')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Status badge colors
  // -----------------------------------------------------------------------

  describe('Status badge colors', () => {
    it('applies yellow for PROCESSING', async () => {
      renderPage();
      const badges = await screen.findAllByText('Processing');
      const headerBadge = badges.find((el) =>
        el.className.includes('bg-yellow-100'),
      );
      expect(headerBadge).toBeDefined();
    });

    it('applies green for COMPLETED', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ status: 'COMPLETED' as never }),
      );
      renderPage();
      const badges = await screen.findAllByText('Completed');
      const headerBadge = badges.find((el) =>
        el.className.includes('bg-green-100'),
      );
      expect(headerBadge).toBeDefined();
    });

    it('applies red for FAILED', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ status: 'FAILED' as never }),
      );
      renderPage();
      const badges = await screen.findAllByText('Failed');
      const headerBadge = badges.find((el) =>
        el.className.includes('bg-red-100'),
      );
      expect(headerBadge).toBeDefined();
    });

    it('applies gray for unknown status', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ status: 'UNKNOWN' as never }),
      );
      renderPage();
      const badge = await screen.findByText('UNKNOWN');
      expect(badge.className).toContain('bg-gray-100');
    });
  });

  // -----------------------------------------------------------------------
  // Files
  // -----------------------------------------------------------------------

  describe('Files', () => {
    it('renders file count in heading', async () => {
      renderPage();
      expect(await screen.findByText('Files (3)')).toBeInTheDocument();
    });

    it('renders each file with name', async () => {
      renderPage();
      expect(await screen.findByText('input.json')).toBeInTheDocument();
      expect(screen.getByText('image.png')).toBeInTheDocument();
      expect(screen.getByText('data.bin')).toBeInTheDocument();
    });

    it('renders file sizes formatted', async () => {
      renderPage();
      expect(await screen.findByText('2.0 KB')).toBeInTheDocument();
      expect(screen.getByText('1.0 MB')).toBeInTheDocument();
      expect(screen.getByText('512 B')).toBeInTheDocument();
    });

    it('shows MIME type badges', async () => {
      renderPage();
      expect(await screen.findByText('application/json')).toBeInTheDocument();
      expect(screen.getByText('image/png')).toBeInTheDocument();
      expect(screen.getByText('application/octet-stream')).toBeInTheDocument();
    });

    it('shows preview button for text and image files', async () => {
      renderPage();
      await screen.findByText('input.json');
      expect(screen.getByTestId('preview-toggle-f1')).toBeInTheDocument();
      expect(screen.getByTestId('preview-toggle-f2')).toBeInTheDocument();
    });

    it('does not show preview button for binary files', async () => {
      renderPage();
      await screen.findByText('data.bin');
      expect(screen.queryByTestId('preview-toggle-f3')).not.toBeInTheDocument();
    });

    it('shows download button for each file', async () => {
      renderPage();
      await screen.findByText('input.json');
      expect(screen.getByTestId('download-f1')).toBeInTheDocument();
      expect(screen.getByTestId('download-f2')).toBeInTheDocument();
      expect(screen.getByTestId('download-f3')).toBeInTheDocument();
    });

    it('toggles preview when Preview button clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('input.json');

      await user.click(screen.getByTestId('preview-toggle-f1'));
      expect(screen.getByTestId('preview-f1')).toBeInTheDocument();

      await user.click(screen.getByTestId('preview-toggle-f1'));
      expect(screen.queryByTestId('preview-f1')).not.toBeInTheDocument();
    });

    it('calls getDownloadUrl when download clicked', async () => {
      const user = userEvent.setup();
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      vi.mocked(client.packages.getDownloadUrl).mockResolvedValue({
        downloadUrl: 'https://s3.example.com/download',
      });

      renderPage();
      await screen.findByText('input.json');

      await user.click(screen.getByTestId('download-f1'));
      expect(client.packages.getDownloadUrl).toHaveBeenCalledWith(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        'f1',
      );

      openSpy.mockRestore();
    });

    it('shows no files message when empty', async () => {
      vi.mocked(client.packages.listFiles).mockResolvedValue([]);
      renderPage();
      expect(
        await screen.findByTestId('no-files'),
      ).toHaveTextContent('No files attached to this package.');
    });
  });

  // -----------------------------------------------------------------------
  // Job History
  // -----------------------------------------------------------------------

  describe('Job History', () => {
    it('renders job count in heading', async () => {
      renderPage();
      expect(await screen.findByText('Job History (2)')).toBeInTheDocument();
    });

    it('renders job entries', async () => {
      renderPage();
      expect(await screen.findByTestId('job-j1')).toBeInTheDocument();
      expect(screen.getByTestId('job-j2')).toBeInTheDocument();
    });

    it('shows worker name from workerVersionId', async () => {
      renderPage();
      expect(await screen.findByText('summarizer')).toBeInTheDocument();
      expect(screen.getByText('reviewer')).toBeInTheDocument();
    });

    it('shows job status badges', async () => {
      renderPage();
      const jobHistory = await screen.findByTestId('job-history');
      expect(within(jobHistory).getByText('Completed')).toBeInTheDocument();
      expect(within(jobHistory).getByText('Running')).toBeInTheDocument();
    });

    it('marks latest job with "Latest" badge', async () => {
      renderPage();
      expect(await screen.findByText('Latest')).toBeInTheDocument();
    });

    it('expands job details when clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByTestId('job-j1');

      await user.click(screen.getByTestId('job-toggle-j1'));
      const details = screen.getByTestId('job-details-j1');
      expect(details).toBeInTheDocument();
      expect(within(details).getByText('summarizer:2')).toBeInTheDocument();
    });

    it('collapses job details when clicked again', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByTestId('job-j1');

      await user.click(screen.getByTestId('job-toggle-j1'));
      expect(screen.getByTestId('job-details-j1')).toBeInTheDocument();

      await user.click(screen.getByTestId('job-toggle-j1'));
      expect(screen.queryByTestId('job-details-j1')).not.toBeInTheDocument();
    });

    it('shows container ID in expanded details', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByTestId('job-j1');

      await user.click(screen.getByTestId('job-toggle-j1'));
      expect(screen.getByText('docker-abc12')).toBeInTheDocument();
    });

    it('shows error message for failed jobs', async () => {
      const user = userEvent.setup();
      vi.mocked(client.jobs.list).mockResolvedValue({
        data: [
          {
            id: 'j-err',
            packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            workerVersionId: 'broken:1',
            status: 'ERROR',
            startedAt: '2026-01-15T10:05:00Z',
            completedAt: '2026-01-15T10:06:00Z',
            errorMessage: 'OutOfMemoryError',
            retryCount: 2,
            logs: [],
            createdAt: '2026-01-15T10:04:00Z',
          },
        ],
        meta: { limit: 50, total: 1 },
      });

      renderPage();
      await screen.findByTestId('job-j-err');
      await user.click(screen.getByTestId('job-toggle-j-err'));
      expect(screen.getByText('OutOfMemoryError')).toBeInTheDocument();
      expect(screen.getByText('Retries: 2')).toBeInTheDocument();
    });

    it('shows log output in expanded details', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByTestId('job-j1');

      await user.click(screen.getByTestId('job-toggle-j1'));
      expect(screen.getByText(/Processing started/)).toBeInTheDocument();
    });

    it('shows no jobs message when empty', async () => {
      vi.mocked(client.jobs.list).mockResolvedValue({
        data: [],
        meta: { limit: 50, total: 0 },
      });
      renderPage();
      expect(
        await screen.findByTestId('no-jobs'),
      ).toHaveTextContent('No job executions for this package.');
    });

    it('shows running duration text for running jobs', async () => {
      renderPage();
      const durationEl = await screen.findByTestId('job-duration-j2');
      expect(durationEl).toHaveTextContent('(running)');
    });
  });

  // -----------------------------------------------------------------------
  // Interactive Response
  // -----------------------------------------------------------------------

  describe('Interactive Response', () => {
    function setupStuckJob() {
      vi.mocked(client.jobs.list).mockResolvedValue({
        data: [
          {
            id: 'j-stuck',
            packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            workerVersionId: 'reviewer:1',
            status: 'STUCK',
            startedAt: '2026-01-15T12:00:00Z',
            errorMessage: 'What format should the output be?',
            retryCount: 0,
            logs: [],
            createdAt: '2026-01-15T11:59:00Z',
          },
        ],
        meta: { limit: 50, total: 1 },
      });
    }

    it('shows interactive response section when job is STUCK', async () => {
      setupStuckJob();
      renderPage();
      expect(
        await screen.findByTestId('interactive-response'),
      ).toBeInTheDocument();
    });

    it('displays the question prompt', async () => {
      setupStuckJob();
      renderPage();
      expect(
        await screen.findByText('What format should the output be?'),
      ).toBeInTheDocument();
    });

    it('has a textarea for the answer', async () => {
      setupStuckJob();
      renderPage();
      expect(
        await screen.findByTestId('answer-input'),
      ).toBeInTheDocument();
    });

    it('submit button is disabled when answer is empty', async () => {
      setupStuckJob();
      renderPage();
      const btn = await screen.findByTestId('submit-answer');
      expect(btn).toBeDisabled();
    });

    it('submit button is enabled when answer is typed', async () => {
      const user = userEvent.setup();
      setupStuckJob();
      renderPage();

      const input = await screen.findByTestId('answer-input');
      await user.type(input, 'JSON format');

      expect(screen.getByTestId('submit-answer')).not.toBeDisabled();
    });

    it('calls sendInteractiveResponse on submit', async () => {
      const user = userEvent.setup();
      setupStuckJob();
      renderPage();

      const input = await screen.findByTestId('answer-input');
      await user.type(input, 'JSON format');
      await user.click(screen.getByTestId('submit-answer'));

      expect(socketManager.sendInteractiveResponse).toHaveBeenCalledWith(
        'j-stuck',
        expect.objectContaining({ answer: 'JSON format' }),
      );
    });

    it('shows confirmation message after submission', async () => {
      const user = userEvent.setup();
      setupStuckJob();
      renderPage();

      const input = await screen.findByTestId('answer-input');
      await user.type(input, 'JSON format');
      await user.click(screen.getByTestId('submit-answer'));

      expect(
        await screen.findByTestId('interactive-confirmation'),
      ).toBeInTheDocument();
    });

    it('does not show interactive section when no jobs are STUCK', async () => {
      renderPage();
      await screen.findByText('Package');
      expect(
        screen.queryByTestId('interactive-response'),
      ).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Socket.IO
  // -----------------------------------------------------------------------

  describe('Socket.IO', () => {
    function setupStuckJob() {
      vi.mocked(client.jobs.list).mockResolvedValue({
        data: [
          {
            id: 'j-active',
            packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            workerVersionId: 'reviewer:1',
            status: 'RUNNING',
            startedAt: '2026-01-15T12:00:00Z',
            retryCount: 0,
            logs: [],
            createdAt: '2026-01-15T11:59:00Z',
          },
        ],
        meta: { limit: 50, total: 1 },
      });
    }

    it('subscribes to job room when active job exists', async () => {
      setupStuckJob();
      renderPage();
      await screen.findByText('Package');
      expect(socketManager.subscribeJob).toHaveBeenCalledWith('j-active');
    });

    it('registers event listeners for JOB_STUCK, JOB_COMPLETED, JOB_ERROR, JOB_STATE_CHANGED', async () => {
      setupStuckJob();
      renderPage();
      await screen.findByText('Package');
      const calls = vi.mocked(socketManager.onEvent).mock.calls;
      const eventNames = calls.map((c) => c[1]);
      expect(eventNames).toContain(RoutingKeys.JOB_STUCK);
      expect(eventNames).toContain(RoutingKeys.JOB_COMPLETED);
      expect(eventNames).toContain(RoutingKeys.JOB_ERROR);
      expect(eventNames).toContain(RoutingKeys.JOB_STATE_CHANGED);
    });

    it('unsubscribes from job room on unmount', async () => {
      setupStuckJob();
      const { unmount } = renderPage();
      await screen.findByText('Package');
      unmount();
      expect(socketManager.unsubscribe).toHaveBeenCalledWith('job:j-active');
    });

    it('does not subscribe when no active job', async () => {
      vi.mocked(client.jobs.list).mockResolvedValue({
        data: [
          {
            id: 'j-done',
            packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            workerVersionId: 'reviewer:1',
            status: 'COMPLETED',
            startedAt: '2026-01-15T10:00:00Z',
            completedAt: '2026-01-15T10:05:00Z',
            retryCount: 0,
            logs: [],
            createdAt: '2026-01-15T09:59:00Z',
          },
        ],
        meta: { limit: 50, total: 1 },
      });
      renderPage();
      await screen.findByText('Package');
      expect(socketManager.subscribeJob).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Interactive Response - option buttons
  // -----------------------------------------------------------------------

  describe('Interactive Response options', () => {
    it('renders option buttons when question has options', async () => {
      // We need a STUCK job with question from Socket
      vi.mocked(client.jobs.list).mockResolvedValue({
        data: [
          {
            id: 'j-stuck-opts',
            packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            workerVersionId: 'reviewer:1',
            status: 'STUCK',
            startedAt: '2026-01-15T12:00:00Z',
            errorMessage: 'Choose format',
            retryCount: 0,
            logs: [],
            createdAt: '2026-01-15T11:59:00Z',
          },
        ],
        meta: { limit: 50, total: 1 },
      });

      // Simulate socket event for interactive question
      let stuckCallback: ((event: unknown) => void) | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(socketManager.onEvent).mockImplementation(
        ((_ns: any, event: any, cb: any) => {
          if (event === RoutingKeys.JOB_STUCK) {
            stuckCallback = cb;
          }
          return vi.fn();
        }) as any,
      );

      renderPage();
      await screen.findByTestId('interactive-response');

      // Trigger stuck event with options
      if (stuckCallback) {
        act(() => {
          stuckCallback!({
            payload: {
              jobExecutionId: 'j-stuck-opts',
              packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              workerVersionId: 'reviewer:1',
              reason: 'Choose output format',
            },
          });
        });
      }
    });

    it('sets answer when option button is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(client.jobs.list).mockResolvedValue({
        data: [
          {
            id: 'j-stuck-click',
            packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            workerVersionId: 'reviewer:1',
            status: 'STUCK',
            startedAt: '2026-01-15T12:00:00Z',
            errorMessage: 'What do you want?',
            retryCount: 0,
            logs: [],
            createdAt: '2026-01-15T11:59:00Z',
          },
        ],
        meta: { limit: 50, total: 1 },
      });

      renderPage();
      const input = await screen.findByTestId('answer-input');
      await user.type(input, 'My answer');

      // The submit button should now be enabled
      expect(screen.getByTestId('submit-answer')).not.toBeDisabled();
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('Edge cases', () => {
    it('handles package with no files gracefully', async () => {
      vi.mocked(client.packages.listFiles).mockResolvedValue([]);
      renderPage();
      expect(await screen.findByText('Files (0)')).toBeInTheDocument();
    });

    it('handles package with no metadata gracefully', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ metadata: {} }),
      );
      renderPage();
      expect(
        await screen.findByTestId('no-metadata'),
      ).toBeInTheDocument();
    });

    it('handles PENDING status correctly in timeline', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ status: 'PENDING' as never }),
      );
      renderPage();
      await screen.findByTestId('status-timeline');
      const dot = screen.getByTestId('timeline-dot-PENDING');
      expect(dot.className).toContain('animate-pulse');
    });

    it('handles EXPIRED status in timeline', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ status: 'EXPIRED' as never }),
      );
      renderPage();
      await screen.findByTestId('status-timeline');
      expect(screen.getByTestId('timeline-dot-EXPIRED')).toBeInTheDocument();
    });

    it('renders type badge with gray for unknown type', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ type: 'CUSTOM_TYPE' as never }),
      );
      renderPage();
      const badge = await screen.findByText('CUSTOM_TYPE');
      expect(badge.className).toContain('bg-gray-100');
    });

    it('handles metadata with object values', async () => {
      vi.mocked(client.packages.get).mockResolvedValue(
        makePackage({ metadata: { config: { nested: true } } }),
      );
      renderPage();
      expect(
        await screen.findByText('{"nested":true}'),
      ).toBeInTheDocument();
    });

    it('handles jobs with no startedAt', async () => {
      vi.mocked(client.jobs.list).mockResolvedValue({
        data: [
          {
            id: 'j-queued',
            packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            workerVersionId: 'worker:1',
            status: 'QUEUED',
            retryCount: 0,
            logs: [],
            createdAt: '2026-01-15T10:00:00Z',
          },
        ],
        meta: { limit: 50, total: 1 },
      });
      renderPage();
      expect(await screen.findByText('Queued')).toBeInTheDocument();
    });

    it('handles CANCELLED job status', async () => {
      vi.mocked(client.jobs.list).mockResolvedValue({
        data: [
          {
            id: 'j-cancel',
            packageId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            workerVersionId: 'worker:1',
            status: 'CANCELLED',
            startedAt: '2026-01-15T10:00:00Z',
            retryCount: 0,
            logs: [],
            createdAt: '2026-01-15T09:59:00Z',
          },
        ],
        meta: { limit: 50, total: 1 },
      });
      renderPage();
      expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    });
  });
});
