# Task 084: Initialize Vite + React Application

## Summary
Initialize the Vite + React application in `apps/web` with TypeScript, install core dependencies (react-router-dom, @tanstack/react-query, zustand, socket.io-client), configure the Vite dev server with API proxy, and wire up the React root with placeholder routing. This is the entry point for all frontend dashboard and factory view work.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 008 (Scaffold Vite + React Web App)
- **Blocks**: 085 (Tailwind + shadcn), 086 (API Client), 087 (Socket.IO Client), 088 (Zustand Store), 089 (App Shell Layout), 090 (React Router Config)

## Architecture Reference
The web application is a Vite-bundled React SPA at `apps/web/`. It communicates with the NestJS API at `VITE_API_URL` (default `http://localhost:3000/api`) via REST and receives real-time updates via Socket.IO. The app uses TanStack Query for server state, Zustand for client state, React Router for navigation, and Socket.IO client for real-time events. During development, Vite's proxy forwards `/api` requests to the backend to avoid CORS issues.

## Files and Folders
- `/apps/web/package.json` — Updated with core dependencies: react-router-dom, @tanstack/react-query, zustand, socket.io-client
- `/apps/web/vite.config.ts` — Vite configuration with React plugin, API proxy to `http://localhost:3000`, and path aliases
- `/apps/web/src/main.tsx` — React DOM render entry point wrapping App in StrictMode, QueryClientProvider, and BrowserRouter
- `/apps/web/src/app.tsx` — Root App component with placeholder React Router outlet

## Acceptance Criteria
- [ ] `pnpm --filter web dev` starts the Vite dev server on port 5173 without errors
- [ ] `vite.config.ts` proxies `/api` requests to `http://localhost:3000` with `changeOrigin: true`
- [ ] `vite.config.ts` proxies `/socket.io` requests to `http://localhost:3000` with WebSocket upgrade support
- [ ] `main.tsx` renders the React root into `#root` element
- [ ] `main.tsx` wraps the app in `React.StrictMode`, `QueryClientProvider`, and `BrowserRouter`
- [ ] `app.tsx` has a placeholder router with a home route rendering "Smithy AI Dashboard"
- [ ] `@tanstack/react-query` QueryClient is configured with sensible defaults (staleTime, retry)
- [ ] All dependencies are installed: `react-router-dom`, `@tanstack/react-query`, `zustand`, `socket.io-client`
- [ ] All type dependencies are installed: `@types/react-router-dom` (if needed)
- [ ] `pnpm --filter web build` completes without errors
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Task 008 already created the base Vite scaffold. This task adds the runtime dependencies and wires up the provider tree.
- Configure the TanStack Query `QueryClient` with: `staleTime: 30_000` (30 seconds), `retry: 1`, `refetchOnWindowFocus: false` for development ergonomics. These can be tuned later.
- The `VITE_API_URL` env var is read via `import.meta.env.VITE_API_URL`. The proxy config in `vite.config.ts` is only for development — in production the SPA is served behind a reverse proxy that routes `/api` to the backend.
- Do NOT install Tailwind or shadcn yet — that is task 085.
- Do NOT configure actual routes beyond a placeholder — that is task 090.
- The `BrowserRouter` is placed in `main.tsx` so that `app.tsx` can use React Router hooks at the top level.
- Add a path alias `@/` pointing to `src/` in both `vite.config.ts` (via `resolve.alias`) and `tsconfig.json` (via `paths`) for clean imports.
