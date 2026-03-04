import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ASSET_KEYS } from '../constants/asset-keys';

// Mock Phaser before importing the module under test
vi.mock('phaser', () => ({
  default: {
    Scene: class MockScene {},
  },
  __esModule: true,
}));

import {
  AnimationManager,
  ANIM_KEYS,
  getAnimationConfig,
} from './animation-manager';

interface CreatedAnimation {
  key: string;
  frames: unknown[];
  frameRate: number;
  repeat: number;
}

function createMockScene() {
  const createdAnimations = new Map<string, CreatedAnimation>();

  const anims = {
    exists: vi.fn((key: string) => createdAnimations.has(key)),
    create: vi.fn((config: CreatedAnimation) => {
      createdAnimations.set(config.key, config);
      return config;
    }),
    generateFrameNumbers: vi.fn(
      (textureKey: string, range: { start: number; end: number }) => {
        const frames = [];
        for (let i = range.start; i <= range.end; i++) {
          frames.push({ key: textureKey, frame: i });
        }
        return frames;
      },
    ),
  };

  const scene = { anims } as unknown as Phaser.Scene;

  return { scene, anims, createdAnimations };
}

describe('ANIM_KEYS', () => {
  it('exports all expected worker animation keys', () => {
    expect(ANIM_KEYS.WORKER_IDLE).toBe('worker-idle');
    expect(ANIM_KEYS.WORKER_WORKING).toBe('worker-working');
    expect(ANIM_KEYS.WORKER_STUCK).toBe('worker-stuck');
    expect(ANIM_KEYS.WORKER_ERROR).toBe('worker-error');
    expect(ANIM_KEYS.WORKER_DONE).toBe('worker-done');
  });

  it('exports all expected package animation keys', () => {
    expect(ANIM_KEYS.PACKAGE_IDLE).toBe('package-idle');
    expect(ANIM_KEYS.PACKAGE_MOVING).toBe('package-moving');
  });

  it('exports all expected belt animation keys', () => {
    expect(ANIM_KEYS.BELT_SCROLLING).toBe('belt-scrolling');
    expect(ANIM_KEYS.BELT_STOPPED).toBe('belt-stopped');
  });

  it('exports all expected effect animation keys', () => {
    expect(ANIM_KEYS.EFFECT_SPARKLE).toBe('effect-sparkle');
    expect(ANIM_KEYS.EFFECT_ERROR_FLASH).toBe('effect-error-flash');
  });

  it('is a frozen const object with exactly 11 keys', () => {
    expect(Object.keys(ANIM_KEYS)).toHaveLength(11);
  });
});

describe('getAnimationConfig', () => {
  it('returns config for all known animation keys', () => {
    for (const key of Object.values(ANIM_KEYS)) {
      const config = getAnimationConfig(key);
      expect(config).toBeDefined();
      expect(config).toHaveProperty('frameRate');
      expect(config).toHaveProperty('repeat');
      expect(typeof config!.frameRate).toBe('number');
      expect(typeof config!.repeat).toBe('number');
    }
  });

  it('returns undefined for unknown keys', () => {
    expect(getAnimationConfig('non-existent-anim')).toBeUndefined();
  });

  it('returns correct repeat values for looping vs non-looping animations', () => {
    // Looping animations (repeat: -1)
    expect(getAnimationConfig(ANIM_KEYS.WORKER_IDLE)!.repeat).toBe(-1);
    expect(getAnimationConfig(ANIM_KEYS.WORKER_WORKING)!.repeat).toBe(-1);
    expect(getAnimationConfig(ANIM_KEYS.WORKER_STUCK)!.repeat).toBe(-1);
    expect(getAnimationConfig(ANIM_KEYS.WORKER_ERROR)!.repeat).toBe(-1);
    expect(getAnimationConfig(ANIM_KEYS.BELT_SCROLLING)!.repeat).toBe(-1);
    expect(getAnimationConfig(ANIM_KEYS.PACKAGE_MOVING)!.repeat).toBe(-1);

    // Non-looping animations (repeat: 0)
    expect(getAnimationConfig(ANIM_KEYS.WORKER_DONE)!.repeat).toBe(0);
    expect(getAnimationConfig(ANIM_KEYS.PACKAGE_IDLE)!.repeat).toBe(0);
    expect(getAnimationConfig(ANIM_KEYS.BELT_STOPPED)!.repeat).toBe(0);
    expect(getAnimationConfig(ANIM_KEYS.EFFECT_SPARKLE)!.repeat).toBe(0);
    expect(getAnimationConfig(ANIM_KEYS.EFFECT_ERROR_FLASH)!.repeat).toBe(0);
  });

  it('returns positive frame rates for all animations', () => {
    for (const key of Object.values(ANIM_KEYS)) {
      expect(getAnimationConfig(key)!.frameRate).toBeGreaterThan(0);
    }
  });
});

describe('AnimationManager', () => {
  let scene: Phaser.Scene;
  let anims: ReturnType<typeof createMockScene>['anims'];
  let createdAnimations: Map<string, CreatedAnimation>;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ scene, anims, createdAnimations } = createMockScene());
  });

  describe('registerAll', () => {
    it('registers all 11 animations', () => {
      AnimationManager.registerAll(scene);
      expect(anims.create).toHaveBeenCalledTimes(11);
      expect(createdAnimations.size).toBe(11);
    });

    it('registers all expected animation keys', () => {
      AnimationManager.registerAll(scene);

      for (const key of Object.values(ANIM_KEYS)) {
        expect(createdAnimations.has(key)).toBe(true);
      }
    });

    it('is idempotent — calling twice does not create duplicate animations', () => {
      AnimationManager.registerAll(scene);
      expect(anims.create).toHaveBeenCalledTimes(11);

      // Second call should skip all — anims.exists returns true now
      AnimationManager.registerAll(scene);
      expect(anims.create).toHaveBeenCalledTimes(11); // No additional calls
    });

    it('checks existence before creating each animation', () => {
      AnimationManager.registerAll(scene);
      expect(anims.exists).toHaveBeenCalledTimes(11);

      // All 11 keys should have been checked
      const checkedKeys = anims.exists.mock.calls.map(
        (call: string[]) => call[0],
      );
      for (const key of Object.values(ANIM_KEYS)) {
        expect(checkedKeys).toContain(key);
      }
    });

    it('only creates animations that do not already exist', () => {
      // Pre-register one animation
      createdAnimations.set(ANIM_KEYS.WORKER_IDLE, {} as CreatedAnimation);

      AnimationManager.registerAll(scene);

      // Should only create 10 (skipping the pre-existing one)
      expect(anims.create).toHaveBeenCalledTimes(10);

      // The pre-existing one should not have been re-created
      const createdKeys = anims.create.mock.calls.map(
        (call: CreatedAnimation[]) => call[0]!.key,
      );
      expect(createdKeys).not.toContain(ANIM_KEYS.WORKER_IDLE);
    });
  });

  describe('worker animations', () => {
    beforeEach(() => {
      AnimationManager.registerAll(scene);
    });

    it('uses WORKER_MACHINE sprite sheet for all worker animations', () => {
      const workerKeys = [
        ANIM_KEYS.WORKER_IDLE,
        ANIM_KEYS.WORKER_WORKING,
        ANIM_KEYS.WORKER_STUCK,
        ANIM_KEYS.WORKER_ERROR,
        ANIM_KEYS.WORKER_DONE,
      ];

      for (const key of workerKeys) {
        const anim = createdAnimations.get(key)!;
        const frames = anim.frames as Array<{ key: string; frame: number }>;
        for (const frame of frames) {
          expect(frame.key).toBe(ASSET_KEYS.WORKER_MACHINE);
        }
      }
    });

    it('worker-idle uses frame 0', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_IDLE)!;
      const frames = anim.frames as Array<{ key: string; frame: number }>;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.frame).toBe(0);
    });

    it('worker-working uses frame 1', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_WORKING)!;
      const frames = anim.frames as Array<{ key: string; frame: number }>;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.frame).toBe(1);
    });

    it('worker-stuck uses frame 2', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_STUCK)!;
      const frames = anim.frames as Array<{ key: string; frame: number }>;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.frame).toBe(2);
    });

    it('worker-error uses frame 3', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_ERROR)!;
      const frames = anim.frames as Array<{ key: string; frame: number }>;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.frame).toBe(3);
    });

    it('worker-done uses frame 4', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_DONE)!;
      const frames = anim.frames as Array<{ key: string; frame: number }>;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.frame).toBe(4);
    });

    it('worker-idle loops infinitely', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_IDLE)!;
      expect(anim.repeat).toBe(-1);
    });

    it('worker-working loops infinitely', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_WORKING)!;
      expect(anim.repeat).toBe(-1);
    });

    it('worker-stuck loops infinitely', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_STUCK)!;
      expect(anim.repeat).toBe(-1);
    });

    it('worker-error loops infinitely', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_ERROR)!;
      expect(anim.repeat).toBe(-1);
    });

    it('worker-done plays once', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_DONE)!;
      expect(anim.repeat).toBe(0);
    });
  });

  describe('package animations', () => {
    beforeEach(() => {
      AnimationManager.registerAll(scene);
    });

    it('uses PACKAGE_CRATE sprite sheet for all package animations', () => {
      const packageKeys = [ANIM_KEYS.PACKAGE_IDLE, ANIM_KEYS.PACKAGE_MOVING];

      for (const key of packageKeys) {
        const anim = createdAnimations.get(key)!;
        const frames = anim.frames as Array<{ key: string; frame: number }>;
        for (const frame of frames) {
          expect(frame.key).toBe(ASSET_KEYS.PACKAGE_CRATE);
        }
      }
    });

    it('package-idle uses frame 0 and does not loop', () => {
      const anim = createdAnimations.get(ANIM_KEYS.PACKAGE_IDLE)!;
      const frames = anim.frames as Array<{ key: string; frame: number }>;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.frame).toBe(0);
      expect(anim.repeat).toBe(0);
    });

    it('package-moving uses frame 0 and loops', () => {
      const anim = createdAnimations.get(ANIM_KEYS.PACKAGE_MOVING)!;
      const frames = anim.frames as Array<{ key: string; frame: number }>;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.frame).toBe(0);
      expect(anim.repeat).toBe(-1);
    });
  });

  describe('belt animations', () => {
    beforeEach(() => {
      AnimationManager.registerAll(scene);
    });

    it('uses CONVEYOR_BELT sprite sheet for all belt animations', () => {
      const beltKeys = [ANIM_KEYS.BELT_SCROLLING, ANIM_KEYS.BELT_STOPPED];

      for (const key of beltKeys) {
        const anim = createdAnimations.get(key)!;
        const frames = anim.frames as Array<{ key: string; frame: number }>;
        for (const frame of frames) {
          expect(frame.key).toBe(ASSET_KEYS.CONVEYOR_BELT);
        }
      }
    });

    it('belt-scrolling uses frames 0-3 and loops', () => {
      const anim = createdAnimations.get(ANIM_KEYS.BELT_SCROLLING)!;
      const frames = anim.frames as Array<{ key: string; frame: number }>;
      expect(frames).toHaveLength(4);
      expect(frames[0]!.frame).toBe(0);
      expect(frames[1]!.frame).toBe(1);
      expect(frames[2]!.frame).toBe(2);
      expect(frames[3]!.frame).toBe(3);
      expect(anim.repeat).toBe(-1);
    });

    it('belt-scrolling has ~200ms per frame (~5 fps)', () => {
      const anim = createdAnimations.get(ANIM_KEYS.BELT_SCROLLING)!;
      expect(anim.frameRate).toBe(1000 / 200);
    });

    it('belt-stopped uses frame 0 and does not loop', () => {
      const anim = createdAnimations.get(ANIM_KEYS.BELT_STOPPED)!;
      const frames = anim.frames as Array<{ key: string; frame: number }>;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.frame).toBe(0);
      expect(anim.repeat).toBe(0);
    });
  });

  describe('effect animations', () => {
    beforeEach(() => {
      AnimationManager.registerAll(scene);
    });

    it('effect-sparkle uses WORKER_MACHINE frame 4 and plays once', () => {
      const anim = createdAnimations.get(ANIM_KEYS.EFFECT_SPARKLE)!;
      const frames = anim.frames as Array<{ key: string; frame: number }>;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.key).toBe(ASSET_KEYS.WORKER_MACHINE);
      expect(frames[0]!.frame).toBe(4);
      expect(anim.repeat).toBe(0);
    });

    it('effect-error-flash uses WORKER_MACHINE frame 3 and plays once', () => {
      const anim = createdAnimations.get(ANIM_KEYS.EFFECT_ERROR_FLASH)!;
      const frames = anim.frames as Array<{ key: string; frame: number }>;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.key).toBe(ASSET_KEYS.WORKER_MACHINE);
      expect(frames[0]!.frame).toBe(3);
      expect(anim.repeat).toBe(0);
    });
  });

  describe('frame rate accuracy', () => {
    beforeEach(() => {
      AnimationManager.registerAll(scene);
    });

    it('worker-idle targets ~800ms cycle', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_IDLE)!;
      // With 1 frame, frameRate = 1000/800 * 4 = 5
      expect(anim.frameRate).toBe(5);
    });

    it('worker-working targets ~400ms cycle', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_WORKING)!;
      // With 1 frame, frameRate = 1000/400 * 4 = 10
      expect(anim.frameRate).toBe(10);
    });

    it('worker-stuck targets ~600ms cycle', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_STUCK)!;
      // frameRate = 1000/600 * 4 ≈ 6.67
      expect(anim.frameRate).toBeCloseTo(1000 / 600 * 4, 2);
    });

    it('worker-error targets ~500ms cycle', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_ERROR)!;
      // frameRate = 1000/500 * 4 = 8
      expect(anim.frameRate).toBe(8);
    });

    it('worker-done targets ~800ms with fewer repeats', () => {
      const anim = createdAnimations.get(ANIM_KEYS.WORKER_DONE)!;
      // frameRate = 1000/800 * 2 = 2.5
      expect(anim.frameRate).toBe(2.5);
    });
  });

  describe('partial pre-registration', () => {
    it('skips only pre-existing animations and creates the rest', () => {
      // Pre-register 3 animations
      createdAnimations.set(ANIM_KEYS.WORKER_IDLE, {} as CreatedAnimation);
      createdAnimations.set(ANIM_KEYS.BELT_SCROLLING, {} as CreatedAnimation);
      createdAnimations.set(ANIM_KEYS.EFFECT_SPARKLE, {} as CreatedAnimation);

      AnimationManager.registerAll(scene);

      expect(anims.create).toHaveBeenCalledTimes(8); // 11 - 3 = 8

      const createdKeys = anims.create.mock.calls.map(
        (call: CreatedAnimation[]) => call[0]!.key,
      );
      expect(createdKeys).not.toContain(ANIM_KEYS.WORKER_IDLE);
      expect(createdKeys).not.toContain(ANIM_KEYS.BELT_SCROLLING);
      expect(createdKeys).not.toContain(ANIM_KEYS.EFFECT_SPARKLE);

      // All other keys should have been created
      expect(createdKeys).toContain(ANIM_KEYS.WORKER_WORKING);
      expect(createdKeys).toContain(ANIM_KEYS.WORKER_STUCK);
      expect(createdKeys).toContain(ANIM_KEYS.WORKER_ERROR);
      expect(createdKeys).toContain(ANIM_KEYS.WORKER_DONE);
      expect(createdKeys).toContain(ANIM_KEYS.PACKAGE_IDLE);
      expect(createdKeys).toContain(ANIM_KEYS.PACKAGE_MOVING);
      expect(createdKeys).toContain(ANIM_KEYS.BELT_STOPPED);
      expect(createdKeys).toContain(ANIM_KEYS.EFFECT_ERROR_FLASH);
    });
  });

  describe('generateFrameNumbers calls', () => {
    it('calls generateFrameNumbers with correct sprite sheet keys', () => {
      AnimationManager.registerAll(scene);

      const textureKeys = anims.generateFrameNumbers.mock.calls.map(
        (call: [string, unknown]) => call[0],
      );

      // Worker machine used 5 times (idle, working, stuck, error, done) + 2 effects
      expect(
        textureKeys.filter((k: string) => k === ASSET_KEYS.WORKER_MACHINE),
      ).toHaveLength(7);

      // Package crate used 2 times (idle, moving)
      expect(
        textureKeys.filter((k: string) => k === ASSET_KEYS.PACKAGE_CRATE),
      ).toHaveLength(2);

      // Conveyor belt used 2 times (scrolling, stopped)
      expect(
        textureKeys.filter((k: string) => k === ASSET_KEYS.CONVEYOR_BELT),
      ).toHaveLength(2);
    });
  });
});
