import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Phaser mock ────────────────────────────────────────────────────────

interface MockTween {
  stop: ReturnType<typeof vi.fn>;
}

let mockTweens: MockTween[] = [];

interface MockText {
  x: number;
  y: number;
  text: string;
  style: Record<string, unknown>;
  depth: number;
  visible: boolean;
  originX: number;
  originY: number;
  setOrigin: ReturnType<typeof vi.fn>;
  setDepth: ReturnType<typeof vi.fn>;
  setVisible: ReturnType<typeof vi.fn>;
  setText: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

let mockTextInstances: MockText[] = [];

interface MockCircle {
  x: number;
  y: number;
  radius: number;
  fillColor: number;
  depth: number;
  setDepth: ReturnType<typeof vi.fn>;
  setFillStyle: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

let mockCircleInstances: MockCircle[] = [];

vi.mock('phaser', () => {
  class MockSprite {
    x: number;
    y: number;
    texture: { key: string };
    frame: { name: number };
    depth = 0;
    alpha = 1;
    tint: number | null = null;
    interactive = false;
    input: { cursor?: string } = {};
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

    setPosition = vi.fn((x: number, y: number) => {
      this.x = x;
      this.y = y;
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
  WorkerState: {
    WAITING: 'WAITING',
    WORKING: 'WORKING',
    DONE: 'DONE',
    STUCK: 'STUCK',
    ERROR: 'ERROR',
  },
}));

import Phaser from 'phaser';
import {
  WorkerMachine,
  MACHINE_DEPTH_OFFSET,
  STATE_FRAME_MAP,
  STATE_TINTS,
  type WorkerMachineConfig,
} from '../worker-machine';
import { ASSET_KEYS } from '../../constants/asset-keys';
import { cartToIso, getDepth } from '../../systems/isometric';
import { WorkerState } from '@smithy/shared';

// ── Scene mock ─────────────────────────────────────────────────────────

function createMockScene() {
  mockTweens = [];
  mockTextInstances = [];
  mockCircleInstances = [];

  return {
    textures: {
      exists: vi.fn(() => true),
    },
    add: {
      existing: vi.fn(),
      text: vi.fn((x: number, y: number, text: string, style: Record<string, unknown>) => {
        const mockText: MockText = {
          x,
          y,
          text,
          style,
          depth: 0,
          visible: true,
          originX: 0,
          originY: 0,
          setOrigin: vi.fn(function (this: MockText, ox: number, oy: number) {
            this.originX = ox;
            this.originY = oy;
            return this;
          }),
          setDepth: vi.fn(function (this: MockText, d: number) {
            this.depth = d;
            return this;
          }),
          setVisible: vi.fn(function (this: MockText, v: boolean) {
            this.visible = v;
            return this;
          }),
          setText: vi.fn(function (this: MockText, t: string) {
            this.text = t;
            return this;
          }),
          destroy: vi.fn(),
        };
        mockTextInstances.push(mockText);
        return mockText;
      }),
      circle: vi.fn((x: number, y: number, radius: number, fillColor: number) => {
        const mockCircle: MockCircle = {
          x,
          y,
          radius,
          fillColor,
          depth: 0,
          setDepth: vi.fn(function (this: MockCircle, d: number) {
            this.depth = d;
            return this;
          }),
          setFillStyle: vi.fn(function (this: MockCircle, c: number) {
            this.fillColor = c;
            return this;
          }),
          destroy: vi.fn(),
        };
        mockCircleInstances.push(mockCircle);
        return mockCircle;
      }),
    },
    tweens: {
      add: vi.fn((config: Record<string, unknown>) => {
        const tween: MockTween = { stop: vi.fn() };
        mockTweens.push(tween);
        return tween;
      }),
    },
  } as unknown as Phaser.Scene;
}

function createConfig(overrides: Partial<WorkerMachineConfig> = {}): WorkerMachineConfig {
  return {
    tileX: 3,
    tileY: 5,
    workerId: 'worker-1',
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('WorkerMachine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTweens = [];
    mockTextInstances = [];
    mockCircleInstances = [];
  });

  // ─── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('extends Phaser.GameObjects.Sprite', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      expect(machine).toBeInstanceOf(Phaser.GameObjects.Sprite);
    });

    it('stores tileX and tileY as readonly properties', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({ tileX: 7, tileY: 9 }));
      expect(machine.tileX).toBe(7);
      expect(machine.tileY).toBe(9);
    });

    it('stores workerId as readonly property', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({ workerId: 'my-worker' }));
      expect(machine.workerId).toBe('my-worker');
    });

    it('positions at correct isometric coordinates', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({ tileX: 3, tileY: 5 }));
      const iso = cartToIso(3, 5);
      expect(machine.x).toBe(iso.screenX);
      expect(machine.y).toBe(iso.screenY);
    });

    it('uses WORKER_MACHINE texture', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      expect(machine.texture.key).toBe(ASSET_KEYS.WORKER_MACHINE);
    });

    it('defaults to WAITING state (frame 0)', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      expect(machine.frame.name).toBe(STATE_FRAME_MAP[WorkerState.WAITING]);
      expect(machine.getState()).toBe(WorkerState.WAITING);
    });

    it('accepts an initial state', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({ initialState: WorkerState.WORKING }));
      expect(machine.frame.name).toBe(STATE_FRAME_MAP[WorkerState.WORKING]);
      expect(machine.getState()).toBe(WorkerState.WORKING);
    });

    it('adds itself to the scene display list', () => {
      const scene = createMockScene();
      new WorkerMachine(scene, createConfig());
      expect(scene.add.existing).toHaveBeenCalled();
    });
  });

  // ─── Depth sorting ─────────────────────────────────────────────────

  describe('depth sorting', () => {
    it('sets depth using getDepth + MACHINE_DEPTH_OFFSET', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({ tileX: 4, tileY: 6 }));
      const expected = getDepth(4, 6) + MACHINE_DEPTH_OFFSET;
      expect(machine.setDepth).toHaveBeenCalledWith(expected);
    });

    it('MACHINE_DEPTH_OFFSET is 0.1', () => {
      expect(MACHINE_DEPTH_OFFSET).toBe(0.1);
    });

    it('renders above conveyor belts (which use offset 0.05)', () => {
      expect(MACHINE_DEPTH_OFFSET).toBeGreaterThan(0.05);
    });
  });

  // ─── Interactive ────────────────────────────────────────────────────

  describe('interactivity', () => {
    it('calls setInteractive with useHandCursor', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      expect(machine.setInteractive).toHaveBeenCalledWith({ useHandCursor: true });
    });

    it('registers pointerover listener', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      expect(machine.on).toHaveBeenCalledWith('pointerover', expect.any(Function), machine);
    });

    it('registers pointerout listener', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      expect(machine.on).toHaveBeenCalledWith('pointerout', expect.any(Function), machine);
    });

    it('registers pointerdown listener', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      expect(machine.on).toHaveBeenCalledWith('pointerdown', expect.any(Function), machine);
    });
  });

  // ─── Tooltip ────────────────────────────────────────────────────────

  describe('tooltip', () => {
    it('creates a text tooltip above the sprite', () => {
      const scene = createMockScene();
      new WorkerMachine(scene, createConfig({ workerName: 'Summarizer' }));
      expect(scene.add.text).toHaveBeenCalled();
      expect(mockTextInstances.length).toBe(1);
      const tooltip = mockTextInstances[0]!;
      expect(tooltip.text).toBe('Summarizer\nWAITING');
    });

    it('tooltip is initially hidden', () => {
      const scene = createMockScene();
      new WorkerMachine(scene, createConfig());
      const tooltip = mockTextInstances[0]!;
      expect(tooltip.setVisible).toHaveBeenCalledWith(false);
    });

    it('shows tooltip on pointerover', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      const tooltip = mockTextInstances[0]!;
      tooltip.setVisible.mockClear();

      machine.emit('pointerover');
      expect(tooltip.setVisible).toHaveBeenCalledWith(true);
    });

    it('hides tooltip on pointerout', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      const tooltip = mockTextInstances[0]!;

      machine.emit('pointerover');
      tooltip.setVisible.mockClear();

      machine.emit('pointerout');
      expect(tooltip.setVisible).toHaveBeenCalledWith(false);
    });

    it('updates tooltip text when state changes', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({ workerName: 'MyWorker' }));
      const tooltip = mockTextInstances[0]!;

      machine.setWorkerState(WorkerState.WORKING);
      expect(tooltip.setText).toHaveBeenCalledWith('MyWorker\nWORKING');
    });

    it('tooltip has higher depth than machine', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({ tileX: 2, tileY: 3 }));
      const tooltip = mockTextInstances[0]!;
      const machineDepth = getDepth(2, 3) + MACHINE_DEPTH_OFFSET;
      const tooltipDepthArg = tooltip.setDepth.mock.calls[0]![0] as number;
      expect(tooltipDepthArg).toBeGreaterThan(machineDepth);
    });

    it('defaults workerName to "Worker" when not provided', () => {
      const scene = createMockScene();
      new WorkerMachine(scene, createConfig({ workerName: undefined }));
      const tooltip = mockTextInstances[0]!;
      expect(tooltip.text).toBe('Worker\nWAITING');
    });
  });

  // ─── Status indicator ──────────────────────────────────────────────

  describe('status indicator', () => {
    it('creates a colored circle below the sprite', () => {
      const scene = createMockScene();
      new WorkerMachine(scene, createConfig());
      expect(scene.add.circle).toHaveBeenCalled();
      expect(mockCircleInstances.length).toBe(1);
    });

    it('uses correct color for WAITING state', () => {
      const scene = createMockScene();
      new WorkerMachine(scene, createConfig({ initialState: WorkerState.WAITING }));
      const circle = mockCircleInstances[0]!;
      expect(circle.fillColor).toBe(0x4488ff);
    });

    it('updates color when state changes', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      const circle = mockCircleInstances[0]!;

      machine.setWorkerState(WorkerState.ERROR);
      expect(circle.setFillStyle).toHaveBeenCalledWith(0xff4444);
    });
  });

  // ─── Click → bridge ────────────────────────────────────────────────

  describe('click dispatching', () => {
    it('dispatches selectWorker via bridge on pointerdown', () => {
      const mockBridge = { onWorkerClicked: vi.fn() };
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({
        workerId: 'worker-42',
        bridge: mockBridge as never,
      }));

      machine.emit('pointerdown');
      expect(mockBridge.onWorkerClicked).toHaveBeenCalledWith('worker-42');
    });

    it('does not throw when bridge is not provided', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({ bridge: undefined }));
      expect(() => machine.emit('pointerdown')).not.toThrow();
    });
  });

  // ─── State transitions ─────────────────────────────────────────────

  describe('setWorkerState', () => {
    it('updates the frame to the corresponding state frame', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());

      for (const [state, frame] of Object.entries(STATE_FRAME_MAP)) {
        machine.setWorkerState(state as WorkerState);
        expect(machine.frame.name).toBe(frame);
      }
    });

    it('updates currentState', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());

      machine.setWorkerState(WorkerState.WORKING);
      expect(machine.getState()).toBe(WorkerState.WORKING);

      machine.setWorkerState(WorkerState.ERROR);
      expect(machine.getState()).toBe(WorkerState.ERROR);
    });

    it('no-ops when setting the same state', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({ initialState: WorkerState.WORKING }));

      // Clear mocks from constructor
      (machine.setFrame as ReturnType<typeof vi.fn>).mockClear();

      machine.setWorkerState(WorkerState.WORKING);
      expect(machine.setFrame).not.toHaveBeenCalled();
    });
  });

  // ─── State animations ──────────────────────────────────────────────

  describe('state animations', () => {
    it('WAITING state starts idle bobbing tween', () => {
      const scene = createMockScene();
      new WorkerMachine(scene, createConfig({ initialState: WorkerState.WAITING }));
      // Constructor applies state effects for initial state
      expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({
        yoyo: true,
        repeat: -1,
      }));
    });

    it('WORKING state applies green tint', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      machine.setWorkerState(WorkerState.WORKING);
      expect(machine.setTint).toHaveBeenCalledWith(0x44ff88);
    });

    it('STUCK state applies yellow tint', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      machine.setWorkerState(WorkerState.STUCK);
      expect(machine.setTint).toHaveBeenCalledWith(STATE_TINTS.STUCK);
    });

    it('STUCK state starts pulse tween', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      (scene.tweens.add as ReturnType<typeof vi.fn>).mockClear();

      machine.setWorkerState(WorkerState.STUCK);
      expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({
        targets: machine,
        alpha: 0.5,
        yoyo: true,
        repeat: -1,
      }));
    });

    it('ERROR state applies red tint', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      machine.setWorkerState(WorkerState.ERROR);
      expect(machine.setTint).toHaveBeenCalledWith(STATE_TINTS.ERROR);
    });

    it('ERROR state starts shake tween', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      (scene.tweens.add as ReturnType<typeof vi.fn>).mockClear();

      machine.setWorkerState(WorkerState.ERROR);
      expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({
        targets: machine,
        yoyo: true,
      }));
    });

    it('DONE state applies green tint', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      machine.setWorkerState(WorkerState.DONE);
      expect(machine.setTint).toHaveBeenCalledWith(STATE_TINTS.DONE);
    });

    it('DONE state starts pulse tween', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      (scene.tweens.add as ReturnType<typeof vi.fn>).mockClear();

      machine.setWorkerState(WorkerState.DONE);
      expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({
        targets: machine,
        alpha: 0.5,
        yoyo: true,
        repeat: -1,
      }));
    });

    it('clears previous effects when transitioning states', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({ initialState: WorkerState.WAITING }));

      // WAITING creates an idle bob tween
      const idleTween = mockTweens[0]!;

      // Transition to WORKING should stop idle bob and clear tint
      machine.setWorkerState(WorkerState.WORKING);
      expect(idleTween.stop).toHaveBeenCalled();
      expect(machine.clearTint).toHaveBeenCalled();
    });

    it('resets position when clearing state effects', () => {
      const scene = createMockScene();
      const config = createConfig({ tileX: 3, tileY: 5 });
      const machine = new WorkerMachine(scene, config);
      const iso = cartToIso(3, 5);

      machine.setWorkerState(WorkerState.WORKING);
      expect(machine.setPosition).toHaveBeenCalledWith(iso.screenX, iso.screenY);
    });

    it('stops pulse tween and resets alpha on state change', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());

      machine.setWorkerState(WorkerState.STUCK);
      const pulseTween = mockTweens[mockTweens.length - 1]!;

      machine.setWorkerState(WorkerState.WAITING);
      expect(pulseTween.stop).toHaveBeenCalled();
      expect(machine.setAlpha).toHaveBeenCalledWith(1);
    });
  });

  // ─── STATE_FRAME_MAP ───────────────────────────────────────────────

  describe('STATE_FRAME_MAP', () => {
    it('maps WAITING to frame 0', () => {
      expect(STATE_FRAME_MAP[WorkerState.WAITING]).toBe(0);
    });

    it('maps WORKING to frame 1', () => {
      expect(STATE_FRAME_MAP[WorkerState.WORKING]).toBe(1);
    });

    it('maps STUCK to frame 2', () => {
      expect(STATE_FRAME_MAP[WorkerState.STUCK]).toBe(2);
    });

    it('maps ERROR to frame 3', () => {
      expect(STATE_FRAME_MAP[WorkerState.ERROR]).toBe(3);
    });

    it('maps DONE to frame 4', () => {
      expect(STATE_FRAME_MAP[WorkerState.DONE]).toBe(4);
    });
  });

  // ─── Destroy ───────────────────────────────────────────────────────

  describe('destroy', () => {
    it('removes input listeners', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      machine.destroy();
      expect(machine.off).toHaveBeenCalledWith('pointerover', expect.any(Function), machine);
      expect(machine.off).toHaveBeenCalledWith('pointerout', expect.any(Function), machine);
      expect(machine.off).toHaveBeenCalledWith('pointerdown', expect.any(Function), machine);
    });

    it('destroys the tooltip', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      const tooltip = mockTextInstances[0]!;

      const superDestroySpy = vi.spyOn(
        Phaser.GameObjects.Sprite.prototype,
        'destroy',
      );
      machine.destroy();
      superDestroySpy.mockRestore();

      expect(tooltip.destroy).toHaveBeenCalled();
    });

    it('destroys the status indicator', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      const circle = mockCircleInstances[0]!;

      const superDestroySpy = vi.spyOn(
        Phaser.GameObjects.Sprite.prototype,
        'destroy',
      );
      machine.destroy();
      superDestroySpy.mockRestore();

      expect(circle.destroy).toHaveBeenCalled();
    });

    it('stops all active tweens', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig({ initialState: WorkerState.WAITING }));
      const idleTween = mockTweens[0]!;

      const superDestroySpy = vi.spyOn(
        Phaser.GameObjects.Sprite.prototype,
        'destroy',
      );
      machine.destroy();
      superDestroySpy.mockRestore();

      expect(idleTween.stop).toHaveBeenCalled();
    });

    it('calls super.destroy()', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      const superDestroySpy = vi.spyOn(
        Phaser.GameObjects.Sprite.prototype,
        'destroy',
      );
      machine.destroy();
      expect(superDestroySpy).toHaveBeenCalled();
      superDestroySpy.mockRestore();
    });

    it('passes fromScene parameter to super.destroy()', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());
      const superDestroySpy = vi.spyOn(
        Phaser.GameObjects.Sprite.prototype,
        'destroy',
      );
      machine.destroy(true);
      expect(superDestroySpy).toHaveBeenCalledWith(true);
      superDestroySpy.mockRestore();
    });
  });

  // ─── Static factory ────────────────────────────────────────────────

  describe('WorkerMachine.create()', () => {
    it('returns a WorkerMachine instance', () => {
      const scene = createMockScene();
      const machine = WorkerMachine.create(scene, createConfig());
      expect(machine).toBeInstanceOf(WorkerMachine);
    });

    it('passes config to constructor', () => {
      const scene = createMockScene();
      const machine = WorkerMachine.create(scene, createConfig({
        tileX: 10,
        tileY: 12,
        workerId: 'test-worker',
      }));
      expect(machine.tileX).toBe(10);
      expect(machine.tileY).toBe(12);
      expect(machine.workerId).toBe('test-worker');
    });
  });

  // ─── Constants ─────────────────────────────────────────────────────

  describe('constants', () => {
    it('STATE_TINTS.STUCK is yellow', () => {
      expect(STATE_TINTS.STUCK).toBe(0xffff00);
    });

    it('STATE_TINTS.ERROR is red', () => {
      expect(STATE_TINTS.ERROR).toBe(0xff0000);
    });

    it('STATE_TINTS.DONE is green', () => {
      expect(STATE_TINTS.DONE).toBe(0x00ff00);
    });
  });

  // ─── Full lifecycle ────────────────────────────────────────────────

  describe('full lifecycle', () => {
    it('supports transitioning through all states', () => {
      const scene = createMockScene();
      const machine = new WorkerMachine(scene, createConfig());

      const states: WorkerState[] = [
        WorkerState.WORKING,
        WorkerState.STUCK,
        WorkerState.ERROR,
        WorkerState.DONE,
        WorkerState.WAITING,
      ];

      for (const state of states) {
        machine.setWorkerState(state);
        expect(machine.getState()).toBe(state);
        expect(machine.frame.name).toBe(STATE_FRAME_MAP[state]);
      }
    });

    it('create → interact → state changes → destroy lifecycle', () => {
      const mockBridge = { onWorkerClicked: vi.fn() };
      const scene = createMockScene();
      const machine = WorkerMachine.create(scene, createConfig({
        workerId: 'lifecycle-test',
        bridge: mockBridge as never,
      }));

      // Verify created
      expect(machine.getState()).toBe(WorkerState.WAITING);

      // Simulate hover
      machine.emit('pointerover');
      expect(mockTextInstances[0]!.setVisible).toHaveBeenCalledWith(true);

      // Simulate click
      machine.emit('pointerdown');
      expect(mockBridge.onWorkerClicked).toHaveBeenCalledWith('lifecycle-test');

      // State change
      machine.setWorkerState(WorkerState.WORKING);
      expect(machine.getState()).toBe(WorkerState.WORKING);

      // Destroy
      const superDestroySpy = vi.spyOn(
        Phaser.GameObjects.Sprite.prototype,
        'destroy',
      );
      machine.destroy();
      expect(superDestroySpy).toHaveBeenCalled();
      superDestroySpy.mockRestore();
    });
  });
});
