# Task 092: Create Assembly Line API Hooks

## Summary
Create TanStack Query hooks for all Assembly Line CRUD and operational endpoints: list with pagination, get by slug with steps, create, update, submit package, and list packages on a line. These hooks encapsulate all server-state management for Assembly Line pages.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 086 (API Client — provides typed fetch methods)
- **Blocks**: 093 (Assembly Line List Page), 094 (Assembly Line Creation Form), 095 (Assembly Line Detail Page), 096 (Package Submission Dialog)

## Architecture Reference
TanStack Query hooks are the server-state layer of the frontend. Each hook wraps a call to the API client (task 086) and manages caching, background refetching, loading/error states, and cache invalidation on mutations. Hooks are co-located in `/apps/web/src/api/hooks/` and export named hooks following the `use[Entity][Action]` convention. Query keys follow a hierarchical array pattern (e.g., `['assembly-lines', 'list', params]`) to enable granular cache invalidation.

## Files and Folders
- `/apps/web/src/api/hooks/use-assembly-lines.ts` — TanStack Query hooks for Assembly Line operations

## Acceptance Criteria
- [ ] `useAssemblyLines(params?)` — `useQuery` hook that fetches paginated list from `GET /api/assembly-lines`; returns `{ data, isLoading, isError, error }`; supports pagination params (`page`, `limit`)
- [ ] `useAssemblyLine(slug)` — `useQuery` hook that fetches a single Assembly Line with steps from `GET /api/assembly-lines/:slug`; enabled only when `slug` is defined
- [ ] `useCreateAssemblyLine()` — `useMutation` hook that calls `POST /api/assembly-lines`; invalidates the `['assembly-lines', 'list']` query cache on success
- [ ] `useUpdateAssemblyLine(slug)` — `useMutation` hook that calls `PATCH /api/assembly-lines/:slug`; invalidates both `['assembly-lines', 'list']` and `['assembly-lines', 'detail', slug]` on success
- [ ] `useSubmitPackageToLine(slug)` — `useMutation` hook that calls `POST /api/assembly-lines/:slug/packages`; invalidates Assembly Line detail and package list on success
- [ ] `useAssemblyLinePackages(slug, params?)` — `useQuery` hook that fetches packages for a specific line from `GET /api/assembly-lines/:slug/packages`; supports pagination
- [ ] All hooks use consistent query key patterns: `['assembly-lines', 'list', params]`, `['assembly-lines', 'detail', slug]`, `['assembly-lines', slug, 'packages', params]`
- [ ] Mutations invalidate relevant queries via `queryClient.invalidateQueries()`
- [ ] All hooks are properly typed using `@smithy/shared` types for request/response
- [ ] Loading, error, and success states are properly exposed by each hook
- [ ] `useAssemblyLine(slug)` has `enabled: !!slug` to prevent fetching when slug is undefined (e.g., during route transitions)

## Implementation Notes
- Use `@tanstack/react-query`'s `useQuery` for read operations and `useMutation` for write operations.
- Query keys must be arrays and should follow a consistent pattern. Consider creating a `queryKeys` constant object:
  ```typescript
  export const assemblyLineKeys = {
    all: ['assembly-lines'] as const,
    lists: () => [...assemblyLineKeys.all, 'list'] as const,
    list: (params: ListParams) => [...assemblyLineKeys.lists(), params] as const,
    details: () => [...assemblyLineKeys.all, 'detail'] as const,
    detail: (slug: string) => [...assemblyLineKeys.details(), slug] as const,
    packages: (slug: string) => [...assemblyLineKeys.all, slug, 'packages'] as const,
  };
  ```
- For `useCreateAssemblyLine`, consider optimistic updates: add the new line to the list cache immediately, then reconcile when the server responds. This is optional but improves perceived performance.
- Mutations should call `queryClient.invalidateQueries({ queryKey: assemblyLineKeys.lists() })` to refetch all list queries regardless of pagination params.
- Access the `queryClient` inside mutation callbacks via `useQueryClient()`.
- Error handling: let errors bubble up to the component layer. The hooks should NOT catch errors — components will display error states based on `isError` and `error`.
