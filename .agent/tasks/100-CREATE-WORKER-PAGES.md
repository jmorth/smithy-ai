# Task 100: Create Worker Pages

## Summary
Create the Worker list page (displayed as a card grid) and the Worker detail page (version history, YAML configuration viewer, and new version upload form). These pages cover Worker discovery, inspection, and versioning.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 086 (API Client — provides fetch methods), 085 (Tailwind + shadcn — provides Card, Badge, Table, Tabs components)
- **Blocks**: None

## Architecture Reference
Workers are the processing units in Smithy — each Worker is defined by a YAML configuration file and a Docker image. Workers are versioned: each new upload creates a new version while preserving the history. The list page shows a card grid for visual scanning (Workers are few in number but important to identify quickly). The detail page provides the full configuration view and version management.

## Files and Folders
- `/apps/web/src/pages/workers/index.tsx` — Worker list page rendered as a card grid
- `/apps/web/src/pages/workers/[slug].tsx` — Worker detail page with info header, version history, YAML viewer, and upload form
- `/apps/web/src/pages/workers/components/version-history.tsx` — Version history table with status and dates
- `/apps/web/src/pages/workers/components/yaml-viewer.tsx` — Syntax-highlighted YAML configuration viewer
- `/apps/web/src/api/hooks/use-workers.ts` — TanStack Query hooks for Worker CRUD and version operations

## Acceptance Criteria
### TanStack Query Hooks
- [ ] `useWorkers(params?)` — paginated list query for `GET /api/workers`
- [ ] `useWorker(slug)` — single Worker query for `GET /api/workers/:slug` with version list (enabled when slug is defined)
- [ ] `useCreateWorker()` — create mutation for `POST /api/workers` with cache invalidation
- [ ] `useCreateWorkerVersion(slug)` — create version mutation for `POST /api/workers/:slug/versions` with cache invalidation

### List Page
- [ ] Card grid layout: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` responsive grid
- [ ] Each card shows: Worker name (heading), latest version badge (e.g., "v3"), input types (tags), output types (tags), status indicator (active/deprecated)
- [ ] Cards are clickable — link to `/workers/:slug` detail page
- [ ] Page header with "Workers" title and "Register Worker" button (opens create form or navigates to create page)
- [ ] Empty state when no Workers exist
- [ ] Loading state: skeleton cards
- [ ] Search/filter: text input to filter Workers by name

### Detail Page
- [ ] Header section: Worker name, latest version badge, description, input/output types, Docker image name
- [ ] Tabs: "Configuration", "Version History", "Upload New Version"
- [ ] Configuration tab: YAML viewer showing the Worker's current YAML configuration with syntax highlighting
- [ ] Version History tab: table with columns — Version Number, Status (active/deprecated badge), Created At, Created By (if tracked), Actions (activate/deprecate)
- [ ] Upload New Version tab: form with YAML editor (textarea with monospace font) and optional Dockerfile upload; submit creates new version
- [ ] YAML viewer highlights syntax (keys, values, comments, strings) using CSS classes or a library
- [ ] Deprecate action on a version shows a confirmation dialog before executing
- [ ] New version upload validates YAML syntax before submission (basic parse check)

## Implementation Notes
- The card grid on the list page is preferred over a table because Workers are typically fewer in number (10s, not 100s) and benefit from visual scanning with type tags and status indicators.
- For the YAML viewer, consider using a lightweight syntax highlighter. Options: (1) `highlight.js` with the YAML language pack, (2) `prism-react-renderer`, (3) a custom CSS-only approach with regex-based highlighting. Keep it simple — the viewer is read-only.
- For the YAML editor in the upload form, use a `<textarea>` with monospace font and tab support (intercept Tab key to insert spaces). A full code editor (Monaco, CodeMirror) is overkill for this use case unless already in the dependency tree.
- The Worker card's input/output types should be displayed as small Badge components. If a Worker accepts multiple input types, show them all as individual badges.
- The version history table should sort by version number descending (newest first). Only one version should be "active" at a time — show it with a green badge.
- For the YAML upload, the form should accept either pasting YAML into the editor or uploading a `.yaml`/`.yml` file (which populates the editor). The Dockerfile is an optional file upload.
- The "Register Worker" button on the list page could navigate to a dedicated create page or open a dialog. Since Worker creation involves a YAML file and potentially a Dockerfile, a full page is preferable.
