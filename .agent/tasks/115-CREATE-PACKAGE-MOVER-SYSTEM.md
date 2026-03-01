# Task 115: Create Package Mover System

## Summary
Create the PackageMover system that orchestrates Package crate animations along conveyor belt paths between Worker machines. The system manages the full animation sequence: exit from source machine, move along belt path segments, enter destination machine — with easing, queuing, and coordination between multiple simultaneous crate movements.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 111 (Conveyor Belt — defines belt paths for movement), 114 (Package Crate — provides moveTo/enterMachine/exitMachine methods)
- **Blocks**: 118 (Realtime Sync — triggers package movement on job completion events)

## Architecture Reference
The PackageMover is a scene-level system (not a game object) that coordinates crate animations. When a Package transitions between Workers, the mover receives the source machine, destination machine, and conveyor belt path, then orchestrates the animation sequence. It queues animations to prevent visual conflicts and ensures smooth transitions with configurable durations and easing curves.

## Files and Folders
- `/apps/web/src/phaser/systems/package-mover.ts` — PackageMover system class

## Acceptance Criteria
- [ ] `moveTo(crate: PackageCrate, targetPosition: {x, y}, duration: number): Promise<void>` tweens a crate along an isometric path with easing
- [ ] `enterMachine(crate: PackageCrate, machine: WorkerMachine): Promise<void>` animates the crate fading/shrinking into the machine sprite
- [ ] `exitMachine(crate: PackageCrate, machine: WorkerMachine): Promise<void>` animates the crate appearing/growing from the machine sprite
- [ ] `moveAlongPath(crate: PackageCrate, path: {x, y}[], segmentDuration: number): Promise<void>` moves a crate through multiple waypoints sequentially
- [ ] `processStep(crate: PackageCrate, sourceMachine: WorkerMachine, destMachine: WorkerMachine, beltPath: {x, y}[]): Promise<void>` orchestrates the full sequence: exit source → move along belt → enter destination
- [ ] Animation queue: multiple movements for the same crate are queued and executed sequentially (no overlapping tweens)
- [ ] Multiple crates can animate simultaneously without interference
- [ ] Smooth transitions with configurable easing (default: `Sine.easeInOut`)
- [ ] Default segment duration: 500-1000ms (configurable)
- [ ] All Promises resolve when their animation completes, enabling chaining
- [ ] System cleans up pending tweens on destroy

## Implementation Notes
- The animation queue per crate can be implemented with a simple Promise chain: store the last Promise for each crate ID and chain new animations onto it.
- `moveAlongPath` chains `moveTo` calls sequentially:
  ```ts
  async moveAlongPath(crate, path, segmentDuration) {
    for (const point of path) {
      await this.moveTo(crate, point, segmentDuration);
    }
  }
  ```
- `processStep` is the high-level orchestrator:
  ```ts
  async processStep(crate, source, dest, beltPath) {
    await this.exitMachine(crate, source);
    await this.moveAlongPath(crate, beltPath, 500);
    await this.enterMachine(crate, dest);
  }
  ```
- Easing options: `Sine.easeInOut` for smooth movement, `Back.easeOut` for a slight overshoot on exit, `Quad.easeIn` for acceleration into a machine.
- If a crate is destroyed mid-animation (e.g., workflow cancelled), pending tweens should be killed via `this.scene.tweens.killTweensOf(crate)`.
- Consider adding a speed multiplier for fast-forward or slow-motion viewing.
- The system should be instantiated by the FactoryScene and accessible to the realtime sync system.
