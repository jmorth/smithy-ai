/** Pixel width of a single isometric tile (2:1 diamond projection). */
export const TILE_WIDTH = 64;

/** Pixel height of a single isometric tile (2:1 diamond projection). */
export const TILE_HEIGHT = 32;

export interface IsoPoint {
  screenX: number;
  screenY: number;
}

export interface CartPoint {
  x: number;
  y: number;
}

export interface TilePoint {
  tileX: number;
  tileY: number;
}

/**
 * Converts cartesian tile coordinates to isometric screen pixel coordinates.
 *
 * Formula (standard 2:1 isometric):
 *   screenX = (x - y) * (TILE_WIDTH / 2)
 *   screenY = (x + y) * (TILE_HEIGHT / 2)
 */
export function cartToIso(x: number, y: number): IsoPoint {
  return {
    screenX: (x - y) * (TILE_WIDTH / 2),
    screenY: (x + y) * (TILE_HEIGHT / 2),
  };
}

/**
 * Converts isometric screen pixel coordinates back to cartesian tile coordinates.
 * Inverse of cartToIso.
 */
export function isoToCart(screenX: number, screenY: number): CartPoint {
  const halfW = TILE_WIDTH / 2;
  const halfH = TILE_HEIGHT / 2;
  return {
    x: (screenX / halfW + screenY / halfH) / 2,
    y: (screenY / halfH - screenX / halfW) / 2,
  };
}

/**
 * Returns a depth value for correct isometric depth sorting.
 * Objects with higher depth render on top (closer to camera).
 */
export function getDepth(x: number, y: number): number {
  return x + y;
}

/**
 * Converts raw screen/pointer coordinates to tile coordinates,
 * accounting for camera scroll offset and zoom level.
 */
export function screenToTile(
  screenX: number,
  screenY: number,
  cameraScrollX: number,
  cameraScrollY: number,
  cameraZoom: number,
): TilePoint {
  const worldX = screenX / cameraZoom + cameraScrollX;
  const worldY = screenY / cameraZoom + cameraScrollY;
  const cart = isoToCart(worldX, worldY);
  return { tileX: cart.x, tileY: cart.y };
}
