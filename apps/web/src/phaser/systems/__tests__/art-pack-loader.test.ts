import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  type ArtPackManifest,
  type ArtPackAssetEntry,
  DEFAULT_ART_PACK,
  validateManifest,
  loadArtPack,
  switchArtPack,
} from '../art-pack-loader';
import { ASSET_KEYS } from '../../constants/asset-keys';

// ---------------------------------------------------------------------------
// Helpers to build a mock Phaser.Scene
// ---------------------------------------------------------------------------

function createMockScene() {
  const loadListeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const sceneListeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const existingTextures = new Set<string>();

  const scene = {
    textures: {
      exists: vi.fn((key: string) => existingTextures.has(key)),
      remove: vi.fn((key: string) => {
        existingTextures.delete(key);
      }),
      _add: (key: string) => existingTextures.add(key),
    },
    load: {
      spritesheet: vi.fn(),
      start: vi.fn(),
      on: vi.fn(
        (event: string, cb: (...args: unknown[]) => void) => {
          const list = loadListeners.get(event) ?? [];
          list.push(cb);
          loadListeners.set(event, list);
        },
      ),
      once: vi.fn(
        (event: string, cb: (...args: unknown[]) => void) => {
          const list = loadListeners.get(event) ?? [];
          list.push(cb);
          loadListeners.set(event, list);
        },
      ),
    },
    events: {
      emit: vi.fn(),
      on: vi.fn(
        (event: string, cb: (...args: unknown[]) => void) => {
          const list = sceneListeners.get(event) ?? [];
          list.push(cb);
          sceneListeners.set(event, list);
        },
      ),
    },
    // Test helper to fire load events
    _fireLoadEvent: (event: string, ...args: unknown[]) => {
      for (const cb of loadListeners.get(event) ?? []) {
        cb(...args);
      }
    },
    _existingTextures: existingTextures,
  };

  // Make load.start() auto-fire 'complete' by default
  scene.load.start.mockImplementation(() => {
    scene._fireLoadEvent('complete');
  });

  return scene;
}

type MockScene = ReturnType<typeof createMockScene>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArtPackLoader', () => {
  let scene: MockScene;

  beforeEach(() => {
    vi.restoreAllMocks();
    scene = createMockScene();
  });

  // -----------------------------------------------------------------------
  // Type / manifest structure
  // -----------------------------------------------------------------------

  describe('DEFAULT_ART_PACK', () => {
    it('has name "default"', () => {
      expect(DEFAULT_ART_PACK.name).toBe('default');
    });

    it('has version "1.0.0"', () => {
      expect(DEFAULT_ART_PACK.version).toBe('1.0.0');
    });

    it('contains entries for all ASSET_KEYS', () => {
      for (const key of Object.values(ASSET_KEYS)) {
        expect(DEFAULT_ART_PACK.assets).toHaveProperty(key);
      }
    });

    it('all default entries have empty path (programmatic textures)', () => {
      for (const entry of Object.values(DEFAULT_ART_PACK.assets)) {
        expect(entry!.path).toBe('');
      }
    });

    it('floor-tile entry matches BootScene dimensions', () => {
      const entry = DEFAULT_ART_PACK.assets[ASSET_KEYS.FLOOR_TILE]!;
      expect(entry.frameWidth).toBe(64);
      expect(entry.frameHeight).toBe(32);
      expect(entry.frameCount).toBe(1);
    });

    it('wall-segment entry matches BootScene dimensions', () => {
      const entry = DEFAULT_ART_PACK.assets[ASSET_KEYS.WALL_SEGMENT]!;
      expect(entry.frameWidth).toBe(64);
      expect(entry.frameHeight).toBe(48);
      expect(entry.frameCount).toBe(1);
    });

    it('conveyor-belt entry matches BootScene dimensions', () => {
      const entry = DEFAULT_ART_PACK.assets[ASSET_KEYS.CONVEYOR_BELT]!;
      expect(entry.frameWidth).toBe(64);
      expect(entry.frameHeight).toBe(32);
      expect(entry.frameCount).toBe(4);
    });

    it('worker-machine entry matches BootScene dimensions', () => {
      const entry = DEFAULT_ART_PACK.assets[ASSET_KEYS.WORKER_MACHINE]!;
      expect(entry.frameWidth).toBe(64);
      expect(entry.frameHeight).toBe(64);
      expect(entry.frameCount).toBe(5);
    });

    it('package-crate entry matches BootScene dimensions', () => {
      const entry = DEFAULT_ART_PACK.assets[ASSET_KEYS.PACKAGE_CRATE]!;
      expect(entry.frameWidth).toBe(32);
      expect(entry.frameHeight).toBe(32);
      expect(entry.frameCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // validateManifest
  // -----------------------------------------------------------------------

  describe('validateManifest', () => {
    it('returns empty array for a complete manifest', () => {
      const result = validateManifest(DEFAULT_ART_PACK);
      expect(result).toEqual([]);
    });

    it('returns missing keys for an incomplete manifest', () => {
      const partial: ArtPackManifest = {
        name: 'partial',
        version: '1.0.0',
        assets: {
          [ASSET_KEYS.FLOOR_TILE]: {
            path: '/art/floor.png',
            frameWidth: 64,
            frameHeight: 32,
            frameCount: 1,
          },
        },
      };
      const missing = validateManifest(partial);
      expect(missing).toContain(ASSET_KEYS.WALL_SEGMENT);
      expect(missing).toContain(ASSET_KEYS.CONVEYOR_BELT);
      expect(missing).toContain(ASSET_KEYS.WORKER_MACHINE);
      expect(missing).toContain(ASSET_KEYS.PACKAGE_CRATE);
      expect(missing).not.toContain(ASSET_KEYS.FLOOR_TILE);
    });

    it('warns on each missing key', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const empty: ArtPackManifest = {
        name: 'empty',
        version: '0.0.0',
        assets: {},
      };
      validateManifest(empty);
      expect(warnSpy).toHaveBeenCalledTimes(Object.keys(ASSET_KEYS).length);
      for (const key of Object.values(ASSET_KEYS)) {
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining(key),
        );
      }
    });

    it('ignores unknown keys in assets without error', () => {
      const manifest: ArtPackManifest = {
        ...DEFAULT_ART_PACK,
        assets: {
          ...DEFAULT_ART_PACK.assets,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ['unknown-asset' as any]: {
            path: '/art/unknown.png',
            frameWidth: 32,
            frameHeight: 32,
            frameCount: 1,
          },
        },
      };
      const missing = validateManifest(manifest);
      expect(missing).toEqual([]);
    });

    it('returns all ASSET_KEYS for a fully empty assets object', () => {
      const empty: ArtPackManifest = {
        name: 'none',
        version: '0.0.0',
        assets: {},
      };
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const missing = validateManifest(empty);
      expect(missing.length).toBe(Object.keys(ASSET_KEYS).length);
    });
  });

  // -----------------------------------------------------------------------
  // loadArtPack
  // -----------------------------------------------------------------------

  describe('loadArtPack', () => {
    it('skips loading for the default art pack (all empty paths)', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await loadArtPack(scene as unknown as Phaser.Scene, DEFAULT_ART_PACK);
      expect(scene.load.spritesheet).not.toHaveBeenCalled();
      expect(scene.load.start).not.toHaveBeenCalled();
    });

    it('loads spritesheets for entries with non-empty paths', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manifest: ArtPackManifest = {
        name: 'custom',
        version: '1.0.0',
        assets: {
          ...DEFAULT_ART_PACK.assets,
          [ASSET_KEYS.WORKER_MACHINE]: {
            path: '/art/custom-worker.png',
            frameWidth: 128,
            frameHeight: 128,
            frameCount: 5,
          },
        },
      };

      await loadArtPack(scene as unknown as Phaser.Scene, manifest);

      expect(scene.load.spritesheet).toHaveBeenCalledWith(
        ASSET_KEYS.WORKER_MACHINE,
        '/art/custom-worker.png',
        { frameWidth: 128, frameHeight: 128 },
      );
      expect(scene.load.start).toHaveBeenCalled();
    });

    it('removes existing texture before loading replacement', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      scene._existingTextures.add(ASSET_KEYS.WORKER_MACHINE);

      const manifest: ArtPackManifest = {
        name: 'custom',
        version: '1.0.0',
        assets: {
          ...DEFAULT_ART_PACK.assets,
          [ASSET_KEYS.WORKER_MACHINE]: {
            path: '/art/worker.png',
            frameWidth: 64,
            frameHeight: 64,
            frameCount: 5,
          },
        },
      };

      await loadArtPack(scene as unknown as Phaser.Scene, manifest);

      expect(scene.textures.remove).toHaveBeenCalledWith(
        ASSET_KEYS.WORKER_MACHINE,
      );
    });

    it('does not remove texture if it does not exist', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manifest: ArtPackManifest = {
        name: 'custom',
        version: '1.0.0',
        assets: {
          ...DEFAULT_ART_PACK.assets,
          [ASSET_KEYS.PACKAGE_CRATE]: {
            path: '/art/crate.png',
            frameWidth: 32,
            frameHeight: 32,
            frameCount: 1,
          },
        },
      };

      await loadArtPack(scene as unknown as Phaser.Scene, manifest);

      expect(scene.textures.remove).not.toHaveBeenCalled();
    });

    it('calls validateManifest and warns on missing keys', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const partial: ArtPackManifest = {
        name: 'partial',
        version: '1.0.0',
        assets: {},
      };

      await loadArtPack(scene as unknown as Phaser.Scene, partial);

      // Should have warned for all missing keys
      expect(warnSpy).toHaveBeenCalledTimes(Object.keys(ASSET_KEYS).length);
    });

    it('emits art-pack-asset-failed for each failed asset', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const manifest: ArtPackManifest = {
        name: 'custom',
        version: '1.0.0',
        assets: {
          ...DEFAULT_ART_PACK.assets,
          [ASSET_KEYS.WORKER_MACHINE]: {
            path: '/art/missing-worker.png',
            frameWidth: 64,
            frameHeight: 64,
            frameCount: 5,
          },
          [ASSET_KEYS.PACKAGE_CRATE]: {
            path: '/art/missing-crate.png',
            frameWidth: 32,
            frameHeight: 32,
            frameCount: 1,
          },
        },
      };

      // Simulate load errors before completion
      scene.load.start.mockImplementation(() => {
        scene._fireLoadEvent('loaderror', {
          key: ASSET_KEYS.WORKER_MACHINE,
          url: '/art/missing-worker.png',
        });
        scene._fireLoadEvent('loaderror', {
          key: ASSET_KEYS.PACKAGE_CRATE,
          url: '/art/missing-crate.png',
        });
        scene._fireLoadEvent('complete');
      });

      await loadArtPack(scene as unknown as Phaser.Scene, manifest);

      expect(scene.events.emit).toHaveBeenCalledWith(
        'art-pack-asset-failed',
        ASSET_KEYS.WORKER_MACHINE,
      );
      expect(scene.events.emit).toHaveBeenCalledWith(
        'art-pack-asset-failed',
        ASSET_KEYS.PACKAGE_CRATE,
      );
    });

    it('logs error per failed asset with key and URL', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const manifest: ArtPackManifest = {
        name: 'custom',
        version: '1.0.0',
        assets: {
          ...DEFAULT_ART_PACK.assets,
          [ASSET_KEYS.FLOOR_TILE]: {
            path: '/art/bad-floor.png',
            frameWidth: 64,
            frameHeight: 32,
            frameCount: 1,
          },
        },
      };

      scene.load.start.mockImplementation(() => {
        scene._fireLoadEvent('loaderror', {
          key: ASSET_KEYS.FLOOR_TILE,
          url: '/art/bad-floor.png',
        });
        scene._fireLoadEvent('complete');
      });

      await loadArtPack(scene as unknown as Phaser.Scene, manifest);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(ASSET_KEYS.FLOOR_TILE),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('/art/bad-floor.png'),
      );
    });

    it('loads multiple assets in a single batch', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manifest: ArtPackManifest = {
        name: 'full-custom',
        version: '2.0.0',
        assets: {
          [ASSET_KEYS.FLOOR_TILE]: {
            path: '/art/floor.png',
            frameWidth: 64,
            frameHeight: 32,
            frameCount: 1,
          },
          [ASSET_KEYS.WALL_SEGMENT]: {
            path: '/art/wall.png',
            frameWidth: 64,
            frameHeight: 48,
            frameCount: 1,
          },
          [ASSET_KEYS.CONVEYOR_BELT]: {
            path: '/art/conveyor.png',
            frameWidth: 64,
            frameHeight: 32,
            frameCount: 4,
          },
          [ASSET_KEYS.WORKER_MACHINE]: {
            path: '/art/worker.png',
            frameWidth: 64,
            frameHeight: 64,
            frameCount: 5,
          },
          [ASSET_KEYS.PACKAGE_CRATE]: {
            path: '/art/crate.png',
            frameWidth: 32,
            frameHeight: 32,
            frameCount: 1,
          },
        },
      };

      await loadArtPack(scene as unknown as Phaser.Scene, manifest);

      expect(scene.load.spritesheet).toHaveBeenCalledTimes(5);
      expect(scene.load.start).toHaveBeenCalledTimes(1);
    });

    it('supports absolute URLs for custom art pack paths', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manifest: ArtPackManifest = {
        name: 'cdn-pack',
        version: '1.0.0',
        assets: {
          ...DEFAULT_ART_PACK.assets,
          [ASSET_KEYS.WORKER_MACHINE]: {
            path: 'https://cdn.example.com/art/worker.png',
            frameWidth: 64,
            frameHeight: 64,
            frameCount: 5,
          },
        },
      };

      await loadArtPack(scene as unknown as Phaser.Scene, manifest);

      expect(scene.load.spritesheet).toHaveBeenCalledWith(
        ASSET_KEYS.WORKER_MACHINE,
        'https://cdn.example.com/art/worker.png',
        { frameWidth: 64, frameHeight: 64 },
      );
    });

    it('supports relative URLs for custom art pack paths', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manifest: ArtPackManifest = {
        name: 'local-pack',
        version: '1.0.0',
        assets: {
          ...DEFAULT_ART_PACK.assets,
          [ASSET_KEYS.FLOOR_TILE]: {
            path: './assets/floor.png',
            frameWidth: 64,
            frameHeight: 32,
            frameCount: 1,
          },
        },
      };

      await loadArtPack(scene as unknown as Phaser.Scene, manifest);

      expect(scene.load.spritesheet).toHaveBeenCalledWith(
        ASSET_KEYS.FLOOR_TILE,
        './assets/floor.png',
        { frameWidth: 64, frameHeight: 32 },
      );
    });

    it('does not emit art-pack-asset-failed when all assets load successfully', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manifest: ArtPackManifest = {
        name: 'custom',
        version: '1.0.0',
        assets: {
          ...DEFAULT_ART_PACK.assets,
          [ASSET_KEYS.WORKER_MACHINE]: {
            path: '/art/worker.png',
            frameWidth: 64,
            frameHeight: 64,
            frameCount: 5,
          },
        },
      };

      await loadArtPack(scene as unknown as Phaser.Scene, manifest);

      expect(scene.events.emit).not.toHaveBeenCalledWith(
        'art-pack-asset-failed',
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // switchArtPack
  // -----------------------------------------------------------------------

  describe('switchArtPack', () => {
    it('calls loadArtPack and then emits art-pack-switched', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const manifest: ArtPackManifest = {
        name: 'pixel-art',
        version: '2.0.0',
        assets: {
          ...DEFAULT_ART_PACK.assets,
          [ASSET_KEYS.WORKER_MACHINE]: {
            path: '/art/pixel-worker.png',
            frameWidth: 64,
            frameHeight: 64,
            frameCount: 5,
          },
        },
      };

      await switchArtPack(scene as unknown as Phaser.Scene, manifest);

      // Should have loaded the spritesheet
      expect(scene.load.spritesheet).toHaveBeenCalledWith(
        ASSET_KEYS.WORKER_MACHINE,
        '/art/pixel-worker.png',
        { frameWidth: 64, frameHeight: 64 },
      );

      // Should have emitted the switched event
      expect(scene.events.emit).toHaveBeenCalledWith(
        'art-pack-switched',
        'pixel-art',
      );
    });

    it('emits art-pack-switched even for the default pack', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await switchArtPack(
        scene as unknown as Phaser.Scene,
        DEFAULT_ART_PACK,
      );
      expect(scene.events.emit).toHaveBeenCalledWith(
        'art-pack-switched',
        'default',
      );
    });

    it('emits art-pack-switched after load completes, not before', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const callOrder: string[] = [];

      scene.load.start.mockImplementation(() => {
        callOrder.push('load-start');
        scene._fireLoadEvent('complete');
      });

      scene.events.emit = vi.fn((...args: unknown[]) => {
        if (args[0] === 'art-pack-switched') {
          callOrder.push('art-pack-switched');
        }
      });

      const manifest: ArtPackManifest = {
        name: 'test',
        version: '1.0.0',
        assets: {
          ...DEFAULT_ART_PACK.assets,
          [ASSET_KEYS.FLOOR_TILE]: {
            path: '/art/floor.png',
            frameWidth: 64,
            frameHeight: 32,
            frameCount: 1,
          },
        },
      };

      await switchArtPack(scene as unknown as Phaser.Scene, manifest);

      expect(callOrder).toEqual(['load-start', 'art-pack-switched']);
    });
  });

  // -----------------------------------------------------------------------
  // Type exports
  // -----------------------------------------------------------------------

  describe('exported types', () => {
    it('ArtPackAssetEntry has the expected shape', () => {
      const entry: ArtPackAssetEntry = {
        path: '/test.png',
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 1,
      };
      expect(entry.path).toBe('/test.png');
      expect(entry.frameWidth).toBe(32);
      expect(entry.frameHeight).toBe(32);
      expect(entry.frameCount).toBe(1);
    });

    it('ArtPackManifest has the expected shape', () => {
      const manifest: ArtPackManifest = {
        name: 'test',
        version: '0.1.0',
        assets: {},
      };
      expect(manifest.name).toBe('test');
      expect(manifest.version).toBe('0.1.0');
      expect(manifest.assets).toEqual({});
    });
  });
});
