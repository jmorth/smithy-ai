# Task 116: Create Animation Manager

## Summary
Create a centralized AnimationManager that defines all sprite sheet animations for Workers, Packages, conveyor belts, and visual effects. The manager registers animations from sprite sheet frame ranges during scene boot, providing consistent animation keys used by all game objects across the factory floor.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 107 (Boot Scene — sprite sheets must be loaded before animations can be created)
- **Blocks**: 113 (Worker Machine — plays state animations), 114 (Package Crate — plays idle/moving animations)

## Architecture Reference
Phaser animations are global to the game instance — once registered via `scene.anims.create()`, they are available to any sprite in any scene. The AnimationManager centralizes all animation definitions in one place, ensuring consistent frame ranges, durations, and repeat behavior. It is called once during FactoryScene initialization (after BootScene has loaded all textures) to register every animation the factory floor needs.

## Files and Folders
- `/apps/web/src/phaser/systems/animation-manager.ts` — AnimationManager class with animation registration methods

## Acceptance Criteria
- [ ] `AnimationManager.registerAll(scene: Phaser.Scene)` creates all animations from loaded sprite sheets
- [ ] Worker machine animations registered:
  - `'worker-idle'`: gentle animation, loop, ~800ms per cycle
  - `'worker-working'`: active animation, loop, ~400ms per cycle
  - `'worker-stuck'`: flashing animation, loop, ~600ms per cycle
  - `'worker-error'`: error animation, loop, ~500ms per cycle
  - `'worker-done'`: completion animation, plays once or loops slowly
- [ ] Package crate animations registered:
  - `'package-idle'`: static or subtle animation
  - `'package-moving'`: slight wobble during movement
- [ ] Conveyor belt animations registered:
  - `'belt-scrolling'`: belt surface scrolling, loop, ~200ms per frame
  - `'belt-stopped'`: static belt frame
- [ ] Effect animations registered:
  - `'effect-sparkle'`: completion sparkle, plays once
  - `'effect-error-flash'`: error flash, plays once
- [ ] All animation keys are exported as string constants (e.g., `ANIM_KEYS.WORKER_IDLE`)
- [ ] Animations use correct sprite sheet keys and frame ranges from the loaded textures
- [ ] `registerAll` is idempotent — calling it twice does not create duplicate animations
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Animation registration example:
  ```ts
  scene.anims.create({
    key: ANIM_KEYS.WORKER_IDLE,
    frames: scene.anims.generateFrameNumbers(ASSET_KEYS.WORKER_MACHINE, { start: 0, end: 3 }),
    frameRate: 5,
    repeat: -1, // loop
  });
  ```
- Frame ranges depend on the sprite sheet layout. With placeholder textures (task 107), each "animation" may only have 1-2 frames. The frame ranges should be updated when real art packs are created.
- Idempotency: check `scene.anims.exists(key)` before creating each animation to avoid errors on scene restart.
- Export animation keys as a const object:
  ```ts
  export const ANIM_KEYS = {
    WORKER_IDLE: 'worker-idle',
    WORKER_WORKING: 'worker-working',
    // ...
  } as const;
  ```
- For placeholder textures with only 1 frame, create a "static" animation with `repeat: 0` — the visual effect (bobbing, glowing) is handled by tweens in the game object rather than frame animation.
- Consider a `getAnimationConfig(key: string)` helper that returns frame rate and repeat settings, useful if the art pack system (task 112) needs to re-register animations with different frame counts.
- The manager should be called after `BootScene` completes and assets are loaded. Typically called in `FactoryScene.create()` before any game objects are instantiated.
