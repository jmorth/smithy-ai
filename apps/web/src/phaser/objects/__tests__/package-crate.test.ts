import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Phaser mock ────────────────────────────────────────────────────────

interface MockTween {
  stop: ReturnType<typeof vi.fn>;
  config: Record<string, unknown>;
}

let mockTweens: MockTween[] = [];

vi.mock('phaser', () => {
  class MockSprite {
    x: number;
    y: number;
    texture: { key: string };
    frame: { name: number };
    depth = 0;
    alpha = 1;
    scaleX = 1;
    scaleY = 1;
    tint: number | null = null;
    interactive = false;
    input: { cursor?: string } = {};
    visible = true;
    _events: Record<string, Array<{ fn: (...args: unknown[]) => void; context: unknown }>> = {};

    scene: unknown;

    constructor(scene: unknown, x: number, y: number, textureKey: string, frameIndex: number = 0) {
      this.scene = scene;
      this.x = x;
      this.y = y;
      this.texture = { key: textureKey };
      this.frame = { name: frameIndex };
    }

    setDepth = vi.fn((d: number) => {
      this.depth = d;
      return this;
    });

    setFrame = vi.fn((f: number) => {
      this.frame = { name: f };
      return this;
    });

    setInteractive = vi.fn((opts?: { useHandCursor?: boolean }) => {
      this.interactive = true;
      if (opts?.useHandCursor) {
        this.input.cursor = 'pointer';
      }
      return this;
    });

    setTint = vi.fn((color: number) => {
      this.tint = color;
      return this;
    });

    clearTint = vi.fn(() => {
      this.tint = null;
      return this;
    });

    setAlpha = vi.fn((a: number) => {
      this.alpha = a;
      return this;
    });

    setScale = vi.fn((s: number) => {
      this.scaleX = s;
      this.scaleY = s;
      return this;
    });

    setPosition = vi.fn((x: number, y: number) => {
      this.x = x;
      this.y = y;
      return this;
    });

    setVisible = vi.fn((v: boolean) => {
      this.visible = v;
      return this;
    });

    on = vi.fn((event: string, fn: (...args: unknown[]) => void, context?: unknown) => {
      if (!this._events[event]) this._events[event] = [];
      this._events[event].push({ fn, context: context ?? this });
      return this;
    });

    off = vi.fn((event: string, fn: (...args: unknown[]) => void, context?: unknown) => {
      if (this._events[event]) {
        this._events[event] = this._events[event].filter(
          (e) => !(e.fn === fn && e.context === (context ?? this)),
        );
      }
      return this;
    });

    emit(event: string, ...args: unknown[]): void {
      if (this._events[event]) {
        for (const listener of this._events[event]) {
          listener.fn.call(listener.context, ...args);
        }
      }
    }
  }

  // Use a prototype method for destroy so vi.spyOn works
  (MockSprite.prototype as MockSprite & { destroy: (_fromScene?: boolean) => void }).destroy = function (_fromScene?: boolean): void {
    // no-op base for subclasses
  };

  return {
    default: {
      GameObjects: {
        Sprite: MockSprite,
        Container: class {},
      },
      Scene: class {},
    },
    __esModule: true,
  };
});

vi.mock('@smithy/shared', () => ({
  PackageType: {
    USER_INPUT: 'USER_INPUT',
    SPECIFICATION: 'SPECIFICATION',
    CODE: 'CODE',
    IMAGE: 'IMAGE',
    PULL_REQUEST: 'PULL_REQUEST',
  },
}));

import Phaser from 'phaser';
import {
  PackageCrate,
  CRATE_DEPTH_OFFSET,
  PACKAGE_TYPE_COLORS,
  DEFAULT_PACKAGE_COLOR,
  type PackageCrateConfig,
} from '../package-crate';
import { ASSET_KEYS } from '../../constants/asset-keys';
import { PackageType } from '@smithy/shared';

// ── Scene mock ─────────────────────────────────────────────────────────

function createMockScene() {
  mockTweens = [];

  return {
    textures: {
      exists: vi.fn(() => true),
    },
    add: {
      existing: vi.fn(),
    },
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        const tween: MockTween = { stop: vi.fn(), config };
        mockTweens.push(tween);
        return tween;
      }),
    },
  } as unknown as Phaser.Scene;
}

function createConfig(overrides: Partial<PackageCrateConfig> = {}): PackageCrateConfig {
  return {
    screenX: 100,
    screenY: 200,
    packageId: 'pkg-1',
    packageType: PackageType.CODE,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('PackageCrate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTweens = [];
  });

  // ─── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('extends Phaser.GameObjects.Sprite', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      expect(crate).toBeInstanceOf(Phaser.GameObjects.Sprite);
    });

    it('positions at provided screen coordinates', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ screenX: 150, screenY: 250 }));
      expect(crate.x).toBe(150);
      expect(crate.y).toBe(250);
    });

    it('uses PACKAGE_CRATE texture', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      expect(crate.texture.key).toBe(ASSET_KEYS.PACKAGE_CRATE);
    });

    it('stores packageId as readonly property', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ packageId: 'pkg-42' }));
      expect(crate.packageId).toBe('pkg-42');
    });

    it('stores packageType as readonly property', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ packageType: PackageType.IMAGE }));
      expect(crate.packageType).toBe(PackageType.IMAGE);
    });

    it('adds itself to the scene display list', () => {
      const scene = createMockScene();
      new PackageCrate(scene, createConfig());
      expect(scene.add.existing).toHaveBeenCalled();
    });
  });

  // ─── Color coding ──────────────────────────────────────────────────

  describe('color coding', () => {
    it('tints USER_INPUT as blue (0x4488ff)', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ packageType: PackageType.USER_INPUT }));
      expect(crate.setTint).toHaveBeenCalledWith(0x4488ff);
    });

    it('tints CODE as green (0x44ff88)', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ packageType: PackageType.CODE }));
      expect(crate.setTint).toHaveBeenCalledWith(0x44ff88);
    });

    it('tints SPECIFICATION as orange (0xff8844)', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ packageType: PackageType.SPECIFICATION }));
      expect(crate.setTint).toHaveBeenCalledWith(0xff8844);
    });

    it('tints IMAGE as purple (0x8844ff)', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ packageType: PackageType.IMAGE }));
      expect(crate.setTint).toHaveBeenCalledWith(0x8844ff);
    });

    it('tints PULL_REQUEST as gray (0xcccccc)', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ packageType: PackageType.PULL_REQUEST }));
      expect(crate.setTint).toHaveBeenCalledWith(0xcccccc);
    });

    it('uses DEFAULT_PACKAGE_COLOR for unknown types', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ packageType: 'UNKNOWN_TYPE' }));
      expect(crate.setTint).toHaveBeenCalledWith(DEFAULT_PACKAGE_COLOR);
    });

    it('PACKAGE_TYPE_COLORS contains all PackageType values', () => {
      for (const type of Object.values(PackageType)) {
        expect(PACKAGE_TYPE_COLORS[type]).toBeDefined();
      }
    });
  });

  // ─── Depth sorting ─────────────────────────────────────────────────

  describe('depth sorting', () => {
    it('sets depth based on screen position plus CRATE_DEPTH_OFFSET', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ screenX: 0, screenY: 160 }));
      // depth = screenY/16 + CRATE_DEPTH_OFFSET = 160/16 + 0.07 = 10.07
      expect(crate.setDepth).toHaveBeenCalledWith(160 / 16 + CRATE_DEPTH_OFFSET);
    });

    it('CRATE_DEPTH_OFFSET is between conveyor (0.05) and machine (0.1)', () => {
      expect(CRATE_DEPTH_OFFSET).toBeGreaterThan(0.05);
      expect(CRATE_DEPTH_OFFSET).toBeLessThan(0.1);
    });

    it('applies depthTieBreaker to prevent z-fighting', () => {
      const scene = createMockScene();
      const tieBreaker = 0.01;
      const crate = new PackageCrate(scene, createConfig({ screenY: 160, depthTieBreaker: tieBreaker }));
      expect(crate.setDepth).toHaveBeenCalledWith(160 / 16 + CRATE_DEPTH_OFFSET + tieBreaker);
    });

    it('defaults depthTieBreaker to 0 when not provided', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ screenY: 160 }));
      expect(crate.setDepth).toHaveBeenCalledWith(160 / 16 + CRATE_DEPTH_OFFSET);
    });
  });

  // ─── Interactive ────────────────────────────────────────────────────

  describe('interactivity', () => {
    it('calls setInteractive with useHandCursor', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      expect(crate.setInteractive).toHaveBeenCalledWith({ useHandCursor: true });
    });

    it('registers pointerdown listener', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      expect(crate.on).toHaveBeenCalledWith('pointerdown', expect.any(Function), crate);
    });
  });

  // ─── Click → bridge ────────────────────────────────────────────────

  describe('click dispatching', () => {
    it('dispatches selectPackage via bridge on pointerdown', () => {
      const mockBridge = { onPackageClicked: vi.fn() };
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({
        packageId: 'pkg-42',
        bridge: mockBridge as never,
      }));

      crate.emit('pointerdown');
      expect(mockBridge.onPackageClicked).toHaveBeenCalledWith('pkg-42');
    });

    it('does not throw when bridge is not provided', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig({ bridge: undefined }));
      expect(() => crate.emit('pointerdown')).not.toThrow();
    });
  });

  // ─── moveTo ────────────────────────────────────────────────────────

  describe('moveTo', () => {
    it('creates a tween targeting the crate', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      crate.moveTo(300, 400, 500);

      expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({
        targets: crate,
        x: 300,
        y: 400,
        duration: 500,
        ease: 'Sine.easeInOut',
      }));
    });

    it('returns a Promise', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const result = crate.moveTo(300, 400, 500);
      expect(result).toBeInstanceOf(Promise);
    });

    it('resolves the Promise when tween completes', async () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const promise = crate.moveTo(300, 400, 500);

      // Simulate tween completion
      const tweenConfig = mockTweens[0]!.config;
      (tweenConfig.onComplete as () => void)();

      await expect(promise).resolves.toBeUndefined();
    });

    it('updates depth during tween via onUpdate', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      crate.moveTo(300, 400, 500);

      const tweenConfig = mockTweens[0]!.config;
      expect(tweenConfig.onUpdate).toBeDefined();

      // Simulate position update and onUpdate callback
      (crate as unknown as { y: number }).y = 320;
      (crate.setDepth as ReturnType<typeof vi.fn>).mockClear();
      (tweenConfig.onUpdate as () => void)();
      expect(crate.setDepth).toHaveBeenCalled();
    });

    it('cleans up completed tween from activeTweens', async () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const promise = crate.moveTo(300, 400, 500);

      const tween = mockTweens[0]!;
      const tweenConfig = tween.config;
      (tweenConfig.onComplete as () => void)();
      await promise;

      // On destroy, if tween was cleaned up, stop should not be called on it
      const superDestroySpy = vi.spyOn(Phaser.GameObjects.Sprite.prototype, 'destroy');
      crate.destroy();
      expect(tween.stop).not.toHaveBeenCalled();
      superDestroySpy.mockRestore();
    });
  });

  // ─── enterMachine ──────────────────────────────────────────────────

  describe('enterMachine', () => {
    it('creates a tween that fades out and shrinks toward machine position', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const machineSprite = { x: 500, y: 600 } as Phaser.GameObjects.Sprite;

      crate.enterMachine(machineSprite);

      expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({
        targets: crate,
        x: 500,
        y: 600,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
      }));
    });

    it('returns a Promise', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const machineSprite = { x: 500, y: 600 } as Phaser.GameObjects.Sprite;

      const result = crate.enterMachine(machineSprite);
      expect(result).toBeInstanceOf(Promise);
    });

    it('hides crate on tween complete', async () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const machineSprite = { x: 500, y: 600 } as Phaser.GameObjects.Sprite;

      const promise = crate.enterMachine(machineSprite);
      const tweenConfig = mockTweens[0]!.config;
      (tweenConfig.onComplete as () => void)();
      await promise;

      expect(crate.setVisible).toHaveBeenCalledWith(false);
    });

    it('uses Sine.easeIn easing', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const machineSprite = { x: 500, y: 600 } as Phaser.GameObjects.Sprite;

      crate.enterMachine(machineSprite);
      expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({
        ease: 'Sine.easeIn',
      }));
    });
  });

  // ─── exitMachine ───────────────────────────────────────────────────

  describe('exitMachine', () => {
    it('positions crate at machine center and sets initial alpha/scale', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const machineSprite = { x: 500, y: 600 } as Phaser.GameObjects.Sprite;

      crate.exitMachine(machineSprite);

      expect(crate.setPosition).toHaveBeenCalledWith(500, 600);
      expect(crate.setAlpha).toHaveBeenCalledWith(0);
      expect(crate.setScale).toHaveBeenCalledWith(0.3);
      expect(crate.setVisible).toHaveBeenCalledWith(true);
    });

    it('creates a tween that fades in and grows to full size', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const machineSprite = { x: 500, y: 600 } as Phaser.GameObjects.Sprite;

      crate.exitMachine(machineSprite);

      expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({
        targets: crate,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
      }));
    });

    it('returns a Promise that resolves on tween complete', async () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const machineSprite = { x: 500, y: 600 } as Phaser.GameObjects.Sprite;

      const promise = crate.exitMachine(machineSprite);
      const tweenConfig = mockTweens[0]!.config;
      (tweenConfig.onComplete as () => void)();

      await expect(promise).resolves.toBeUndefined();
    });

    it('uses Sine.easeOut easing', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const machineSprite = { x: 500, y: 600 } as Phaser.GameObjects.Sprite;

      crate.exitMachine(machineSprite);
      expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({
        ease: 'Sine.easeOut',
      }));
    });

    it('refreshes depth after exit animation completes', async () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const machineSprite = { x: 500, y: 600 } as Phaser.GameObjects.Sprite;

      const promise = crate.exitMachine(machineSprite);
      (crate.setDepth as ReturnType<typeof vi.fn>).mockClear();

      const tweenConfig = mockTweens[0]!.config;
      (tweenConfig.onComplete as () => void)();
      await promise;

      expect(crate.setDepth).toHaveBeenCalled();
    });
  });

  // ─── Destroy ───────────────────────────────────────────────────────

  describe('destroy', () => {
    it('removes pointerdown listener', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      crate.destroy();
      expect(crate.off).toHaveBeenCalledWith('pointerdown', expect.any(Function), crate);
    });

    it('stops all active tweens', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      crate.moveTo(300, 400, 500);
      const tween = mockTweens[0]!;

      const superDestroySpy = vi.spyOn(Phaser.GameObjects.Sprite.prototype, 'destroy');
      crate.destroy();
      expect(tween.stop).toHaveBeenCalled();
      superDestroySpy.mockRestore();
    });

    it('calls super.destroy()', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const superDestroySpy = vi.spyOn(Phaser.GameObjects.Sprite.prototype, 'destroy');
      crate.destroy();
      expect(superDestroySpy).toHaveBeenCalled();
      superDestroySpy.mockRestore();
    });

    it('passes fromScene parameter to super.destroy()', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const superDestroySpy = vi.spyOn(Phaser.GameObjects.Sprite.prototype, 'destroy');
      crate.destroy(true);
      expect(superDestroySpy).toHaveBeenCalledWith(true);
      superDestroySpy.mockRestore();
    });

    it('handles destroy with no active tweens gracefully', () => {
      const scene = createMockScene();
      const crate = new PackageCrate(scene, createConfig());
      const superDestroySpy = vi.spyOn(Phaser.GameObjects.Sprite.prototype, 'destroy');
      expect(() => crate.destroy()).not.toThrow();
      superDestroySpy.mockRestore();
    });
  });

  // ─── Static factory ────────────────────────────────────────────────

  describe('PackageCrate.create()', () => {
    it('returns a PackageCrate instance', () => {
      const scene = createMockScene();
      const crate = PackageCrate.create(scene, createConfig());
      expect(crate).toBeInstanceOf(PackageCrate);
    });

    it('passes config to constructor', () => {
      const scene = createMockScene();
      const crate = PackageCrate.create(scene, createConfig({
        screenX: 50,
        screenY: 75,
        packageId: 'test-pkg',
        packageType: PackageType.SPECIFICATION,
      }));
      expect(crate.x).toBe(50);
      expect(crate.y).toBe(75);
      expect(crate.packageId).toBe('test-pkg');
      expect(crate.packageType).toBe(PackageType.SPECIFICATION);
    });
  });

  // ─── Constants ─────────────────────────────────────────────────────

  describe('constants', () => {
    it('DEFAULT_PACKAGE_COLOR is a valid color', () => {
      expect(DEFAULT_PACKAGE_COLOR).toBe(0xaaaaaa);
    });

    it('PACKAGE_TYPE_COLORS has distinct values for each type', () => {
      const colors = Object.values(PACKAGE_TYPE_COLORS);
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(colors.length);
    });
  });

  // ─── Full lifecycle ────────────────────────────────────────────────

  describe('full lifecycle', () => {
    it('create → click → moveTo → enterMachine → exitMachine → destroy', async () => {
      const mockBridge = { onPackageClicked: vi.fn() };
      const scene = createMockScene();
      const crate = PackageCrate.create(scene, createConfig({
        packageId: 'lifecycle-pkg',
        packageType: PackageType.USER_INPUT,
        bridge: mockBridge as never,
      }));

      // Verify created with correct tint
      expect(crate.setTint).toHaveBeenCalledWith(PACKAGE_TYPE_COLORS[PackageType.USER_INPUT]);

      // Simulate click
      crate.emit('pointerdown');
      expect(mockBridge.onPackageClicked).toHaveBeenCalledWith('lifecycle-pkg');

      // moveTo
      const movePromise = crate.moveTo(200, 300, 500);
      const moveTweenConfig = mockTweens[0]!.config;
      (moveTweenConfig.onComplete as () => void)();
      await movePromise;

      // enterMachine
      const machineSprite = { x: 400, y: 500 } as Phaser.GameObjects.Sprite;
      const enterPromise = crate.enterMachine(machineSprite);
      const enterTweenConfig = mockTweens[1]!.config;
      (enterTweenConfig.onComplete as () => void)();
      await enterPromise;
      expect(crate.setVisible).toHaveBeenCalledWith(false);

      // exitMachine
      const exitPromise = crate.exitMachine(machineSprite);
      const exitTweenConfig = mockTweens[2]!.config;
      (exitTweenConfig.onComplete as () => void)();
      await exitPromise;
      expect(crate.setVisible).toHaveBeenCalledWith(true);

      // Destroy
      const superDestroySpy = vi.spyOn(Phaser.GameObjects.Sprite.prototype, 'destroy');
      crate.destroy();
      expect(superDestroySpy).toHaveBeenCalled();
      superDestroySpy.mockRestore();
    });
  });
});
