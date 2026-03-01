# Task 088: Create Zustand Application Store

## Summary
Create the global Zustand application store for client-side state management, including view mode toggling (managerial/factory), Socket.IO connection state tracking, notification count, and entity selection state. This store is consumed by the app shell, sidebar, header, and individual pages.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 084 (Initialize Vite + React App)
- **Blocks**: 089 (App Shell Layout — reads viewMode, socketState), 091 (Dashboard — reads stats), 102+ (Phaser Factory — reads viewMode)

## Architecture Reference
Zustand is used for lightweight client-side state that does not belong in TanStack Query's server-state cache. The store is a single flat store with logical slices (not separate stores) for simplicity. It uses Zustand's `persist` middleware to save the `viewMode` preference to `localStorage` so the user's choice survives page reloads. The Socket.IO client (task 087) pushes connection state updates into this store via a callback.

## Files and Folders
- `/apps/web/src/stores/app.store.ts` — Zustand store with state slices, actions, and localStorage persistence for viewMode

## Acceptance Criteria
- [ ] Store exports a `useAppStore` hook created via `zustand/create`
- [ ] State slice — `viewMode`: `'managerial' | 'factory'`, default `'managerial'`
- [ ] State slice — `socketState`: `'connected' | 'disconnected' | 'reconnecting'`, default `'disconnected'`
- [ ] State slice — `unreadNotificationCount`: `number`, default `0`
- [ ] State slice — `selectedWorkerId`: `string | null`, default `null`
- [ ] State slice — `selectedPackageId`: `string | null`, default `null`
- [ ] Action — `setViewMode(mode)`: updates `viewMode`
- [ ] Action — `setSocketState(state)`: updates `socketState`
- [ ] Action — `incrementNotifications()`: increments `unreadNotificationCount` by 1
- [ ] Action — `resetNotifications()`: sets `unreadNotificationCount` to 0
- [ ] Action — `selectWorker(id | null)`: updates `selectedWorkerId`
- [ ] Action — `selectPackage(id | null)`: updates `selectedPackageId`
- [ ] `viewMode` is persisted to `localStorage` via Zustand's `persist` middleware with key `smithy-view-mode`
- [ ] Other state slices are NOT persisted (they are ephemeral)
- [ ] Store is fully typed — TypeScript interface for state and actions

## Implementation Notes
- Use Zustand's `persist` middleware with `partialize` to persist only the `viewMode` field: `persist(stateCreator, { name: 'smithy-view-mode', partialize: (state) => ({ viewMode: state.viewMode }) })`.
- The store should be a single `create()` call, not split into multiple stores. Zustand stores are cheap and a single store simplifies cross-slice access (e.g., the header needs both `viewMode` and `unreadNotificationCount`).
- For selectors, consumers should use `useAppStore((s) => s.viewMode)` to avoid unnecessary re-renders. Do NOT export the entire store object as a default — export individual selector hooks if frequently used (e.g., `export const useViewMode = () => useAppStore((s) => s.viewMode)`).
- The `setSocketState` action will be called by the Socket.IO client's connection state callback (task 087). It is a one-way flow: Socket.IO client -> store -> UI.
- The `selectedWorkerId` and `selectedPackageId` are used for cross-page coordination (e.g., clicking a Worker in the factory view selects it, and switching to the managerial view shows its detail page).
