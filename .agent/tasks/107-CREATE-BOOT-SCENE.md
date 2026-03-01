# Task 107: Create Boot Scene

## Summary
Create the Phaser BootScene that preloads all sprite sheets, tilesets, and placeholder assets before transitioning to the FactoryScene. The BootScene shows a loading progress bar and handles asset loading errors gracefully. Placeholder assets (simple colored shapes) are provided for initial development before AI-generated or custom art packs are available.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 103 (Phaser Game Config — registers BootScene in the scene list)
- **Blocks**: 108 (Factory Scene — cannot start without loaded assets), 110 (Floor Tiles — use loaded textures), 111 (Conveyor Belt — uses loaded textures), 113 (Worker Machine — uses loaded sprite sheets), 114 (Package Crate — uses loaded textures)

## Architecture Reference
The BootScene is the first scene in the Phaser scene list. It runs its `preload()` method to load all game assets (sprite sheets, images, tilesets) into Phaser's texture cache. Once loading completes, `create()` transitions to the FactoryScene via `this.scene.start('FactoryScene')`. Placeholder assets are generated programmatically using Phaser's Graphics API if sprite sheet files are not yet available.

## Files and Folders
- `/apps/web/src/phaser/scenes/boot-scene.ts` — BootScene class extending Phaser.Scene
- `/apps/web/src/phaser/assets/` — Directory for placeholder sprite images (or generated at runtime)
- `/apps/web/src/phaser/constants/asset-keys.ts` — String constants for all asset/texture keys

## Acceptance Criteria
- [ ] `BootScene` extends `Phaser.Scene` with key `'BootScene'`
- [ ] `preload()` loads all required sprite sheets: Worker machines, Package crates, floor tiles, wall segments, conveyor belt frames
- [ ] Loading progress bar displayed during preload (using `this.load.on('progress', ...)`)
- [ ] `create()` transitions to `'FactoryScene'` when loading completes
- [ ] Placeholder assets are generated programmatically (colored rectangles/diamonds) if sprite files are not found
- [ ] Asset keys are defined as string constants in a separate file for consistency across scenes
- [ ] Loading errors are caught and logged — scene still transitions with fallback textures
- [ ] All asset keys are documented with their expected sprite sheet dimensions and frame counts
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Use Phaser's `this.make.graphics()` to generate placeholder textures at runtime: draw colored shapes, call `graphics.generateTexture(key, width, height)`, then destroy the graphics object.
- Placeholder textures needed:
  - `'floor-tile'`: 64x32 gray diamond (isometric tile shape)
  - `'wall-segment'`: 64x48 dark rectangle
  - `'conveyor-belt'`: 64x32 sprite sheet with 4 frames (scrolling animation)
  - `'worker-machine'`: 64x64 sprite sheet with frames for idle, working, stuck, error, done states
  - `'package-crate'`: 32x32 colored squares (one per package type)
- The progress bar can be a simple rectangle that fills left-to-right. Use `this.add.rectangle()` for the background and a crop mask or scale for the fill.
- Asset keys should be a `const` object (not an enum) for better tree-shaking: `export const ASSET_KEYS = { FLOOR_TILE: 'floor-tile', ... } as const`.
- If actual PNG/SVG assets are available, load them with `this.load.spritesheet()` or `this.load.image()`. The art pack system (task 112) will later replace placeholders with real art.
- Keep the BootScene minimal — its only job is loading. No game logic, no input handling.
