import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock factories ──────────────────────────────────────────────────────

function createMockGraphics() {
  const gfx: Record<string, ReturnType<typeof vi.fn>> = {
    fillStyle: vi.fn().mockReturnThis(),
    fillRect: vi.fn().mockReturnThis(),
    fillRoundedRect: vi.fn().mockReturnThis(),
    beginPath: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    closePath: vi.fn().mockReturnThis(),
    fillPath: vi.fn().mockReturnThis(),
    generateTexture: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    clear: vi.fn().mockReturnThis(),
  };
  return gfx;
}

function createMockText() {
  return {
    setOrigin: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function createMockTexture() {
  return {
    add: vi.fn(),
  };
}

const existingTextures = new Set<string>();

vi.mock('phaser', () => ({
  default: {
    Scene: class MockScene {
      config: unknown;
      constructor(config: unknown) {
        this.config = config;
      }
    },
  },
  __esModule: true,
}));

import BootScene from '../boot-scene';
import { ASSET_KEYS } from '../../constants/asset-keys';

// ── Helpers ─────────────────────────────────────────────────────────────

function createScene(): BootScene {
  const scene = new BootScene();

  const mockGraphics = createMockGraphics();
  const mockText = createMockText();
  const mockTexture = createMockTexture();
  const loadEvents = new Map<string, (...args: unknown[]) => void>();

  // scene.add
  (scene as unknown as Record<string, unknown>).add = {
    graphics: vi.fn().mockReturnValue(mockGraphics),
    text: vi.fn().mockReturnValue(mockText),
    rectangle: vi.fn(),
  };

  // scene.make — returns a fresh mock graphics per call
  (scene as unknown as Record<string, unknown>).make = {
    graphics: vi.fn().mockImplementation(() => createMockGraphics()),
  };

  // scene.scale
  (scene as unknown as Record<string, unknown>).scale = {
    width: 800,
    height: 600,
  };

  // scene.load
  (scene as unknown as Record<string, unknown>).load = {
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      loadEvents.set(event, callback);
    }),
    spritesheet: vi.fn(),
    image: vi.fn(),
  };

  // scene.scene
  (scene as unknown as Record<string, unknown>).scene = {
    start: vi.fn(),
  };

  // scene.textures
  existingTextures.clear();
  (scene as unknown as Record<string, unknown>).textures = {
    exists: vi.fn((key: string) => existingTextures.has(key)),
    get: vi.fn().mockReturnValue(mockTexture),
  };

  // Attach helpers for test access
  (scene as unknown as Record<string, unknown>)._testHelpers = {
    mockGraphics,
    mockText,
    mockTexture,
    loadEvents,
  };

  return scene;
}

interface TestHelpers {
  mockGraphics: ReturnType<typeof createMockGraphics>;
  mockText: ReturnType<typeof createMockText>;
  mockTexture: ReturnType<typeof createMockTexture>;
  loadEvents: Map<string, (...args: unknown[]) => void>;
}

function getHelpers(scene: BootScene): TestHelpers {
  return (scene as unknown as Record<string, unknown>)._testHelpers as TestHelpers;
}

function getSceneManager(scene: BootScene) {
  return (scene as unknown as { scene: { start: ReturnType<typeof vi.fn> } }).scene;
}

function getAdd(scene: BootScene) {
  return (scene as unknown as { add: { graphics: ReturnType<typeof vi.fn>; text: ReturnType<typeof vi.fn> } }).add;
}

function getMake(scene: BootScene) {
  return (scene as unknown as { make: { graphics: ReturnType<typeof vi.fn> } }).make;
}

function getTextures(scene: BootScene) {
  return (scene as unknown as { textures: { exists: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } }).textures;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('BootScene', () => {
  let scene: BootScene;

  beforeEach(() => {
    scene = createScene();
  });

  describe('constructor', () => {
    it('extends Phaser.Scene with key "BootScene"', () => {
      expect(
        (scene as unknown as { config: { key: string } }).config,
      ).toEqual({ key: 'BootScene' });
    });
  });

  describe('preload', () => {
    it('creates a progress bar background', () => {
      scene.preload();
      const add = getAdd(scene);
      expect(add.graphics).toHaveBeenCalled();
    });

    it('creates loading text centered on screen', () => {
      scene.preload();
      const add = getAdd(scene);
      expect(add.text).toHaveBeenCalledWith(
        400, // centerX = 800/2
        expect.any(Number),
        'Loading…',
        expect.objectContaining({ fontSize: '14px' }),
      );
    });

    it('registers a progress event listener', () => {
      scene.preload();
      const { loadEvents } = getHelpers(scene);
      expect(loadEvents.has('progress')).toBe(true);
    });

    it('registers a loaderror event listener', () => {
      scene.preload();
      const { loadEvents } = getHelpers(scene);
      expect(loadEvents.has('loaderror')).toBe(true);
    });
  });

  describe('progress bar updates', () => {
    it('updates fill width based on progress value', () => {
      scene.preload();
      const { loadEvents } = getHelpers(scene);
      const progressCallback = loadEvents.get('progress')!;
      const add = getAdd(scene);
      const barGraphics = add.graphics.mock.results[1]!.value;

      progressCallback(0.5);

      expect(barGraphics.clear).toHaveBeenCalled();
      expect(barGraphics.fillRoundedRect).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        160, // 320 * 0.5
        24,
        4,
      );
    });

    it('handles 0% progress', () => {
      scene.preload();
      const { loadEvents } = getHelpers(scene);
      const progressCallback = loadEvents.get('progress')!;
      const add = getAdd(scene);
      const barGraphics = add.graphics.mock.results[1]!.value;

      progressCallback(0);

      expect(barGraphics.fillRoundedRect).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        0,
        24,
        4,
      );
    });

    it('handles 100% progress', () => {
      scene.preload();
      const { loadEvents } = getHelpers(scene);
      const progressCallback = loadEvents.get('progress')!;
      const add = getAdd(scene);
      const barGraphics = add.graphics.mock.results[1]!.value;

      progressCallback(1);

      expect(barGraphics.fillRoundedRect).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        320, // full width
        24,
        4,
      );
    });
  });

  describe('error handling', () => {
    it('logs a warning when an asset fails to load', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      scene.preload();
      const { loadEvents } = getHelpers(scene);
      const errorCallback = loadEvents.get('loaderror')!;

      errorCallback({ key: 'missing-asset', url: '/assets/missing.png' });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing-asset'),
      );
      warnSpy.mockRestore();
    });

    it('still transitions to FactoryScene after load errors', () => {
      scene.preload();
      scene.create();

      const sceneManager = getSceneManager(scene);
      expect(sceneManager.start).toHaveBeenCalledWith('FactoryScene');
    });
  });

  describe('create', () => {
    it('transitions to FactoryScene', () => {
      scene.preload();
      scene.create();

      const sceneManager = getSceneManager(scene);
      expect(sceneManager.start).toHaveBeenCalledWith('FactoryScene');
    });

    it('destroys progress bar elements', () => {
      scene.preload();
      const { mockText } = getHelpers(scene);
      const add = getAdd(scene);
      const bgGraphics = add.graphics.mock.results[0]!.value;
      const barGraphics = add.graphics.mock.results[1]!.value;

      scene.create();

      expect(bgGraphics.destroy).toHaveBeenCalled();
      expect(barGraphics.destroy).toHaveBeenCalled();
      expect(mockText.destroy).toHaveBeenCalled();
    });

    it('generates placeholder textures for missing assets', () => {
      scene.preload();
      scene.create();

      const make = getMake(scene);
      // 5 assets should each create a graphics object
      expect(make.graphics).toHaveBeenCalledTimes(5);
    });

    it('skips placeholder generation for existing textures', () => {
      existingTextures.add(ASSET_KEYS.FLOOR_TILE);
      existingTextures.add(ASSET_KEYS.WALL_SEGMENT);
      existingTextures.add(ASSET_KEYS.CONVEYOR_BELT);
      existingTextures.add(ASSET_KEYS.WORKER_MACHINE);
      existingTextures.add(ASSET_KEYS.PACKAGE_CRATE);

      scene.preload();
      scene.create();

      const make = getMake(scene);
      expect(make.graphics).not.toHaveBeenCalled();
    });

    it('only generates placeholders for missing textures', () => {
      existingTextures.add(ASSET_KEYS.FLOOR_TILE);
      existingTextures.add(ASSET_KEYS.WALL_SEGMENT);
      // conveyor-belt, worker-machine, package-crate are missing

      scene.preload();
      scene.create();

      const make = getMake(scene);
      expect(make.graphics).toHaveBeenCalledTimes(3);
    });
  });

  describe('placeholder texture generation', () => {
    it('generates floor tile as 64x32 diamond', () => {
      scene.preload();
      scene.create();

      const make = getMake(scene);
      const gfx = make.graphics.mock.results[0]!.value;

      expect(gfx.beginPath).toHaveBeenCalled();
      expect(gfx.moveTo).toHaveBeenCalledWith(32, 0);
      expect(gfx.lineTo).toHaveBeenCalledWith(64, 16);
      expect(gfx.lineTo).toHaveBeenCalledWith(32, 32);
      expect(gfx.lineTo).toHaveBeenCalledWith(0, 16);
      expect(gfx.closePath).toHaveBeenCalled();
      expect(gfx.fillPath).toHaveBeenCalled();
      expect(gfx.generateTexture).toHaveBeenCalledWith(
        ASSET_KEYS.FLOOR_TILE,
        64,
        32,
      );
      expect(gfx.destroy).toHaveBeenCalled();
    });

    it('generates wall segment as 64x48 rectangle', () => {
      scene.preload();
      scene.create();

      const make = getMake(scene);
      const gfx = make.graphics.mock.results[1]!.value;

      expect(gfx.fillRect).toHaveBeenCalledWith(0, 0, 64, 48);
      expect(gfx.generateTexture).toHaveBeenCalledWith(
        ASSET_KEYS.WALL_SEGMENT,
        64,
        48,
      );
      expect(gfx.destroy).toHaveBeenCalled();
    });

    it('generates conveyor belt as 4-frame spritesheet', () => {
      scene.preload();
      scene.create();

      const make = getMake(scene);
      const gfx = make.graphics.mock.results[2]!.value;

      // Total width = 64 * 4 = 256
      expect(gfx.generateTexture).toHaveBeenCalledWith(
        ASSET_KEYS.CONVEYOR_BELT,
        256,
        32,
      );

      const textures = getTextures(scene);
      expect(textures.get).toHaveBeenCalledWith(ASSET_KEYS.CONVEYOR_BELT);

      const { mockTexture } = getHelpers(scene);
      expect(mockTexture.add).toHaveBeenCalledTimes(4 + 5); // 4 conveyor + 5 worker
      // First 4 calls are conveyor frames
      expect(mockTexture.add).toHaveBeenCalledWith(0, 0, 0, 0, 64, 32);
      expect(mockTexture.add).toHaveBeenCalledWith(1, 0, 64, 0, 64, 32);
      expect(mockTexture.add).toHaveBeenCalledWith(2, 0, 128, 0, 64, 32);
      expect(mockTexture.add).toHaveBeenCalledWith(3, 0, 192, 0, 64, 32);
      expect(gfx.destroy).toHaveBeenCalled();
    });

    it('generates worker machine as 5-frame spritesheet', () => {
      scene.preload();
      scene.create();

      const make = getMake(scene);
      const gfx = make.graphics.mock.results[3]!.value;

      // Total width = 64 * 5 = 320
      expect(gfx.generateTexture).toHaveBeenCalledWith(
        ASSET_KEYS.WORKER_MACHINE,
        320,
        64,
      );

      const textures = getTextures(scene);
      expect(textures.get).toHaveBeenCalledWith(ASSET_KEYS.WORKER_MACHINE);
      expect(gfx.destroy).toHaveBeenCalled();
    });

    it('generates package crate as 32x32 square', () => {
      scene.preload();
      scene.create();

      const make = getMake(scene);
      const gfx = make.graphics.mock.results[4]!.value;

      expect(gfx.fillRect).toHaveBeenCalledWith(0, 0, 32, 32);
      expect(gfx.generateTexture).toHaveBeenCalledWith(
        ASSET_KEYS.PACKAGE_CRATE,
        32,
        32,
      );
      expect(gfx.destroy).toHaveBeenCalled();
    });

    it('destroys graphics objects after texture generation', () => {
      scene.preload();
      scene.create();

      const make = getMake(scene);
      for (const result of make.graphics.mock.results) {
        expect(result.value.destroy).toHaveBeenCalled();
      }
    });
  });

  describe('generateMissingPlaceholders (public method)', () => {
    it('checks texture existence for each asset key', () => {
      scene.generateMissingPlaceholders();

      const textures = getTextures(scene);
      expect(textures.exists).toHaveBeenCalledWith(ASSET_KEYS.FLOOR_TILE);
      expect(textures.exists).toHaveBeenCalledWith(ASSET_KEYS.WALL_SEGMENT);
      expect(textures.exists).toHaveBeenCalledWith(ASSET_KEYS.CONVEYOR_BELT);
      expect(textures.exists).toHaveBeenCalledWith(ASSET_KEYS.WORKER_MACHINE);
      expect(textures.exists).toHaveBeenCalledWith(ASSET_KEYS.PACKAGE_CRATE);
    });
  });

  describe('progress bar null safety', () => {
    it('does not throw if progress fires before preload creates the bar', () => {
      // Manually trigger progress callback without calling preload first
      const loadEvents = new Map<string, (...args: unknown[]) => void>();
      const load = (scene as unknown as Record<string, unknown>).load as Record<string, unknown>;
      load.on = vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        loadEvents.set(event, callback);
      });

      // Register events without creating progress bar
      scene.preload();
      // Destroy bar to simulate null state
      scene.create();

      // After create(), progressBar is null. Triggering progress should not throw.
      const progressCallback = loadEvents.get('progress');
      expect(() => progressCallback?.(0.5)).not.toThrow();
    });
  });

  describe('worker machine frame colors', () => {
    it('uses 5 distinct colors for machine states', () => {
      scene.preload();
      scene.create();

      const make = getMake(scene);
      const gfx = make.graphics.mock.results[3]!.value;

      // Should have 5 fillStyle calls for 5 frames
      expect(gfx.fillStyle).toHaveBeenCalledTimes(5);

      const colors = gfx.fillStyle.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      const uniqueColors = new Set(colors);
      expect(uniqueColors.size).toBe(5);
    });
  });
});
