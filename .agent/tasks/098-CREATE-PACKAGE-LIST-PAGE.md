# Task 098: Create Package List Page

## Summary
Create the Package list page with a filterable, searchable, paginated data table showing all Packages across all workflows. Filters include type, status, and date range. This is the global Package management view.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 086 (API Client — provides fetch methods), 085 (Tailwind + shadcn — provides Table, Badge, Input components)
- **Blocks**: 099 (Package Detail Page)

## Architecture Reference
The Package list page is a data-heavy view that needs efficient server-side filtering and pagination. All filter state is stored in URL search params for bookmarkability and shareability. The TanStack Query hook accepts the filter params and includes them in the query key so that different filter combinations are cached separately. The table renders Package rows with links to detail pages and color-coded status badges.

## Files and Folders
- `/apps/web/src/pages/packages/index.tsx` — Package list page with data table, search bar, filter controls, and pagination
- `/apps/web/src/api/hooks/use-packages.ts` — TanStack Query hooks for Package list and detail operations

## Acceptance Criteria
### TanStack Query Hooks
- [ ] `usePackages(params?)` — paginated list query for `GET /api/packages` with filter support; query key includes all filter params
- [ ] `usePackage(id)` — single package query for `GET /api/packages/:id` (enabled when id is defined)
- [ ] Query keys follow hierarchical pattern: `['packages', 'list', params]`, `['packages', 'detail', id]`

### List Page
- [ ] Table columns: ID (truncated to first 8 chars, link to detail), Type (badge), Status (colored badge), Workflow (Assembly Line or Pool name, link), Created At (formatted date), Actions (view button)
- [ ] Status badge color coding: `pending` = gray, `queued` = blue, `processing` = yellow, `completed` = green, `failed` = red, `cancelled` = gray strikethrough
- [ ] Search bar: text input that filters by Package ID or metadata values; debounced (300ms) to avoid excessive API calls
- [ ] Filter: Type dropdown — shows all distinct Package types from the data
- [ ] Filter: Status dropdown — multi-select with all status options
- [ ] Filter: Date range — "Created after" and "Created before" date pickers
- [ ] All filter state persisted in URL search params via `useSearchParams`
- [ ] Clear filters button resets all filters and search
- [ ] Pagination controls: previous/next buttons, current page / total pages display, items per page selector (10, 25, 50)
- [ ] Empty state when no Packages match filters (differentiate between "no Packages at all" and "no Packages matching filters")
- [ ] Loading state: table skeleton
- [ ] Error state: error message with retry

## Implementation Notes
- The search is passed to the API as a query param (e.g., `?search=abc`). The API should handle searching across Package ID and metadata. If the API does not support server-side search, implement client-side filtering on the fetched page (less ideal but functional).
- For the Type filter dropdown, fetch distinct types from the API or derive them from the current page data. If the API supports a `GET /api/packages/types` endpoint, use it. Otherwise, use a static list of known types.
- The date range filter should use native `<input type="date">` or a shadcn DatePicker if available. Pass dates as ISO strings to the API.
- Debounce the search input using a custom `useDebouncedValue` hook or `useEffect` with a timeout. Update the URL search params only after the debounce delay.
- The "Workflow" column should show either the Assembly Line name or Worker Pool name depending on which workflow the Package belongs to. This requires the API to include workflow context in the Package response.
- For large datasets, consider adding a "total count" display above the table (e.g., "Showing 1-25 of 1,234 Packages").
- The truncated Package ID should show the full ID in a tooltip on hover.
