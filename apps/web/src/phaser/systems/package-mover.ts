import type Phaser from 'phaser';
import type { PackageCrate } from '../objects/package-crate';
import type { WorkerMachine } from '../objects/worker-machine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default duration (ms) for each path segment movement. */
export const DEFAULT_SEGMENT_DURATION = 500;

/** Default easing for path movement. */
export const DEFAULT_MOVE_EASE = 'Sine.easeInOut';

/** Easing for exit-machine animation (slight overshoot). */
export const EXIT_MACHINE_EASE = 'Back.easeOut';

/** Easing for enter-machine animation (accelerate in). */
export const ENTER_MACHINE_EASE = 'Quad.easeIn';

/** Duration (ms) for enter/exit machine animations. */
export const MACHINE_ANIM_DURATION = 300;

/** Scale when crate is "inside" a machine. */
export const MACHINE_SCALE_MIN = 0.3;

// ---------------------------------------------------------------------------
// PackageMover
// ---------------------------------------------------------------------------

/**
 * Scene-level system that orchestrates PackageCrate animations along conveyor
 * belt paths between WorkerMachines.
 *
 * Manages per-crate animation queues so multiple movements on the same crate
 * execute sequentially, while different crates animate simultaneously.
 */
export class PackageMover {
  private readonly scene: Phaser.Scene;
  private readonly animationQueues = new Map<string, Promise<void>>();
  private readonly activeTweens = new Set<Phaser.Tweens.Tween>();
  private speedMultiplier = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // -----------------------------------------------------------------------
  // Speed control
  // -----------------------------------------------------------------------

  /** Set a speed multiplier for all animations (e.g. 2 = double speed). */
  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.max(0.1, multiplier);
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  // -----------------------------------------------------------------------
  // Core animation methods
  // -----------------------------------------------------------------------

  /**
   * Tweens a crate to a target screen position with easing.
   * Queued per-crate so animations don't overlap.
   */
  moveTo(
    crate: PackageCrate,
    targetPosition: { x: number; y: number },
    duration: number = DEFAULT_SEGMENT_DURATION,
  ): Promise<void> {
    return this.enqueue(crate, () => this.doMoveTo(crate, targetPosition, duration));
  }

  /**
   * Animates the crate fading/shrinking into the machine sprite.
   * Queued per-crate.
   */
  enterMachine(crate: PackageCrate, machine: WorkerMachine): Promise<void> {
    return this.enqueue(crate, () => this.doEnterMachine(crate, machine));
  }

  /**
   * Animates the crate appearing/growing from the machine sprite.
   * Queued per-crate.
   */
  exitMachine(crate: PackageCrate, machine: WorkerMachine): Promise<void> {
    return this.enqueue(crate, () => this.doExitMachine(crate, machine));
  }

  /**
   * Moves a crate through multiple waypoints sequentially.
   * Each segment uses the same duration. Queued per-crate.
   */
  moveAlongPath(
    crate: PackageCrate,
    path: { x: number; y: number }[],
    segmentDuration: number = DEFAULT_SEGMENT_DURATION,
  ): Promise<void> {
    return this.enqueue(crate, async () => {
      for (const point of path) {
        await this.doMoveTo(crate, point, segmentDuration);
      }
    });
  }

  /**
   * Orchestrates the full sequence: exit source machine → move along belt
   * path → enter destination machine.
   * Queued per-crate.
   */
  processStep(
    crate: PackageCrate,
    sourceMachine: WorkerMachine,
    destMachine: WorkerMachine,
    beltPath: { x: number; y: number }[],
  ): Promise<void> {
    return this.enqueue(crate, async () => {
      await this.doExitMachine(crate, sourceMachine);
      for (const point of beltPath) {
        await this.doMoveTo(crate, point, DEFAULT_SEGMENT_DURATION);
      }
      await this.doEnterMachine(crate, destMachine);
    });
  }

  // -----------------------------------------------------------------------
  // Queue management
  // -----------------------------------------------------------------------

  /**
   * Enqueues an animation for a specific crate. Animations for the same crate
   * run sequentially; different crates run concurrently.
   */
  private enqueue(crate: PackageCrate, action: () => Promise<void>): Promise<void> {
    const id = crate.packageId;
    const previous = this.animationQueues.get(id);

    // Run synchronously when no pending queue; chain otherwise.
    const next = previous
      ? previous.then(action, () => action())
      : action();
    this.animationQueues.set(id, next);

    // Clean up resolved queue entries to prevent memory leaks
    next.finally(() => {
      if (this.animationQueues.get(id) === next) {
        this.animationQueues.delete(id);
      }
    });

    return next;
  }

  // -----------------------------------------------------------------------
  // Internal tween implementations
  // -----------------------------------------------------------------------

  private doMoveTo(
    crate: PackageCrate,
    target: { x: number; y: number },
    duration: number,
  ): Promise<void> {
    const adjustedDuration = duration / this.speedMultiplier;

    return new Promise<void>((resolve) => {
      const tween = this.scene.tweens.add({
        targets: crate,
        x: target.x,
        y: target.y,
        duration: adjustedDuration,
        ease: DEFAULT_MOVE_EASE,
        onComplete: () => {
          this.activeTweens.delete(tween);
          resolve();
        },
      });
      this.activeTweens.add(tween);
    });
  }

  private doEnterMachine(
    crate: PackageCrate,
    machine: WorkerMachine,
  ): Promise<void> {
    const adjustedDuration = MACHINE_ANIM_DURATION / this.speedMultiplier;

    return new Promise<void>((resolve) => {
      const tween = this.scene.tweens.add({
        targets: crate,
        x: machine.x,
        y: machine.y,
        alpha: 0,
        scaleX: MACHINE_SCALE_MIN,
        scaleY: MACHINE_SCALE_MIN,
        duration: adjustedDuration,
        ease: ENTER_MACHINE_EASE,
        onComplete: () => {
          crate.setVisible(false);
          this.activeTweens.delete(tween);
          resolve();
        },
      });
      this.activeTweens.add(tween);
    });
  }

  private doExitMachine(
    crate: PackageCrate,
    machine: WorkerMachine,
  ): Promise<void> {
    const adjustedDuration = MACHINE_ANIM_DURATION / this.speedMultiplier;

    crate.setPosition(machine.x, machine.y);
    crate.setAlpha(0);
    crate.setScale(MACHINE_SCALE_MIN);
    crate.setVisible(true);

    return new Promise<void>((resolve) => {
      const tween = this.scene.tweens.add({
        targets: crate,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: adjustedDuration,
        ease: EXIT_MACHINE_EASE,
        onComplete: () => {
          this.activeTweens.delete(tween);
          resolve();
        },
      });
      this.activeTweens.add(tween);
    });
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Kills all pending tweens and clears animation queues. */
  destroy(): void {
    for (const tween of this.activeTweens) {
      tween.stop();
    }
    this.activeTweens.clear();
    this.animationQueues.clear();
  }
}
