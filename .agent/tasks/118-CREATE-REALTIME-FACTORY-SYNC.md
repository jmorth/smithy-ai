# Task 118: Create Realtime Factory Sync

## Summary
Create the RealtimeSync system that connects Socket.IO events to factory scene updates — mapping workflow domain events (package created, job started, job completed, job stuck, job error, assembly line completed) to visual operations (sprite creation, crate movement, machine state changes, effect triggers, sprite removal). This is the live nerve center that makes the factory floor reflect real-time workflow progress.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 087 (Socket.IO Client — provides the event stream), 106 (Zustand-Phaser Bridge — forwards events to Phaser), 113 (Worker Machine — state updates applied to machines), 114 (Package Crate — crates created/moved/removed), 115 (Package Mover — orchestrates movement animations), 117 (Factory Zustand Store — reads/writes factory state)
- **Blocks**: 119 (Visual Effects — sync triggers effects on certain events)

## Architecture Reference
The RealtimeSync system sits between the Socket.IO event stream and the factory Zustand store + Phaser bridge. It listens to Socket.IO events (received via the app-level Zustand store or directly from the socket client), translates them into factory store actions and bridge events, and coordinates the visual response. It ensures that domain events result in smooth, ordered visual transitions rather than jarring instant state changes.

## Files and Folders
- `/apps/web/src/phaser/systems/realtime-sync.ts` — RealtimeSync system class

## Acceptance Criteria
- [ ] `package:created` event → adds new PackageCrate sprite at the Assembly Line/Pool entrance position
- [ ] `job:started` event → animates crate entering the Worker machine (enterMachine animation)
- [ ] `job:completed` event → animates crate exiting machine, moves crate to next Worker via conveyor belt path
- [ ] `job:stuck` event → switches Worker machine to STUCK state (flashing yellow animation)
- [ ] `job:error` event → switches Worker machine to ERROR state (red glow/shake animation)
- [ ] `assembly-line:completed` event → crate exits the last machine, plays completion effect, removes crate
- [ ] Worker state changes are reflected in the factory Zustand store and propagated to Phaser via bridge
- [ ] Smooth transitions: no teleporting — crates always animate between positions
- [ ] Events that arrive while a crate is mid-animation are queued and processed in order
- [ ] System handles out-of-order events gracefully (e.g., completion before start due to race conditions)
- [ ] `destroy()` unsubscribes from all Socket.IO events and cleans up
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Event handling pattern: each Socket.IO event type maps to a handler method:
  ```ts
  this.socket.on('package:created', (data) => this.handlePackageCreated(data));
  this.socket.on('job:started', (data) => this.handleJobStarted(data));
  // ...
  ```
- `handleJobCompleted` is the most complex handler — it must:
  1. Update the Worker machine state to DONE (briefly) then back to IDLE
  2. Call `packageMover.exitMachine(crate, sourceMachine)`
  3. Determine the next machine from the Assembly Line step order
  4. Get the conveyor belt path from the layout
  5. Call `packageMover.moveAlongPath(crate, beltPath)`
  6. Call `packageMover.enterMachine(crate, destMachine)`
  7. Update the factory store with the new crate position
- Animation queuing per crate prevents visual conflicts. Use the PackageMover's built-in queue (task 115).
- For events that arrive before the scene is ready (e.g., during initial load), buffer them and replay once the scene emits a `'ready'` event.
- Consider a `syncInitialState()` method that queries the current workflow state from the API and sets up the factory floor accordingly (not just incremental events).
- Out-of-order handling: if a `job:completed` arrives for a crate that hasn't received `job:started`, skip the exit animation and directly move the crate to the next position.
- Map Socket.IO event payload types to the domain event contracts from task 021 for type safety.
