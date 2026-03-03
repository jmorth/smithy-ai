import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

export interface LogFilterState {
  levels: Record<LogLevel, boolean>;
  search: string;
  hideNonMatching: boolean;
  after: string;
  before: string;
}

export const DEFAULT_FILTER_STATE: LogFilterState = {
  levels: { debug: true, info: true, warning: true, error: true },
  search: '',
  hideNonMatching: false,
  after: '',
  before: '',
};

const LEVEL_CONFIG: { level: LogLevel; label: string; className: string; activeClassName: string }[] = [
  { level: 'debug', label: 'Debug', className: 'border-gray-300 text-gray-600', activeClassName: 'bg-gray-100 border-gray-400 text-gray-800' },
  { level: 'info', label: 'Info', className: 'border-blue-300 text-blue-600', activeClassName: 'bg-blue-100 border-blue-400 text-blue-800' },
  { level: 'warning', label: 'Warning', className: 'border-yellow-300 text-yellow-600', activeClassName: 'bg-yellow-100 border-yellow-400 text-yellow-800' },
  { level: 'error', label: 'Error', className: 'border-red-300 text-red-600', activeClassName: 'bg-red-100 border-red-400 text-red-800' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LogFiltersProps {
  filters: LogFilterState;
  onChange: (filters: LogFilterState) => void;
}

export default function LogFilters({ filters, onChange }: LogFiltersProps) {
  const toggleLevel = (level: LogLevel) => {
    onChange({
      ...filters,
      levels: { ...filters.levels, [level]: !filters.levels[level] },
    });
  };

  const setSearch = (search: string) => {
    onChange({ ...filters, search });
  };

  const toggleHideNonMatching = () => {
    onChange({ ...filters, hideNonMatching: !filters.hideNonMatching });
  };

  const setAfter = (after: string) => {
    onChange({ ...filters, after });
  };

  const setBefore = (before: string) => {
    onChange({ ...filters, before });
  };

  const hasActiveFilters =
    Object.values(filters.levels).some((v) => !v) ||
    filters.search !== '' ||
    filters.after !== '' ||
    filters.before !== '';

  const clearFilters = () => {
    onChange({ ...DEFAULT_FILTER_STATE });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Level checkboxes */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Levels:</span>
        {LEVEL_CONFIG.map(({ level, label, className, activeClassName }) => (
          <button
            key={level}
            type="button"
            role="checkbox"
            aria-checked={filters.levels[level]}
            aria-label={`${label} level`}
            onClick={() => toggleLevel(level)}
            className={cn(
              'rounded border px-2.5 py-0.5 text-xs font-medium transition-colors',
              filters.levels[level] ? activeClassName : cn(className, 'opacity-40'),
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search + timestamp filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search logs"
            placeholder="Search log messages…"
            value={filters.search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 font-mono text-sm"
          />
        </div>

        {filters.search && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleHideNonMatching}
            className="text-xs"
            aria-pressed={filters.hideNonMatching}
          >
            {filters.hideNonMatching ? 'Show all' : 'Hide non-matching'}
          </Button>
        )}

        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="log-after" className="text-xs text-muted-foreground">
              After
            </label>
            <Input
              id="log-after"
              type="datetime-local"
              value={filters.after}
              onChange={(e) => setAfter(e.target.value)}
              className="h-9 w-auto text-xs"
            />
          </div>
          <div>
            <label htmlFor="log-before" className="text-xs text-muted-foreground">
              Before
            </label>
            <Input
              id="log-before"
              type="datetime-local"
              value={filters.before}
              onChange={(e) => setBefore(e.target.value)}
              className="h-9 w-auto text-xs"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} aria-label="Clear filters">
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
