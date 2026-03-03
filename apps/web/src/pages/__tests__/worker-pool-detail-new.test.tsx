import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkerPoolDetailPage from '../worker-pool-detail';
import * as client from '@/api/client';
import { socketManager } from '@/api/socket';
import { RoutingKeys } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  workerPools: {
    get: vi.fn(),
    update: vi.fn(),
    submitPackage: vi.fn(),
  },
  packages: {
    create: vi.fn(),
    getUploadUrl: vi.fn(),
    confirmUpload: vi.fn(),
  },
  assemblyLines: {
    submitPackage: vi.fn(),
  },
  workerPoolsApi: {
    submitPackage: vi.fn(),
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
    subscribeWorkerPool: vi.fn(),
    unsubscribe: vi.fn(),
    onEvent: vi.fn(() => vi.fn()),
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
    description: 'A pool for GPU workers',
    status: 'ACTIVE',
    maxConcurrency: 10,
    activeJobCount: 3,
    members: [
      { id: 'm1', poolId: 'pool-1', workerVersionId: 'summarizer:2', priority: 1 },
      { id: 'm2', poolId: 'pool-1', workerVersionId: 'reviewer:1', priority: 2 },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(slug = 'gpu-pool') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/worker-pools/${slug}`]}>
        <Routes>
          <Route path="/worker-pools/:slug" element={<WorkerPoolDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerPoolDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.workerPools.get).mockResolvedValue(makePool() as never);
  });

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------

  describe('Header', () => {
    it('renders the pool name', async () => {
      renderPage();
      expect(
        await screen.findByRole('heading', { level: 2, name: 'GPU Pool' }),
      ).toBeInTheDocument();
    });

    it('renders the status badge', async () => {
      renderPage();
      expect(await screen.findByText('Active')).toBeInTheDocument();
    });

    it('renders the description', async () => {
      renderPage();
      expect(await screen.findByText('A pool for GPU workers')).toBeInTheDocument();
    });

    it('has a back button that navigates to pool list', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('GPU Pool');

      await user.click(
        screen.getByRole('button', { name: /Back to Worker Pools/i }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/worker-pools');
    });

    it('has an edit button', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      expect(
        screen.getByRole('button', { name: /Edit/i }),
      ).toBeInTheDocument();
    });

    it('has a submit package button', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      expect(
        screen.getByRole('button', { name: /Submit Package/i }),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Pool Utilization
  // -----------------------------------------------------------------------

  describe('Pool Utilization', () => {
    it('renders pool utilization section', async () => {
      renderPage();
      expect(await screen.findByText('Pool Utilization')).toBeInTheDocument();
    });

    it('renders a progressbar', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows active jobs / max concurrency text', async () => {
      renderPage();
      expect(await screen.findByText('3 / 10')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Queue depth
  // -----------------------------------------------------------------------

  describe('Queue depth', () => {
    it('renders queue depth indicator', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      expect(screen.getByText('Queue Depth:')).toBeInTheDocument();
      expect(screen.getByTestId('queue-depth')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Members
  // -----------------------------------------------------------------------

  describe('Members', () => {
    it('renders member count in heading', async () => {
      renderPage();
      expect(await screen.findByText('Members (2)')).toBeInTheDocument();
    });

    it('renders member cards', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      expect(screen.getByTestId('member-m1')).toBeInTheDocument();
      expect(screen.getByTestId('member-m2')).toBeInTheDocument();
    });

    it('shows member name from workerVersionId', async () => {
      renderPage();
      expect(await screen.findByText('summarizer')).toBeInTheDocument();
      expect(screen.getByText('reviewer')).toBeInTheDocument();
    });

    it('shows member version', async () => {
      renderPage();
      expect(await screen.findByText('v2')).toBeInTheDocument();
      expect(screen.getByText('v1')).toBeInTheDocument();
    });

    it('shows idle status by default', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      const idleBadges = screen.getAllByText('Idle');
      expect(idleBadges.length).toBe(2);
    });

    it('shows no members message when pool has no members', async () => {
      vi.mocked(client.workerPools.get).mockResolvedValue(
        makePool({ members: [] }) as never,
      );
      renderPage();
      expect(await screen.findByText('No members in this pool.')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Active Jobs
  // -----------------------------------------------------------------------

  describe('Active Jobs', () => {
    it('renders active jobs section heading', async () => {
      renderPage();
      expect(await screen.findByText('Active Jobs')).toBeInTheDocument();
    });

    it('shows no active jobs message initially', async () => {
      renderPage();
      expect(await screen.findByText('No active jobs.')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  describe('Loading state', () => {
    it('shows skeleton while loading', () => {
      vi.mocked(client.workerPools.get).mockReturnValue(
        new Promise(() => {}),
      );
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
      vi.mocked(client.workerPools.get).mockRejectedValue(
        new Error('Pool not found'),
      );
      renderPage();
      expect(
        await screen.findByText('Failed to load Worker Pool'),
      ).toBeInTheDocument();
      expect(screen.getByText('Pool not found')).toBeInTheDocument();
    });

    it('has role="alert"', async () => {
      vi.mocked(client.workerPools.get).mockRejectedValue(
        new Error('Network error'),
      );
      renderPage();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('shows retry button that refetches', async () => {
      const user = userEvent.setup();
      vi.mocked(client.workerPools.get)
        .mockRejectedValueOnce(new Error('Oops'))
        .mockResolvedValueOnce(makePool() as never);

      renderPage();
      const retryBtn = await screen.findByRole('button', { name: /Retry/i });
      await user.click(retryBtn);
      expect(client.workerPools.get).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Socket.IO subscription
  // -----------------------------------------------------------------------

  describe('Socket.IO', () => {
    it('subscribes to worker-pool room on mount', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      expect(socketManager.subscribeWorkerPool).toHaveBeenCalledWith('gpu-pool');
    });

    it('registers event listeners for JOB_STATE_CHANGED, PACKAGE_CREATED, PACKAGE_PROCESSED', async () => {
      renderPage();
      await screen.findByText('GPU Pool');
      const calls = vi.mocked(socketManager.onEvent).mock.calls;
      const eventNames = calls.map((c) => c[1]);
      expect(eventNames).toContain(RoutingKeys.JOB_STATE_CHANGED);
      expect(eventNames).toContain(RoutingKeys.PACKAGE_CREATED);
      expect(eventNames).toContain(RoutingKeys.PACKAGE_PROCESSED);
    });

    it('unsubscribes from room on unmount', async () => {
      const { unmount } = renderPage();
      await screen.findByText('GPU Pool');
      unmount();
      expect(socketManager.unsubscribe).toHaveBeenCalledWith('worker-pool:gpu-pool');
    });
  });

  // -----------------------------------------------------------------------
  // Real-time event handling
  // -----------------------------------------------------------------------

  describe('Real-time events', () => {
    function getEventCallback(eventKey: string) {
      const calls = vi.mocked(socketManager.onEvent).mock.calls;
      const match = calls.find((c) => c[1] === eventKey);
      return match?.[2] as (event: unknown) => void;
    }

    it('adds active job when JOB_STATE_CHANGED WORKING event fires', async () => {
      renderPage();
      await screen.findByText('GPU Pool');

      const callback = getEventCallback(RoutingKeys.JOB_STATE_CHANGED);
      expect(callback).toBeDefined();

      act(() => {
        callback({
          payload: {
            newState: 'WORKING',
            jobExecutionId: 'j1',
            packageId: 'p1',
            workerVersionId: 'summarizer:2',
            workerId: 'w1',
            previousState: 'IDLE',
          },
        });
      });

      // Should show the active job in the table
      expect(await screen.findByText('WORKING')).toBeInTheDocument();
    });

    it('removes active job when JOB_STATE_CHANGED DONE event fires', async () => {
      renderPage();
      await screen.findByText('GPU Pool');

      const callback = getEventCallback(RoutingKeys.JOB_STATE_CHANGED);

      act(() => {
        callback({
          payload: {
            newState: 'WORKING',
            jobExecutionId: 'j2',
            packageId: 'p2',
            workerVersionId: 'reviewer:1',
            workerId: 'w2',
            previousState: 'IDLE',
          },
        });
      });

      expect(await screen.findByText('WORKING')).toBeInTheDocument();

      act(() => {
        callback({
          payload: {
            newState: 'DONE',
            jobExecutionId: 'j2',
            packageId: 'p2',
            workerVersionId: 'reviewer:1',
            workerId: 'w2',
            previousState: 'WORKING',
          },
        });
      });

      expect(screen.getByText('No active jobs.')).toBeInTheDocument();
    });

    it('updates member status to busy on WORKING event', async () => {
      renderPage();
      await screen.findByText('GPU Pool');

      const callback = getEventCallback(RoutingKeys.JOB_STATE_CHANGED);

      act(() => {
        callback({
          payload: {
            newState: 'WORKING',
            jobExecutionId: 'j3',
            packageId: 'p3',
            workerVersionId: 'summarizer:2',
            workerId: 'w1',
            previousState: 'IDLE',
          },
        });
      });

      expect(await screen.findByText('Busy')).toBeInTheDocument();
    });

    it('updates member status to error on ERROR event', async () => {
      renderPage();
      await screen.findByText('GPU Pool');

      const callback = getEventCallback(RoutingKeys.JOB_STATE_CHANGED);

      act(() => {
        callback({
          payload: {
            newState: 'WORKING',
            jobExecutionId: 'j4',
            packageId: 'p4',
            workerVersionId: 'summarizer:2',
            workerId: 'w1',
            previousState: 'IDLE',
          },
        });
      });

      act(() => {
        callback({
          payload: {
            newState: 'ERROR',
            jobExecutionId: 'j4',
            packageId: 'p4',
            workerVersionId: 'summarizer:2',
            workerId: 'w1',
            previousState: 'WORKING',
          },
        });
      });

      const memberCard = screen.getByTestId('member-m1');
      expect(within(memberCard).getByText('Error')).toBeInTheDocument();
    });

    it('increments queue depth on PACKAGE_CREATED', async () => {
      renderPage();
      await screen.findByText('GPU Pool');

      const callback = getEventCallback(RoutingKeys.PACKAGE_CREATED);

      act(() => {
        callback({ payload: {} });
      });

      expect(screen.getByTestId('queue-depth')).toHaveTextContent('1');
    });

    it('decrements queue depth on PACKAGE_PROCESSED', async () => {
      renderPage();
      await screen.findByText('GPU Pool');

      const createCallback = getEventCallback(RoutingKeys.PACKAGE_CREATED);
      const processCallback = getEventCallback(RoutingKeys.PACKAGE_PROCESSED);

      act(() => {
        createCallback({ payload: {} });
        createCallback({ payload: {} });
      });

      expect(screen.getByTestId('queue-depth')).toHaveTextContent('2');

      act(() => {
        processCallback({ payload: {} });
      });

      expect(screen.getByTestId('queue-depth')).toHaveTextContent('1');
    });

    it('handles WORKING event without workerVersionId', async () => {
      renderPage();
      await screen.findByText('GPU Pool');

      const callback = getEventCallback(RoutingKeys.JOB_STATE_CHANGED);

      act(() => {
        callback({
          payload: {
            newState: 'WORKING',
            jobExecutionId: 'j5',
            packageId: 'p5',
            workerId: 'w5',
            previousState: 'IDLE',
          },
        });
      });

      expect(await screen.findByText('Unknown')).toBeInTheDocument();
    });

    it('does not add duplicate active job for same jobId', async () => {
      renderPage();
      await screen.findByText('GPU Pool');

      const callback = getEventCallback(RoutingKeys.JOB_STATE_CHANGED);

      act(() => {
        callback({
          payload: { newState: 'WORKING', jobExecutionId: 'j6', packageId: 'p6', workerVersionId: 'w1:1', workerId: 'w1', previousState: 'IDLE' },
        });
        callback({
          payload: { newState: 'WORKING', jobExecutionId: 'j6', packageId: 'p6', workerVersionId: 'w1:1', workerId: 'w1', previousState: 'IDLE' },
        });
      });

      // Only one row should appear
      const rows = screen.getAllByText('WORKING');
      expect(rows).toHaveLength(1);
    });

    it('handles DONE event without workerVersionId', async () => {
      renderPage();
      await screen.findByText('GPU Pool');

      const callback = getEventCallback(RoutingKeys.JOB_STATE_CHANGED);

      act(() => {
        callback({
          payload: { newState: 'WORKING', jobExecutionId: 'j7', packageId: 'p7', workerId: 'w7', previousState: 'IDLE' },
        });
      });

      act(() => {
        callback({
          payload: { newState: 'DONE', jobExecutionId: 'j7', packageId: 'p7', workerId: 'w7', previousState: 'WORKING' },
        });
      });

      expect(screen.getByText('No active jobs.')).toBeInTheDocument();
    });

    it('does not go below 0 queue depth', async () => {
      renderPage();
      await screen.findByText('GPU Pool');

      const processCallback = getEventCallback(RoutingKeys.PACKAGE_PROCESSED);

      act(() => {
        processCallback({ payload: {} });
      });

      expect(screen.getByTestId('queue-depth')).toHaveTextContent('0');
    });
  });

  // -----------------------------------------------------------------------
  // Submit Package dialog
  // -----------------------------------------------------------------------

  describe('Submit Package dialog', () => {
    it('opens dialog when Submit Package button is clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('GPU Pool');

      await user.click(screen.getByRole('button', { name: /Submit Package/i }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText(/Submit a new package/i)).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Status badge colors
  // -----------------------------------------------------------------------

  describe('Status badge colors', () => {
    it('applies green for ACTIVE', async () => {
      renderPage();
      const badge = await screen.findByText('Active');
      expect(badge.className).toContain('bg-green-100');
    });

    it('applies yellow for PAUSED', async () => {
      vi.mocked(client.workerPools.get).mockResolvedValue(
        makePool({ status: 'PAUSED' }) as never,
      );
      renderPage();
      const badge = await screen.findByText('Paused');
      expect(badge.className).toContain('bg-yellow-100');
    });

    it('applies red for ERROR', async () => {
      vi.mocked(client.workerPools.get).mockResolvedValue(
        makePool({ status: 'ERROR' }) as never,
      );
      renderPage();
      const badge = await screen.findByText('Error');
      expect(badge.className).toContain('bg-red-100');
    });

    it('applies gray for unknown status', async () => {
      vi.mocked(client.workerPools.get).mockResolvedValue(
        makePool({ status: 'UNKNOWN' }) as never,
      );
      renderPage();
      const badge = await screen.findByText('UNKNOWN');
      expect(badge.className).toContain('bg-gray-100');
    });
  });

  // -----------------------------------------------------------------------
  // No description
  // -----------------------------------------------------------------------

  describe('No description', () => {
    it('does not render description when not provided', async () => {
      vi.mocked(client.workerPools.get).mockResolvedValue(
        makePool({ description: undefined }) as never,
      );
      renderPage();
      await screen.findByText('GPU Pool');
      expect(screen.queryByText('A pool for GPU workers')).not.toBeInTheDocument();
    });
  });
});
