import Phaser from 'phaser';

import { ASSET_KEYS } from '../constants/asset-keys';
import { cartToIso, getDepth } from '../systems/isometric';

/** Depth offset so conveyor belts render above floor tiles but below machines. */
export const CONVEYOR_DEPTH_OFFSET = 0.05;

/** Spacing between belt segment centres (in tile units). */
export const SEGMENT_SPACING = 0.5;

/** Animation speed in milliseconds per frame. */
export const FRAME_DURATION_MS = 150;

/** Total frames in the conveyor belt spritesheet. */
export const TOTAL_FRAMES = 4;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export interface BeltPoint {
  x: number;
  y: number;
}

/**
 * Generates evenly-spaced segment positions along a polyline path.
 *
 * For straight belts: interpolates between start and end.
 * For L-shaped belts: follows waypoints in order.
 */
export function computeSegmentPositions(
  start: BeltPoint,
  end: BeltPoint,
  waypoints: BeltPoint[] = [],
  spacing: number = SEGMENT_SPACING,
): BeltPoint[] {
  const polyline = [start, ...waypoints, end];
  const positions: BeltPoint[] = [];

  for (let i = 0; i < polyline.length - 1; i++) {
    const from = polyline[i]!;
    const to = polyline[i + 1]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) continue;

    const segmentCount = Math.max(1, Math.round(length / spacing));
    const stepX = dx / segmentCount;
    const stepY = dy / segmentCount;

    // Start at 0.5 steps in, end at 0.5 steps before next node
    // to centre segments within each leg, avoiding overlap at waypoints
    for (let s = 0; s < segmentCount; s++) {
      positions.push({
        x: from.x + stepX * (s + 0.5),
        y: from.y + stepY * (s + 0.5),
      });
    }
  }

  return positions;
}

// ---------------------------------------------------------------------------
// ConveyorBelt
// ---------------------------------------------------------------------------

export interface ConveyorBeltConfig {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  waypoints?: BeltPoint[];
}

/**
 * An animated conveyor belt connecting two machine positions.
 *
 * Composed of multiple segment sprites placed along the path between
 * two isometric positions. Supports straight and L-shaped routing.
 *
 * Non-interactive — clicks pass through to floor tiles below.
 */
export class ConveyorBelt extends Phaser.GameObjects.Container {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly waypoints: BeltPoint[];

  private segments: Phaser.GameObjects.Sprite[] = [];
  private animating = false;
  private forward = true;
  private elapsed = 0;

  constructor(scene: Phaser.Scene, config: ConveyorBeltConfig) {
    super(scene, 0, 0);

    this.startX = config.startX;
    this.startY = config.startY;
    this.endX = config.endX;
    this.endY = config.endY;
    this.waypoints = config.waypoints ?? [];

    this.createSegments();

    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
  }

  // -----------------------------------------------------------------------
  // Segment creation
  // -----------------------------------------------------------------------

  private createSegments(): void {
    const positions = computeSegmentPositions(
      { x: this.startX, y: this.startY },
      { x: this.endX, y: this.endY },
      this.waypoints,
    );

    for (const pos of positions) {
      const iso = cartToIso(pos.x, pos.y);
      const sprite = new Phaser.GameObjects.Sprite(
        this.scene,
        iso.screenX,
        iso.screenY,
        ASSET_KEYS.CONVEYOR_BELT,
        0,
      );

      sprite.setDepth(getDepth(pos.x, pos.y) + CONVEYOR_DEPTH_OFFSET);

      this.segments.push(sprite);
      this.scene.add.existing(sprite);
    }
  }

  // -----------------------------------------------------------------------
  // Animation control
  // -----------------------------------------------------------------------

  /** Starts the belt scrolling animation. */
  activate(): void {
    this.animating = true;
  }

  /** Stops the belt animation (all segments freeze at current frame). */
  deactivate(): void {
    this.animating = false;
  }

  /** Returns whether the belt is currently animating. */
  isActive(): boolean {
    return this.animating;
  }

  /** Controls animation direction. `true` = forward, `false` = reverse. */
  setDirection(forward: boolean): void {
    this.forward = forward;
  }

  /** Returns the current animation direction. */
  getDirection(): boolean {
    return this.forward;
  }

  /**
   * Advances the belt animation. Call from the scene's `update()`.
   *
   * @param delta - Milliseconds since last frame (from Phaser update loop).
   */
  updateAnimation(delta: number): void {
    if (!this.animating) return;

    this.elapsed += delta;

    const frameIndex = this.forward
      ? Math.floor(this.elapsed / FRAME_DURATION_MS) % TOTAL_FRAMES
      : (TOTAL_FRAMES - 1 - (Math.floor(this.elapsed / FRAME_DURATION_MS) % TOTAL_FRAMES));

    for (const segment of this.segments) {
      segment.setFrame(frameIndex);
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Returns the current segment sprites (for testing / inspection). */
  getSegments(): readonly Phaser.GameObjects.Sprite[] {
    return this.segments;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Destroys all segment sprites and the container. */
  destroy(fromScene?: boolean): void {
    for (const segment of this.segments) {
      segment.destroy();
    }
    this.segments = [];
    super.destroy(fromScene);
  }

  // -----------------------------------------------------------------------
  // Static factory
  // -----------------------------------------------------------------------

  /** Convenient factory for creating a conveyor belt. */
  static create(
    scene: Phaser.Scene,
    config: ConveyorBeltConfig,
  ): ConveyorBelt {
    return new ConveyorBelt(scene, config);
  }
}
