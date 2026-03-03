import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LogStream from '../components/log-stream';
import { filterLogs } from '../components/log-stream';
import { DEFAULT_FILTER_STATE, type LogFilterState } from '../components/log-filters';
import type { LogEntry } from '@/api/client';

// Mock @tanstack/react-virtual since jsdom doesn't support layout
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

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: '2026-01-15T10:30:00.123Z',
    level: 'info',
    message: 'Test log message',
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  logs: [] as LogEntry[],
  filters: { ...DEFAULT_FILTER_STATE },
  isStreaming: false,
  isLoading: false,
};

// ---------------------------------------------------------------------------
// filterLogs (pure function)
// ---------------------------------------------------------------------------

describe('filterLogs', () => {
  const logs: LogEntry[] = [
    makeEntry({ level: 'debug', message: 'debug msg' }),
    makeEntry({ level: 'info', message: 'info msg' }),
    makeEntry({ level: 'warning', message: 'warning msg' }),
    makeEntry({ level: 'error', message: 'error msg' }),
    makeEntry({ level: 'warn', message: 'warn msg' }),
  ];

  it('returns all logs with default filters', () => {
    expect(filterLogs(logs, DEFAULT_FILTER_STATE)).toHaveLength(5);
  });

  it('filters by level — hides debug', () => {
    const filters: LogFilterState = {
      ...DEFAULT_FILTER_STATE,
      levels: { debug: false, info: true, warning: true, error: true },
    };
    const result = filterLogs(logs, filters);
    expect(result).toHaveLength(4);
    expect(result.every((l) => l.level !== 'debug')).toBe(true);
  });

  it('filters by level — hides error', () => {
    const filters: LogFilterState = {
      ...DEFAULT_FILTER_STATE,
      levels: { debug: true, info: true, warning: true, error: false },
    };
    const result = filterLogs(logs, filters);
    expect(result).toHaveLength(4);
    expect(result.every((l) => l.level !== 'error')).toBe(true);
  });

  it('normalizes "warn" to "warning" level', () => {
    const filters: LogFilterState = {
      ...DEFAULT_FILTER_STATE,
      levels: { debug: true, info: true, warning: false, error: true },
    };
    const result = filterLogs(logs, filters);
    // Both "warning" and "warn" should be excluded
    expect(result).toHaveLength(3);
  });

  it('filters by search text (hideNonMatching)', () => {
    const filters: LogFilterState = {
      ...DEFAULT_FILTER_STATE,
      search: 'error',
      hideNonMatching: true,
    };
    const result = filterLogs(logs, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toBe('error msg');
  });

  it('does not hide non-matching when hideNonMatching is false', () => {
    const filters: LogFilterState = {
      ...DEFAULT_FILTER_STATE,
      search: 'error',
      hideNonMatching: false,
    };
    const result = filterLogs(logs, filters);
    expect(result).toHaveLength(5);
  });

  it('filters by after timestamp', () => {
    const logs2: LogEntry[] = [
      makeEntry({ timestamp: '2026-01-15T10:00:00Z', message: 'early' }),
      makeEntry({ timestamp: '2026-01-15T12:00:00Z', message: 'late' }),
    ];
    const filters: LogFilterState = {
      ...DEFAULT_FILTER_STATE,
      after: '2026-01-15T11:00:00Z',
    };
    const result = filterLogs(logs2, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toBe('late');
  });

  it('filters by before timestamp', () => {
    const logs2: LogEntry[] = [
      makeEntry({ timestamp: '2026-01-15T10:00:00Z', message: 'early' }),
      makeEntry({ timestamp: '2026-01-15T12:00:00Z', message: 'late' }),
    ];
    const filters: LogFilterState = {
      ...DEFAULT_FILTER_STATE,
      before: '2026-01-15T11:00:00Z',
    };
    const result = filterLogs(logs2, filters);
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toBe('early');
  });

  it('combines multiple filters', () => {
    const filters: LogFilterState = {
      levels: { debug: false, info: true, warning: true, error: true },
      search: 'msg',
      hideNonMatching: true,
      after: '',
      before: '',
    };
    const result = filterLogs(logs, filters);
    // All have 'msg' in message, but debug is excluded
    expect(result).toHaveLength(4);
  });

  it('handles search case-insensitively', () => {
    const filters: LogFilterState = {
      ...DEFAULT_FILTER_STATE,
      search: 'ERROR',
      hideNonMatching: true,
    };
    const result = filterLogs(logs, filters);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// LogStream component
// ---------------------------------------------------------------------------

describe('LogStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading state', () => {
    it('shows loading spinner when isLoading is true', () => {
      render(<LogStream {...DEFAULT_PROPS} isLoading={true} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('Fetching logs…')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no logs', () => {
      render(<LogStream {...DEFAULT_PROPS} logs={[]} />);
      expect(screen.getByText('No logs available for this job')).toBeInTheDocument();
    });

    it('shows filter empty message when logs exist but are filtered out', () => {
      const logs = [makeEntry({ level: 'debug' })];
      const filters: LogFilterState = {
        ...DEFAULT_FILTER_STATE,
        levels: { debug: false, info: true, warning: true, error: true },
      };
      render(<LogStream {...DEFAULT_PROPS} logs={logs} filters={filters} />);
      expect(screen.getByText(/No logs match current filters/)).toBeInTheDocument();
    });
  });

  describe('Log rendering', () => {
    it('renders log entries with timestamps', () => {
      const logs = [makeEntry({ timestamp: '2026-01-15T10:30:00.123Z' })];
      render(<LogStream {...DEFAULT_PROPS} logs={logs} />);
      expect(screen.getByText('10:30:00.123')).toBeInTheDocument();
    });

    it('renders log level badges', () => {
      const logs = [
        makeEntry({ level: 'info', message: 'info msg' }),
        makeEntry({ level: 'error', message: 'error msg' }),
      ];
      render(<LogStream {...DEFAULT_PROPS} logs={logs} />);
      expect(screen.getByText('INFO')).toBeInTheDocument();
      expect(screen.getByText('ERROR')).toBeInTheDocument();
    });

    it('renders WARN for warning level', () => {
      const logs = [makeEntry({ level: 'warning', message: 'warn msg' })];
      render(<LogStream {...DEFAULT_PROPS} logs={logs} />);
      expect(screen.getByText('WARN')).toBeInTheDocument();
    });

    it('renders WARN for "warn" level variant', () => {
      const logs = [makeEntry({ level: 'warn', message: 'warn variant' })];
      render(<LogStream {...DEFAULT_PROPS} logs={logs} />);
      expect(screen.getByText('WARN')).toBeInTheDocument();
    });

    it('renders message text', () => {
      const logs = [makeEntry({ message: 'Application started successfully' })];
      render(<LogStream {...DEFAULT_PROPS} logs={logs} />);
      expect(screen.getByText('Application started successfully')).toBeInTheDocument();
    });

    it('applies red background tint for error lines', () => {
      const logs = [makeEntry({ level: 'error', message: 'Error occurred' })];
      const { container } = render(<LogStream {...DEFAULT_PROPS} logs={logs} />);
      const errorRow = container.querySelector('.bg-red-50');
      expect(errorRow).toBeInTheDocument();
    });

    it('does not apply red background for non-error lines', () => {
      const logs = [makeEntry({ level: 'info', message: 'Normal info' })];
      const { container } = render(<LogStream {...DEFAULT_PROPS} logs={logs} />);
      const errorRow = container.querySelector('.bg-red-50');
      expect(errorRow).not.toBeInTheDocument();
    });

    it('renders log container with role="log"', () => {
      const logs = [makeEntry()];
      render(<LogStream {...DEFAULT_PROPS} logs={logs} />);
      expect(screen.getByRole('log')).toBeInTheDocument();
    });

    it('sets aria-live="polite" when streaming', () => {
      const logs = [makeEntry()];
      render(<LogStream {...DEFAULT_PROPS} logs={logs} isStreaming={true} />);
      expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'polite');
    });

    it('sets aria-live="off" when not streaming', () => {
      const logs = [makeEntry()];
      render(<LogStream {...DEFAULT_PROPS} logs={logs} isStreaming={false} />);
      expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'off');
    });
  });

  describe('Search highlighting', () => {
    it('highlights matching text with <mark>', () => {
      const logs = [makeEntry({ message: 'Error in module X' })];
      const filters: LogFilterState = { ...DEFAULT_FILTER_STATE, search: 'Error' };
      const { container } = render(
        <LogStream {...DEFAULT_PROPS} logs={logs} filters={filters} />,
      );
      const mark = container.querySelector('mark');
      expect(mark).toBeInTheDocument();
      expect(mark?.textContent).toBe('Error');
    });

    it('highlights case-insensitively', () => {
      const logs = [makeEntry({ message: 'error found' })];
      const filters: LogFilterState = { ...DEFAULT_FILTER_STATE, search: 'ERROR' };
      const { container } = render(
        <LogStream {...DEFAULT_PROPS} logs={logs} filters={filters} />,
      );
      const mark = container.querySelector('mark');
      expect(mark).toBeInTheDocument();
      expect(mark?.textContent).toBe('error');
    });

    it('does not add marks when search is empty', () => {
      const logs = [makeEntry({ message: 'some message' })];
      const { container } = render(<LogStream {...DEFAULT_PROPS} logs={logs} />);
      expect(container.querySelector('mark')).not.toBeInTheDocument();
    });
  });

  describe('Streaming indicator', () => {
    it('shows Live indicator when streaming', () => {
      const logs = [makeEntry()];
      render(<LogStream {...DEFAULT_PROPS} logs={logs} isStreaming={true} />);
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('does not show Live indicator when not streaming', () => {
      const logs = [makeEntry()];
      render(<LogStream {...DEFAULT_PROPS} logs={logs} isStreaming={false} />);
      expect(screen.queryByText('Live')).not.toBeInTheDocument();
    });
  });

  describe('Virtual scrolling', () => {
    it('renders all filtered log entries via virtualizer', () => {
      const logs = Array.from({ length: 100 }, (_, i) =>
        makeEntry({ message: `Line ${i}` }),
      );
      render(<LogStream {...DEFAULT_PROPS} logs={logs} />);
      // The mock virtualizer renders all items
      expect(screen.getByText('Line 0')).toBeInTheDocument();
      expect(screen.getByText('Line 99')).toBeInTheDocument();
    });
  });
});
