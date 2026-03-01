# Task 097: Create Worker Pool Pages

## Summary
Create the Worker Pool list page, creation form (with member selector and concurrency settings), and detail page (member list with status, queue depth, active jobs). These three pages cover the full Worker Pool management lifecycle.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 086 (API Client — provides fetch methods), 087 (Socket.IO Client — real-time updates for detail page), 085 (Tailwind + shadcn — provides UI components)
- **Blocks**: None

## Architecture Reference
Worker Pools are groups of interchangeable Workers that process Packages from a shared queue with configurable concurrency. The list page shows all pools with summary stats. The creation form lets users compose pools by selecting Worker members and setting concurrency limits. The detail page is the operational view showing real-time pool utilization, member status, and active jobs.

## Files and Folders
- `/apps/web/src/pages/worker-pools/index.tsx` — Worker Pool list page with data table
- `/apps/web/src/pages/worker-pools/create.tsx` — Worker Pool creation form with member selector and concurrency config
- `/apps/web/src/pages/worker-pools/[slug].tsx` — Worker Pool detail page with members, queue, and active jobs
- `/apps/web/src/pages/worker-pools/components/pool-status.tsx` — Pool utilization visualization component (progress bar or gauge)
- `/apps/web/src/api/hooks/use-worker-pools.ts` — TanStack Query hooks for Worker Pool CRUD and operations

## Acceptance Criteria
### TanStack Query Hooks
- [ ] `useWorkerPools(params?)` — paginated list query for `GET /api/worker-pools`
- [ ] `useWorkerPool(slug)` — single pool query for `GET /api/worker-pools/:slug` (enabled when slug is defined)
- [ ] `useCreateWorkerPool()` — create mutation for `POST /api/worker-pools` with cache invalidation
- [ ] `useUpdateWorkerPool(slug)` — update mutation for `PATCH /api/worker-pools/:slug` with cache invalidation
- [ ] `useSubmitPackageToPool(slug)` — submit package mutation for `POST /api/worker-pools/:slug/packages`

### List Page
- [ ] Table columns: Name (link to detail), Member Count, Queue Depth, Concurrency (used/max), Status (badge), Actions
- [ ] Page header with "Worker Pools" title and "Create Pool" button
- [ ] Empty state with CTA when no pools exist
- [ ] Loading and error states
- [ ] Pagination controls

### Creation Form
- [ ] Form fields: Name (required text input), Description (optional textarea)
- [ ] Worker member multi-select: searchable list of available Workers; selected Workers shown as chips/tags with remove button
- [ ] Max concurrency: slider or number input with min=1, max=50 (configurable), default=5
- [ ] Validation: name required, at least 1 Worker member required
- [ ] Submit creates pool and navigates to detail page on success
- [ ] Cancel navigates back to list

### Detail Page
- [ ] Header: pool name, status badge, description, edit button
- [ ] Pool utilization visualization: progress bar showing `activeJobs / maxConcurrency` with percentage label
- [ ] Member list: cards or table showing each Worker member with name, version, status (idle/busy/error)
- [ ] Active jobs table: Job ID (link), Worker (name), Package (link), Status, Started At, Duration
- [ ] Queue depth indicator: number of Packages waiting in the queue
- [ ] Real-time updates via Socket.IO subscription to worker-pool-specific room
- [ ] "Submit Package" button opens Package Submission Dialog (task 096)
- [ ] Unsubscribes from Socket.IO room on unmount

## Implementation Notes
- The TanStack Query hooks follow the same pattern as task 092. Define a `workerPoolKeys` factory for consistent query keys.
- For the member multi-select in the creation form, use a combobox pattern: an input field that shows a dropdown of matching Workers as the user types. Selected Workers appear as removable chips below the input. This requires fetching the Worker list from the API.
- The pool utilization visualization (`pool-status.tsx`) should be a horizontal progress bar with color coding: green (< 70%), yellow (70-90%), red (> 90%). Show `activeJobs / maxConcurrency` as text.
- For the detail page, merge Socket.IO real-time data with the initial TanStack Query fetch. Socket events update member statuses, queue depth, and active jobs without requiring a full refetch.
- The active jobs table on the detail page should auto-update job durations in real-time (same pattern as task 095's package tracker).
- Consider showing a visual queue: a list of Package cards waiting to be processed, in order. This gives users a clear picture of backlog.
