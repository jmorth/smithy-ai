# Task 102: Create Phaser React Wrapper

## Summary
Create a React component that instantiates and manages a Phaser 3 game instance — creates on mount, destroys on unmount, passes parent div ref for canvas attachment. This is the foundational bridge between the React SPA and the Phaser 3 game engine, enabling the isometric factory floor to live inside the React component tree.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 084 (Initialize Vite + React App)
- **Blocks**: 103-121 (all Phaser tasks depend on a mounted game instance)

## Architecture Reference
The Phaser game canvas is rendered inside a React component using a `div` ref as the parent element. The React component manages the Phaser lifecycle: creating the `Phaser.Game` instance on mount and destroying it on unmount to prevent memory leaks. React overlay panels are rendered as siblings of the canvas container using absolute positioning, allowing HTML UI to float on top of the WebGL canvas. The factory page is a dedicated route (`/factory`) in the React Router config.

## Files and Folders
- `/apps/web/src/pages/factory/index.tsx` — Factory page component containing the PhaserGame wrapper and overlay container
- `/apps/web/src/phaser/game.ts` — PhaserGame React component that manages the Phaser.Game lifecycle
- `/apps/web/package.json` — Updated with `phaser` dependency

## Acceptance Criteria
- [ ] `phaser` package is installed as a dependency in `apps/web`
- [ ] `PhaserGame` React component creates a `Phaser.Game` instance on mount using a parent `div` ref
- [ ] `PhaserGame` destroys the game instance on unmount via `game.destroy(true)` in the cleanup function
- [ ] No memory leaks — mounting and unmounting the component repeatedly does not accumulate Phaser instances
- [ ] Canvas fills the parent container (width: 100%, height: 100%)
- [ ] React can render overlay elements on top of the canvas using absolute positioning within a shared container
- [ ] The factory page component renders at the `/factory` route (or is exported for routing integration)
- [ ] `PhaserGame` accepts a game config prop or imports the config from `config.ts` (task 103)
- [ ] `PhaserGame` exposes the game instance via a ref or callback for external access (e.g., bridge setup)
- [ ] `pnpm --filter web build` completes without errors
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Use `useRef` for the container div and `useEffect` for the Phaser lifecycle. The game instance should be stored in a ref (not state) to avoid re-renders.
- The factory page layout should be a full-viewport container (`w-screen h-screen relative`) with the Phaser canvas as the base layer and an overlay div (`absolute inset-0 pointer-events-none`) for React panels.
- Phaser's `parent` config option accepts either a DOM element or a string ID. Passing the ref's `current` element directly is preferred over using an ID.
- React StrictMode in development will mount/unmount/remount components. The cleanup function must handle this gracefully — destroy the game fully so the second mount starts clean.
- Do NOT configure scenes, physics, or rendering options here — that is task 103 (Phaser Game Config). This component should accept a config object.
- Consider exposing an `onGameReady` callback prop so the parent can set up the bridge (task 106) once the game instance is available.
