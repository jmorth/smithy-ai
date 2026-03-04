import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Phaser mock ────────────────────────────────────────────────────────

interface MockImage {
  x: number;
  y: number;
  texture: { key: string };
  depth: number;
  angle: number;
  setDepth: ReturnType<typeof vi.fn>;
  setAngle: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

let mockImageInstances: MockImage[] = [];

vi.mock('phaser', () => {
  class MockImage {
    x: number;
    y: number;
    texture: { key: string };
    depth = 0;
    angle = 0;

    constructor(scene: unknown, x: number, y: number, textureKey: string) {
      this.x = x;
      this.y = y;
      this.texture = { key: textureKey };
    }

    setDepth = vi.fn((d: number) => {
      this.depth = d;
      return this;
    });

    setAngle = vi.fn((a: number) => {
      this.angle = a;
      return this;
    });

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
import { Wall, WALL_DEPTH_OFFSET } from '../wall';
import { ASSET_KEYS } from '../../constants/asset-keys';
import { cartToIso, getDepth } from '../../systems/isometric';

// ── Scene mock ─────────────────────────────────────────────────────────

function createMockScene() {
  return {
    textures: {
      exists: vi.fn(() => true),
    },
    add: {
      existing: vi.fn((obj: MockImage) => {
        mockImageInstances.push(obj);
      }),
    },
  } as unknown as Phaser.Scene;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Wall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImageInstances = [];
  });

  // ─── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('extends Phaser.GameObjects.Image', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 0, 0);
      expect(wall).toBeInstanceOf(Phaser.GameObjects.Image);
    });

    it('stores tileX and tileY as readonly properties', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 3, 7);
      expect(wall.tileX).toBe(3);
      expect(wall.tileY).toBe(7);
    });

    it('stores orientation as readonly property', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 0, 0, 'vertical');
      expect(wall.orientation).toBe('vertical');
    });

    it('defaults orientation to horizontal', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 0, 0);
      expect(wall.orientation).toBe('horizontal');
    });

    it('positions at correct isometric screen coordinates', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 5, 3);
      const iso = cartToIso(5, 3);
      expect(wall.x).toBe(iso.screenX);
      expect(wall.y).toBe(iso.screenY);
    });

    it('uses WALL_SEGMENT texture', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 0, 0);
      expect(wall.texture.key).toBe(ASSET_KEYS.WALL_SEGMENT);
    });

    it('adds itself to the scene display list', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 0, 0);
      expect(scene.add.existing).toHaveBeenCalledWith(wall);
    });
  });

  // ─── Depth sorting ──────────────────────────────────────────────────

  describe('depth sorting', () => {
    it('renders above floor tiles at the same position', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 4, 6);
      const floorDepth = getDepth(4, 6);
      expect(wall.depth).toBeGreaterThan(floorDepth);
    });

    it('depth equals getDepth + WALL_DEPTH_OFFSET', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 3, 2);
      expect(wall.setDepth).toHaveBeenCalledWith(
        getDepth(3, 2) + WALL_DEPTH_OFFSET,
      );
    });

    it('WALL_DEPTH_OFFSET is 0.1', () => {
      expect(WALL_DEPTH_OFFSET).toBe(0.1);
    });

    it('walls further from camera have higher depth', () => {
      const scene = createMockScene();
      const near = new Wall(scene, 0, 0);
      const far = new Wall(scene, 5, 5);
      expect(far.depth).toBeGreaterThan(near.depth);
    });
  });

  // ─── Orientation ────────────────────────────────────────────────────

  describe('orientation', () => {
    it('horizontal wall does not rotate', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 0, 0, 'horizontal');
      expect(wall.setAngle).not.toHaveBeenCalled();
    });

    it('vertical wall rotates 90 degrees', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 0, 0, 'vertical');
      expect(wall.setAngle).toHaveBeenCalledWith(90);
    });

    it('default orientation does not rotate', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 0, 0);
      expect(wall.setAngle).not.toHaveBeenCalled();
    });
  });

  // ─── Non-interactive ────────────────────────────────────────────────

  describe('non-interactive', () => {
    it('does not call setInteractive', () => {
      const scene = createMockScene();
      const wall = new Wall(scene, 0, 0);
      expect(
        (wall as unknown as { setInteractive?: ReturnType<typeof vi.fn> }).setInteractive,
      ).toBeUndefined();
    });
  });

  // ─── Static create() ───────────────────────────────────────────────

  describe('Wall.create()', () => {
    it('returns a Wall instance', () => {
      const scene = createMockScene();
      const wall = Wall.create(scene, 2, 3);
      expect(wall).toBeInstanceOf(Wall);
    });

    it('passes tileX and tileY to constructor', () => {
      const scene = createMockScene();
      const wall = Wall.create(scene, 4, 7);
      expect(wall.tileX).toBe(4);
      expect(wall.tileY).toBe(7);
    });

    it('passes orientation to constructor', () => {
      const scene = createMockScene();
      const wall = Wall.create(scene, 0, 0, 'vertical');
      expect(wall.orientation).toBe('vertical');
    });

    it('defaults orientation to horizontal', () => {
      const scene = createMockScene();
      const wall = Wall.create(scene, 0, 0);
      expect(wall.orientation).toBe('horizontal');
    });

    it('positions at correct isometric coordinates', () => {
      const scene = createMockScene();
      const wall = Wall.create(scene, 6, 2);
      const iso = cartToIso(6, 2);
      expect(wall.x).toBe(iso.screenX);
      expect(wall.y).toBe(iso.screenY);
    });
  });
});
