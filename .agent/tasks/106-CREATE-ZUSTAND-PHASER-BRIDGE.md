# Task 106: Create Zustand-Phaser Bridge

## Summary
Create the bidirectional bridge between Zustand stores and Phaser scenes — Zustand state changes trigger Phaser scene events for visual updates, and Phaser user interactions (clicks, selections) dispatch Zustand actions to update React UI state. The bridge is the communication backbone between the React and Phaser layers.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 088 (Zustand App Store — provides the store to subscribe to), 102 (Phaser React Wrapper — provides the game instance and mount lifecycle)
- **Blocks**: 107-121 (all Phaser objects and systems use the bridge for state synchronization)

## Architecture Reference
The bridge pattern decouples Phaser scenes from React components. Neither layer imports the other directly. Instead, the bridge subscribes to Zustand store slices and emits typed Phaser scene events when relevant state changes. Conversely, Phaser input events (e.g., clicking a Worker machine) are forwarded through the bridge to Zustand actions. The bridge is created when the PhaserGame component mounts and destroyed when it unmounts, matching the game instance lifecycle.

## Files and Folders
- `/apps/web/src/phaser/bridge.ts` — PhaserBridge class with Zustand subscriptions and Phaser event emission

## Acceptance Criteria
- [ ] `PhaserBridge` class accepts a `Phaser.Game` instance and Zustand store references on construction
- [ ] Bridge subscribes to relevant Zustand store slices (workflow state, worker states, package states)
- [ ] On Zustand state change: emits corresponding Phaser scene events (e.g., `'worker:stateChanged'`, `'package:moved'`, `'layout:updated'`)
- [ ] On Phaser interaction: dispatches Zustand actions (e.g., `selectWorker(id)`, `selectPackage(id)`, `deselectAll()`)
- [ ] Type-safe event names and payloads — event types are defined as a TypeScript union/enum
- [ ] Handles rapid state changes without flooding the scene with events (debounce/throttle where appropriate)
- [ ] `destroy()` method unsubscribes all Zustand subscriptions and removes all Phaser event listeners
- [ ] Bridge is created in the PhaserGame mount effect and destroyed in the cleanup function
- [ ] No direct imports between React components and Phaser scenes — all communication goes through the bridge
- [ ] Bridge handles the case where the game/scene is not yet ready (queues events until scene is active)

## Implementation Notes
- Zustand's `subscribe` method with a selector is the primary mechanism: `store.subscribe((state) => state.workers, (workers) => scene.events.emit('workers:updated', workers))`.
- Use Zustand's `subscribeWithSelector` middleware (or the built-in selector support in Zustand v4+) to subscribe to specific slices rather than the entire store.
- For Phaser → Zustand, expose callback functions that the Phaser scenes call: `bridge.onWorkerClicked(workerId)` which internally calls `store.getState().selectWorker(workerId)`.
- Consider a thin event bus pattern where event names are string literals from a const object: `const BRIDGE_EVENTS = { WORKER_STATE_CHANGED: 'worker:stateChanged', ... } as const`.
- Debouncing is especially important for package position updates during animations — the scene doesn't need 60fps state updates from Zustand, only key transitions.
- The bridge should be a singleton per game instance. Store it in a ref in the PhaserGame component.
- Consider using `queueMicrotask` or `requestAnimationFrame` to batch Zustand → Phaser event emissions to align with Phaser's game loop.
