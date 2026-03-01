# Task 094: Create Assembly Line Creation Form

## Summary
Create the Assembly Line creation page with a form for name and description, and a drag-and-drop step editor for ordering Worker versions into a processing pipeline. This is where users define new workflows by composing Workers into sequential steps.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 092 (Assembly Line API Hooks — provides create mutation), 085 (Tailwind + shadcn — provides form components)
- **Blocks**: None

## Architecture Reference
The creation form is a two-part interface: a standard form section (name, description) and a visual step editor. The step editor lets users add Workers to the pipeline, reorder them via drag-and-drop, and remove steps. Each step references a specific Worker version. On submission, the form calls the `useCreateAssemblyLine` mutation with the full configuration (name, description, ordered steps) and navigates to the new Assembly Line's detail page on success.

## Files and Folders
- `/apps/web/src/pages/assembly-lines/create.tsx` — Assembly Line creation page with form and step editor
- `/apps/web/src/pages/assembly-lines/components/step-editor.tsx` — Drag-and-drop step editor component for ordering Worker steps

## Acceptance Criteria
- [ ] Form fields: Name (required, text input), Description (optional, textarea)
- [ ] Step editor: "Add Step" button opens a Worker version selector (dropdown or dialog)
- [ ] Worker version selector shows available Workers with their latest versions
- [ ] Added steps are displayed as ordered cards showing: step number, Worker name, version number, remove button
- [ ] Steps can be reordered via drag-and-drop (using HTML Drag and Drop API or a library like `@dnd-kit/core`)
- [ ] Steps can be removed via a delete button on each step card
- [ ] Form validation: name is required (non-empty), at least 1 step is required
- [ ] Validation errors are displayed inline below the relevant field
- [ ] Submit button calls `useCreateAssemblyLine()` mutation with the form data
- [ ] Submit button shows a loading spinner while the mutation is in flight
- [ ] On successful creation, navigates to `/assembly-lines/:slug` (the new line's detail page)
- [ ] On error, displays an error toast or inline error message
- [ ] Cancel button navigates back to `/assembly-lines` list
- [ ] Worker list for the selector is fetched via `useWorkers()` hook (or similar)

## Implementation Notes
- For drag-and-drop, consider using `@dnd-kit/core` and `@dnd-kit/sortable` — they are lightweight, accessible, and work well with React. Alternatively, use the HTML5 Drag and Drop API for zero-dependency implementation. The former is recommended for better UX (keyboard support, accessibility, smooth animations).
- If using `@dnd-kit`, add it as a dependency in this task.
- The step editor should maintain local state (an ordered array of `{ workerId, workerSlug, workerName, version }` objects). On form submission, map this array to the API's expected step format (likely `{ workerVersionId, order }`).
- Use React Hook Form or controlled inputs for form state management. Given shadcn's form components work well with React Hook Form + Zod validation, consider installing `react-hook-form` and `@hookform/resolvers` + `zod` (client-side) in this task.
- The Worker version selector should show a searchable list of Workers, and once a Worker is selected, show a version dropdown (defaulting to the latest version). This could be a two-step dropdown or a combined combobox.
- Keep the form simple for v1 — advanced features like step configuration (per-step env vars, timeouts, retry policies) can be added later.
