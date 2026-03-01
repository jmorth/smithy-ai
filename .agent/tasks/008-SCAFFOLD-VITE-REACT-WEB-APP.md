# Task 008: Scaffold Vite + React Web Application

## Summary
Create the `apps/web` Vite + React application skeleton with `package.json`, `tsconfig.json`, Vite configuration, HTML entry point, and minimal React app component. This is the frontend dashboard used to manage packages, monitor workers, view workflow progress, and interact with the Smithy system through a browser-based UI.

## Phase
Phase 1: Foundation & Infrastructure

## Dependencies
- **Depends on**: 001 (Initialize pnpm Workspace), 003 (TypeScript Base Config)
- **Blocks**: 084-101 (all frontend dashboard tasks in Phase 5)

## Architecture Reference
The web application is a single-page React application bundled by Vite. It communicates with the NestJS API via REST and receives real-time updates via SSE or WebSockets. It depends on `@smithy/shared` for type definitions. The application will eventually include:
- Package management views
- Worker configuration and monitoring
- Assembly line (workflow) builder
- Real-time job execution logs
- Notification center

## Files and Folders
- `/apps/web/package.json` — Package manifest with React, Vite dependencies, scripts for `dev`, `build`, `preview`
- `/apps/web/tsconfig.json` — TypeScript config extending `../../tsconfig.base.json`, with DOM lib and JSX settings
- `/apps/web/vite.config.ts` — Vite configuration with React plugin and API proxy
- `/apps/web/index.html` — HTML entry point with root div and script tag
- `/apps/web/src/main.tsx` — React DOM render entry point
- `/apps/web/src/app.tsx` — Root App component with placeholder content
- `/apps/web/public/` — Public static assets directory (create with a placeholder favicon or `.gitkeep`)

## Acceptance Criteria
- [ ] `pnpm --filter web dev` starts the Vite dev server without error
- [ ] `pnpm --filter web build` produces output in `dist/` directory
- [ ] React renders a placeholder page (e.g., "Smithy AI Dashboard") visible in the browser
- [ ] `package.json` depends on `@smithy/shared` via workspace protocol
- [ ] `package.json` has scripts: `dev`, `build`, `preview`, `lint`, `typecheck`
- [ ] `tsconfig.json` extends `../../tsconfig.base.json` and includes `"lib": ["ES2022", "DOM", "DOM.Iterable"]`
- [ ] `tsconfig.json` sets `"jsx": "react-jsx"`
- [ ] Vite config includes `@vitejs/plugin-react`
- [ ] Vite config includes a proxy configuration for `/api` routes pointing to `http://localhost:3000`

## Implementation Notes
- Do NOT use `create-vite` interactively — scaffold the files manually to maintain full control over the configuration.
- Install: `react`, `react-dom`, `@types/react`, `@types/react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`.
- Set `"type": "module"` in package.json.
- The `vite.config.ts` should configure a proxy so `fetch("/api/...")` forwards to the NestJS API during development.
- The `tsconfig.json` needs a separate `tsconfig.node.json` for Vite config files (or use a single config with appropriate includes).
- Keep the placeholder App component minimal — just enough to confirm React rendering works. No routing, state management, or styling libraries yet.
- Add a `public/` directory with `.gitkeep` for static assets.
