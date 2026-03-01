# Task 101: Create Log Viewer Page

## Summary
Create the log viewer page with a job selector, log level filtering, real-time SSE streaming for active jobs, and virtual scrolling for large log outputs. This is the debugging and monitoring interface for job execution logs.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 086 (API Client — fetches log data), 085 (Tailwind + shadcn — provides UI components)
- **Blocks**: None

## Architecture Reference
The log viewer fetches historical log data via the REST API (`GET /api/jobs/:id/logs`) and streams live logs for active jobs via Server-Sent Events (SSE). Logs can be large (thousands of lines), so the viewer uses virtual scrolling (only rendering visible lines) for performance. Each log line has a level (debug, info, warning, error), timestamp, and message. The viewer supports filtering by level and searching within log content.

## Files and Folders
- `/apps/web/src/pages/logs/index.tsx` — Log viewer page composing job selector, filters, and log stream
- `/apps/web/src/pages/logs/components/log-stream.tsx` — Virtualized log output with auto-scrolling, level coloring, and timestamp display
- `/apps/web/src/pages/logs/components/log-filters.tsx` — Log level checkboxes and search input
- `/apps/web/src/api/hooks/use-logs.ts` — TanStack Query hook for fetching log data and SSE stream management

## Acceptance Criteria
### Job Selector
- [ ] Dropdown or combobox to select a job execution by ID; shows recent jobs with Worker name and status
- [ ] Supports search/filter within the job list by Job ID or Worker name
- [ ] Pre-selects a job if navigated from a Package detail or Assembly Line page (via URL param `?jobId=xxx`)

### Log Filters
- [ ] Level checkboxes: Debug, Info, Warning, Error — all checked by default; unchecking hides lines of that level
- [ ] Search input: text filter that highlights matching lines and optionally hides non-matching lines
- [ ] Timestamp range filter (optional): filter logs to a specific time window

### Log Stream
- [ ] Renders log lines with: timestamp (monospace, gray), level indicator (colored badge or text: debug=gray, info=white, warn=yellow, error=red), message (monospace)
- [ ] Virtual scrolling: only renders visible log lines in the DOM; supports scrolling through thousands of lines without performance degradation
- [ ] Auto-scroll: when scrolled to the bottom, new lines auto-scroll into view; when user scrolls up, auto-scroll pauses; a "Jump to bottom" button appears when not at bottom
- [ ] For active jobs: connects to an SSE endpoint (`GET /api/jobs/:id/logs/stream`) via `EventSource` and appends new lines in real-time
- [ ] For completed jobs: fetches the full log via `GET /api/jobs/:id/logs` and renders it statically
- [ ] SSE connection is established when a running job is selected and closed when a different job is selected or the page unmounts
- [ ] Error lines (level=error) have a red background tint for visual prominence

### TanStack Query Hook
- [ ] `useJobLogs(jobId, params?)` — fetches log data from `GET /api/jobs/:id/logs` with optional level and timestamp filters
- [ ] Returns typed log entries: `{ timestamp: string; level: 'debug' | 'info' | 'warning' | 'error'; message: string }[]`
- [ ] Handles the SSE stream lifecycle separately from the query (SSE is managed via a `useEffect`, not TanStack Query)

### General
- [ ] Loading state: "Fetching logs..." with spinner
- [ ] Empty state: "No logs available for this job" when log data is empty
- [ ] Error state: "Failed to fetch logs" with retry button
- [ ] Copy button: copies all visible (filtered) log lines to clipboard
- [ ] Download button: downloads the full log as a `.log` text file

## Implementation Notes
- For virtual scrolling, use `react-window` (lightweight) or `@tanstack/react-virtual` (newer, from the TanStack ecosystem). `@tanstack/react-virtual` is recommended for consistency with the TanStack stack. Add it as a dependency.
- Each log line should have a fixed estimated height for the virtualizer. If messages can wrap to multiple lines, use a variable-size list (`VariableSizeList` in react-window or `useVirtualizer` with `estimateSize` in @tanstack/react-virtual).
- For SSE streaming, use the native `EventSource` API. Create an `EventSource` instance pointing to `${API_URL}/jobs/${jobId}/logs/stream`. Listen for `message` events and parse the data as log entries. Store streamed lines in a `useRef` array (not state, to avoid re-renders per line) and batch-flush to state on a `requestAnimationFrame` cadence.
- The auto-scroll behavior should track whether the user is at the bottom of the scroll container. Use `onScroll` to detect position and a boolean ref `isAtBottom`. When new lines are appended and `isAtBottom` is true, scroll to the bottom.
- For the search/highlight feature, use a simple string match. Wrap matching substrings in a `<mark>` element. Apply the filter client-side (don't re-fetch from the API).
- The job selector should fetch recent jobs from `GET /api/jobs?limit=50&sort=-createdAt` or a similar endpoint. Group them by status (running first, then recent completed, then failed).
- The copy and download features should respect the current filters — only include visible lines.
- Consider adding a "Follow" toggle (synonymous with auto-scroll) that is clearly visible when streaming is active.
