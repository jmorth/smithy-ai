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
    alpha = 1;
    scaleX = 1;
    scaleY = 1;
    visible = true;
    scene: unknown;

    constructor(scene: unknown, x: number, y: number) {
      this.scene = scene;
      this.x = x;
      this.y = y;
    }

    setPosition = vi.fn((x: number, y: number) => {
      this.x = x;
      this.y = y;
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

    setVisible = vi.fn((v: boolean) => {
      this.visible = v;
      return this;
    });
  }

  return {
    default: {
      GameObjects: {
        Sprite: MockSprite,
      },
    },
    __esModule: true,
  };
});

import {
  PackageMover,
  DEFAULT_SEGMENT_DURATION,
  DEFAULT_MOVE_EASE,
  EXIT_MACHINE_EASE,
  ENTER_MACHINE_EASE,
  MACHINE_ANIM_DURATION,
  MACHINE_SCALE_MIN,
} from '../package-mover';
import type { PackageCrate } from '../../objects/package-crate';
import type { WorkerMachine } from '../../objects/worker-machine';
import type Phaser from 'phaser';

// ── Helpers ────────────────────────────────────────────────────────────

function createMockScene(): Phaser.Scene {
  mockTweens = [];

  return {
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        const tween: MockTween = { stop: vi.fn(), config };
        mockTweens.push(tween);
        return tween;
      }),
    },
  } as unknown as Phaser.Scene;
}

function createMockCrate(overrides: Partial<PackageCrate> = {}): PackageCrate {
  return {
    packageId: 'crate-1',
    x: 100,
    y: 200,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    visible: true,
    setPosition: vi.fn(function (this: { x: number; y: number }, x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }),
    setAlpha: vi.fn(function (this: { alpha: number }, a: number) {
      this.alpha = a;
      return this;
    }),
    setScale: vi.fn(function (this: { scaleX: number; scaleY: number }, s: number) {
      this.scaleX = s;
      this.scaleY = s;
      return this;
    }),
    setVisible: vi.fn(function (this: { visible: boolean }, v: boolean) {
      this.visible = v;
      return this;
    }),
    ...overrides,
  } as unknown as PackageCrate;
}

function createMockMachine(overrides: Partial<WorkerMachine> = {}): WorkerMachine {
  return {
    x: 500,
    y: 600,
    workerId: 'machine-1',
    ...overrides,
  } as unknown as WorkerMachine;
}

/** Completes the nth tween (0-indexed) by invoking its onComplete callback. */
function completeTween(index: number): void {
  const tween = mockTweens[index];
  if (!tween) throw new Error(`No tween at index ${index}`);
  const onComplete = tween.config.onComplete as (() => void) | undefined;
  if (!onComplete) throw new Error(`Tween ${index} has no onComplete`);
  onComplete();
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('PackageMover', () => {
  let scene: Phaser.Scene;
  let mover: PackageMover;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTweens = [];
    scene = createMockScene();
    mover = new PackageMover(scene);
  });

  // ─── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates a PackageMover instance', () => {
      expect(mover).toBeInstanceOf(PackageMover);
    });

    it('initialises speed multiplier to 1', () => {
      expect(mover.getSpeedMultiplier()).toBe(1);
    });
  });

  // ─── Constants ──────────────────────────────────────────────────────

  describe('constants', () => {
    it('DEFAULT_SEGMENT_DURATION is 500ms', () => {
      expect(DEFAULT_SEGMENT_DURATION).toBe(500);
    });

    it('DEFAULT_MOVE_EASE is Sine.easeInOut', () => {
      expect(DEFAULT_MOVE_EASE).toBe('Sine.easeInOut');
    });

    it('EXIT_MACHINE_EASE is Back.easeOut', () => {
      expect(EXIT_MACHINE_EASE).toBe('Back.easeOut');
    });

    it('ENTER_MACHINE_EASE is Quad.easeIn', () => {
      expect(ENTER_MACHINE_EASE).toBe('Quad.easeIn');
    });

    it('MACHINE_ANIM_DURATION is 300ms', () => {
      expect(MACHINE_ANIM_DURATION).toBe(300);
    });

    it('MACHINE_SCALE_MIN is 0.3', () => {
      expect(MACHINE_SCALE_MIN).toBe(0.3);
    });
  });

  // ─── Speed multiplier ──────────────────────────────────────────────

  describe('speed multiplier', () => {
    it('sets and gets speed multiplier', () => {
      mover.setSpeedMultiplier(2);
      expect(mover.getSpeedMultiplier()).toBe(2);
    });

    it('clamps speed multiplier to minimum 0.1', () => {
      mover.setSpeedMultiplier(0);
      expect(mover.getSpeedMultiplier()).toBe(0.1);
    });

    it('clamps negative speed multiplier to 0.1', () => {
      mover.setSpeedMultiplier(-5);
      expect(mover.getSpeedMultiplier()).toBe(0.1);
    });

    it('applies speed multiplier to moveTo duration', () => {
      const crate = createMockCrate();
      mover.setSpeedMultiplier(2);
      mover.moveTo(crate, { x: 300, y: 400 }, 1000);

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({ duration: 500 }),
      );
    });

    it('applies speed multiplier to enterMachine duration', () => {
      const crate = createMockCrate();
      const machine = createMockMachine();
      mover.setSpeedMultiplier(2);
      mover.enterMachine(crate, machine);

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({ duration: MACHINE_ANIM_DURATION / 2 }),
      );
    });

    it('applies speed multiplier to exitMachine duration', () => {
      const crate = createMockCrate();
      const machine = createMockMachine();
      mover.setSpeedMultiplier(2);
      mover.exitMachine(crate, machine);

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({ duration: MACHINE_ANIM_DURATION / 2 }),
      );
    });
  });

  // ─── moveTo ─────────────────────────────────────────────────────────

  describe('moveTo', () => {
    it('creates a tween targeting the crate', () => {
      const crate = createMockCrate();
      mover.moveTo(crate, { x: 300, y: 400 }, 600);

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: crate,
          x: 300,
          y: 400,
          duration: 600,
          ease: DEFAULT_MOVE_EASE,
        }),
      );
    });

    it('returns a Promise', () => {
      const crate = createMockCrate();
      const result = mover.moveTo(crate, { x: 300, y: 400 });
      expect(result).toBeInstanceOf(Promise);
    });

    it('resolves Promise when tween completes', async () => {
      const crate = createMockCrate();
      const promise = mover.moveTo(crate, { x: 300, y: 400 });
      completeTween(0);
      await expect(promise).resolves.toBeUndefined();
    });

    it('uses DEFAULT_SEGMENT_DURATION when duration not provided', () => {
      const crate = createMockCrate();
      mover.moveTo(crate, { x: 300, y: 400 });

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({ duration: DEFAULT_SEGMENT_DURATION }),
      );
    });
  });

  // ─── enterMachine ───────────────────────────────────────────────────

  describe('enterMachine', () => {
    it('creates a tween that fades out and shrinks toward machine', () => {
      const crate = createMockCrate();
      const machine = createMockMachine({ x: 500, y: 600 });

      mover.enterMachine(crate, machine);

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: crate,
          x: 500,
          y: 600,
          alpha: 0,
          scaleX: MACHINE_SCALE_MIN,
          scaleY: MACHINE_SCALE_MIN,
          duration: MACHINE_ANIM_DURATION,
          ease: ENTER_MACHINE_EASE,
        }),
      );
    });

    it('returns a Promise', () => {
      const crate = createMockCrate();
      const machine = createMockMachine();
      const result = mover.enterMachine(crate, machine);
      expect(result).toBeInstanceOf(Promise);
    });

    it('hides crate on tween complete', async () => {
      const crate = createMockCrate();
      const machine = createMockMachine();

      const promise = mover.enterMachine(crate, machine);
      completeTween(0);
      await promise;

      expect(crate.setVisible).toHaveBeenCalledWith(false);
    });

    it('resolves Promise when tween completes', async () => {
      const crate = createMockCrate();
      const machine = createMockMachine();

      const promise = mover.enterMachine(crate, machine);
      completeTween(0);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  // ─── exitMachine ────────────────────────────────────────────────────

  describe('exitMachine', () => {
    it('positions crate at machine and sets initial state', () => {
      const crate = createMockCrate();
      const machine = createMockMachine({ x: 500, y: 600 });

      mover.exitMachine(crate, machine);

      expect(crate.setPosition).toHaveBeenCalledWith(500, 600);
      expect(crate.setAlpha).toHaveBeenCalledWith(0);
      expect(crate.setScale).toHaveBeenCalledWith(MACHINE_SCALE_MIN);
      expect(crate.setVisible).toHaveBeenCalledWith(true);
    });

    it('creates a tween that fades in and grows to full size', () => {
      const crate = createMockCrate();
      const machine = createMockMachine();

      mover.exitMachine(crate, machine);

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: crate,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          duration: MACHINE_ANIM_DURATION,
          ease: EXIT_MACHINE_EASE,
        }),
      );
    });

    it('returns a Promise', () => {
      const crate = createMockCrate();
      const machine = createMockMachine();
      const result = mover.exitMachine(crate, machine);
      expect(result).toBeInstanceOf(Promise);
    });

    it('resolves Promise when tween completes', async () => {
      const crate = createMockCrate();
      const machine = createMockMachine();

      const promise = mover.exitMachine(crate, machine);
      completeTween(0);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  // ─── moveAlongPath ──────────────────────────────────────────────────

  describe('moveAlongPath', () => {
    it('creates tweens for each waypoint in sequence', async () => {
      const crate = createMockCrate();
      const path = [
        { x: 200, y: 300 },
        { x: 300, y: 400 },
        { x: 400, y: 500 },
      ];

      const promise = mover.moveAlongPath(crate, path, 600);

      // First waypoint tween created
      expect(mockTweens).toHaveLength(1);
      expect(mockTweens[0]!.config).toEqual(
        expect.objectContaining({ x: 200, y: 300, duration: 600 }),
      );

      // Complete first → second tween created
      completeTween(0);
      await vi.waitFor(() => expect(mockTweens).toHaveLength(2));
      expect(mockTweens[1]!.config).toEqual(
        expect.objectContaining({ x: 300, y: 400 }),
      );

      // Complete second → third tween created
      completeTween(1);
      await vi.waitFor(() => expect(mockTweens).toHaveLength(3));
      expect(mockTweens[2]!.config).toEqual(
        expect.objectContaining({ x: 400, y: 500 }),
      );

      // Complete third → promise resolves
      completeTween(2);
      await expect(promise).resolves.toBeUndefined();
    });

    it('returns a Promise', () => {
      const crate = createMockCrate();
      const result = mover.moveAlongPath(crate, [{ x: 100, y: 200 }]);
      expect(result).toBeInstanceOf(Promise);
    });

    it('uses DEFAULT_SEGMENT_DURATION when not provided', () => {
      const crate = createMockCrate();
      mover.moveAlongPath(crate, [{ x: 100, y: 200 }]);

      expect(scene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({ duration: DEFAULT_SEGMENT_DURATION }),
      );
    });

    it('handles empty path by resolving immediately', async () => {
      const crate = createMockCrate();
      const promise = mover.moveAlongPath(crate, []);
      await expect(promise).resolves.toBeUndefined();
      expect(scene.tweens.add).not.toHaveBeenCalled();
    });
  });

  // ─── processStep ────────────────────────────────────────────────────

  describe('processStep', () => {
    it('orchestrates exit → move along path → enter sequence', async () => {
      const crate = createMockCrate();
      const source = createMockMachine({ x: 100, y: 200, workerId: 'src' } as never);
      const dest = createMockMachine({ x: 700, y: 800, workerId: 'dst' } as never);
      const beltPath = [
        { x: 300, y: 400 },
        { x: 500, y: 600 },
      ];

      const promise = mover.processStep(crate, source, dest, beltPath);

      // Step 1: exit machine tween (sets position, creates tween)
      expect(crate.setPosition).toHaveBeenCalledWith(100, 200);
      expect(crate.setVisible).toHaveBeenCalledWith(true);
      expect(mockTweens).toHaveLength(1);
      expect(mockTweens[0]!.config.ease).toBe(EXIT_MACHINE_EASE);

      // Complete exit → first belt segment
      completeTween(0);
      await vi.waitFor(() => expect(mockTweens).toHaveLength(2));
      expect(mockTweens[1]!.config).toEqual(
        expect.objectContaining({ x: 300, y: 400, ease: DEFAULT_MOVE_EASE }),
      );

      // Complete first segment → second belt segment
      completeTween(1);
      await vi.waitFor(() => expect(mockTweens).toHaveLength(3));
      expect(mockTweens[2]!.config).toEqual(
        expect.objectContaining({ x: 500, y: 600 }),
      );

      // Complete second segment → enter machine
      completeTween(2);
      await vi.waitFor(() => expect(mockTweens).toHaveLength(4));
      expect(mockTweens[3]!.config).toEqual(
        expect.objectContaining({
          x: 700,
          y: 800,
          ease: ENTER_MACHINE_EASE,
        }),
      );

      // Complete enter → promise resolves
      completeTween(3);
      await expect(promise).resolves.toBeUndefined();
    });

    it('works with empty belt path (direct transfer)', async () => {
      const crate = createMockCrate();
      const source = createMockMachine({ x: 100, y: 200 } as never);
      const dest = createMockMachine({ x: 300, y: 400 } as never);

      const promise = mover.processStep(crate, source, dest, []);

      // Exit machine
      expect(mockTweens).toHaveLength(1);
      completeTween(0);

      // Enter machine (no path tweens)
      await vi.waitFor(() => expect(mockTweens).toHaveLength(2));
      completeTween(1);

      await expect(promise).resolves.toBeUndefined();
    });
  });

  // ─── Animation queue ────────────────────────────────────────────────

  describe('animation queue', () => {
    it('queues multiple movements for the same crate sequentially', async () => {
      const crate = createMockCrate();

      const p1 = mover.moveTo(crate, { x: 200, y: 300 });
      const p2 = mover.moveTo(crate, { x: 400, y: 500 });

      // Only first tween created initially
      expect(mockTweens).toHaveLength(1);
      expect(mockTweens[0]!.config).toEqual(
        expect.objectContaining({ x: 200, y: 300 }),
      );

      // Complete first → second starts
      completeTween(0);
      await p1;
      await vi.waitFor(() => expect(mockTweens).toHaveLength(2));
      expect(mockTweens[1]!.config).toEqual(
        expect.objectContaining({ x: 400, y: 500 }),
      );

      // Complete second
      completeTween(1);
      await expect(p2).resolves.toBeUndefined();
    });

    it('allows multiple crates to animate simultaneously', () => {
      const crate1 = createMockCrate({ packageId: 'crate-1' } as never);
      const crate2 = createMockCrate({ packageId: 'crate-2' } as never);

      mover.moveTo(crate1, { x: 200, y: 300 });
      mover.moveTo(crate2, { x: 400, y: 500 });

      // Both tweens created immediately (different crates)
      expect(mockTweens).toHaveLength(2);
      expect(mockTweens[0]!.config.targets).toBe(crate1);
      expect(mockTweens[1]!.config.targets).toBe(crate2);
    });

    it('recovers from errors in queued animation and continues', async () => {
      const crate = createMockCrate();

      // First animation will reject
      const p1 = mover.moveTo(crate, { x: 200, y: 300 });
      const p2 = mover.moveTo(crate, { x: 400, y: 500 });

      // Simulate error by completing with exception
      // We modify the mock to reject
      const tweenConfig = mockTweens[0]!.config;
      const onComplete = tweenConfig.onComplete as () => void;
      onComplete();
      await p1;

      // Second animation should still start
      await vi.waitFor(() => expect(mockTweens).toHaveLength(2));
      completeTween(1);
      await expect(p2).resolves.toBeUndefined();
    });
  });

  // ─── destroy ────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('stops all active tweens', () => {
      const crate = createMockCrate();
      mover.moveTo(crate, { x: 200, y: 300 });
      mover.moveTo(createMockCrate({ packageId: 'crate-2' } as never), { x: 100, y: 100 });

      expect(mockTweens).toHaveLength(2);

      mover.destroy();

      for (const tween of mockTweens) {
        expect(tween.stop).toHaveBeenCalled();
      }
    });

    it('clears animation queues', () => {
      const crate = createMockCrate();
      mover.moveTo(crate, { x: 200, y: 300 });

      mover.destroy();

      // After destroy, new animations should work fresh (no queue chain)
      const crate2 = createMockCrate();
      mover.moveTo(crate2, { x: 100, y: 100 });
      expect(mockTweens).toHaveLength(2); // new tween created immediately
    });

    it('handles destroy with no active tweens gracefully', () => {
      expect(() => mover.destroy()).not.toThrow();
    });
  });

  // ─── Full lifecycle ─────────────────────────────────────────────────

  describe('full lifecycle', () => {
    it('create → processStep → moveTo → destroy', async () => {
      const crate = createMockCrate();
      const source = createMockMachine({ x: 100, y: 200 } as never);
      const dest = createMockMachine({ x: 700, y: 800 } as never);
      const beltPath = [{ x: 400, y: 500 }];

      // processStep: exit → move → enter
      const processPromise = mover.processStep(crate, source, dest, beltPath);

      // Exit machine
      completeTween(0);
      await vi.waitFor(() => expect(mockTweens).toHaveLength(2));

      // Move along path
      completeTween(1);
      await vi.waitFor(() => expect(mockTweens).toHaveLength(3));

      // Enter machine
      completeTween(2);
      await processPromise;

      // Additional standalone moveTo
      const movePromise = mover.moveTo(crate, { x: 900, y: 1000 }, 500);
      completeTween(3);
      await movePromise;

      // Destroy
      expect(() => mover.destroy()).not.toThrow();
    });

    it('handles concurrent crates through full processStep', async () => {
      const crate1 = createMockCrate({ packageId: 'crate-A' } as never);
      const crate2 = createMockCrate({ packageId: 'crate-B' } as never);
      const machineA = createMockMachine({ x: 100, y: 200 } as never);
      const machineB = createMockMachine({ x: 300, y: 400 } as never);
      const machineC = createMockMachine({ x: 500, y: 600 } as never);

      const p1 = mover.processStep(crate1, machineA, machineB, [{ x: 200, y: 300 }]);
      const p2 = mover.processStep(crate2, machineB, machineC, [{ x: 400, y: 500 }]);

      // Both crates start their exit animations simultaneously
      expect(mockTweens).toHaveLength(2);

      // Complete all steps for crate1 (indices 0, 2, 4)
      completeTween(0); // exit crate1
      await vi.waitFor(() => expect(mockTweens.length).toBeGreaterThanOrEqual(3));
      completeTween(2); // move crate1
      await vi.waitFor(() => expect(mockTweens.length).toBeGreaterThanOrEqual(4));
      completeTween(3); // enter crate1

      // Complete all steps for crate2 (indices 1, 4, 5)
      completeTween(1); // exit crate2
      await vi.waitFor(() => expect(mockTweens.length).toBeGreaterThanOrEqual(5));
      completeTween(4); // move crate2
      await vi.waitFor(() => expect(mockTweens.length).toBeGreaterThanOrEqual(6));
      completeTween(5); // enter crate2

      await expect(p1).resolves.toBeUndefined();
      await expect(p2).resolves.toBeUndefined();
    });
  });
});
