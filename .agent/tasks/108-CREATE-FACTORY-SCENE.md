# Task 108: Create Factory Scene

## Summary
Create the main FactoryScene — the primary Phaser scene that renders the isometric factory floor grid, manages all game objects (Workers, Packages, conveyors), initializes the camera controller, connects to the Zustand bridge for state synchronization, and handles user interaction events. This is the central scene where all factory visualization happens.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 104 (Isometric Coordinate System), 105 (Camera Controller), 106 (Zustand-Phaser Bridge), 107 (Boot Scene — loads assets first)
- **Blocks**: 109 (Layout Generator — scene uses layout to place objects), 110 (Floor Tiles — scene creates tile grid), 111 (Conveyor Belt — scene places belts), 113 (Worker Machine — scene manages machine sprites), 114 (Package Crate — scene manages crate sprites), 118 (Realtime Sync — scene receives live updates), 119 (Visual Effects — scene triggers effects)

## Architecture Reference
The FactoryScene is the primary game scene, started by BootScene after asset loading completes. It creates the isometric floor grid, instantiates game objects based on layout data, initializes the camera controller, and listens for bridge events to update the visualization. The scene maintains Maps of active game objects (workers, packages) keyed by their domain IDs, enabling efficient lookup when state updates arrive.

## Files and Folders
- `/apps/web/src/phaser/scenes/factory-scene.ts` — FactoryScene class extending Phaser.Scene

## Acceptance Criteria
- [ ] `FactoryScene` extends `Phaser.Scene` with key `'FactoryScene'`
- [ ] `create()` renders a basic isometric tile grid floor (configurable dimensions, e.g., 20x20 tiles)
- [ ] Camera controller is initialized in `create()` with bounds matching the floor dimensions
- [ ] Scene listens for bridge events: `'worker:stateChanged'`, `'package:moved'`, `'layout:updated'`, etc.
- [ ] Click events on game objects are detected and forwarded to the bridge (Worker/Package selection)
- [ ] Scene manages game object lifecycle: creates sprites when entities appear, destroys them when removed
- [ ] `workerMachines` Map tracks active WorkerMachine sprites by Worker ID
- [ ] `packageCrates` Map tracks active PackageCrate sprites by Package ID
- [ ] Scene renders correctly on load with a visible isometric grid floor
- [ ] `update(time, delta)` loop runs the camera controller update
- [ ] Scene cleans up all game objects and listeners on shutdown
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- The floor grid is created by iterating over tile coordinates and placing FloorTile objects (task 110) at each position using `cartToIso()`.
- Game object Maps should use domain entity IDs (UUIDs) as keys, not Phaser internal IDs, for bridge lookups.
- Bridge event handlers should be registered in `create()` and removed in `shutdown()` to prevent listener leaks when the scene restarts.
- The scene should expose methods like `addWorkerMachine(id, config)`, `removeWorkerMachine(id)`, `updateWorkerState(id, state)` that bridge event handlers call.
- For initial rendering without real data, create a small demo layout (a few machines on a grid) to verify the isometric rendering works.
- Use `this.add.group()` or Phaser containers for organizing related objects (e.g., all floor tiles in one group, all machines in another) to simplify depth sorting and bulk operations.
- The scene should handle the case where bridge events arrive before `create()` completes — either queue them or ignore them with a ready flag.
- Consider a `rebuild()` method that clears all objects and recreates them from the current layout data — useful when the user switches between Assembly Lines.
