# Task 109: Create Factory Layout Generator

## Summary
Create the layout generator that takes Assembly Line and Worker Pool configurations and computes isometric positions for rooms, machines, and conveyor belt paths. The generator transforms domain workflow topology into spatial positions suitable for rendering on the isometric factory floor.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 104 (Isometric Coordinate System — uses tile coordinate math)
- **Blocks**: 108 (Factory Scene — uses layout to place objects), 110 (Floor Tiles — room boundaries determine floor area), 111 (Conveyor Belt — paths from layout), 113 (Worker Machine — positions from layout)

## Architecture Reference
The layout generator is a pure function that takes workflow configuration data (Assembly Lines with their steps, Worker Pools with their members) and produces a typed layout data structure containing positioned rooms, machine placements, and conveyor belt routing. The algorithm arranges Assembly Lines in horizontal rows, each enclosed in a rectangular room with conveyor belts connecting the steps. Worker Pools are clustered in a separate area. The output is consumed by the FactoryScene to create game objects at the computed positions.

## Files and Folders
- `/apps/web/src/phaser/systems/layout-generator.ts` — Layout generation functions and types

## Acceptance Criteria
- [ ] Input type: accepts Assembly Lines (with ordered steps/Workers) and Worker Pools (with member Workers)
- [ ] Output type: `FactoryLayout` containing `rooms: Room[]`, `machinePositions: MachinePosition[]`, `conveyorPaths: ConveyorPath[]`, `floorBounds: { width: number; height: number }`
- [ ] Assembly Lines are arranged in horizontal rows, each getting a rectangular room sized to fit its steps
- [ ] Worker machines within an Assembly Line room are spaced evenly along the room's horizontal axis
- [ ] Conveyor belt paths connect adjacent Worker machines within each Assembly Line room
- [ ] Worker Pools are arranged in a separate area (below or beside Assembly Line rooms) as clusters of machines
- [ ] No overlapping rooms — rooms are placed with gap spacing between them
- [ ] `floorBounds` returns the total width and height of the generated layout in tile coordinates (for camera bounds)
- [ ] Layout is deterministic — same input always produces the same output
- [ ] All types are exported for use by the scene and bridge
- [ ] Functions are pure and testable without Phaser

## Implementation Notes
- Room sizing: each Assembly Line room width = `(number_of_steps * MACHINE_SPACING) + ROOM_PADDING * 2`, height = `ROOM_HEIGHT` (constant, e.g., 5 tiles).
- Room placement: stack rooms vertically with a gap: room[0] at y=0, room[1] at y=room[0].height + GAP, etc.
- Machine positions within a room: start at `(room.x + ROOM_PADDING, room.y + room.height / 2)`, increment x by `MACHINE_SPACING`.
- Conveyor paths: straight horizontal segments connecting adjacent machine positions within the same room.
- Worker Pool clusters: arrange machines in a grid pattern (e.g., 3 columns) within a rectangular area.
- Consider a `LAYOUT_CONFIG` constants object for spacing, padding, and gap values to make the layout tunable.
- The generator does not create Phaser objects — it only computes positions. The FactoryScene reads the layout and creates sprites at those positions.
- Edge case: empty Assembly Lines (no steps) should produce an empty room. Single-step lines should have a room with one machine and no conveyor.
- Future enhancement: allow user-customized layouts by persisting and loading saved position overrides.
