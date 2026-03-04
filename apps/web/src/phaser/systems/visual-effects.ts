import type Phaser from 'phaser';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Key for the programmatically generated sparkle particle texture. */
export const SPARKLE_TEXTURE_KEY = '__vfx_sparkle__';

/** Sparkle texture radius in pixels. */
export const SPARKLE_RADIUS = 4;

/** Number of particles emitted in a completion burst. */
export const COMPLETION_PARTICLE_COUNT = 15;

/** Particle lifespan in ms. */
export const COMPLETION_PARTICLE_LIFESPAN = 800;

/** Particle speed range (min/max). */
export const COMPLETION_PARTICLE_SPEED = { min: 40, max: 120 } as const;

/** Error shake offset in pixels. */
export const ERROR_SHAKE_OFFSET = 3;

/** Error shake tween duration per half-cycle in ms. */
export const ERROR_SHAKE_DURATION = 50;

/** Error shake yoyo repeat count (3 cycles = 5 yoyo repeats). */
export const ERROR_SHAKE_REPEATS = 5;

/** Error red tint colour. */
export const ERROR_TINT = 0xff0000;

/** Stuck yellow tint colour. */
export const STUCK_TINT = 0xffff00;

/** Stuck pulse tween duration per half-cycle in ms. */
export const STUCK_PULSE_DURATION = 600;

/** Stuck pulse minimum alpha. */
export const STUCK_PULSE_ALPHA = 0.7;

/** New package pop-in overshoot scale. */
export const POP_IN_OVERSHOOT_SCALE = 1.2;

/** New package pop-in total duration in ms. */
export const POP_IN_DURATION = 400;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the user has opted into reduced motion at the OS level.
 * Safe to call in non-browser environments (returns `false`).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// ---------------------------------------------------------------------------
// VisualEffects
// ---------------------------------------------------------------------------

export type StuckEffectCleanup = () => void;

/**
 * Transient visual effects for the factory scene. Every method is static and
 * fire-and-forget — effects auto-cleanup after their duration elapses. The
 * only exception is `stuckEffect` which returns a cleanup handle so the caller
 * can stop the looping glow when the stuck state clears.
 *
 * All effects respect `VisualEffects.enabled` and the user's OS-level
 * `prefers-reduced-motion` setting.
 */
export class VisualEffects {
  /** Master toggle — set to `false` to suppress all effects globally. */
  static enabled = true;

  // -----------------------------------------------------------------------
  // completionEffect — sparkle particle burst
  // -----------------------------------------------------------------------

  /**
   * Sparkle/star particle burst at the given position. Auto-destroys after
   * approximately one second.
   */
  static completionEffect(scene: Phaser.Scene, x: number, y: number): void {
    if (!VisualEffects.shouldPlay()) return;

    VisualEffects.ensureSparkleTexture(scene);

    const emitter = scene.add.particles(x, y, SPARKLE_TEXTURE_KEY, {
      speed: COMPLETION_PARTICLE_SPEED,
      lifespan: COMPLETION_PARTICLE_LIFESPAN,
      quantity: COMPLETION_PARTICLE_COUNT,
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      emitting: false,
    });

    emitter.explode(COMPLETION_PARTICLE_COUNT);

    // Auto-destroy emitter after all particles have expired
    scene.time.delayedCall(COMPLETION_PARTICLE_LIFESPAN + 100, () => {
      emitter.destroy();
    });
  }

  // -----------------------------------------------------------------------
  // errorEffect — shake + red flash
  // -----------------------------------------------------------------------

  /**
   * Brief shake (±3 px, 50 ms intervals, 3 cycles) with a red flash tint on
   * the target sprite. Automatically reverts position and tint on completion.
   */
  static errorEffect(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite): void {
    if (!VisualEffects.shouldPlay()) return;

    const originalX = target.x;
    target.setTint(ERROR_TINT);

    scene.tweens.add({
      targets: target,
      x: originalX + ERROR_SHAKE_OFFSET,
      yoyo: true,
      repeat: ERROR_SHAKE_REPEATS,
      duration: ERROR_SHAKE_DURATION,
      onComplete: () => {
        target.x = originalX;
        target.clearTint();
      },
    });
  }

  // -----------------------------------------------------------------------
  // stuckEffect — pulsing yellow glow
  // -----------------------------------------------------------------------

  /**
   * Pulsing yellow glow (tint oscillation) on the target sprite. Returns a
   * cleanup function that the caller **must** invoke when the stuck state
   * clears to stop the looping effect and restore the sprite.
   */
  static stuckEffect(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Sprite,
  ): StuckEffectCleanup {
    if (!VisualEffects.shouldPlay()) {
      return () => {};
    }

    const tween = scene.tweens.add({
      targets: target,
      alpha: STUCK_PULSE_ALPHA,
      yoyo: true,
      repeat: -1,
      duration: STUCK_PULSE_DURATION,
      onYoyo: () => target.setTint(STUCK_TINT),
      onRepeat: () => target.clearTint(),
    });

    return () => {
      tween.stop();
      target.clearTint();
      target.setAlpha(1);
    };
  }

  // -----------------------------------------------------------------------
  // newPackageEffect — pop-in scale animation
  // -----------------------------------------------------------------------

  /**
   * Pop-in scale animation (0 → 1.2 → 1.0) with a bounce easing over ~400 ms.
   */
  static newPackageEffect(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Sprite,
  ): void {
    if (!VisualEffects.shouldPlay()) return;

    target.setScale(0);

    // Phase 1: scale 0 → 1.2 (60 % of duration)
    scene.tweens.add({
      targets: target,
      scaleX: POP_IN_OVERSHOOT_SCALE,
      scaleY: POP_IN_OVERSHOOT_SCALE,
      duration: POP_IN_DURATION * 0.6,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Phase 2: scale 1.2 → 1.0 (40 % of duration)
        scene.tweens.add({
          targets: target,
          scaleX: 1,
          scaleY: 1,
          duration: POP_IN_DURATION * 0.4,
          ease: 'Sine.easeInOut',
        });
      },
    });
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Returns `true` when effects should play (enabled and no reduced-motion). */
  private static shouldPlay(): boolean {
    return VisualEffects.enabled && !prefersReducedMotion();
  }

  /**
   * Lazily generates the small sparkle circle texture if it doesn't already
   * exist in the scene's texture manager.
   */
  static ensureSparkleTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(SPARKLE_TEXTURE_KEY)) return;

    const diameter = SPARKLE_RADIUS * 2;
    const gfx = scene.make.graphics({ x: 0, y: 0 }, false);
    gfx.fillStyle(0xffd700, 1); // gold
    gfx.fillCircle(SPARKLE_RADIUS, SPARKLE_RADIUS, SPARKLE_RADIUS);
    gfx.generateTexture(SPARKLE_TEXTURE_KEY, diameter, diameter);
    gfx.destroy();
  }
}
