# Task 090: Create React Router Configuration

## Summary
Configure React Router with all application routes wrapped in the shell layout, including routes for every dashboard page, the factory view, and a 404 fallback. This is the routing backbone that ties all pages together under the shell layout.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 089 (App Shell Layout — provides the layout wrapper)
- **Blocks**: 091-101 (all pages need their routes defined)

## Architecture Reference
React Router v6 is used with a layout route pattern: the shell layout component wraps all child routes via `<Outlet />`. Routes are defined declaratively in `app.tsx` using `createBrowserRouter` or `<Routes>` / `<Route>` JSX. Lazy loading via `React.lazy()` is used for page components to keep the initial bundle small. The factory route (`/factory`) renders inside the same shell but with a different content area (full-width, no padding) to accommodate the Phaser canvas.

## Files and Folders
- `/apps/web/src/app.tsx` — Updated with full route configuration, lazy-loaded page imports, shell layout wrapper

## Acceptance Criteria
- [ ] All routes are wrapped in the Shell layout component as a parent layout route
- [ ] Route: `/` — Dashboard home page
- [ ] Route: `/assembly-lines` — Assembly Line list page
- [ ] Route: `/assembly-lines/create` — Assembly Line creation form
- [ ] Route: `/assembly-lines/:slug` — Assembly Line detail page
- [ ] Route: `/worker-pools` — Worker Pool list page
- [ ] Route: `/worker-pools/create` — Worker Pool creation form
- [ ] Route: `/worker-pools/:slug` — Worker Pool detail page
- [ ] Route: `/packages` — Package list page
- [ ] Route: `/packages/:id` — Package detail page
- [ ] Route: `/workers` — Worker list page
- [ ] Route: `/workers/:slug` — Worker detail page
- [ ] Route: `/logs` — Log viewer page
- [ ] Route: `/factory` — Phaser factory view (Phase 6 placeholder)
- [ ] Route: `*` — 404 Not Found fallback page with link back to dashboard
- [ ] Page components are lazy-loaded with `React.lazy()` and wrapped in `<Suspense>` with a loading fallback
- [ ] `pnpm --filter web build` completes without errors
- [ ] Navigation between routes works without full page reloads

## Implementation Notes
- Use `createBrowserRouter` with `createRoutesFromElements` for a declarative JSX-based route definition, or use the object-based `createBrowserRouter([...])` syntax — either is fine, but be consistent.
- Lazy load page components: `const DashboardPage = React.lazy(() => import('./pages/dashboard'))`. This keeps the initial bundle small and loads pages on demand.
- The `<Suspense>` fallback should be a simple centered spinner or "Loading..." text. A proper skeleton loader can be added per-page later.
- The `/assembly-lines/create` route MUST be defined before `/assembly-lines/:slug` to avoid the `:slug` param matching "create" as a slug value.
- The `/factory` route renders inside the shell but the page component itself should be full-width (no container padding). The page component can use a CSS class or context to signal the shell to remove padding.
- For Phase 5, page components that are not yet implemented should render a placeholder: `<div>Coming soon: [Page Name]</div>`. This allows the routing and navigation to be tested end-to-end.
- The 404 page should be minimal: "Page Not Found" heading, a short message, and a `<Link to="/">` back to the dashboard.
- Consider wrapping the route tree in an `ErrorBoundary` (React Router's `errorElement`) to catch rendering errors gracefully.
