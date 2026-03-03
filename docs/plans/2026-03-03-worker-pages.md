# Worker Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Worker list page (card grid with search/filter), Worker detail page (tabs for config viewer, version history, upload form), and supporting hooks/components.

**Architecture:** Replace the two placeholder pages (`worker-list.tsx`, `worker-detail.tsx`) and extend the existing hooks (`use-workers.ts`). Add a deprecate version endpoint to the API client. Create sub-components for YAML viewer and version history table. Follow existing patterns from worker-pool and package pages.

**Tech Stack:** React 18 + TypeScript, TanStack Query v5, Tailwind CSS + shadcn/ui (Badge, Card, Tabs, Table, Dialog, Button, Input), Vitest + Testing Library, lucide-react icons.

---

### Task 1: Extend API Client & Query Hooks

**Files:**
- Modify: `apps/web/src/api/client.ts` (add `deprecateVersion` endpoint)
- Modify: `apps/web/src/api/hooks/use-workers.ts` (add `useCreateWorker`, `useCreateWorkerVersion`, `useDeprecateWorkerVersion` mutations)
- Test: `apps/web/src/api/hooks/__tests__/use-workers.test.ts`

**Step 1: Add `deprecateVersion` to the workers client object in `client.ts`**

After the existing `createVersion` method, add:

```typescript
deprecateVersion(
  slug: string,
  version: number,
  signal?: AbortSignal,
) {
  return request<WorkerVersion>(
    'PATCH',
    `/workers/${encodeURIComponent(slug)}/versions/${version}`,
    { body: { status: 'DEPRECATED' }, signal },
  );
},
```

**Step 2: Add mutation hooks to `use-workers.ts`**

Add `useMutation` and `useQueryClient` imports. Add three mutation hooks:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workers } from '@/api/client';
import type { WorkerQueryParams, WorkerDetail, CreateWorkerBody, CreateWorkerVersionBody, ApiError } from '@/api/client';
import type { Worker, WorkerVersion } from '@smithy/shared';

// ... existing keys and hooks ...

export function useCreateWorker() {
  const queryClient = useQueryClient();
  return useMutation<Worker, ApiError, CreateWorkerBody>({
    mutationFn: (data) => workers.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerKeys.lists() });
    },
  });
}

export function useCreateWorkerVersion(slug: string) {
  const queryClient = useQueryClient();
  return useMutation<WorkerVersion, ApiError, CreateWorkerVersionBody>({
    mutationFn: (data) => workers.createVersion(slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerKeys.lists() });
      queryClient.invalidateQueries({ queryKey: workerKeys.detail(slug) });
    },
  });
}

export function useDeprecateWorkerVersion(slug: string) {
  const queryClient = useQueryClient();
  return useMutation<WorkerVersion, ApiError, number>({
    mutationFn: (version) => workers.deprecateVersion(slug, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerKeys.detail(slug) });
    },
  });
}
```

**Step 3: Write tests for hooks in `use-workers.test.ts`**

Follow the pattern from `use-assembly-lines.test.ts` — mock `@/api/client`, test query keys, test each hook returns data / calls the right client method / invalidates caches.

**Step 4: Run tests**

Run: `cd apps/web && pnpm vitest run src/api/hooks/__tests__/use-workers.test.ts`

**Step 5: Commit**

```
feat(web): extend worker API client and query hooks (task 100)
```

---

### Task 2: Worker List Page — Card Grid

**Files:**
- Modify: `apps/web/src/pages/worker-list.tsx` (replace placeholder)
- Test: `apps/web/src/pages/__tests__/worker-list.test.tsx`

**Implementation:**

The list page should display Workers in a responsive card grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).

**Components to build inside the file:**
- `STATUS_CONFIG` — maps `ACTIVE`/`DEPRECATED` to label + badge class
- `WorkerCard` — Card with: name (heading), latest version badge, input types (badges), output type (badge), status indicator, link to `/workers/:slug`
- `SkeletonCard` — Loading card placeholder
- `EmptyState` — Message when no workers, with Register button
- `ErrorState` — Error with retry
- `SearchFilter` — Text input to filter by name (debounced)
- `WorkerListPage` — Main component with header ("Workers" title + "Register Worker" button), search, and grid

**Key patterns:**
- Use `useWorkers({ name: debouncedSearch })` query hook
- "Register Worker" button navigates to `/workers/create` (or opens a dialog — per task spec, a full page is preferred since it involves file uploads)
- Cards are wrapped in `<Link to={/workers/${slug}}>` for navigation
- Extract latest version from the API response (the list API returns workers with latest version only)
- For version display: show `v${version.version}` badge
- Input types from `version.yamlConfig.inputTypes` as individual Badge components
- Output type from `version.yamlConfig.outputType` as a Badge

**Step 1: Write failing test file `worker-list.test.tsx`**

Test: header renders, cards render with correct info, search filters, empty state, error state, loading skeletons, card links work, register button.

**Step 2: Implement `worker-list.tsx`**

**Step 3: Run tests**

Run: `cd apps/web && pnpm vitest run src/pages/__tests__/worker-list.test.tsx`

**Step 4: Commit**

```
feat(web): implement Worker list page with card grid and search (task 100)
```

---

### Task 3: YAML Viewer Component

**Files:**
- Create: `apps/web/src/pages/workers/components/yaml-viewer.tsx`
- Test: `apps/web/src/pages/workers/components/__tests__/yaml-viewer.test.tsx`

**Implementation:**

A read-only YAML viewer with CSS-based syntax highlighting. Keep it simple — no external library. Convert a `Record<string, unknown>` (yamlConfig) to a formatted YAML string and apply CSS classes for keys, values, strings, and comments.

**Component API:**
```typescript
interface YamlViewerProps {
  config: Record<string, unknown>;
}
```

**Approach:**
- Use `JSON.stringify` then a simple recursive formatter to produce YAML-like output (key: value pairs, indented nested objects, arrays with dashes)
- Apply Tailwind classes via `<span>` elements for syntax highlighting:
  - Keys: `text-blue-600 dark:text-blue-400`
  - String values: `text-green-600 dark:text-green-400`
  - Numbers: `text-orange-600 dark:text-orange-400`
  - Booleans: `text-purple-600 dark:text-purple-400`
- Wrap in `<pre><code>` with monospace font and a bordered container

**Step 1: Write test**
**Step 2: Implement**
**Step 3: Run tests**
**Step 4: Commit**

```
feat(web): create YAML viewer component with syntax highlighting (task 100)
```

---

### Task 4: Version History Component

**Files:**
- Create: `apps/web/src/pages/workers/components/version-history.tsx`
- Test: `apps/web/src/pages/workers/components/__tests__/version-history.test.tsx`

**Implementation:**

Table showing version history with columns: Version Number, Status (badge), Created At, Actions (deprecate button).

**Component API:**
```typescript
interface VersionHistoryProps {
  versions: WorkerVersion[];
  onDeprecate: (version: number) => void;
  isDeprecating?: boolean;
}
```

**Key patterns:**
- Sort versions descending by version number (newest first)
- Active version gets green badge, deprecated gets gray
- Deprecate button shows confirmation dialog before executing
- Only show deprecate action on ACTIVE versions
- Use shadcn Table, Badge, Button, Dialog components

**Step 1: Write test**
**Step 2: Implement**
**Step 3: Run tests**
**Step 4: Commit**

```
feat(web): create version history table component (task 100)
```

---

### Task 5: Worker Detail Page

**Files:**
- Modify: `apps/web/src/pages/worker-detail.tsx` (replace placeholder)
- Modify: `apps/web/src/pages/__tests__/worker-detail.test.tsx` (replace placeholder test)

**Implementation:**

Detail page with:
- **Header:** Back button, Worker name, latest version badge, description, Docker image (from yamlConfig), input/output types
- **Tabs:** "Configuration", "Version History", "Upload New Version"

**Configuration tab:** Uses `<YamlViewer config={latestVersion.yamlConfig} />`

**Version History tab:** Uses `<VersionHistory versions={worker.versions} onDeprecate={...} />`

**Upload New Version tab:** Form with:
- YAML editor (textarea, monospace, tab support)
- File upload for `.yaml`/.yml` (populates textarea)
- Optional Dockerfile upload (file input)
- YAML validation before submit (try `yaml.parse()` or JSON parse check)
- Submit button calls `useCreateWorkerVersion`

**Key patterns:**
- Use `useWorker(slug)` to fetch worker detail with all versions
- Use `useCreateWorkerVersion(slug)` for the upload form
- Use `useDeprecateWorkerVersion(slug)` for the version history
- Back button navigates to `/workers`
- Loading skeleton while fetching
- Error state with retry
- YAML validation: since we send `yamlConfig` as a JSON object, parse the textarea content as YAML. Use a simple approach: try `JSON.parse` first, and if that fails, show validation error. Or accept YAML text and convert to object. Per the backend API, `yamlConfig` is `Record<string, unknown>`, so the form should accept JSON.

**Note on YAML parsing:** The backend expects `yamlConfig` as a JSON object. The textarea should accept YAML-formatted text. We need a YAML parser. Check if `js-yaml` is already a dependency; if not, we can use JSON input or add `js-yaml`. For simplicity, accept JSON in the textarea (since the backend API expects JSON). The task says "YAML editor" and "validates YAML syntax" — we should install `js-yaml` as a lightweight dep for parse/stringify.

**Step 1: Write failing tests**
**Step 2: Implement detail page**
**Step 3: Run tests**
**Step 4: Commit**

```
feat(web): implement Worker detail page with tabs, config viewer, version history, and upload form (task 100)
```

---

### Task 6: Worker Create Page (Register Worker)

**Files:**
- Create: `apps/web/src/pages/worker-create.tsx`
- Modify: `apps/web/src/app.tsx` (add route)
- Test: `apps/web/src/pages/__tests__/worker-create.test.tsx`

**Implementation:**

Simple form page with:
- Name input (required)
- Description textarea (optional)
- Submit calls `useCreateWorker()`
- On success, navigate to `/workers/:slug`
- Error display for validation/conflict errors

**Step 1: Write test**
**Step 2: Implement page and add route**
**Step 3: Run tests**
**Step 4: Commit**

```
feat(web): create Worker registration page (task 100)
```

---

### Task 7: Final Integration & Coverage

**Step 1: Run full test suite for all new/modified files**

```bash
cd apps/web && pnpm vitest run --coverage
```

**Step 2: Verify coverage meets requirements (100% critical path, 80%+ overall for new files)**

**Step 3: Run lint, type-check, build**

```bash
cd apps/web && pnpm lint && pnpm tsc --noEmit && pnpm build
```

**Step 4: Start the app and verify pages render**

**Step 5: Final commit if any fixes needed**

```
fix(web): address coverage and lint issues for Worker pages (task 100)
```
