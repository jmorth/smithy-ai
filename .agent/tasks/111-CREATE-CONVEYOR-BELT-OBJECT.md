# Task 111: Create Conveyor Belt Object

## Summary
Create the ConveyorBelt Phaser game object — an animated belt sprite that visually connects Worker machine positions within Assembly Lines. The belt features directional scrolling animation, supports straight and L-shaped routing between machines, and activates/deactivates based on Assembly Line status.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 104 (Isometric Coordinate System — positioning along paths), 107 (Boot Scene — loads belt sprite sheet)
- **Blocks**: 115 (Package Mover — animates crates along belt paths)

## Architecture Reference
Conveyor belts are the visual connection between Worker machines in an Assembly Line. Each belt segment connects two adjacent machine positions and plays a scrolling animation to indicate flow direction. The belt is composed of multiple segment sprites placed along the path between machines. The animation can be paused (when the line is idle) or reversed. Belt paths are computed by the layout generator (task 109) and created by the FactoryScene.

## Files and Folders
- `/apps/web/src/phaser/objects/conveyor-belt.ts` — ConveyorBelt game object class

## Acceptance Criteria
- [ ] `ConveyorBelt` creates belt segment sprites between two isometric positions (start machine → end machine)
- [ ] Belt segments display a scrolling/animated texture indicating flow direction
- [ ] Supports straight horizontal routing (most common within a room)
- [ ] Supports L-shaped routing (horizontal then vertical, or vice versa) for connections between rows
- [ ] Correct depth sorting — belts render above floor tiles but below machines and crates
- [ ] `activate()` method starts the belt animation (scrolling)
- [ ] `deactivate()` method stops the belt animation (static)
- [ ] `setDirection(forward: boolean)` controls animation direction
- [ ] Belt segments are properly spaced to fill the gap between two machine positions
- [ ] `destroy()` cleans up all segment sprites
- [ ] Non-interactive (decorative — clicks pass through to floor tiles)

## Implementation Notes
- Each belt is composed of multiple segment sprites placed at regular intervals along the path. Each segment uses the same animated sprite sheet frame.
- The scrolling effect can be achieved with a sprite sheet animation (4-8 frames of a belt surface moving) played on each segment, or by using `tilePositionX` on a `TileSprite` to scroll the texture.
- For straight belts: place segments at equal intervals along the line from start to end position, all using the same horizontal texture.
- For L-shaped belts: create a corner segment at the turn point with a rotated texture, then straight segments for each arm of the L.
- Depth: use `getDepth(tileX, tileY) + 0.05` to render above floor but below machines (which use `+ 0.5` or higher).
- Consider using a Phaser Container to group all segments of one belt for easier lifecycle management.
- Performance: if there are many belts, consider rendering them to a RenderTexture or using a shader for the scrolling effect instead of individual animated sprites.
- The belt path data comes from `ConveyorPath` in the layout generator output, which contains `startPos`, `endPos`, and optional `waypoints` for L-shapes.
