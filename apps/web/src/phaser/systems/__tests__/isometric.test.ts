import { describe, it, expect } from 'vitest';

import {
  TILE_WIDTH,
  TILE_HEIGHT,
  cartToIso,
  isoToCart,
  getDepth,
  screenToTile,
} from '../isometric';

describe('isometric coordinate system', () => {
  describe('constants', () => {
    it('exports TILE_WIDTH as 64', () => {
      expect(TILE_WIDTH).toBe(64);
    });

    it('exports TILE_HEIGHT as 32', () => {
      expect(TILE_HEIGHT).toBe(32);
    });
  });

  describe('cartToIso', () => {
    it('converts origin (0,0) to screen origin (0,0)', () => {
      const result = cartToIso(0, 0);
      expect(result).toEqual({ screenX: 0, screenY: 0 });
    });

    it('converts (1,0) to (TILE_WIDTH/2, TILE_HEIGHT/2)', () => {
      const result = cartToIso(1, 0);
      expect(result).toEqual({ screenX: 32, screenY: 16 });
    });

    it('converts (0,1) to (-TILE_WIDTH/2, TILE_HEIGHT/2)', () => {
      const result = cartToIso(0, 1);
      expect(result).toEqual({ screenX: -32, screenY: 16 });
    });

    it('converts (1,1) to (0, TILE_HEIGHT)', () => {
      const result = cartToIso(1, 1);
      expect(result).toEqual({ screenX: 0, screenY: 32 });
    });

    it('handles negative coordinates', () => {
      const result = cartToIso(-1, -1);
      expect(result).toEqual({ screenX: 0, screenY: -32 });
    });

    it('handles fractional coordinates for sub-tile positioning', () => {
      const result = cartToIso(0.5, 0.5);
      expect(result).toEqual({ screenX: 0, screenY: 16 });
    });

    it('converts (3, 2) correctly using formula screenX=(x-y)*32, screenY=(x+y)*16', () => {
      // screenX = (3-2)*32 = 32, screenY = (3+2)*16 = 80
      const result = cartToIso(3, 2);
      expect(result).toEqual({ screenX: 32, screenY: 80 });
    });
  });

  describe('isoToCart', () => {
    it('converts screen origin (0,0) to cartesian origin (0,0)', () => {
      const result = isoToCart(0, 0);
      expect(result).toEqual({ x: 0, y: 0 });
    });

    it('converts (32, 16) back to (1, 0)', () => {
      const result = isoToCart(32, 16);
      expect(result).toEqual({ x: 1, y: 0 });
    });

    it('converts (-32, 16) back to (0, 1)', () => {
      const result = isoToCart(-32, 16);
      expect(result).toEqual({ x: 0, y: 1 });
    });

    it('converts (0, 32) back to (1, 1)', () => {
      const result = isoToCart(0, 32);
      expect(result).toEqual({ x: 1, y: 1 });
    });

    it('handles negative screen coordinates', () => {
      const result = isoToCart(0, -32);
      expect(result).toEqual({ x: -1, y: -1 });
    });
  });

  describe('round-trip accuracy', () => {
    const testCases = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, -1],
      [5, 3],
      [0.5, 0.25],
      [10, 7],
      [-3, 4],
      [100, 200],
    ] as const;

    for (const [x, y] of testCases) {
      it(`isoToCart(cartToIso(${x}, ${y})) returns original coordinates`, () => {
        const iso = cartToIso(x, y);
        const cart = isoToCart(iso.screenX, iso.screenY);
        expect(cart.x).toBeCloseTo(x, 10);
        expect(cart.y).toBeCloseTo(y, 10);
      });
    }

    for (const [x, y] of testCases) {
      it(`cartToIso(isoToCart(${x}, ${y})) returns original screen coordinates`, () => {
        const cart = isoToCart(x, y);
        const iso = cartToIso(cart.x, cart.y);
        expect(iso.screenX).toBeCloseTo(x, 10);
        expect(iso.screenY).toBeCloseTo(y, 10);
      });
    }
  });

  describe('getDepth', () => {
    it('returns 0 for origin', () => {
      expect(getDepth(0, 0)).toBe(0);
    });

    it('returns x + y', () => {
      expect(getDepth(3, 2)).toBe(5);
    });

    it('objects with higher (x+y) have higher depth', () => {
      expect(getDepth(5, 5)).toBeGreaterThan(getDepth(3, 3));
    });

    it('handles negative coordinates', () => {
      expect(getDepth(-1, -2)).toBe(-3);
    });

    it('handles fractional coordinates', () => {
      expect(getDepth(0.5, 0.5)).toBe(1);
    });
  });

  describe('screenToTile', () => {
    it('converts screen origin with no camera offset to tile origin', () => {
      const result = screenToTile(0, 0, 0, 0, 1);
      expect(result.tileX).toBeCloseTo(0, 10);
      expect(result.tileY).toBeCloseTo(0, 10);
    });

    it('accounts for camera scroll position', () => {
      // worldX = screenX / zoom + cameraScrollX = 0/1 + 32 = 32
      // worldY = screenY / zoom + cameraScrollY = 0/1 + 16 = 16
      // isoToCart(32, 16) = (1, 0)
      const result = screenToTile(0, 0, 32, 16, 1);
      expect(result.tileX).toBeCloseTo(1, 10);
      expect(result.tileY).toBeCloseTo(0, 10);
    });

    it('accounts for camera zoom', () => {
      // zoom=2: worldX = 64/2 + 0 = 32, worldY = 32/2 + 0 = 16
      // isoToCart(32, 16) = (1, 0)
      const result = screenToTile(64, 32, 0, 0, 2);
      expect(result.tileX).toBeCloseTo(1, 10);
      expect(result.tileY).toBeCloseTo(0, 10);
    });

    it('combines scroll and zoom correctly', () => {
      // zoom=0.5: worldX = 16/0.5 + 0 = 32, worldY = 8/0.5 + 0 = 16
      // isoToCart(32, 16) = (1, 0)
      const result = screenToTile(16, 8, 0, 0, 0.5);
      expect(result.tileX).toBeCloseTo(1, 10);
      expect(result.tileY).toBeCloseTo(0, 10);
    });

    it('returns fractional tile coordinates for sub-tile positions', () => {
      // worldX = 16/1 + 0 = 16, worldY = 8/1 + 0 = 8
      // isoToCart(16, 8) = (16/32 + 8/16)/2 = (0.5+0.5)/2 = 0.5, (8/16 - 16/32)/2 = (0.5-0.5)/2 = 0
      const result = screenToTile(16, 8, 0, 0, 1);
      expect(result.tileX).toBeCloseTo(0.5, 10);
      expect(result.tileY).toBeCloseTo(0, 10);
    });
  });

  describe('purity and independence', () => {
    it('cartToIso has no side effects (same input always same output)', () => {
      const a = cartToIso(5, 3);
      const b = cartToIso(5, 3);
      expect(a).toEqual(b);
      expect(a).not.toBe(b); // fresh object each call
    });

    it('isoToCart has no side effects (same input always same output)', () => {
      const a = isoToCart(32, 16);
      const b = isoToCart(32, 16);
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });

    it('getDepth is deterministic', () => {
      expect(getDepth(3, 4)).toBe(getDepth(3, 4));
    });

    it('screenToTile is deterministic', () => {
      const a = screenToTile(100, 50, 10, 20, 1.5);
      const b = screenToTile(100, 50, 10, 20, 1.5);
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });
  });
});
