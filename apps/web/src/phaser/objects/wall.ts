import Phaser from 'phaser';

import { ASSET_KEYS } from '../constants/asset-keys';
import { cartToIso, getDepth } from '../systems/isometric';

/** Orientation of a wall segment. */
export type WallOrientation = 'horizontal' | 'vertical';

/** Depth offset so walls render above adjacent floor tiles. */
export const WALL_DEPTH_OFFSET = 0.1;

/**
 * Non-interactive isometric wall segment for room boundaries.
 *
 * Uses `Phaser.GameObjects.Image` (not Sprite) since walls are static.
 * Walls are placed along room edges and rendered slightly above floor
 * tiles at the same position via a depth offset.
 */
export class Wall extends Phaser.GameObjects.Image {
  readonly tileX: number;
  readonly tileY: number;
  readonly orientation: WallOrientation;

  constructor(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    orientation: WallOrientation = 'horizontal',
  ) {
    const iso = cartToIso(tileX, tileY);

    super(scene, iso.screenX, iso.screenY, ASSET_KEYS.WALL_SEGMENT);

    this.tileX = tileX;
    this.tileY = tileY;
    this.orientation = orientation;
    this.setDepth(getDepth(tileX, tileY) + WALL_DEPTH_OFFSET);

    if (orientation === 'vertical') {
      this.setAngle(90);
    }

    scene.add.existing(this);
  }

  /** Convenient factory for creating a single wall segment. */
  static create(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    orientation?: WallOrientation,
  ): Wall {
    return new Wall(scene, tileX, tileY, orientation);
  }
}
