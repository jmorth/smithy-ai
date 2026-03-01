# Task 110: Create Floor Tile and Wall Objects

## Summary
Create FloorTile and Wall Phaser game objects for rendering isometric floor surfaces and room boundaries. Floor tiles are isometric diamond shapes that form the factory floor grid, and walls are vertical segments that delineate room boundaries for Assembly Lines and Worker Pools.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 104 (Isometric Coordinate System — positioning and depth sorting), 107 (Boot Scene — loads textures)
- **Blocks**: 108 (Factory Scene — creates tile grids and room walls from layout data)

## Architecture Reference
Floor tiles and walls are decorative, non-interactive game objects that form the visual foundation of the factory floor. FloorTile renders an isometric diamond at a given grid position with correct depth sorting. Wall renders vertical segments at room boundaries. Both use textures loaded by the BootScene (or placeholder textures generated at boot time). They are created by the FactoryScene based on layout data from the layout generator.

## Files and Folders
- `/apps/web/src/phaser/objects/floor-tile.ts` — FloorTile game object class
- `/apps/web/src/phaser/objects/wall.ts` — Wall game object class

## Acceptance Criteria
- [ ] `FloorTile` extends `Phaser.GameObjects.Sprite` (or `Image` for static tiles)
- [ ] FloorTile renders an isometric diamond tile at the given grid position `(tileX, tileY)` using `cartToIso`
- [ ] FloorTile applies correct depth sorting via `getDepth(tileX, tileY)`
- [ ] FloorTile supports different floor texture variants (e.g., regular floor, highlighted floor, room floor)
- [ ] `Wall` extends `Phaser.GameObjects.Sprite` (or `Image`)
- [ ] Wall renders an isometric wall segment at the given grid position
- [ ] Wall supports horizontal and vertical orientations
- [ ] Wall applies correct depth sorting (walls render above adjacent floor tiles)
- [ ] Both objects are non-interactive (no click handlers, no hover effects)
- [ ] Both objects accept their scene and grid position as constructor parameters
- [ ] Factory methods or static `create()` helpers for convenient instantiation
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- FloorTile is the simplest game object — it just places a texture at the correct isometric position. Use `Phaser.GameObjects.Image` (not Sprite) if the tile has no animation, which is more performant.
- Depth sorting: set `this.setDepth(getDepth(tileX, tileY))` in the constructor. Floor tiles should have a base depth offset (e.g., 0) so they always render below machines and crates.
- Wall segments need a slightly higher depth than floor tiles at the same position. Use `getDepth(tileX, tileY) + 0.1` or a separate depth layer.
- For room boundaries, walls are placed along the edges of the room rectangle from the layout generator. The FactoryScene iterates over room edges and creates Wall objects at each edge tile.
- Consider a `FloorTile.createGrid(scene, width, height)` static method that creates an entire grid of tiles at once for convenience.
- Texture variants can be implemented by passing a frame index or texture key to the constructor: `'floor-tile-default'`, `'floor-tile-room'`, `'floor-tile-highlight'`.
- For performance with large grids, consider using a `Phaser.GameObjects.TileSprite` or rendering the floor grid to a `RenderTexture` once instead of creating individual sprite objects for every tile.
