# Task 095: Create Assembly Line Detail Page

## Summary
Create the Assembly Line detail page with a horizontal pipeline visualization showing steps as connected nodes, a package tracker table showing each Package's current position and status, and real-time updates via Socket.IO. This is the operational monitoring view for a running Assembly Line.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 092 (Assembly Line API Hooks — provides data), 087 (Socket.IO Client — real-time updates)
- **Blocks**: None

## Architecture Reference
The detail page combines static data (Assembly Line configuration, steps) fetched via TanStack Query with real-time updates (Package positions, job status changes) streamed via Socket.IO. When the page mounts, it subscribes to the assembly-line-specific Socket.IO room. Events update the local state, which re-renders the pipeline visualization and package tracker. The pipeline visualization is a horizontal flow diagram rendered with CSS/SVG (not a full graph library).

## Files and Folders
- `/apps/web/src/pages/assembly-lines/[slug].tsx` — Assembly Line detail page composing pipeline visualization, package tracker, and action bar
- `/apps/web/src/pages/assembly-lines/components/pipeline-visualization.tsx` — Horizontal flow diagram showing steps as connected boxes with status indicators
- `/apps/web/src/pages/assembly-lines/components/package-tracker.tsx` — Table tracking Packages and their progress through the pipeline

## Acceptance Criteria
- [ ] Page header shows Assembly Line name, status badge, and description
- [ ] Pipeline visualization: horizontal flow diagram with a box per step, connected by arrows or lines
- [ ] Each step box shows: step number, Worker name, Worker version, status color (idle/processing/error)
- [ ] Steps currently processing a Package show a visual indicator (e.g., pulsing border, highlighted background)
- [ ] Package tracker: table with columns — Package ID (link to detail), Type (badge), Current Step (name), Status (colored badge), Entered At (timestamp), Duration (elapsed time)
- [ ] Real-time updates: subscribes to the assembly-line-specific Socket.IO room on mount via `subscribeAssemblyLine(slug)`
- [ ] Real-time updates: Package position changes update the pipeline visualization and tracker without full refetch
- [ ] Real-time updates: job status changes (started, completed, failed) update the step status indicators
- [ ] Unsubscribes from the Socket.IO room on unmount
- [ ] Action buttons: "Submit Package" (opens Package submission dialog), "Pause" / "Resume" (toggles line status), "Edit" (navigates to edit form or inline edit)
- [ ] Uses `useAssemblyLine(slug)` hook for initial data fetch
- [ ] Uses `useAssemblyLinePackages(slug)` for the package tracker table
- [ ] Loading state: skeleton for pipeline visualization and table
- [ ] Error state: error message with retry

## Implementation Notes
- The pipeline visualization should be implemented with CSS flexbox or CSS grid, not a heavy graph library. Each step is a card with a connecting line/arrow between them. Use CSS `::after` pseudo-elements or inline SVG for the arrows.
- For real-time updates, subscribe to the Socket.IO room in a `useEffect` with `slug` as the dependency. Store real-time Package positions in local state, merged with the initial fetch data. When a Socket.IO event arrives, update the local state optimistically and optionally invalidate the TanStack Query cache for fresh data.
- The package tracker table should support sorting by "Entered At" (default: most recent first) and filtering by status.
- The "Submit Package" action button should open the Package Submission Dialog (task 096) as a modal. Pass the `assemblyLineSlug` to the dialog so it knows which line to submit to.
- For the step status, use a state machine: `idle` (no Package at this step), `processing` (a Package is being worked on), `completed` (step finished for the current Package), `error` (step failed). Map these to colors: gray, blue, green, red.
- The elapsed duration for each Package should be computed client-side as `now - enteredAt` and tick every second. Use a `useInterval` or `requestAnimationFrame` hook for live updating.
- Consider a "mini-map" mode where the pipeline visualization can be collapsed to a compact bar for long pipelines with many steps.
