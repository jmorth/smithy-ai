/**
 * Asset texture keys used throughout the Phaser scenes.
 *
 * Each key corresponds to a texture loaded (or generated) in BootScene.
 *
 * Sprite sheet dimensions and frame counts:
 *
 * | Key              | Width | Height | Frames | Description                                    |
 * |------------------|-------|--------|--------|------------------------------------------------|
 * | FLOOR_TILE       | 64    | 32     | 1      | Isometric diamond floor tile                   |
 * | WALL_SEGMENT     | 64    | 48     | 1      | Dark rectangle wall piece                      |
 * | CONVEYOR_BELT    | 64    | 32     | 4      | Scrolling animation frames                     |
 * | WORKER_MACHINE   | 64    | 64     | 5      | idle, working, stuck, error, done              |
 * | PACKAGE_CRATE    | 32    | 32     | 1      | Colored square per package type                |
 */
export const ASSET_KEYS = {
  FLOOR_TILE: 'floor-tile',
  WALL_SEGMENT: 'wall-segment',
  CONVEYOR_BELT: 'conveyor-belt',
  WORKER_MACHINE: 'worker-machine',
  PACKAGE_CRATE: 'package-crate',
} as const;

export type AssetKey = (typeof ASSET_KEYS)[keyof typeof ASSET_KEYS];
