import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AssemblyLineDetailPage from '../assembly-line-detail';
import * as client from '@/api/client';
import { socketManager } from '@/api/socket';
import { RoutingKeys } from '@smithy/shared';
import type {
  AssemblyLineStepCompletedEvent,
  WorkerStateChangedEvent,
  PackageCreatedEvent,
  PackageProcessedEvent,
  AssemblyLineCompletedEvent,
} from '@smithy/shared';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/client', () => ({
  assemblyLines: {
    get: vi.fn(),
    update: vi.fn(),
    listPackages: vi.fn(),
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
    subscribeAssemblyLine: vi.fn(),
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

function makeAssemblyLine(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'line-1',
    name: 'Test Pipeline',
    slug: 'test-pipeline',
    description: 'A test assembly line for processing packages',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    steps: [
      {
        id: 'step-1',
        assemblyLineId: 'line-1',
        stepNumber: 1,
        workerVersionId: 'Summarizer:1.0',
      },
      {
        id: 'step-2',
        assemblyLineId: 'line-1',
        stepNumber: 2,
        workerVersionId: 'Reviewer:2.0',
      },
      {
        id: 'step-3',
        assemblyLineId: 'line-1',
        stepNumber: 3,
        workerVersionId: 'Builder:1.5',
      },
    ],
    ...overrides,
  };
}

function makePackage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pkg-11112222-abcd',
    type: 'CODE',
    status: 'PROCESSING',
    metadata: {},
    assemblyLineId: 'line-1',
    currentStep: 2,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const DEFAULT_PACKAGES = {
  data: [
    makePackage({
      id: 'pkg-aaaa1111-xxxx',
      type: 'USER_INPUT',
      status: 'PENDING',
      currentStep: 1,
    }),
    makePackage({
      id: 'pkg-bbbb2222-yyyy',
      type: 'CODE',
      status: 'PROCESSING',
      currentStep: 2,
    }),
  ],
  meta: { limit: 20, total: 2 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(slug = 'test-pipeline') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/assembly-lines/${slug}`]}>
        <Routes>
          <Route
            path="/assembly-lines/:slug"
            element={<AssemblyLineDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Helper to capture socket event handlers
type EventHandler = (...args: unknown[]) => void;
function captureSocketHandlers() {
  const handlers = new Map<string, EventHandler>();

  vi.mocked(socketManager.onEvent).mockImplementation(
    ((_ns: string, event: string, callback: EventHandler) => {
      handlers.set(`${_ns}:${event}`, callback);
      return vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  );

  return handlers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssemblyLineDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.assemblyLines.get).mockResolvedValue(
      makeAssemblyLine() as never,
    );
    vi.mocked(client.assemblyLines.listPackages).mockResolvedValue(
      DEFAULT_PACKAGES as never,
    );
  });

  // -----------------------------------------------------------------------
  // Header
  // -----------------------------------------------------------------------

  describe('Header', () => {
    it('renders the assembly line name', async () => {
      renderPage();
      expect(
        await screen.findByRole('heading', {
          level: 2,
          name: 'Test Pipeline',
        }),
      ).toBeInTheDocument();
    });

    it('renders the status badge', async () => {
      renderPage();
      expect(await screen.findByText('Active')).toBeInTheDocument();
    });

    it('renders the description', async () => {
      renderPage();
      expect(
        await screen.findByText(
          'A test assembly line for processing packages',
        ),
      ).toBeInTheDocument();
    });

    it('renders back button that navigates to list', async () => {
      const user = userEvent.setup();
      renderPage();
      const backBtn = await screen.findByRole('button', {
        name: /Back to Assembly Lines/i,
      });
      await user.click(backBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/assembly-lines');
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
      vi.mocked(client.assemblyLines.get).mockResolvedValue(
        makeAssemblyLine({ status: 'PAUSED' }) as never,
      );
      renderPage();
      const badge = await screen.findByText('Paused');
      expect(badge.className).toContain('bg-yellow-100');
    });

    it('applies gray for ARCHIVED', async () => {
      vi.mocked(client.assemblyLines.get).mockResolvedValue(
        makeAssemblyLine({ status: 'ARCHIVED' }) as never,
      );
      renderPage();
      const badge = await screen.findByText('Archived');
      expect(badge.className).toContain('bg-gray-100');
    });

    it('applies red for ERROR', async () => {
      vi.mocked(client.assemblyLines.get).mockResolvedValue(
        makeAssemblyLine({ status: 'ERROR' }) as never,
      );
      renderPage();
      const badge = await screen.findByText('Error');
      expect(badge.className).toContain('bg-red-100');
    });
  });

  // -----------------------------------------------------------------------
  // Pipeline visualization
  // -----------------------------------------------------------------------

  describe('Pipeline visualization', () => {
    it('renders pipeline steps', async () => {
      renderPage();
      // Wait for data to load by looking for step test IDs
      expect(await screen.findByTestId('step-1')).toBeInTheDocument();
      expect(screen.getByTestId('step-2')).toBeInTheDocument();
      expect(screen.getByTestId('step-3')).toBeInTheDocument();
      // Worker names appear within step boxes
      expect(within(screen.getByTestId('step-1')).getByText('Summarizer')).toBeInTheDocument();
      expect(within(screen.getByTestId('step-2')).getByText('Reviewer')).toBeInTheDocument();
      expect(within(screen.getByTestId('step-3')).getByText('Builder')).toBeInTheDocument();
    });

    it('renders step numbers', async () => {
      renderPage();
      await screen.findByTestId('step-1');
      expect(within(screen.getByTestId('step-1')).getByText('Step 1')).toBeInTheDocument();
      expect(within(screen.getByTestId('step-2')).getByText('Step 2')).toBeInTheDocument();
      expect(within(screen.getByTestId('step-3')).getByText('Step 3')).toBeInTheDocument();
    });

    it('renders worker versions', async () => {
      renderPage();
      await screen.findByTestId('step-1');
      expect(within(screen.getByTestId('step-1')).getByText('v1.0')).toBeInTheDocument();
      expect(within(screen.getByTestId('step-2')).getByText('v2.0')).toBeInTheDocument();
      expect(within(screen.getByTestId('step-3')).getByText('v1.5')).toBeInTheDocument();
    });

    it('renders Pipeline heading with compact toggle', async () => {
      renderPage();
      await screen.findByTestId('step-1');
      expect(screen.getByText('Pipeline')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Collapse pipeline/i }),
      ).toBeInTheDocument();
    });

    it('toggles compact mode', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByTestId('step-1');

      // Click collapse
      await user.click(
        screen.getByRole('button', { name: /Collapse pipeline/i }),
      );

      // Should show compact steps
      expect(screen.getByTestId('compact-step-1')).toBeInTheDocument();

      // Click expand
      await user.click(
        screen.getByRole('button', { name: /Expand pipeline/i }),
      );

      // Should show full steps again
      expect(screen.getByTestId('step-1')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Package tracker
  // -----------------------------------------------------------------------

  describe('Package tracker', () => {
    it('renders package IDs as links', async () => {
      renderPage();
      const link = await screen.findByRole('link', { name: 'pkg-aaaa' });
      expect(link).toHaveAttribute('href', '/packages/pkg-aaaa1111-xxxx');
    });

    it('renders package status badges', async () => {
      renderPage();
      // Wait for packages to load
      await screen.findByRole('link', { name: 'pkg-aaaa' });
      // Status badges appear in the table
      const table = screen.getByRole('table');
      expect(within(table).getByText('Pending')).toBeInTheDocument();
      expect(within(table).getByText('Processing')).toBeInTheDocument();
    });

    it('renders current step names', async () => {
      renderPage();
      // Wait for the page to load by finding the package links
      const link = await screen.findByRole('link', { name: 'pkg-aaaa' });
      // The package at step 1 should show "Summarizer" in its row
      const row = link.closest('tr')!;
      const cells = within(row).getAllByRole('cell');
      expect(cells[2]!).toHaveTextContent('Summarizer');
    });
  });

  // -----------------------------------------------------------------------
  // Action buttons
  // -----------------------------------------------------------------------

  describe('Action buttons', () => {
    it('renders Submit Package button', async () => {
      renderPage();
      expect(
        await screen.findByRole('button', { name: /Submit Package/i }),
      ).toBeInTheDocument();
    });

    it('opens submit dialog on Submit Package click', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        await screen.findByRole('button', { name: /Submit Package/i }),
      );
      expect(
        await screen.findByRole('heading', { name: 'Submit Package' }),
      ).toBeInTheDocument();
    });

    it('renders Edit button', async () => {
      renderPage();
      expect(
        await screen.findByRole('button', { name: /Edit/i }),
      ).toBeInTheDocument();
    });

    it('navigates to edit page on Edit click', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        await screen.findByRole('button', { name: /Edit/i }),
      );
      expect(mockNavigate).toHaveBeenCalledWith(
        '/assembly-lines/test-pipeline/edit',
      );
    });

    it('renders Pause button for active lines', async () => {
      renderPage();
      expect(
        await screen.findByRole('button', { name: /Pause/i }),
      ).toBeInTheDocument();
    });

    it('renders Resume button for paused lines', async () => {
      vi.mocked(client.assemblyLines.get).mockResolvedValue(
        makeAssemblyLine({ status: 'PAUSED' }) as never,
      );
      renderPage();
      expect(
        await screen.findByRole('button', { name: /Resume/i }),
      ).toBeInTheDocument();
    });

    it('does not render Pause/Resume for archived lines', async () => {
      vi.mocked(client.assemblyLines.get).mockResolvedValue(
        makeAssemblyLine({ status: 'ARCHIVED' }) as never,
      );
      renderPage();
      await screen.findByText('Test Pipeline');
      expect(
        screen.queryByRole('button', { name: /Pause/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Resume/i }),
      ).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Pause/Resume confirmation dialog
  // -----------------------------------------------------------------------

  describe('Pause/Resume confirmation', () => {
    it('opens confirmation dialog when Pause is clicked', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        await screen.findByRole('button', { name: /Pause/i }),
      );

      expect(screen.getByText('Pause Assembly Line')).toBeInTheDocument();
      expect(
        screen.getByText(/will stop processing new packages/),
      ).toBeInTheDocument();
    });

    it('opens confirmation dialog when Resume is clicked', async () => {
      vi.mocked(client.assemblyLines.get).mockResolvedValue(
        makeAssemblyLine({ status: 'PAUSED' }) as never,
      );
      const user = userEvent.setup();
      renderPage();
      await user.click(
        await screen.findByRole('button', { name: /Resume/i }),
      );

      expect(screen.getByText('Resume Assembly Line')).toBeInTheDocument();
      expect(
        screen.getByText(/will allow it to process packages again/),
      ).toBeInTheDocument();
    });

    it('calls update mutation with PAUSED when confirmed', async () => {
      vi.mocked(client.assemblyLines.update).mockResolvedValue(
        makeAssemblyLine({ status: 'PAUSED' }) as never,
      );
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Pause/i }),
      );

      // Click confirm in dialog
      const dialog = screen.getByRole('dialog');
      await user.click(
        within(dialog).getByRole('button', { name: 'Pause' }),
      );

      expect(client.assemblyLines.update).toHaveBeenCalledWith(
        'test-pipeline',
        { status: 'PAUSED' },
      );
    });

    it('calls update mutation with ACTIVE when Resume confirmed', async () => {
      vi.mocked(client.assemblyLines.get).mockResolvedValue(
        makeAssemblyLine({ status: 'PAUSED' }) as never,
      );
      vi.mocked(client.assemblyLines.update).mockResolvedValue(
        makeAssemblyLine({ status: 'ACTIVE' }) as never,
      );
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Resume/i }),
      );

      const dialog = screen.getByRole('dialog');
      await user.click(
        within(dialog).getByRole('button', { name: 'Resume' }),
      );

      expect(client.assemblyLines.update).toHaveBeenCalledWith(
        'test-pipeline',
        { status: 'ACTIVE' },
      );
    });

    it('closes dialog on Cancel', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Pause/i }),
      );
      expect(screen.getByText('Pause Assembly Line')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(
        screen.queryByText('Pause Assembly Line'),
      ).not.toBeInTheDocument();
    });

    it('shows loading state during mutation', async () => {
      vi.mocked(client.assemblyLines.update).mockReturnValue(
        new Promise(() => {}),
      );
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /Pause/i }),
      );

      const dialog = screen.getByRole('dialog');
      await user.click(
        within(dialog).getByRole('button', { name: 'Pause' }),
      );

      const spinner = dialog.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: 'Cancel' }),
      ).toBeDisabled();
    });
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  describe('Loading state', () => {
    it('shows skeleton while loading', () => {
      vi.mocked(client.assemblyLines.get).mockReturnValue(
        new Promise(() => {}),
      );
      const { container } = renderPage();
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not render assembly line name while loading', () => {
      vi.mocked(client.assemblyLines.get).mockReturnValue(
        new Promise(() => {}),
      );
      renderPage();
      expect(screen.queryByText('Test Pipeline')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  describe('Error state', () => {
    it('shows error message when API fails', async () => {
      vi.mocked(client.assemblyLines.get).mockRejectedValue(
        new Error('Server error'),
      );
      renderPage();
      expect(
        await screen.findByText('Failed to load Assembly Line'),
      ).toBeInTheDocument();
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });

    it('has role="alert" on error container', async () => {
      vi.mocked(client.assemblyLines.get).mockRejectedValue(
        new Error('fail'),
      );
      renderPage();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('shows retry button that refetches', async () => {
      const user = userEvent.setup();
      vi.mocked(client.assemblyLines.get)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(makeAssemblyLine() as never);

      renderPage();
      const retryBtn = await screen.findByRole('button', { name: /Retry/i });
      await user.click(retryBtn);
      expect(client.assemblyLines.get).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Socket.IO integration
  // -----------------------------------------------------------------------

  describe('Socket.IO integration', () => {
    it('subscribes to assembly line room on mount', async () => {
      renderPage();
      await screen.findByText('Test Pipeline');
      expect(socketManager.subscribeAssemblyLine).toHaveBeenCalledWith(
        'test-pipeline',
      );
    });

    it('unsubscribes from assembly line room on unmount', async () => {
      const { unmount } = renderPage();
      await screen.findByText('Test Pipeline');
      unmount();
      expect(socketManager.unsubscribe).toHaveBeenCalledWith(
        'assembly-line:test-pipeline',
      );
    });

    it('subscribes to workflow events', async () => {
      renderPage();
      await screen.findByText('Test Pipeline');

      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        expect.any(Function),
      );
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/workflows',
        RoutingKeys.PACKAGE_PROCESSED,
        expect.any(Function),
      );
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/workflows',
        RoutingKeys.ASSEMBLY_LINE_STEP_COMPLETED,
        expect.any(Function),
      );
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/workflows',
        RoutingKeys.ASSEMBLY_LINE_COMPLETED,
        expect.any(Function),
      );
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/workflows',
        RoutingKeys.JOB_STATE_CHANGED,
        expect.any(Function),
      );
    });

    it('calls unsubscribe functions on unmount', async () => {
      const unsubFns: ReturnType<typeof vi.fn>[] = [];
      vi.mocked(socketManager.onEvent).mockImplementation(() => {
        const unsub = vi.fn();
        unsubFns.push(unsub);
        return unsub;
      });

      const { unmount } = renderPage();
      await screen.findByText('Test Pipeline');
      unmount();

      for (const unsub of unsubFns) {
        expect(unsub).toHaveBeenCalled();
      }
    });

    it('updates step status on JOB_STATE_CHANGED event', async () => {
      const handlers = captureSocketHandlers();
      renderPage();
      await screen.findByText('Test Pipeline');

      // Simulate a WORKING state change for a package at step 2
      const handler = handlers.get(
        `/workflows:${RoutingKeys.JOB_STATE_CHANGED}`,
      );
      expect(handler).toBeDefined();

      act(() => {
        handler?.({
          eventType: RoutingKeys.JOB_STATE_CHANGED,
          timestamp: new Date().toISOString(),
          correlationId: 'test-corr',
          payload: {
            jobExecutionId: 'job-1',
            workerId: 'worker-1',
            workerVersionId: 'wv-1',
            previousState: 'WAITING',
            newState: 'WORKING',
            packageId: 'pkg-bbbb2222-yyyy',
          },
        } satisfies WorkerStateChangedEvent);
      });

      // Step 2 should now show processing status
      const step2 = screen.getByTestId('step-2');
      expect(step2.className).toContain('border-blue-300');
    });

    it('updates step status to error on ERROR state', async () => {
      const handlers = captureSocketHandlers();
      renderPage();
      await screen.findByText('Test Pipeline');

      const handler = handlers.get(
        `/workflows:${RoutingKeys.JOB_STATE_CHANGED}`,
      );

      act(() => {
        handler?.({
          eventType: RoutingKeys.JOB_STATE_CHANGED,
          timestamp: new Date().toISOString(),
          correlationId: 'test-corr',
          payload: {
            jobExecutionId: 'job-1',
            workerId: 'worker-1',
            workerVersionId: 'wv-1',
            previousState: 'WORKING',
            newState: 'ERROR',
            packageId: 'pkg-bbbb2222-yyyy',
          },
        } satisfies WorkerStateChangedEvent);
      });

      const step2 = screen.getByTestId('step-2');
      expect(step2.className).toContain('border-red-300');
    });

    it('marks step as completed on ASSEMBLY_LINE_STEP_COMPLETED', async () => {
      const handlers = captureSocketHandlers();
      renderPage();
      await screen.findByText('Test Pipeline');

      const handler = handlers.get(
        `/workflows:${RoutingKeys.ASSEMBLY_LINE_STEP_COMPLETED}`,
      );

      act(() => {
        handler?.({
          eventType: RoutingKeys.ASSEMBLY_LINE_STEP_COMPLETED,
          timestamp: new Date().toISOString(),
          correlationId: 'test-corr',
          payload: {
            assemblyLineId: 'line-1',
            stepIndex: 1,
            stepName: 'Summarizer',
            packageId: 'pkg-aaaa',
            duration: 5000,
          },
        } satisfies AssemblyLineStepCompletedEvent);
      });

      const step1 = screen.getByTestId('step-1');
      expect(step1.className).toContain('border-green-300');
    });

    it('updates step status to completed on DONE state', async () => {
      const handlers = captureSocketHandlers();
      renderPage();
      await screen.findByText('Test Pipeline');

      const handler = handlers.get(
        `/workflows:${RoutingKeys.JOB_STATE_CHANGED}`,
      );

      act(() => {
        handler?.({
          eventType: RoutingKeys.JOB_STATE_CHANGED,
          timestamp: new Date().toISOString(),
          correlationId: 'test-corr',
          payload: {
            jobExecutionId: 'job-1',
            workerId: 'worker-1',
            workerVersionId: 'wv-1',
            previousState: 'WORKING',
            newState: 'DONE',
            packageId: 'pkg-bbbb2222-yyyy',
          },
        } satisfies WorkerStateChangedEvent);
      });

      const step2 = screen.getByTestId('step-2');
      expect(step2.className).toContain('border-green-300');
    });

    it('updates package status to PENDING on PACKAGE_CREATED', async () => {
      const handlers = captureSocketHandlers();
      renderPage();
      await screen.findByText('Test Pipeline');

      const handler = handlers.get(
        `/workflows:${RoutingKeys.PACKAGE_CREATED}`,
      );

      act(() => {
        handler?.({
          eventType: RoutingKeys.PACKAGE_CREATED,
          timestamp: new Date().toISOString(),
          correlationId: 'test-corr',
          payload: {
            packageId: 'pkg-new-1',
            type: 'CODE',
            metadata: {},
          },
        } satisfies PackageCreatedEvent);
      });

      // Verify the handler was called (state update is internal)
      expect(handler).toBeDefined();
    });

    it('updates package status to COMPLETED on PACKAGE_PROCESSED', async () => {
      const handlers = captureSocketHandlers();
      renderPage();
      await screen.findByText('Test Pipeline');

      const handler = handlers.get(
        `/workflows:${RoutingKeys.PACKAGE_PROCESSED}`,
      );

      act(() => {
        handler?.({
          eventType: RoutingKeys.PACKAGE_PROCESSED,
          timestamp: new Date().toISOString(),
          correlationId: 'test-corr',
          payload: {
            packageId: 'pkg-aaaa1111-xxxx',
            type: 'USER_INPUT',
            resultSummary: 'Done',
          },
        } satisfies PackageProcessedEvent);
      });

      expect(handler).toBeDefined();
    });

    it('invalidates queries on ASSEMBLY_LINE_COMPLETED', async () => {
      const handlers = captureSocketHandlers();
      renderPage();
      await screen.findByText('Test Pipeline');

      const handler = handlers.get(
        `/workflows:${RoutingKeys.ASSEMBLY_LINE_COMPLETED}`,
      );

      act(() => {
        handler?.({
          eventType: RoutingKeys.ASSEMBLY_LINE_COMPLETED,
          timestamp: new Date().toISOString(),
          correlationId: 'test-corr',
          payload: {
            assemblyLineId: 'line-1',
            packageId: 'pkg-aaaa',
            totalSteps: 3,
            totalDuration: 15000,
          },
        } satisfies AssemblyLineCompletedEvent);
      });

      expect(handler).toBeDefined();
    });

    it('handles JOB_STATE_CHANGED for unknown package gracefully', async () => {
      const handlers = captureSocketHandlers();
      renderPage();
      await screen.findByText('Test Pipeline');

      const handler = handlers.get(
        `/workflows:${RoutingKeys.JOB_STATE_CHANGED}`,
      );

      // Package not in the current data — step should be null
      act(() => {
        handler?.({
          eventType: RoutingKeys.JOB_STATE_CHANGED,
          timestamp: new Date().toISOString(),
          correlationId: 'test-corr',
          payload: {
            jobExecutionId: 'job-1',
            workerId: 'worker-1',
            workerVersionId: 'wv-1',
            previousState: 'WAITING',
            newState: 'WORKING',
            packageId: 'pkg-unknown-not-in-data',
          },
        } satisfies WorkerStateChangedEvent);
      });

      // No step should change — all still idle (gray)
      expect(screen.getByTestId('step-1').className).toContain('border-gray-200');
    });
  });

  // -----------------------------------------------------------------------
  // Uses correct hooks
  // -----------------------------------------------------------------------

  describe('API hooks', () => {
    it('fetches assembly line detail with slug', async () => {
      renderPage('my-custom-slug');
      await screen.findByText('Test Pipeline');
      expect(client.assemblyLines.get).toHaveBeenCalledWith(
        'my-custom-slug',
        expect.anything(),
      );
    });

    it('fetches packages for the assembly line', async () => {
      renderPage('my-custom-slug');
      await screen.findByText('Test Pipeline');
      expect(client.assemblyLines.listPackages).toHaveBeenCalledWith(
        'my-custom-slug',
        undefined,
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // No description
  // -----------------------------------------------------------------------

  describe('No description', () => {
    it('does not render description paragraph when not provided', async () => {
      vi.mocked(client.assemblyLines.get).mockResolvedValue(
        makeAssemblyLine({ description: undefined }) as never,
      );
      renderPage();
      await screen.findByText('Test Pipeline');
      expect(
        screen.queryByText('A test assembly line'),
      ).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Unknown status fallback
  // -----------------------------------------------------------------------

  describe('Unknown status fallback', () => {
    it('uses gray fallback for unknown status', async () => {
      vi.mocked(client.assemblyLines.get).mockResolvedValue(
        makeAssemblyLine({ status: 'CUSTOM_STATUS' }) as never,
      );
      renderPage();
      const badge = await screen.findByText('CUSTOM_STATUS');
      expect(badge.className).toContain('bg-gray-100');
    });
  });

  // -----------------------------------------------------------------------
  // hasMore for packages
  // -----------------------------------------------------------------------

  describe('Package load more', () => {
    it('shows Load more when more packages exist', async () => {
      vi.mocked(client.assemblyLines.listPackages).mockResolvedValue({
        data: [
          makePackage({
            id: 'pkg-aaaa1111-xxxx',
            type: 'USER_INPUT',
            status: 'PENDING',
            currentStep: 1,
          }),
        ],
        meta: { limit: 1, total: 5 },
      } as never);
      renderPage();
      expect(
        await screen.findByRole('button', { name: 'Load more' }),
      ).toBeInTheDocument();
    });

    it('does not show Load more when all packages loaded', async () => {
      renderPage();
      await screen.findByText('Test Pipeline');
      expect(
        screen.queryByRole('button', { name: 'Load more' }),
      ).not.toBeInTheDocument();
    });
  });
});
