# Task 103: Create Phaser Game Config

## Summary
Create the Phaser game configuration object — WebGL renderer with Canvas fallback, transparent background for React overlay compositing, scene list registration, physics disabled, and responsive scale mode that fills the container. This config is consumed by the PhaserGame React wrapper (task 102).

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 102 (Phaser React Wrapper — consumes this config)
- **Blocks**: 104 (Isometric Coordinate System), 105 (Camera Controller), 107 (Boot Scene), 108 (Factory Scene)

## Architecture Reference
The Phaser game config defines how the engine renders and manages the game. It is a `Phaser.Types.Core.GameConfig` object passed to `new Phaser.Game(config)`. The config uses `Phaser.AUTO` for renderer selection (WebGL preferred, Canvas fallback), transparent background so the React page background shows through, and `Phaser.Scale.RESIZE` so the canvas automatically adapts to the container size. Physics is disabled since the factory floor uses tweens for movement, not physics simulation.

## Files and Folders
- `/apps/web/src/phaser/config.ts` — Phaser game configuration factory function

## Acceptance Criteria
- [ ] Config uses `type: Phaser.AUTO` (WebGL with Canvas fallback)
- [ ] Config sets `transparent: true` so the React background is visible behind the canvas
- [ ] Config uses `scale.mode: Phaser.Scale.RESIZE` to fill the container responsively
- [ ] Config accepts a `parent` parameter (DOM element from React ref) for canvas attachment
- [ ] Config registers scenes in order: `[BootScene, FactoryScene]` (imported from scene files)
- [ ] Config disables physics: `physics: { default: false }` or physics section omitted
- [ ] Config enables antialiasing: `render.antialias: true`
- [ ] Config sets `render.pixelArt: false` (smooth scaling for AI-generated art)
- [ ] Config is exported as a function `createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig` so the parent element can be injected
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Export a factory function rather than a static object because the `parent` element is only available at mount time from the React ref.
- Scene classes are imported and listed in the `scene` array. They will be defined in tasks 107 and 108 — use placeholder imports or create stub scene files initially.
- `transparent: true` is critical for the overlay pattern. Without it, the canvas draws an opaque background that hides React elements behind it.
- `Phaser.Scale.RESIZE` automatically adjusts the canvas size when the container or window resizes. Combined with the React wrapper's full-viewport container, this gives responsive behavior.
- Set `audio.disableWebAudio: true` initially since the factory floor has no audio. This avoids browser autoplay policy warnings.
- Consider setting `banner: false` to suppress the Phaser version banner in the console during production builds.
- The `input.activePointers` default (2) is sufficient for drag-to-pan. Increase if multi-touch gestures are needed later.
