import Phaser from 'phaser';

import { ASSET_KEYS } from '../constants/asset-keys';
import type { PhaserBridge } from '../bridge';
import { getDepth } from '../systems/isometric';
import { PackageType } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Depth offset so crates render above belts (0.05) but below machines (0.1). */
export const CRATE_DEPTH_OFFSET = 0.07;

/** Color tints per PackageType for at-a-glance visual differentiation. */
export const PACKAGE_TYPE_COLORS: Record<string, number> = {
  [PackageType.USER_INPUT]: 0x4488ff,
  [PackageType.CODE]: 0x44ff88,
  [PackageType.SPECIFICATION]: 0xff8844,
  [PackageType.IMAGE]: 0x8844ff,
  [PackageType.PULL_REQUEST]: 0xcccccc,
};

/** Fallback tint for unknown package types. */
export const DEFAULT_PACKAGE_COLOR = 0xaaaaaa;

/** Duration (ms) for enterMachine / exitMachine animations. */
const MACHINE_ANIM_DURATION = 300;

/** Scale value when crate is "inside" a machine. */
const MACHINE_SCALE_MIN = 0.3;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PackageCrateConfig {
  screenX: number;
  screenY: number;
  packageId: string;
  packageType: string;
  bridge?: PhaserBridge;
  /** Optional sub-depth offset to prevent z-fighting between simultaneous crates. */
  depthTieBreaker?: number;
}

// ---------------------------------------------------------------------------
// PackageCrate
// ---------------------------------------------------------------------------

/**
 * Small crate sprite representing a Package on the isometric factory floor.
 *
 * Color-coded by PackageType, clickable for detail panel display, with smooth
 * tweening for conveyor belt movement and enter/exit machine animations.
 */
export class PackageCrate extends Phaser.GameObjects.Sprite {
  readonly packageId: string;
  readonly packageType: string;

  private bridge: PhaserBridge | null;
  private activeTweens: Phaser.Tweens.Tween[] = [];

  constructor(scene: Phaser.Scene, config: PackageCrateConfig) {
    super(scene, config.screenX, config.screenY, ASSET_KEYS.PACKAGE_CRATE, 0);

    this.packageId = config.packageId;
    this.packageType = config.packageType;
    this.bridge = config.bridge ?? null;

    const color = PACKAGE_TYPE_COLORS[config.packageType] ?? DEFAULT_PACKAGE_COLOR;
    this.setTint(color);

    // Depth: above belts (0.05), below machines (0.1). Use screen coords to
    // approximate tile position for depth sorting, plus a tie-breaker.
    const tieBreaker = config.depthTieBreaker ?? 0;
    this.setDepth(this.computeDepthFromScreen(config.screenX, config.screenY) + tieBreaker);

    this.setInteractive({ useHandCursor: true });
    this.registerInputListeners();

    scene.add.existing(this as unknown as Phaser.GameObjects.Sprite);
  }

  // -----------------------------------------------------------------------
  // Depth helpers
  // -----------------------------------------------------------------------

  private computeDepthFromScreen(screenX: number, screenY: number): number {
    // Use screenY as a rough proxy for depth (higher Y = closer to camera).
    // Normalise to a reasonable range so it interleaves with tile-based depths.
    // For isometric grids: depth ≈ tileX + tileY. screenY = (tileX+tileY)*16
    // so tileX+tileY ≈ screenY/16. We add CRATE_DEPTH_OFFSET on top.
    return screenY / 16 + CRATE_DEPTH_OFFSET;
  }

  /** Update depth when position changes (e.g. after moveTo). */
  private refreshDepth(): void {
    const tieBreaker = this.depth - this.computeDepthFromScreen(this.x, this.y);
    // Clamp tieBreaker to a small range to avoid drift
    const clampedTieBreaker = Math.max(0, Math.min(tieBreaker, 0.06));
    this.setDepth(this.computeDepthFromScreen(this.x, this.y) + clampedTieBreaker);
  }

  // -----------------------------------------------------------------------
  // Movement
  // -----------------------------------------------------------------------

  /**
   * Tweens the crate to a new screen position with easing.
   * Returns a Promise that resolves when the tween completes.
   */
  moveTo(screenX: number, screenY: number, duration: number): Promise<void> {
    return new Promise((resolve) => {
      const tween = this.scene.tweens.add({
        targets: this,
        x: screenX,
        y: screenY,
        duration,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          this.refreshDepth();
        },
        onComplete: () => {
          this.removeTween(tween);
          resolve();
        },
      });
      this.activeTweens.push(tween);
    });
  }

  // -----------------------------------------------------------------------
  // Machine enter/exit animations
  // -----------------------------------------------------------------------

  /**
   * Fades and shrinks the crate into a machine sprite, then hides it.
   */
  enterMachine(machineSprite: Phaser.GameObjects.Sprite): Promise<void> {
    return new Promise((resolve) => {
      const tween = this.scene.tweens.add({
        targets: this,
        x: machineSprite.x,
        y: machineSprite.y,
        alpha: 0,
        scaleX: MACHINE_SCALE_MIN,
        scaleY: MACHINE_SCALE_MIN,
        duration: MACHINE_ANIM_DURATION,
        ease: 'Sine.easeIn',
        onComplete: () => {
          this.setVisible(false);
          this.removeTween(tween);
          resolve();
        },
      });
      this.activeTweens.push(tween);
    });
  }

  /**
   * Shows the crate at a machine's position and grows/fades it back in.
   */
  exitMachine(machineSprite: Phaser.GameObjects.Sprite): Promise<void> {
    this.setPosition(machineSprite.x, machineSprite.y);
    this.setAlpha(0);
    this.setScale(MACHINE_SCALE_MIN);
    this.setVisible(true);

    return new Promise((resolve) => {
      const tween = this.scene.tweens.add({
        targets: this,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: MACHINE_ANIM_DURATION,
        ease: 'Sine.easeOut',
        onComplete: () => {
          this.refreshDepth();
          this.removeTween(tween);
          resolve();
        },
      });
      this.activeTweens.push(tween);
    });
  }

  // -----------------------------------------------------------------------
  // Input listeners
  // -----------------------------------------------------------------------

  private registerInputListeners(): void {
    this.on('pointerdown', this.onPointerDown, this);
  }

  private onPointerDown(): void {
    if (this.bridge) {
      this.bridge.onPackageClicked(this.packageId);
    }
  }

  // -----------------------------------------------------------------------
  // Tween management
  // -----------------------------------------------------------------------

  private removeTween(tween: Phaser.Tweens.Tween): void {
    const idx = this.activeTweens.indexOf(tween);
    if (idx !== -1) {
      this.activeTweens.splice(idx, 1);
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  destroy(fromScene?: boolean): void {
    this.off('pointerdown', this.onPointerDown, this);

    for (const tween of this.activeTweens) {
      tween.stop();
    }
    this.activeTweens = [];

    super.destroy(fromScene);
  }

  // -----------------------------------------------------------------------
  // Static factory
  // -----------------------------------------------------------------------

  static create(scene: Phaser.Scene, config: PackageCrateConfig): PackageCrate {
    return new PackageCrate(scene, config);
  }
}
