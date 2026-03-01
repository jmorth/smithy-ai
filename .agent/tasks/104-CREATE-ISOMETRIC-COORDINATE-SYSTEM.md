# Task 104: Create Isometric Coordinate System

## Summary
Create isometric math utilities — cartesian-to-isometric projection, isometric-to-cartesian inverse, tile size constants, depth sorting calculation, and screen-to-tile coordinate mapping for mouse interaction. These pure functions are the spatial foundation for every game object placed on the factory floor.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 103 (Phaser Game Config — establishes the rendering context)
- **Blocks**: 105 (Camera Controller — uses iso coords for bounds), 108 (Factory Scene — renders iso grid), 109 (Layout Generator — positions objects in iso space), 110 (Floor Tiles — placed with iso coords), 111 (Conveyor Belt — routed in iso space), 113 (Worker Machine — positioned with iso coords), 114 (Package Crate — positioned with iso coords)

## Architecture Reference
The factory floor uses a standard isometric (2:1 diamond) projection. Cartesian grid coordinates (tileX, tileY) are transformed to screen pixel coordinates (screenX, screenY) for rendering. The inverse transformation is used for mouse picking — converting screen clicks back to tile coordinates. Depth sorting ensures sprites closer to the camera (higher Y, higher X) render on top of sprites further away.

## Files and Folders
- `/apps/web/src/phaser/systems/isometric.ts` — Isometric coordinate utilities and constants

## Acceptance Criteria
- [ ] `TILE_WIDTH` and `TILE_HEIGHT` constants exported (e.g., 64x32 for standard 2:1 isometric)
- [ ] `cartToIso(x: number, y: number): { screenX: number; screenY: number }` converts cartesian tile coords to screen pixel coords
- [ ] `isoToCart(screenX: number, screenY: number): { x: number; y: number }` converts screen pixel coords back to cartesian tile coords (inverse of cartToIso)
- [ ] `getDepth(x: number, y: number): number` returns a z-index value for correct depth sorting (objects with higher depth render on top)
- [ ] `screenToTile(screenX: number, screenY: number, cameraScrollX: number, cameraScrollY: number, cameraZoom: number): { tileX: number; tileY: number }` converts raw screen/pointer coordinates to tile coordinates accounting for camera offset and zoom
- [ ] Round-trip accuracy: `isoToCart(cartToIso(x, y))` returns values within floating-point tolerance of the original `(x, y)`
- [ ] All functions are pure (no side effects, no Phaser dependencies) and independently testable
- [ ] Functions are exported individually for tree-shaking
- [ ] Type definitions for all input/output shapes

## Implementation Notes
- Standard 2:1 isometric projection formulas:
  - `screenX = (x - y) * (TILE_WIDTH / 2)`
  - `screenY = (x + y) * (TILE_HEIGHT / 2)`
- Inverse:
  - `x = (screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 2)) / 2`
  - `y = (screenY / (TILE_HEIGHT / 2) - screenX / (TILE_WIDTH / 2)) / 2`
- Depth sorting: `depth = (x + y)` works for standard iso. Objects with higher `(x + y)` are closer to the camera and should render on top.
- `screenToTile` must account for the camera's scroll position and zoom level: first convert screen coords to world coords (`worldX = screenX / zoom + cameraScrollX`), then apply `isoToCart`.
- Consider exporting a `tileToWorld` alias that adds an optional Y-offset for sprites that are taller than one tile (e.g., machines).
- Tile coordinates can be fractional for sub-tile positioning (e.g., package crates moving along belts between tiles).
- These functions have zero Phaser dependencies — they are pure math and can be unit tested without a game instance.
