import Phaser from 'phaser';

import { ASSET_KEYS } from '../constants/asset-keys';
import { cartToIso, getDepth } from '../systems/isometric';

/** Texture keys for floor tile variants. */
export const FLOOR_TILE_VARIANTS = {
  DEFAULT: ASSET_KEYS.FLOOR_TILE,
  ROOM: 'floor-tile-room',
  HIGHLIGHT: 'floor-tile-highlight',
} as const;

export type FloorTileVariant =
  (typeof FLOOR_TILE_VARIANTS)[keyof typeof FLOOR_TILE_VARIANTS];

/**
 * Non-interactive isometric diamond floor tile.
 *
 * Uses `Phaser.GameObjects.Image` (not Sprite) for performance since
 * floor tiles have no animation.
 */
export class FloorTile extends Phaser.GameObjects.Image {
  readonly tileX: number;
  readonly tileY: number;

  constructor(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    variant: FloorTileVariant | string = FLOOR_TILE_VARIANTS.DEFAULT,
  ) {
    const iso = cartToIso(tileX, tileY);
    const textureKey = scene.textures.exists(variant)
      ? variant
      : ASSET_KEYS.FLOOR_TILE;

    super(scene, iso.screenX, iso.screenY, textureKey);

    this.tileX = tileX;
    this.tileY = tileY;
    this.setDepth(getDepth(tileX, tileY));

    scene.add.existing(this);
  }

  /** Convenient factory for creating a single floor tile. */
  static create(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    variant?: FloorTileVariant | string,
  ): FloorTile {
    return new FloorTile(scene, tileX, tileY, variant);
  }

  /** Creates a rectangular grid of floor tiles. */
  static createGrid(
    scene: Phaser.Scene,
    width: number,
    height: number,
    variant?: FloorTileVariant | string,
  ): FloorTile[] {
    const tiles: FloorTile[] = [];
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        tiles.push(new FloorTile(scene, col, row, variant));
      }
    }
    return tiles;
  }
}
