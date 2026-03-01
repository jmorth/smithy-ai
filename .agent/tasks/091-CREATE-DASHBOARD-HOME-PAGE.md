# Task 091: Create Dashboard Home Page

## Summary
Create the dashboard home page with system overview stats cards (active assembly lines, worker pools, in-transit packages, running containers), a real-time activity feed powered by Socket.IO, and quick action buttons for common operations. This is the first page users see and provides an at-a-glance system health overview.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 086 (API Client — fetches stats), 087 (Socket.IO Client — activity feed), 088 (Zustand Store — reads state), 089 (App Shell Layout — provides layout), 090 (React Router — provides route)
- **Blocks**: None

## Architecture Reference
The dashboard home page combines server-fetched aggregate stats (via TanStack Query) with real-time event streaming (via Socket.IO). Stats cards poll the API on an interval and show cached data while refreshing. The activity feed subscribes to the `/workflows` and `/jobs` Socket.IO namespaces and displays the last 20 events in reverse chronological order. Quick action buttons navigate to creation forms or open dialogs.

## Files and Folders
- `/apps/web/src/pages/dashboard/index.tsx` — Dashboard page component composing stats cards, activity feed, and quick actions
- `/apps/web/src/pages/dashboard/components/stats-cards.tsx` — Grid of summary statistic cards
- `/apps/web/src/pages/dashboard/components/activity-feed.tsx` — Real-time event feed from Socket.IO
- `/apps/web/src/api/hooks/use-dashboard-stats.ts` — TanStack Query hook for fetching dashboard aggregate stats

## Acceptance Criteria
- [ ] Stats cards display: Active Assembly Lines (count), Active Worker Pools (count), In-Transit Packages (count), Running Containers (used/max)
- [ ] Stats cards use shadcn Card component with an icon, title, and large number
- [ ] Stats cards show a loading skeleton while data is being fetched
- [ ] Stats cards show an error state if the API call fails
- [ ] `useDashboardStats()` TanStack Query hook fetches from `GET /api/stats/dashboard` (or aggregates from individual endpoints)
- [ ] `useDashboardStats()` refreshes every 30 seconds (`refetchInterval: 30_000`)
- [ ] Activity feed displays the last 20 system events in reverse chronological order
- [ ] Activity feed events show: timestamp, event type (badge), description text
- [ ] Activity feed updates in real-time — new events from Socket.IO are prepended to the list
- [ ] Activity feed event types are color-coded: green for success, yellow for warnings, red for errors, blue for informational
- [ ] Quick action buttons: "Submit Package" (navigates to package submission), "Create Assembly Line" (navigates to `/assembly-lines/create`)
- [ ] Quick action buttons are displayed prominently (e.g., below stats cards or in a separate section)
- [ ] Page has a title/heading: "Dashboard" or "System Overview"
- [ ] Page is responsive — stats cards stack on mobile, grid on desktop

## Implementation Notes
- The backend may not have a dedicated `/api/stats/dashboard` endpoint. If not, the hook can fetch counts from individual list endpoints (`/api/assembly-lines?limit=0`, `/api/worker-pools?limit=0`, etc.) and aggregate. Alternatively, define the hook to call multiple endpoints in parallel via `useQueries`.
- For the activity feed, subscribe to broad events on the `/workflows` and `/jobs` namespaces. Store events in local component state (not Zustand — this is page-specific state). Cap the array at 20 entries and drop the oldest when new ones arrive.
- Each activity feed event should be rendered as a small card or list item with: relative timestamp (e.g., "2 min ago" via a utility like `date-fns`'s `formatDistanceToNow`), event type badge, and a human-readable description.
- The stats cards grid should be `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` for responsive layout.
- Consider adding a "View All" link on the activity feed that navigates to a dedicated logs/events page.
- The running containers stat may need a dedicated API endpoint or can be derived from active job counts. Use a placeholder if the endpoint is not yet available.
