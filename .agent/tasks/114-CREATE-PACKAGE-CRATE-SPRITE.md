# Task 114: Create Package Crate Sprite

## Summary
Create the PackageCrate Phaser game object — a small crate/box sprite representing a Package on the factory floor, with type-based color coding (USER_INPUT=blue, CODE=green, etc.), click handling for detail panel display, smooth position tweening for movement along conveyor belts, and enter/exit machine animations.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 104 (Isometric Coordinate System — positioning and depth), 107 (Boot Scene — loads crate textures)
- **Blocks**: 115 (Package Mover — animates crate movement), 118 (Realtime Sync — creates/removes crates based on events)

## Architecture Reference
PackageCrate is a small, mobile game object representing a Package entity moving through the workflow. Crates are created when a Package enters an Assembly Line or Worker Pool, move along conveyor belts between machines, enter machines for processing, exit machines when done, and are destroyed when the Package leaves the workflow. The crate's color indicates the Package type, providing at-a-glance visual differentiation.

## Files and Folders
- `/apps/web/src/phaser/objects/package-crate.ts` — PackageCrate game object class

## Acceptance Criteria
- [ ] `PackageCrate` extends `Phaser.GameObjects.Sprite`
- [ ] Small crate sprite (32x32 or similar) positioned on the isometric grid
- [ ] Color-coded by Package type using tint:
  - `USER_INPUT` = blue (`0x4488ff`)
  - `CODE` = green (`0x44ff88`)
  - `SPECIFICATION` = orange (`0xff8844`)
  - `IMAGE` = purple (`0x8844ff`)
  - `DOCUMENT` = white/gray (`0xcccccc`)
  - Additional types have distinct colors
- [ ] Click handler dispatches `selectPackage(packageId)` via the bridge
- [ ] `moveTo(screenX: number, screenY: number, duration: number): Promise<void>` tweens the crate to a new position with easing
- [ ] `enterMachine(machineSprite: Phaser.GameObjects.Sprite): Promise<void>` fades and shrinks crate into the machine
- [ ] `exitMachine(machineSprite: Phaser.GameObjects.Sprite): Promise<void>` fades in and grows crate from the machine
- [ ] Stores domain `packageId` and `packageType` for bridge correlation
- [ ] Correct depth sorting — crates render above belts but below machine tooltips
- [ ] Interactive with hand cursor on hover
- [ ] `destroy()` cleans up tweens, input listeners
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Color coding: use `this.setTint(color)` where color is looked up from a `PACKAGE_TYPE_COLORS` constant map.
- `moveTo` should return a Promise that resolves when the tween completes. Wrap the Phaser tween in a Promise:
  ```ts
  moveTo(x: number, y: number, duration: number): Promise<void> {
    return new Promise(resolve => {
      this.scene.tweens.add({ targets: this, x, y, duration, ease: 'Sine.easeInOut', onComplete: resolve });
    });
  }
  ```
- `enterMachine`: tween alpha from 1→0 and scale from 1→0.3 over ~300ms, moving toward the machine's center position.
- `exitMachine`: set position to machine center, set alpha=0 and scale=0.3, tween to alpha=1 and scale=1 over ~300ms.
- Depth: crates should have depth = `getDepth(tileX, tileY) + 0.3` (above belts at +0.05, below machines at +0.5).
- When a crate is inside a machine (between enter and exit), it should be invisible (`setVisible(false)`) rather than destroyed, since it will reappear when the machine finishes.
- Consider adding a small label or icon on the crate showing the package type abbreviation for accessibility.
- Multiple crates may exist simultaneously on the factory floor — ensure each has a unique depth value to prevent z-fighting. Add a small random offset or use the package ID hash for sub-depth.
