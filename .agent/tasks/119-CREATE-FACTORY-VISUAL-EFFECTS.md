# Task 119: Create Factory Visual Effects

## Summary
Create visual feedback effects for factory events — particle effects on Package completion, shake effect on errors, glow effects on state changes, and pop-in animations for new Packages. These effects provide satisfying visual feedback that communicates workflow state changes at a glance without requiring text or panel inspection.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 108 (Factory Scene — effects are rendered in the scene)
- **Blocks**: None (enhances visual quality but is not a dependency for other tasks)

## Architecture Reference
Visual effects are transient, auto-cleaning Phaser game objects (particles, tweens, graphics overlays) triggered by the RealtimeSync system or direct scene events. The VisualEffects system is a utility class instantiated by the FactoryScene that exposes methods for each effect type. Effects do not persist — they play once and clean up automatically, ensuring no memory leaks from accumulated effect objects.

## Files and Folders
- `/apps/web/src/phaser/systems/visual-effects.ts` — VisualEffects system class

## Acceptance Criteria
- [ ] `completionEffect(scene: Phaser.Scene, x: number, y: number)` — sparkle/star particle burst at the given position, auto-destroys after ~1 second
- [ ] `errorEffect(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite)` — brief shake (±3px, 50ms intervals, 3 cycles) + red flash tint on the target sprite, auto-reverts
- [ ] `stuckEffect(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite)` — pulsing yellow glow (tint oscillation), returns a handle to stop the effect
- [ ] `newPackageEffect(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite)` — pop-in scale animation (0→1.2→1.0) with slight bounce easing, ~400ms
- [ ] Effects do not block the game loop (all async/tween-based)
- [ ] Particle effects auto-cleanup: particle emitters are destroyed after their lifespan expires
- [ ] `stuckEffect` returns a cleanup function or handle so the caller can stop the pulsing when the stuck state clears
- [ ] Effects work at any zoom level (scale particles/distances relative to camera zoom or use fixed screen-space sizes)
- [ ] No memory leaks: repeated effect triggers do not accumulate game objects
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Phaser 3 particle system: use `scene.add.particles(x, y, textureKey, emitterConfig)` with a short `lifespan` and `quantity` burst. The particle manager auto-removes dead particles.
- For the sparkle effect, create a small white/gold circle texture programmatically (or use a loaded sparkle texture) and emit 10-20 particles in a burst with random velocities and fade-out alpha.
- Shake effect implementation:
  ```ts
  errorEffect(scene, target) {
    const originalX = target.x;
    target.setTint(0xff0000);
    scene.tweens.add({
      targets: target, x: originalX + 3, yoyo: true, repeat: 5,
      duration: 50, onComplete: () => { target.x = originalX; target.clearTint(); }
    });
  }
  ```
- Stuck effect: use a looping tween that oscillates the tint between normal and yellow:
  ```ts
  stuckEffect(scene, target) {
    const tween = scene.tweens.add({
      targets: target, alpha: 0.7, yoyo: true, repeat: -1, duration: 600,
      onYoyo: () => target.setTint(0xffff00),
      onRepeat: () => target.clearTint(),
    });
    return () => { tween.stop(); target.clearTint(); target.setAlpha(1); };
  }
  ```
- For the `newPackageEffect`, use `Phaser.Math.Easing.Back.Out` for the bounce.
- Consider adding a `VisualEffects.enabled` flag that disables all effects (for performance mode or accessibility — reduced motion preference).
- Check `window.matchMedia('(prefers-reduced-motion: reduce)')` and skip animations if the user has reduced motion enabled.
