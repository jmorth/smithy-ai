import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Phaser mock ────────────────────────────────────────────────────────

let mockImageInstances: MockImage[] = [];

interface MockImage {
  x: number;
  y: number;
  texture: { key: string };
  depth: number;
  tileX?: number;
  tileY?: number;
  setDepth: ReturnType<typeof vi.fn>;
  setAngle: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

vi.mock('phaser', () => {
  class MockImage {
    x: number;
    y: number;
    texture: { key: string };
    depth = 0;

    constructor(scene: unknown, x: number, y: number, textureKey: string) {
      this.x = x;
      this.y = y;
      this.texture = { key: textureKey };
    }

    setDepth = vi.fn((d: number) => {
      this.depth = d;
      return this;
    });

    setAngle = vi.fn().mockReturnThis();

    destroy = vi.fn();
  }

  return {
    default: {
      GameObjects: {
        Image: MockImage,
      },
      Scene: class MockScene {},
    },
    __esModule: true,
  };
});

import Phaser from 'phaser';
import { FloorTile, FLOOR_TILE_VARIANTS } from '../floor-tile';
import { ASSET_KEYS } from '../../constants/asset-keys';
import { cartToIso, getDepth } from '../../systems/isometric';

// ── Scene mock ─────────────────────────────────────────────────────────

function createMockScene(existingTextures: string[] = [ASSET_KEYS.FLOOR_TILE]) {
  return {
    textures: {
      exists: vi.fn((key: string) => existingTextures.includes(key)),
    },
    add: {
      existing: vi.fn((obj: MockImage) => {
        mockImageInstances.push(obj);
      }),
    },
  } as unknown as Phaser.Scene;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('FloorTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImageInstances = [];
  });

  // ─── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('extends Phaser.GameObjects.Image', () => {
      const scene = createMockScene();
      const tile = new FloorTile(scene, 0, 0);
      expect(tile).toBeInstanceOf(Phaser.GameObjects.Image);
    });

    it('stores tileX and tileY as readonly properties', () => {
      const scene = createMockScene();
      const tile = new FloorTile(scene, 5, 3);
      expect(tile.tileX).toBe(5);
      expect(tile.tileY).toBe(3);
    });

    it('positions at correct isometric screen coordinates', () => {
      const scene = createMockScene();
      const tile = new FloorTile(scene, 3, 2);
      const iso = cartToIso(3, 2);
      expect(tile.x).toBe(iso.screenX);
      expect(tile.y).toBe(iso.screenY);
    });

    it('positions origin tile (0,0) at screen origin', () => {
      const scene = createMockScene();
      const tile = new FloorTile(scene, 0, 0);
      expect(tile.x).toBe(0);
      expect(tile.y).toBe(0);
    });

    it('sets correct depth via getDepth', () => {
      const scene = createMockScene();
      const tile = new FloorTile(scene, 4, 6);
      expect(tile.setDepth).toHaveBeenCalledWith(getDepth(4, 6));
    });

    it('uses default FLOOR_TILE texture when no variant specified', () => {
      const scene = createMockScene();
      const tile = new FloorTile(scene, 0, 0);
      expect(tile.texture.key).toBe(ASSET_KEYS.FLOOR_TILE);
    });

    it('uses specified variant texture when it exists', () => {
      const scene = createMockScene([
        ASSET_KEYS.FLOOR_TILE,
        FLOOR_TILE_VARIANTS.ROOM,
      ]);
      const tile = new FloorTile(scene, 0, 0, FLOOR_TILE_VARIANTS.ROOM);
      expect(tile.texture.key).toBe(FLOOR_TILE_VARIANTS.ROOM);
    });

    it('falls back to FLOOR_TILE when variant texture does not exist', () => {
      const scene = createMockScene([ASSET_KEYS.FLOOR_TILE]);
      const tile = new FloorTile(scene, 0, 0, 'nonexistent-texture');
      expect(tile.texture.key).toBe(ASSET_KEYS.FLOOR_TILE);
    });

    it('adds itself to the scene display list', () => {
      const scene = createMockScene();
      const tile = new FloorTile(scene, 0, 0);
      expect(scene.add.existing).toHaveBeenCalledWith(tile);
    });

    it('is non-interactive (no setInteractive call)', () => {
      const scene = createMockScene();
      const tile = new FloorTile(scene, 0, 0);
      // FloorTile never calls setInteractive — it has no such method on mock
      expect(typeof (tile as unknown as Record<string, unknown>).setInteractive).not.toBe('function');
    });
  });

  // ─── Depth sorting ──────────────────────────────────────────────────

  describe('depth sorting', () => {
    it('tiles further from camera have higher depth', () => {
      const scene = createMockScene();
      const near = new FloorTile(scene, 0, 0);
      const far = new FloorTile(scene, 5, 5);
      expect(far.depth).toBeGreaterThan(near.depth);
    });

    it('depth equals x + y', () => {
      const scene = createMockScene();
      const tile = new FloorTile(scene, 7, 3);
      expect(tile.depth).toBe(10);
    });
  });

  // ─── Texture variants ───────────────────────────────────────────────

  describe('texture variants', () => {
    it('FLOOR_TILE_VARIANTS.DEFAULT equals ASSET_KEYS.FLOOR_TILE', () => {
      expect(FLOOR_TILE_VARIANTS.DEFAULT).toBe(ASSET_KEYS.FLOOR_TILE);
    });

    it('defines ROOM variant key', () => {
      expect(FLOOR_TILE_VARIANTS.ROOM).toBe('floor-tile-room');
    });

    it('defines HIGHLIGHT variant key', () => {
      expect(FLOOR_TILE_VARIANTS.HIGHLIGHT).toBe('floor-tile-highlight');
    });

    it('accepts custom string texture keys', () => {
      const scene = createMockScene([
        ASSET_KEYS.FLOOR_TILE,
        'custom-floor-texture',
      ]);
      const tile = new FloorTile(scene, 0, 0, 'custom-floor-texture');
      expect(tile.texture.key).toBe('custom-floor-texture');
    });
  });

  // ─── Static create() ───────────────────────────────────────────────

  describe('FloorTile.create()', () => {
    it('returns a FloorTile instance', () => {
      const scene = createMockScene();
      const tile = FloorTile.create(scene, 2, 3);
      expect(tile).toBeInstanceOf(FloorTile);
    });

    it('passes tileX and tileY to constructor', () => {
      const scene = createMockScene();
      const tile = FloorTile.create(scene, 4, 7);
      expect(tile.tileX).toBe(4);
      expect(tile.tileY).toBe(7);
    });

    it('passes variant to constructor', () => {
      const scene = createMockScene([
        ASSET_KEYS.FLOOR_TILE,
        FLOOR_TILE_VARIANTS.HIGHLIGHT,
      ]);
      const tile = FloorTile.create(scene, 0, 0, FLOOR_TILE_VARIANTS.HIGHLIGHT);
      expect(tile.texture.key).toBe(FLOOR_TILE_VARIANTS.HIGHLIGHT);
    });

    it('uses default variant when not specified', () => {
      const scene = createMockScene();
      const tile = FloorTile.create(scene, 0, 0);
      expect(tile.texture.key).toBe(ASSET_KEYS.FLOOR_TILE);
    });
  });

  // ─── Static createGrid() ───────────────────────────────────────────

  describe('FloorTile.createGrid()', () => {
    it('creates width * height tiles', () => {
      const scene = createMockScene();
      const tiles = FloorTile.createGrid(scene, 4, 3);
      expect(tiles).toHaveLength(12);
    });

    it('returns empty array for zero dimensions', () => {
      const scene = createMockScene();
      expect(FloorTile.createGrid(scene, 0, 5)).toHaveLength(0);
      expect(FloorTile.createGrid(scene, 5, 0)).toHaveLength(0);
    });

    it('tiles cover all grid positions', () => {
      const scene = createMockScene();
      const tiles = FloorTile.createGrid(scene, 3, 2);
      const positions = tiles.map((t) => [t.tileX, t.tileY]);
      expect(positions).toContainEqual([0, 0]);
      expect(positions).toContainEqual([1, 0]);
      expect(positions).toContainEqual([2, 0]);
      expect(positions).toContainEqual([0, 1]);
      expect(positions).toContainEqual([1, 1]);
      expect(positions).toContainEqual([2, 1]);
    });

    it('passes variant to all tiles', () => {
      const scene = createMockScene([
        ASSET_KEYS.FLOOR_TILE,
        FLOOR_TILE_VARIANTS.ROOM,
      ]);
      const tiles = FloorTile.createGrid(scene, 2, 2, FLOOR_TILE_VARIANTS.ROOM);
      for (const tile of tiles) {
        expect(tile.texture.key).toBe(FLOOR_TILE_VARIANTS.ROOM);
      }
    });

    it('each tile has correct isometric coordinates', () => {
      const scene = createMockScene();
      const tiles = FloorTile.createGrid(scene, 3, 3);
      for (const tile of tiles) {
        const expected = cartToIso(tile.tileX, tile.tileY);
        expect(tile.x).toBe(expected.screenX);
        expect(tile.y).toBe(expected.screenY);
      }
    });

    it('each tile has correct depth', () => {
      const scene = createMockScene();
      const tiles = FloorTile.createGrid(scene, 3, 3);
      for (const tile of tiles) {
        expect(tile.depth).toBe(getDepth(tile.tileX, tile.tileY));
      }
    });

    it('adds all tiles to the scene', () => {
      const scene = createMockScene();
      FloorTile.createGrid(scene, 2, 2);
      expect(scene.add.existing).toHaveBeenCalledTimes(4);
    });

    it('creates a 1x1 grid correctly', () => {
      const scene = createMockScene();
      const tiles = FloorTile.createGrid(scene, 1, 1);
      expect(tiles).toHaveLength(1);
      expect(tiles[0]!.tileX).toBe(0);
      expect(tiles[0]!.tileY).toBe(0);
    });
  });
});
