# Task 117: Create Factory Zustand Store

## Summary
Create the factory-specific Zustand store for Phaser view state — Worker machine positions and states, Package crate positions and statuses, active animation tracking, selected entity IDs, and layout data. This store is the single source of truth for the factory floor's visual state, bridging domain data from the API/Socket.IO with Phaser rendering state.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 088 (Zustand App Store — follows established store patterns and middleware)
- **Blocks**: 118 (Realtime Sync — reads and writes factory store), 120 (Overlay Panels — reads selected entity from store), 121 (Factory Toolbar — reads/writes view state)

## Architecture Reference
The factory store is a Zustand store dedicated to the Phaser factory floor's visual state. It is separate from the main app store (task 088) to keep concerns isolated. The factory store holds the current layout, positions and states of all game objects, and UI selection state. The Zustand-Phaser bridge (task 106) subscribes to this store and emits Phaser events when values change. React overlay panels read from this store to display details about selected entities.

## Files and Folders
- `/apps/web/src/stores/factory.store.ts` — Factory Zustand store with types and actions

## Acceptance Criteria
- [ ] Store contains `workerMachines: Map<string, WorkerMachineState>` where `WorkerMachineState` includes `{ position: { tileX, tileY }, state: WorkerState, workerId: string, name: string }`
- [ ] Store contains `packageCrates: Map<string, PackageCrateState>` where `PackageCrateState` includes `{ position: { tileX, tileY }, type: PackageType, status: PackageStatus, currentStep: number }`
- [ ] Store contains `activeAnimations: Set<string>` tracking currently animating entity IDs
- [ ] Store contains `layoutData: FactoryLayout | null` from the layout generator
- [ ] Store contains `selectedMachine: string | null` (selected Worker machine ID)
- [ ] Store contains `selectedCrate: string | null` (selected Package crate ID)
- [ ] Actions: `updateWorkerState(id: string, state: WorkerState)` — updates a machine's state
- [ ] Actions: `movePackage(id: string, position: { tileX, tileY })` — updates a crate's position
- [ ] Actions: `addPackage(id: string, crateState: PackageCrateState)` — adds a new crate to the map
- [ ] Actions: `removePackage(id: string)` — removes a crate from the map
- [ ] Actions: `setLayout(layout: FactoryLayout)` — sets the layout data and resets positions
- [ ] Actions: `selectMachine(id: string | null)` and `selectCrate(id: string | null)` — set selection (selecting one clears the other)
- [ ] Store uses `subscribeWithSelector` middleware (or equivalent) for fine-grained bridge subscriptions
- [ ] All types are exported for use by bridge, scenes, and React components
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Use Zustand's `create` with TypeScript generics for type safety:
  ```ts
  interface FactoryState {
    workerMachines: Map<string, WorkerMachineState>;
    packageCrates: Map<string, PackageCrateState>;
    // ...
    updateWorkerState: (id: string, state: WorkerState) => void;
    // ...
  }
  ```
- Zustand does not deeply compare Maps by default. When updating a Map entry, create a new Map reference to trigger re-renders: `set({ workerMachines: new Map(get().workerMachines).set(id, updated) })`.
- `subscribeWithSelector` middleware enables the bridge to subscribe to individual fields: `useFactoryStore.subscribe(s => s.workerMachines, (machines) => { ... })`.
- The `activeAnimations` set is used to prevent overlapping animations — the realtime sync system checks if an entity is already animating before starting a new animation.
- Selection is mutually exclusive: selecting a machine clears the crate selection and vice versa. This mirrors a single-selection UI pattern.
- Consider adding a `viewMode` field (e.g., `'factory' | 'dashboard'`) if the toolbar (task 121) needs to toggle between views.
- Import Worker state enums from the shared types package (task 019/020) to ensure consistency with the backend.
