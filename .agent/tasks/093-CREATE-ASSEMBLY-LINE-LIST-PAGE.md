# Task 093: Create Assembly Line List Page

## Summary
Create the Assembly Line list page with a data table showing name, status, step count, active packages, and action buttons. The table supports sorting and links to detail pages. This is the primary management view for Assembly Lines.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 092 (Assembly Line API Hooks — provides data), 085 (Tailwind + shadcn — provides Table, Badge, Button components)
- **Blocks**: None

## Architecture Reference
The list page follows a standard pattern used across all entity list pages: a TanStack Query hook fetches paginated data, which is rendered in a shadcn Table. Each row links to the entity's detail page. Action buttons trigger mutations or navigate to sub-pages. The page is rendered inside the shell layout via React Router's `<Outlet />`.

## Files and Folders
- `/apps/web/src/pages/assembly-lines/index.tsx` — Assembly Line list page with data table, filters, and actions

## Acceptance Criteria
- [ ] Displays a shadcn Table with columns: Name (link to detail), Status (colored Badge), Steps (count), Active Packages (count), Actions (dropdown menu)
- [ ] Name column links to `/assembly-lines/:slug` (detail page)
- [ ] Status column renders a Badge with color coding: `active` = green, `paused` = yellow, `archived` = gray, `error` = red
- [ ] Steps column shows the number of steps in the assembly line
- [ ] Active Packages column shows the count of packages currently being processed
- [ ] Actions dropdown includes: View (link to detail), Pause/Resume (toggles status), Archive (soft delete)
- [ ] Pause/Resume action calls `useUpdateAssemblyLine` mutation and shows a loading state
- [ ] Page header shows "Assembly Lines" title with a "Create Assembly Line" button linking to `/assembly-lines/create`
- [ ] Empty state: when no Assembly Lines exist, show a centered message with a "Create your first Assembly Line" call to action
- [ ] Loading state: show a table skeleton (placeholder rows) while data is loading
- [ ] Error state: show an error message with a retry button
- [ ] Pagination controls at the bottom of the table (previous/next buttons, page number display)
- [ ] Uses `useAssemblyLines()` hook for data fetching

## Implementation Notes
- Use the shadcn Table component for structure. The table header should have sortable column headers (click to toggle sort direction) — pass sort params to the API hook.
- For the Actions dropdown, use shadcn DropdownMenu triggered by a "..." (MoreHorizontal) icon button.
- Pagination state should be managed in URL search params (e.g., `?page=2&limit=10`) so the page is bookmarkable and shareable. Use React Router's `useSearchParams` to read/write pagination state.
- The empty state is important for first-time users. Include a brief description of what Assembly Lines are and a prominent CTA button.
- For the Pause/Resume action, show a confirmation dialog before toggling. This prevents accidental pauses of active lines.
- Keep the component focused — extract the table row rendering and action handling into sub-components if the file gets too large.
