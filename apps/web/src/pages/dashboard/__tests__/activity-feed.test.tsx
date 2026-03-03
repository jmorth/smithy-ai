import { render, screen, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ActivityFeed,
  useActivityFeed,
  type ActivityEvent,
} from '../components/activity-feed';
import { socketManager } from '@/api/socket';
import { RoutingKeys } from '@smithy/shared';
import type { SmithyEvent } from '@smithy/shared';

vi.mock('@/api/socket', () => ({
  socketManager: {
    onEvent: vi.fn(() => vi.fn()),
  },
}));

function makeEvent(overrides: Partial<SmithyEvent> = {}): SmithyEvent {
  return {
    eventType: RoutingKeys.JOB_COMPLETED,
    timestamp: new Date().toISOString(),
    correlationId: `corr-${Math.random()}`,
    payload: {
      jobExecutionId: 'job-1',
      packageId: 'pkg-1',
      workerVersionId: 'wv-1',
      duration: 1234,
    },
    ...overrides,
  };
}

describe('useActivityFeed', () => {
  let eventHandlers: Map<string, (data: SmithyEvent) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers = new Map();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(socketManager.onEvent).mockImplementation(
      ((_ns: string, event: string, callback: (data: SmithyEvent) => void) => {
        eventHandlers.set(`${_ns}:${event}`, callback);
        return vi.fn();
      }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );
  });

  it('subscribes to all workflow and job events on mount', () => {
    renderHook(() => useActivityFeed());

    const expectedWorkflowEvents = [
      RoutingKeys.PACKAGE_CREATED,
      RoutingKeys.PACKAGE_PROCESSED,
      RoutingKeys.JOB_STATE_CHANGED,
      RoutingKeys.ASSEMBLY_LINE_COMPLETED,
      RoutingKeys.ASSEMBLY_LINE_STEP_COMPLETED,
    ];

    const expectedJobEvents = [
      RoutingKeys.JOB_STARTED,
      RoutingKeys.JOB_COMPLETED,
      RoutingKeys.JOB_STUCK,
      RoutingKeys.JOB_ERROR,
    ];

    for (const key of expectedWorkflowEvents) {
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/workflows',
        key,
        expect.any(Function),
      );
    }

    for (const key of expectedJobEvents) {
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/jobs',
        key,
        expect.any(Function),
      );
    }
  });

  it('unsubscribes from all events on unmount', () => {
    const unsubFns = new Array<ReturnType<typeof vi.fn>>();
    vi.mocked(socketManager.onEvent).mockImplementation(() => {
      const unsub = vi.fn();
      unsubFns.push(unsub);
      return unsub;
    });

    const { unmount } = renderHook(() => useActivityFeed());
    unmount();

    for (const unsub of unsubFns) {
      expect(unsub).toHaveBeenCalled();
    }
  });

  it('adds events to the front of the list', () => {
    const { result } = renderHook(() => useActivityFeed());

    const handler = eventHandlers.get(`/jobs:${RoutingKeys.JOB_COMPLETED}`);

    act(() => {
      handler?.(makeEvent({ correlationId: 'first' }));
    });
    act(() => {
      handler?.(makeEvent({ correlationId: 'second' }));
    });

    expect(result.current).toHaveLength(2);
    expect(result.current[0]!.id).toContain('second');
    expect(result.current[1]!.id).toContain('first');
  });

  it('caps events at 20', () => {
    const { result } = renderHook(() => useActivityFeed());
    const handler = eventHandlers.get(`/jobs:${RoutingKeys.JOB_COMPLETED}`);

    act(() => {
      for (let i = 0; i < 25; i++) {
        handler?.(makeEvent({ correlationId: `evt-${i}` }));
      }
    });

    expect(result.current).toHaveLength(20);
    // Most recent event should be first
    expect(result.current[0]!.id).toContain('evt-24');
  });

  it('classifies different event types correctly', () => {
    const { result } = renderHook(() => useActivityFeed());

    const testCases: Array<{
      ns: string;
      key: string;
      severity: string;
    }> = [
      { ns: '/workflows', key: RoutingKeys.PACKAGE_CREATED, severity: 'info' },
      { ns: '/workflows', key: RoutingKeys.PACKAGE_PROCESSED, severity: 'success' },
      { ns: '/jobs', key: RoutingKeys.JOB_STARTED, severity: 'info' },
      { ns: '/jobs', key: RoutingKeys.JOB_COMPLETED, severity: 'success' },
      { ns: '/jobs', key: RoutingKeys.JOB_STUCK, severity: 'warning' },
      { ns: '/jobs', key: RoutingKeys.JOB_ERROR, severity: 'error' },
    ];

    for (const { ns, key, severity } of testCases) {
      const handler = eventHandlers.get(`${ns}:${key}`);
      act(() => {
        handler?.(makeEvent({ eventType: key, correlationId: `${key}-test` }));
      });
      expect(result.current[0]!.severity).toBe(severity);
    }
  });
});

describe('ActivityFeed', () => {
  const now = new Date();

  const mockEvents: ActivityEvent[] = [
    {
      id: '1',
      timestamp: new Date(now.getTime() - 60_000).toISOString(),
      eventType: 'Job Completed',
      description: 'Job job-1 completed in 1234ms',
      severity: 'success',
    },
    {
      id: '2',
      timestamp: new Date(now.getTime() - 120_000).toISOString(),
      eventType: 'Job Error',
      description: 'Job job-2 error: connection refused',
      severity: 'error',
    },
    {
      id: '3',
      timestamp: new Date(now.getTime() - 300_000).toISOString(),
      eventType: 'Job Stuck',
      description: 'Job job-3 is stuck: waiting for input',
      severity: 'warning',
    },
    {
      id: '4',
      timestamp: new Date(now.getTime() - 600_000).toISOString(),
      eventType: 'Package Created',
      description: 'Package pkg-1 created (type: code)',
      severity: 'info',
    },
  ];

  it('renders empty state when no events', () => {
    render(<ActivityFeed events={[]} />);
    expect(
      screen.getByText('No recent activity. Events will appear here in real-time.'),
    ).toBeInTheDocument();
  });

  it('renders the activity feed title', () => {
    render(<ActivityFeed events={mockEvents} />);
    expect(
      screen.getByRole('heading', { name: 'Activity Feed' }),
    ).toBeInTheDocument();
  });

  it('renders all events with their descriptions', () => {
    render(<ActivityFeed events={mockEvents} />);

    expect(screen.getByText('Job job-1 completed in 1234ms')).toBeInTheDocument();
    expect(screen.getByText('Job job-2 error: connection refused')).toBeInTheDocument();
    expect(screen.getByText('Job job-3 is stuck: waiting for input')).toBeInTheDocument();
    expect(screen.getByText('Package pkg-1 created (type: code)')).toBeInTheDocument();
  });

  it('renders event type badges', () => {
    render(<ActivityFeed events={mockEvents} />);

    expect(screen.getByText('Job Completed')).toBeInTheDocument();
    expect(screen.getByText('Job Error')).toBeInTheDocument();
    expect(screen.getByText('Job Stuck')).toBeInTheDocument();
    expect(screen.getByText('Package Created')).toBeInTheDocument();
  });

  it('applies correct color classes based on severity', () => {
    render(<ActivityFeed events={mockEvents} />);

    const successBadge = screen.getByText('Job Completed');
    expect(successBadge.className).toContain('text-green-700');

    const errorBadge = screen.getByText('Job Error');
    expect(errorBadge.className).toContain('text-red-700');

    const warningBadge = screen.getByText('Job Stuck');
    expect(warningBadge.className).toContain('text-yellow-700');

    const infoBadge = screen.getByText('Package Created');
    expect(infoBadge.className).toContain('text-blue-700');
  });

  it('renders relative timestamps', () => {
    render(<ActivityFeed events={mockEvents} />);

    // date-fns formatDistanceToNow produces strings like "1 minute ago", "2 minutes ago"
    // We just check that timestamps are rendered
    const timeElements = screen.getAllByText(/ago$/);
    expect(timeElements.length).toBe(4);
  });
});
