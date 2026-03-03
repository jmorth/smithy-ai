import { useRef, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LogEntry } from '@/api/client';
import type { LogFilterState, LogLevel } from './log-filters';

// ---------------------------------------------------------------------------
// Level styling
// ---------------------------------------------------------------------------

const LEVEL_STYLES: Record<string, { badge: string; row: string }> = {
  debug: { badge: 'text-gray-500', row: '' },
  info: { badge: 'text-blue-600', row: '' },
  warning: { badge: 'text-yellow-600', row: '' },
  warn: { badge: 'text-yellow-600', row: '' },
  error: { badge: 'text-red-600', row: 'bg-red-50' },
};

function levelStyle(level: string) {
  return LEVEL_STYLES[level.toLowerCase()] ?? LEVEL_STYLES.info!;
}

// ---------------------------------------------------------------------------
// Highlight helper
// ---------------------------------------------------------------------------

function highlightText(text: string, search: string) {
  if (!search) return text;
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function normalizeLevel(level: string): LogLevel {
  const l = level.toLowerCase();
  if (l === 'warn') return 'warning';
  if (l === 'debug' || l === 'info' || l === 'warning' || l === 'error') return l;
  return 'info';
}

export function filterLogs(logs: LogEntry[], filters: LogFilterState): LogEntry[] {
  return logs.filter((entry) => {
    // Level filter
    const normalized = normalizeLevel(entry.level);
    if (!filters.levels[normalized]) return false;

    // Search filter (hide non-matching mode)
    if (filters.search && filters.hideNonMatching) {
      if (!entry.message.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }
    }

    // Timestamp range
    if (filters.after) {
      const afterDate = new Date(filters.after);
      if (new Date(entry.timestamp) < afterDate) return false;
    }
    if (filters.before) {
      const beforeDate = new Date(filters.before);
      if (new Date(entry.timestamp) > beforeDate) return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// Format timestamp
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toISOString().slice(11, 23); // HH:mm:ss.SSS
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LogStreamProps {
  logs: LogEntry[];
  filters: LogFilterState;
  isStreaming: boolean;
  isLoading: boolean;
}

const ESTIMATED_LINE_HEIGHT = 28;

export default function LogStream({ logs, filters, isStreaming, isLoading }: LogStreamProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  const filteredLogs = useMemo(() => filterLogs(logs, filters), [logs, filters]);

  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_LINE_HEIGHT,
    overscan: 20,
  });

  // Auto-scroll to bottom when new lines arrive (if user is at bottom)
  useEffect(() => {
    if (filteredLogs.length > prevCountRef.current && isAtBottomRef.current) {
      virtualizer.scrollToIndex(filteredLogs.length - 1, { align: 'end' });
    }
    prevCountRef.current = filteredLogs.length;
  }, [filteredLogs.length, virtualizer]);

  // Track scroll position to detect if at bottom
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const threshold = 50;
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  const jumpToBottom = useCallback(() => {
    isAtBottomRef.current = true;
    virtualizer.scrollToIndex(filteredLogs.length - 1, { align: 'end' });
  }, [virtualizer, filteredLogs.length]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" role="status">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Fetching logs…
        </div>
      </div>
    );
  }

  if (filteredLogs.length === 0 && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        No logs available for this job
      </div>
    );
  }

  if (filteredLogs.length === 0 && logs.length > 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        No logs match current filters ({logs.length} total hidden)
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="h-[600px] overflow-auto rounded-md border bg-background font-mono text-xs"
        role="log"
        aria-label="Log output"
        aria-live={isStreaming ? 'polite' : 'off'}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = filteredLogs[virtualRow.index]!;
            const style = levelStyle(entry.level);

            return (
              <div
                key={virtualRow.index}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={cn(
                  'flex items-start gap-2 border-b border-border/30 px-3 py-1',
                  style.row,
                )}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <span className="shrink-0 select-none text-muted-foreground">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span
                  className={cn('w-[52px] shrink-0 text-right font-semibold uppercase', style.badge)}
                >
                  {entry.level === 'warning' || entry.level === 'warn' ? 'WARN' : entry.level.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">
                  {highlightText(entry.message, filters.search)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Jump to bottom */}
      {!isAtBottomRef.current && filteredLogs.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={jumpToBottom}
          className="absolute bottom-4 right-4 shadow-md"
          aria-label="Jump to bottom"
        >
          <ArrowDown className="mr-1 h-3 w-3" />
          {isStreaming ? 'Follow' : 'Jump to bottom'}
        </Button>
      )}

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="absolute right-4 top-2 flex items-center gap-1.5 rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          Live
        </div>
      )}
    </div>
  );
}
