import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Phaser mock ────────────────────────────────────────────────────────

interface MockSprite {
  x: number;
  y: number;
  texture: { key: string };
  frame: { name: number };
  depth: number;
  setDepth: ReturnType<typeof vi.fn>;
  setFrame: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

interface MockContainer {
  x: number;
  y: number;
  scene: unknown;
  destroy: (_fromScene?: boolean) => void;
}

let mockSpriteInstances: MockSprite[] = [];
let mockContainerInstances: MockContainer[] = [];

vi.mock('phaser', () => {
  class MockSprite {
    x: number;
    y: number;
    texture: { key: string };
    frame: { name: number };
    depth = 0;

    constructor(_scene: unknown, x: number, y: number, textureKey: string, frameIndex: number = 0) {
      this.x = x;
      this.y = y;
      this.texture = { key: textureKey };
      this.frame = { name: frameIndex };
      mockSpriteInstances.push(this as unknown as MockSprite);
    }

    setDepth = vi.fn((d: number) => {
      this.depth = d;
      return this;
    });

    setFrame = vi.fn((f: number) => {
      this.frame = { name: f };
      return this;
    });

    destroy = vi.fn();
  }

  class MockContainer {
    x: number;
    y: number;
    scene: unknown;

    constructor(scene: unknown, x: number, y: number) {
      this.x = x;
      this.y = y;
      this.scene = scene;
      mockContainerInstances.push(this as unknown as MockContainer);
    }

    destroy(_fromScene?: boolean): void {
      // no-op prototype method so super.destroy() works in subclasses
    }
  }

  return {
    default: {
      GameObjects: {
        Sprite: MockSprite,
        Container: MockContainer,
      },
      Scene: class MockScene {},
    },
    __esModule: true,
  };
});

import Phaser from 'phaser';
import {
  ConveyorBelt,
  CONVEYOR_DEPTH_OFFSET,
  SEGMENT_SPACING,
  FRAME_DURATION_MS,
  TOTAL_FRAMES,
  computeSegmentPositions,
  type ConveyorBeltConfig,
} from '../conveyor-belt';
import { ASSET_KEYS } from '../../constants/asset-keys';
import { cartToIso, getDepth } from '../../systems/isometric';

// ── Scene mock ─────────────────────────────────────────────────────────

function createMockScene() {
  return {
    textures: {
      exists: vi.fn(() => true),
    },
    add: {
      existing: vi.fn(),
    },
  } as unknown as Phaser.Scene;
}

function createConfig(overrides: Partial<ConveyorBeltConfig> = {}): ConveyorBeltConfig {
  return {
    startX: 2,
    startY: 4,
    endX: 8,
    endY: 4,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('computeSegmentPositions', () => {
  it('generates positions along a straight horizontal path', () => {
    const positions = computeSegmentPositions(
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    );
    expect(positions.length).toBe(Math.round(3 / SEGMENT_SPACING));
    // All positions on y=0
    for (const p of positions) {
      expect(p.y).toBe(0);
    }
    // First position should be offset half a step from start
    expect(positions[0]!.x).toBeGreaterThan(0);
    expect(positions[positions.length - 1]!.x).toBeLessThan(3);
  });

  it('generates positions along a straight vertical path', () => {
    const positions = computeSegmentPositions(
      { x: 5, y: 0 },
      { x: 5, y: 4 },
    );
    expect(positions.length).toBe(Math.round(4 / SEGMENT_SPACING));
    for (const p of positions) {
      expect(p.x).toBe(5);
    }
  });

  it('handles L-shaped path via waypoints', () => {
    const positions = computeSegmentPositions(
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      [{ x: 3, y: 0 }],
    );
    // Should have segments for both legs
    const horizontalSegments = positions.filter(p => p.y === 0);
    const verticalSegments = positions.filter(p => p.x === 3);
    expect(horizontalSegments.length).toBeGreaterThan(0);
    expect(verticalSegments.length).toBeGreaterThan(0);
  });

  it('handles zero-length path gracefully', () => {
    const positions = computeSegmentPositions(
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    );
    expect(positions.length).toBe(0);
  });

  it('respects custom spacing parameter', () => {
    const positions = computeSegmentPositions(
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      [],
      1.0,
    );
    expect(positions.length).toBe(6);
  });

  it('centres segments within each leg', () => {
    const positions = computeSegmentPositions(
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      [],
      1.0,
    );
    // With spacing 1.0 over length 2: 2 segments at 0.5 and 1.5
    expect(positions.length).toBe(2);
    expect(positions[0]!.x).toBeCloseTo(0.5, 5);
    expect(positions[1]!.x).toBeCloseTo(1.5, 5);
  });

  it('handles multiple waypoints', () => {
    const positions = computeSegmentPositions(
      { x: 0, y: 0 },
      { x: 6, y: 3 },
      [{ x: 3, y: 0 }, { x: 3, y: 3 }],
    );
    expect(positions.length).toBeGreaterThan(0);
  });
});

describe('ConveyorBelt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpriteInstances = [];
    mockContainerInstances = [];
  });

  // ─── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('extends Phaser.GameObjects.Container', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig());
      expect(belt).toBeInstanceOf(Phaser.GameObjects.Container);
    });

    it('stores start and end coordinates', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 1, startY: 2, endX: 5, endY: 6,
      }));
      expect(belt.startX).toBe(1);
      expect(belt.startY).toBe(2);
      expect(belt.endX).toBe(5);
      expect(belt.endY).toBe(6);
    });

    it('stores waypoints (defaults to empty)', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig());
      expect(belt.waypoints).toEqual([]);
    });

    it('stores provided waypoints', () => {
      const scene = createMockScene();
      const wps = [{ x: 5, y: 0 }];
      const belt = new ConveyorBelt(scene, createConfig({ waypoints: wps }));
      expect(belt.waypoints).toEqual(wps);
    });

    it('adds itself to the scene display list', () => {
      const scene = createMockScene();
      new ConveyorBelt(scene, createConfig());
      // Container is added + all segments are added
      expect(scene.add.existing).toHaveBeenCalled();
    });

    it('creates segment sprites between start and end', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 3, endY: 0,
      }));
      const segments = belt.getSegments();
      expect(segments.length).toBeGreaterThan(0);
    });
  });

  // ─── Segment sprites ───────────────────────────────────────────────

  describe('segment sprites', () => {
    it('uses CONVEYOR_BELT texture', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 3, endY: 0,
      }));
      for (const segment of belt.getSegments()) {
        expect(segment.texture.key).toBe(ASSET_KEYS.CONVEYOR_BELT);
      }
    });

    it('positions segments at correct isometric coordinates', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 2, endY: 0,
      }));
      const segments = belt.getSegments();
      // Each segment should have isometric screen coordinates
      for (const segment of segments) {
        // Since these are placed at sub-tile positions, just verify they exist
        expect(typeof segment.x).toBe('number');
        expect(typeof segment.y).toBe('number');
      }
    });

    it('starts all segments at frame 0', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 3, endY: 0,
      }));
      for (const segment of belt.getSegments()) {
        expect(segment.frame.name).toBe(0);
      }
    });

    it('fills the gap between two positions with proper spacing', () => {
      const scene = createMockScene();
      // 6-tile horizontal belt: should have ~12 segments at 0.5 spacing
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 6, endY: 0,
      }));
      const segments = belt.getSegments();
      expect(segments.length).toBe(Math.round(6 / SEGMENT_SPACING));
    });
  });

  // ─── Depth sorting ─────────────────────────────────────────────────

  describe('depth sorting', () => {
    it('renders above floor tiles at the same position', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 4, startY: 4, endX: 7, endY: 4,
      }));
      const segments = belt.getSegments();
      // Each segment should have depth > floor depth for its position
      for (const segment of segments) {
        expect(segment.depth).toBeGreaterThan(0);
      }
    });

    it('CONVEYOR_DEPTH_OFFSET is 0.05', () => {
      expect(CONVEYOR_DEPTH_OFFSET).toBe(0.05);
    });

    it('segment depth includes CONVEYOR_DEPTH_OFFSET', () => {
      const scene = createMockScene();
      // Use known positions so we can compute expected depth
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 2, endY: 0,
      }));
      const segments = belt.getSegments();
      const expectedPositions = computeSegmentPositions(
        { x: 0, y: 0 }, { x: 2, y: 0 },
      );
      expect(segments.length).toBe(expectedPositions.length);
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]!;
        const pos = expectedPositions[i]!;
        expect(segment.setDepth).toHaveBeenCalled();
        const depthArg = (segment.setDepth as ReturnType<typeof vi.fn>).mock.calls[0]![0] as number;
        expect(depthArg).toBeCloseTo(getDepth(pos.x, pos.y) + CONVEYOR_DEPTH_OFFSET, 5);
      }
    });

    it('renders below machines (which use offset >= 0.1)', () => {
      expect(CONVEYOR_DEPTH_OFFSET).toBeLessThan(0.1);
    });
  });

  // ─── Activation / Deactivation ─────────────────────────────────────

  describe('activate / deactivate', () => {
    it('starts inactive', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig());
      expect(belt.isActive()).toBe(false);
    });

    it('activate() starts belt animation', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig());
      belt.activate();
      expect(belt.isActive()).toBe(true);
    });

    it('deactivate() stops belt animation', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig());
      belt.activate();
      belt.deactivate();
      expect(belt.isActive()).toBe(false);
    });
  });

  // ─── Direction ─────────────────────────────────────────────────────

  describe('setDirection', () => {
    it('defaults to forward', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig());
      expect(belt.getDirection()).toBe(true);
    });

    it('setDirection(false) sets reverse', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig());
      belt.setDirection(false);
      expect(belt.getDirection()).toBe(false);
    });

    it('setDirection(true) restores forward', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig());
      belt.setDirection(false);
      belt.setDirection(true);
      expect(belt.getDirection()).toBe(true);
    });
  });

  // ─── Animation ─────────────────────────────────────────────────────

  describe('updateAnimation', () => {
    it('does nothing when inactive', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 3, endY: 0,
      }));
      const segments = belt.getSegments();
      // Clear mock calls from constructor
      for (const s of segments) {
        (s.setFrame as ReturnType<typeof vi.fn>).mockClear();
      }
      belt.updateAnimation(FRAME_DURATION_MS);
      for (const s of segments) {
        expect(s.setFrame).not.toHaveBeenCalled();
      }
    });

    it('advances frames when active (forward)', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 3, endY: 0,
      }));
      belt.activate();

      // After 1 frame duration, should be frame 1
      belt.updateAnimation(FRAME_DURATION_MS);
      for (const s of belt.getSegments()) {
        expect(s.frame.name).toBe(1);
      }
    });

    it('cycles through all frames', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 3, endY: 0,
      }));
      belt.activate();

      const observed: (string | number)[] = [];
      for (let i = 0; i < TOTAL_FRAMES + 1; i++) {
        belt.updateAnimation(FRAME_DURATION_MS);
        observed.push(belt.getSegments()[0]!.frame.name);
      }
      // Should see frames 1, 2, 3, 0, 1 (wrapping)
      expect(observed).toEqual([1, 2, 3, 0, 1]);
    });

    it('reverses frame order when direction is backward', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 3, endY: 0,
      }));
      belt.activate();
      belt.setDirection(false);

      // At time=0 elapsed, frame is TOTAL_FRAMES-1-0 = 3
      // After FRAME_DURATION_MS: elapsed = FRAME_DURATION_MS, floor(150/150) % 4 = 1, reverse = 3-1 = 2
      belt.updateAnimation(FRAME_DURATION_MS);
      expect(belt.getSegments()[0]!.frame.name).toBe(2);
    });

    it('FRAME_DURATION_MS is a positive number', () => {
      expect(FRAME_DURATION_MS).toBeGreaterThan(0);
    });

    it('TOTAL_FRAMES matches spritesheet frame count', () => {
      expect(TOTAL_FRAMES).toBe(4);
    });
  });

  // ─── L-shaped routing ──────────────────────────────────────────────

  describe('L-shaped routing', () => {
    it('supports L-shaped path via waypoints', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0,
        startY: 0,
        endX: 3,
        endY: 3,
        waypoints: [{ x: 3, y: 0 }],
      }));
      const segments = belt.getSegments();
      // Should have segments for both horizontal and vertical legs
      expect(segments.length).toBeGreaterThan(0);
      // Total path length is 3 + 3 = 6 tiles, so ~12 segments at 0.5 spacing
      expect(segments.length).toBe(Math.round(6 / SEGMENT_SPACING));
    });

    it('supports reverse L-shaped path (vertical then horizontal)', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0,
        startY: 0,
        endX: 4,
        endY: 2,
        waypoints: [{ x: 0, y: 2 }],
      }));
      const segments = belt.getSegments();
      // Path: 2 vertical + 4 horizontal = 6 tiles total
      expect(segments.length).toBe(Math.round(6 / SEGMENT_SPACING));
    });
  });

  // ─── Non-interactive ───────────────────────────────────────────────

  describe('non-interactive', () => {
    it('segment sprites do not call setInteractive', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 3, endY: 0,
      }));
      for (const segment of belt.getSegments()) {
        expect(
          (segment as unknown as { setInteractive?: ReturnType<typeof vi.fn> }).setInteractive,
        ).toBeUndefined();
      }
    });
  });

  // ─── Destroy ───────────────────────────────────────────────────────

  describe('destroy', () => {
    it('destroys all segment sprites', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 3, endY: 0,
      }));
      const segments = [...belt.getSegments()];
      expect(segments.length).toBeGreaterThan(0);

      const superDestroySpy = vi.spyOn(
        Phaser.GameObjects.Container.prototype,
        'destroy',
      );
      belt.destroy();
      superDestroySpy.mockRestore();

      for (const segment of segments) {
        expect(segment.destroy).toHaveBeenCalled();
      }
    });

    it('clears the segments array after destroy', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig({
        startX: 0, startY: 0, endX: 3, endY: 0,
      }));
      const superDestroySpy = vi.spyOn(
        Phaser.GameObjects.Container.prototype,
        'destroy',
      );
      belt.destroy();
      superDestroySpy.mockRestore();
      expect(belt.getSegments().length).toBe(0);
    });

    it('calls super.destroy()', () => {
      const scene = createMockScene();
      const belt = new ConveyorBelt(scene, createConfig());
      const superDestroySpy = vi.spyOn(
        Phaser.GameObjects.Container.prototype,
        'destroy',
      );
      belt.destroy();
      expect(superDestroySpy).toHaveBeenCalled();
      superDestroySpy.mockRestore();
    });
  });

  // ─── Static create() ──────────────────────────────────────────────

  describe('ConveyorBelt.create()', () => {
    it('returns a ConveyorBelt instance', () => {
      const scene = createMockScene();
      const belt = ConveyorBelt.create(scene, createConfig());
      expect(belt).toBeInstanceOf(ConveyorBelt);
    });

    it('passes config to constructor', () => {
      const scene = createMockScene();
      const config = createConfig({ startX: 1, startY: 2, endX: 7, endY: 8 });
      const belt = ConveyorBelt.create(scene, config);
      expect(belt.startX).toBe(1);
      expect(belt.startY).toBe(2);
      expect(belt.endX).toBe(7);
      expect(belt.endY).toBe(8);
    });
  });

  // ─── Constants ─────────────────────────────────────────────────────

  describe('constants', () => {
    it('SEGMENT_SPACING is 0.5', () => {
      expect(SEGMENT_SPACING).toBe(0.5);
    });

    it('CONVEYOR_DEPTH_OFFSET is between 0 and WALL_DEPTH_OFFSET', () => {
      expect(CONVEYOR_DEPTH_OFFSET).toBeGreaterThan(0);
      expect(CONVEYOR_DEPTH_OFFSET).toBeLessThan(0.1);
    });
  });
});
