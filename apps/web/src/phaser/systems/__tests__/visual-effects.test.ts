import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Phaser mock ────────────────────────────────────────────────────────

interface MockTween {
  stop: ReturnType<typeof vi.fn>;
  config: Record<string, unknown>;
}

let mockTweens: MockTween[] = [];

vi.mock('phaser', () => {
  return {
    default: {
      GameObjects: {
        Sprite: class MockSprite {},
      },
    },
    __esModule: true,
  };
});

import {
  VisualEffects,
  prefersReducedMotion,
  SPARKLE_TEXTURE_KEY,
  SPARKLE_RADIUS,
  COMPLETION_PARTICLE_COUNT,
  COMPLETION_PARTICLE_LIFESPAN,
  COMPLETION_PARTICLE_SPEED,
  ERROR_SHAKE_OFFSET,
  ERROR_SHAKE_DURATION,
  ERROR_SHAKE_REPEATS,
  ERROR_TINT,
  STUCK_TINT,
  STUCK_PULSE_DURATION,
  STUCK_PULSE_ALPHA,
  POP_IN_OVERSHOOT_SCALE,
  POP_IN_DURATION,
} from '../visual-effects';
import type Phaser from 'phaser';

// ── Helpers ────────────────────────────────────────────────────────────

interface MockParticleEmitter {
  config: Record<string, unknown>;
  explode: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

interface MockDelayedCall {
  delay: number;
  callback: () => void;
}

interface MockGraphics {
  fillStyle: ReturnType<typeof vi.fn>;
  fillCircle: ReturnType<typeof vi.fn>;
  generateTexture: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

type MockScene = Phaser.Scene & {
  _particles: MockParticleEmitter[];
  _delayedCalls: MockDelayedCall[];
  _graphics: MockGraphics[];
};

function createMockScene(): MockScene {
  mockTweens = [];

  const particles: MockParticleEmitter[] = [];
  const delayedCalls: MockDelayedCall[] = [];
  const graphics: MockGraphics[] = [];

  const existingTextures = new Set<string>();

  const scene = {
    _particles: particles,
    _delayedCalls: delayedCalls,
    _graphics: graphics,
    add: {
      particles: vi.fn(
        (x: number, y: number, textureKey: string, config: Record<string, unknown>) => {
          const emitter = {
            config: { x, y, textureKey, ...config },
            explode: vi.fn(),
            destroy: vi.fn(),
          };
          particles.push(emitter);
          return emitter;
        },
      ),
    },
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        const tween: MockTween = { stop: vi.fn(), config };
        mockTweens.push(tween);
        return tween;
      }),
    },
    time: {
      delayedCall: vi.fn((delay: number, callback: () => void) => {
        delayedCalls.push({ delay, callback });
      }),
    },
    textures: {
      exists: vi.fn((key: string) => existingTextures.has(key)),
      _addTexture: (key: string) => existingTextures.add(key),
    },
    make: {
      graphics: vi.fn(() => {
        const gfx = {
          fillStyle: vi.fn(),
          fillCircle: vi.fn(),
          generateTexture: vi.fn((key: string) => {
            existingTextures.add(key);
          }),
          destroy: vi.fn(),
        };
        graphics.push(gfx);
        return gfx;
      }),
    },
  } as unknown as MockScene;

  return scene;
}

function createMockSprite(
  overrides: Partial<{ x: number; y: number; alpha: number; scaleX: number; scaleY: number }> = {},
): Phaser.GameObjects.Sprite {
  return {
    x: 100,
    y: 200,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    setTint: vi.fn(),
    clearTint: vi.fn(),
    setAlpha: vi.fn(function (this: { alpha: number }, a: number) {
      this.alpha = a;
      return this;
    }),
    setScale: vi.fn(function (this: { scaleX: number; scaleY: number }, s: number) {
      this.scaleX = s;
      this.scaleY = s;
      return this;
    }),
    ...overrides,
  } as unknown as Phaser.GameObjects.Sprite;
}

/** Invokes the onComplete callback of the nth tween (0-indexed). */
function completeTween(index: number): void {
  const tween = mockTweens[index];
  if (!tween) throw new Error(`No tween at index ${index}`);
  const onComplete = tween.config.onComplete as (() => void) | undefined;
  if (!onComplete) throw new Error(`Tween ${index} has no onComplete`);
  onComplete();
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('VisualEffects', () => {
  let scene: MockScene;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTweens = [];
    scene = createMockScene();
    VisualEffects.enabled = true;
  });

  afterEach(() => {
    VisualEffects.enabled = true;
  });

  // ─── Constants ──────────────────────────────────────────────────────

  describe('constants', () => {
    it('SPARKLE_TEXTURE_KEY is defined', () => {
      expect(SPARKLE_TEXTURE_KEY).toBe('__vfx_sparkle__');
    });

    it('SPARKLE_RADIUS is 4', () => {
      expect(SPARKLE_RADIUS).toBe(4);
    });

    it('COMPLETION_PARTICLE_COUNT is 15', () => {
      expect(COMPLETION_PARTICLE_COUNT).toBe(15);
    });

    it('COMPLETION_PARTICLE_LIFESPAN is 800ms', () => {
      expect(COMPLETION_PARTICLE_LIFESPAN).toBe(800);
    });

    it('COMPLETION_PARTICLE_SPEED has min 40 and max 120', () => {
      expect(COMPLETION_PARTICLE_SPEED).toEqual({ min: 40, max: 120 });
    });

    it('ERROR_SHAKE_OFFSET is 3px', () => {
      expect(ERROR_SHAKE_OFFSET).toBe(3);
    });

    it('ERROR_SHAKE_DURATION is 50ms', () => {
      expect(ERROR_SHAKE_DURATION).toBe(50);
    });

    it('ERROR_SHAKE_REPEATS is 5', () => {
      expect(ERROR_SHAKE_REPEATS).toBe(5);
    });

    it('ERROR_TINT is red', () => {
      expect(ERROR_TINT).toBe(0xff0000);
    });

    it('STUCK_TINT is yellow', () => {
      expect(STUCK_TINT).toBe(0xffff00);
    });

    it('STUCK_PULSE_DURATION is 600ms', () => {
      expect(STUCK_PULSE_DURATION).toBe(600);
    });

    it('STUCK_PULSE_ALPHA is 0.7', () => {
      expect(STUCK_PULSE_ALPHA).toBe(0.7);
    });

    it('POP_IN_OVERSHOOT_SCALE is 1.2', () => {
      expect(POP_IN_OVERSHOOT_SCALE).toBe(1.2);
    });

    it('POP_IN_DURATION is 400ms', () => {
      expect(POP_IN_DURATION).toBe(400);
    });
  });

  // ─── prefersReducedMotion ──────────────────────────────────────────

  describe('prefersReducedMotion', () => {
    it('returns false when matchMedia not available', () => {
      const original = window.matchMedia;
      Object.defineProperty(window, 'matchMedia', { value: undefined, writable: true });
      expect(prefersReducedMotion()).toBe(false);
      Object.defineProperty(window, 'matchMedia', { value: original, writable: true });
    });

    it('returns false when prefers-reduced-motion is not reduce', () => {
      const original = window.matchMedia;
      Object.defineProperty(window, 'matchMedia', {
        value: () => ({ matches: false }),
        writable: true,
      });
      expect(prefersReducedMotion()).toBe(false);
      Object.defineProperty(window, 'matchMedia', { value: original, writable: true });
    });

    it('returns true when prefers-reduced-motion is reduce', () => {
      const original = window.matchMedia;
      Object.defineProperty(window, 'matchMedia', {
        value: () => ({ matches: true }),
        writable: true,
      });
      expect(prefersReducedMotion()).toBe(true);
      Object.defineProperty(window, 'matchMedia', { value: original, writable: true });
    });
  });

  // ─── enabled flag ──────────────────────────────────────────────────

  describe('enabled flag', () => {
    it('defaults to true', () => {
      expect(VisualEffects.enabled).toBe(true);
    });

    it('skips completionEffect when disabled', () => {
      VisualEffects.enabled = false;
      VisualEffects.completionEffect(scene, 100, 200);
      expect(scene.add.particles).not.toHaveBeenCalled();
    });

    it('skips errorEffect when disabled', () => {
      VisualEffects.enabled = false;
      const target = createMockSprite();
      VisualEffects.errorEffect(scene, target);
      expect(scene.tweens.add).not.toHaveBeenCalled();
      expect(target.setTint).not.toHaveBeenCalled();
    });

    it('stuckEffect returns no-op cleanup when disabled', () => {
      VisualEffects.enabled = false;
      const target = createMockSprite();
      const cleanup = VisualEffects.stuckEffect(scene, target);
      expect(scene.tweens.add).not.toHaveBeenCalled();
      expect(typeof cleanup).toBe('function');
      // Should not throw
      cleanup();
    });

    it('skips newPackageEffect when disabled', () => {
      VisualEffects.enabled = false;
      const target = createMockSprite();
      VisualEffects.newPackageEffect(scene, target);
      expect(scene.tweens.add).not.toHaveBeenCalled();
      expect(target.setScale).not.toHaveBeenCalled();
    });

    it('skips all effects when reduced motion is preferred', () => {
      const original = window.matchMedia;
      Object.defineProperty(window, 'matchMedia', {
        value: () => ({ matches: true }),
        writable: true,
      });

      VisualEffects.completionEffect(scene, 100, 200);
      expect(scene.add.particles).not.toHaveBeenCalled();

      const target = createMockSprite();
      VisualEffects.errorEffect(scene, target);
      expect(scene.tweens.add).not.toHaveBeenCalled();

      Object.defineProperty(window, 'matchMedia', { value: original, writable: true });
    });
  });

  // ─── completionEffect ─────────────────────────────────────────────

  describe('completionEffect', () => {
    it('creates a particle emitter at the given position', () => {
      VisualEffects.completionEffect(scene, 300, 400);

      expect(scene.add.particles).toHaveBeenCalledWith(
        300,
        400,
        SPARKLE_TEXTURE_KEY,
        expect.objectContaining({
          speed: COMPLETION_PARTICLE_SPEED,
          lifespan: COMPLETION_PARTICLE_LIFESPAN,
          quantity: COMPLETION_PARTICLE_COUNT,
          emitting: false,
        }),
      );
    });

    it('calls explode with the correct particle count', () => {
      VisualEffects.completionEffect(scene, 300, 400);

      expect(scene._particles).toHaveLength(1);
      expect(scene._particles[0]!.explode).toHaveBeenCalledWith(COMPLETION_PARTICLE_COUNT);
    });

    it('schedules emitter destruction after lifespan', () => {
      VisualEffects.completionEffect(scene, 300, 400);

      expect(scene._delayedCalls).toHaveLength(1);
      expect(scene._delayedCalls[0]!.delay).toBe(COMPLETION_PARTICLE_LIFESPAN + 100);
    });

    it('destroys emitter when delayed call fires', () => {
      VisualEffects.completionEffect(scene, 300, 400);

      const emitter = scene._particles[0]!;
      scene._delayedCalls[0]!.callback();

      expect(emitter.destroy).toHaveBeenCalled();
    });

    it('generates sparkle texture if missing', () => {
      VisualEffects.completionEffect(scene, 0, 0);

      expect(scene.make.graphics).toHaveBeenCalled();
      const gfx = scene._graphics[0]!;
      expect(gfx.fillStyle).toHaveBeenCalledWith(0xffd700, 1);
      expect(gfx.fillCircle).toHaveBeenCalledWith(SPARKLE_RADIUS, SPARKLE_RADIUS, SPARKLE_RADIUS);
      expect(gfx.generateTexture).toHaveBeenCalledWith(SPARKLE_TEXTURE_KEY, SPARKLE_RADIUS * 2, SPARKLE_RADIUS * 2);
      expect(gfx.destroy).toHaveBeenCalled();
    });

    it('does not regenerate sparkle texture if it already exists', () => {
      // Generate it the first time
      VisualEffects.completionEffect(scene, 0, 0);
      expect(scene._graphics).toHaveLength(1);

      // Second call — texture already exists
      VisualEffects.completionEffect(scene, 50, 50);
      expect(scene._graphics).toHaveLength(1); // no new graphics created
    });

    it('does not accumulate emitters — each auto-cleans', () => {
      VisualEffects.completionEffect(scene, 0, 0);
      VisualEffects.completionEffect(scene, 50, 50);

      expect(scene._particles).toHaveLength(2);

      // Fire both delayed calls
      scene._delayedCalls[0]!.callback();
      scene._delayedCalls[1]!.callback();

      expect(scene._particles[0]!.destroy).toHaveBeenCalled();
      expect(scene._particles[1]!.destroy).toHaveBeenCalled();
    });
  });

  // ─── errorEffect ──────────────────────────────────────────────────

  describe('errorEffect', () => {
    it('applies red tint to target', () => {
      const target = createMockSprite({ x: 150 });
      VisualEffects.errorEffect(scene, target);

      expect(target.setTint).toHaveBeenCalledWith(ERROR_TINT);
    });

    it('creates a shake tween with correct config', () => {
      const target = createMockSprite({ x: 150 });
      VisualEffects.errorEffect(scene, target);

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: target,
          x: 150 + ERROR_SHAKE_OFFSET,
          yoyo: true,
          repeat: ERROR_SHAKE_REPEATS,
          duration: ERROR_SHAKE_DURATION,
        }),
      );
    });

    it('restores position and clears tint on completion', () => {
      const target = createMockSprite({ x: 150 });
      VisualEffects.errorEffect(scene, target);

      completeTween(0);

      expect(target.x).toBe(150);
      expect(target.clearTint).toHaveBeenCalled();
    });

    it('does not block the game loop (uses tweens)', () => {
      const target = createMockSprite();
      VisualEffects.errorEffect(scene, target);

      // Tween is created, not blocking synchronously
      expect(mockTweens).toHaveLength(1);
    });

    it('multiple error effects on different targets run independently', () => {
      const target1 = createMockSprite({ x: 100 });
      const target2 = createMockSprite({ x: 200 });

      VisualEffects.errorEffect(scene, target1);
      VisualEffects.errorEffect(scene, target2);

      expect(mockTweens).toHaveLength(2);
      expect(mockTweens[0]!.config.x).toBe(100 + ERROR_SHAKE_OFFSET);
      expect(mockTweens[1]!.config.x).toBe(200 + ERROR_SHAKE_OFFSET);
    });
  });

  // ─── stuckEffect ──────────────────────────────────────────────────

  describe('stuckEffect', () => {
    it('creates a looping alpha tween', () => {
      const target = createMockSprite();
      VisualEffects.stuckEffect(scene, target);

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: target,
          alpha: STUCK_PULSE_ALPHA,
          yoyo: true,
          repeat: -1,
          duration: STUCK_PULSE_DURATION,
        }),
      );
    });

    it('applies yellow tint on yoyo callback', () => {
      const target = createMockSprite();
      VisualEffects.stuckEffect(scene, target);

      const onYoyo = mockTweens[0]!.config.onYoyo as () => void;
      onYoyo();

      expect(target.setTint).toHaveBeenCalledWith(STUCK_TINT);
    });

    it('clears tint on repeat callback', () => {
      const target = createMockSprite();
      VisualEffects.stuckEffect(scene, target);

      const onRepeat = mockTweens[0]!.config.onRepeat as () => void;
      onRepeat();

      expect(target.clearTint).toHaveBeenCalled();
    });

    it('returns a cleanup function', () => {
      const target = createMockSprite();
      const cleanup = VisualEffects.stuckEffect(scene, target);

      expect(typeof cleanup).toBe('function');
    });

    it('cleanup function stops the tween', () => {
      const target = createMockSprite();
      const cleanup = VisualEffects.stuckEffect(scene, target);

      cleanup();

      expect(mockTweens[0]!.stop).toHaveBeenCalled();
    });

    it('cleanup function clears tint and restores alpha', () => {
      const target = createMockSprite();
      const cleanup = VisualEffects.stuckEffect(scene, target);

      cleanup();

      expect(target.clearTint).toHaveBeenCalled();
      expect(target.setAlpha).toHaveBeenCalledWith(1);
    });

    it('cleanup can be called multiple times safely', () => {
      const target = createMockSprite();
      const cleanup = VisualEffects.stuckEffect(scene, target);

      cleanup();
      cleanup(); // Should not throw

      expect(mockTweens[0]!.stop).toHaveBeenCalledTimes(2);
    });
  });

  // ─── newPackageEffect ─────────────────────────────────────────────

  describe('newPackageEffect', () => {
    it('sets initial scale to 0', () => {
      const target = createMockSprite();
      VisualEffects.newPackageEffect(scene, target);

      expect(target.setScale).toHaveBeenCalledWith(0);
    });

    it('creates phase 1 tween with overshoot scale and Back.easeOut', () => {
      const target = createMockSprite();
      VisualEffects.newPackageEffect(scene, target);

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: target,
          scaleX: POP_IN_OVERSHOOT_SCALE,
          scaleY: POP_IN_OVERSHOOT_SCALE,
          duration: POP_IN_DURATION * 0.6,
          ease: 'Back.easeOut',
        }),
      );
    });

    it('creates phase 2 tween on phase 1 completion', () => {
      const target = createMockSprite();
      VisualEffects.newPackageEffect(scene, target);

      // Only phase 1 tween exists initially
      expect(mockTweens).toHaveLength(1);

      // Complete phase 1
      completeTween(0);

      // Phase 2 tween created
      expect(mockTweens).toHaveLength(2);
      expect(mockTweens[1]!.config).toEqual(
        expect.objectContaining({
          targets: target,
          scaleX: 1,
          scaleY: 1,
          duration: POP_IN_DURATION * 0.4,
          ease: 'Sine.easeInOut',
        }),
      );
    });

    it('total animation is ~400ms across both phases', () => {
      const target = createMockSprite();
      VisualEffects.newPackageEffect(scene, target);

      const phase1Duration = mockTweens[0]!.config.duration as number;
      completeTween(0);
      const phase2Duration = mockTweens[1]!.config.duration as number;

      expect(phase1Duration + phase2Duration).toBe(POP_IN_DURATION);
    });
  });

  // ─── ensureSparkleTexture ─────────────────────────────────────────

  describe('ensureSparkleTexture', () => {
    it('creates a gold circle texture when missing', () => {
      VisualEffects.ensureSparkleTexture(scene);

      expect(scene.make.graphics).toHaveBeenCalledWith({ x: 0, y: 0 }, false);
      const gfx = scene._graphics[0]!;
      expect(gfx.fillStyle).toHaveBeenCalledWith(0xffd700, 1);
      expect(gfx.fillCircle).toHaveBeenCalledWith(SPARKLE_RADIUS, SPARKLE_RADIUS, SPARKLE_RADIUS);
      expect(gfx.generateTexture).toHaveBeenCalledWith(
        SPARKLE_TEXTURE_KEY,
        SPARKLE_RADIUS * 2,
        SPARKLE_RADIUS * 2,
      );
      expect(gfx.destroy).toHaveBeenCalled();
    });

    it('skips texture generation when already exists', () => {
      // Pre-add the texture
      (scene.textures as unknown as { _addTexture: (k: string) => void })._addTexture(SPARKLE_TEXTURE_KEY);

      VisualEffects.ensureSparkleTexture(scene);

      expect(scene.make.graphics).not.toHaveBeenCalled();
    });
  });

  // ─── Memory leak prevention ────────────────────────────────────────

  describe('memory leak prevention', () => {
    it('completionEffect auto-destroys emitter after lifespan', () => {
      VisualEffects.completionEffect(scene, 0, 0);

      const emitter = scene._particles[0]!;
      expect(emitter.destroy).not.toHaveBeenCalled();

      scene._delayedCalls[0]!.callback();
      expect(emitter.destroy).toHaveBeenCalledTimes(1);
    });

    it('errorEffect auto-reverts tint and position — no persistent state', () => {
      const target = createMockSprite({ x: 50 });
      VisualEffects.errorEffect(scene, target);
      completeTween(0);

      expect(target.clearTint).toHaveBeenCalled();
      expect(target.x).toBe(50);
    });

    it('stuckEffect cleanup stops the tween and restores state', () => {
      const target = createMockSprite();
      const cleanup = VisualEffects.stuckEffect(scene, target);
      cleanup();

      expect(mockTweens[0]!.stop).toHaveBeenCalled();
      expect(target.clearTint).toHaveBeenCalled();
      expect(target.setAlpha).toHaveBeenCalledWith(1);
    });

    it('repeated completionEffects each schedule their own cleanup', () => {
      for (let i = 0; i < 5; i++) {
        VisualEffects.completionEffect(scene, i * 10, i * 10);
      }

      expect(scene._particles).toHaveLength(5);
      expect(scene._delayedCalls).toHaveLength(5);

      // Firing all delayed calls destroys all emitters
      for (const call of scene._delayedCalls) {
        call.callback();
      }

      for (const emitter of scene._particles) {
        expect(emitter.destroy).toHaveBeenCalledTimes(1);
      }
    });
  });

  // ─── Non-blocking behaviour ────────────────────────────────────────

  describe('non-blocking behaviour', () => {
    it('all effects use tweens and do not block synchronously', () => {
      const target = createMockSprite();

      VisualEffects.completionEffect(scene, 0, 0);
      VisualEffects.errorEffect(scene, target);
      VisualEffects.stuckEffect(scene, target);
      VisualEffects.newPackageEffect(scene, target);

      // All effects created without blocking
      expect(mockTweens.length).toBeGreaterThanOrEqual(3);
      expect(scene._particles).toHaveLength(1);
    });
  });
});
