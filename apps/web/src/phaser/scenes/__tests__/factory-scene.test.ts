import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Phaser mock ────────────────────────────────────────────────────────

vi.mock('phaser', () => ({
  default: {
    Scene: class MockScene {
      config: unknown;
      constructor(config: unknown) {
        this.config = config;
      }
    },
    Math: {
      Clamp: (value: number, min: number, max: number) =>
        Math.min(Math.max(value, min), max),
    },
  },
  __esModule: true,
}));

// ── Mocks for CameraController ─────────────────────────────────────────

const mockCameraController = {
  update: vi.fn(),
  destroy: vi.fn(),
  setBounds: vi.fn(),
  centerOn: vi.fn(),
  zoomTo: vi.fn(),
  resetView: vi.fn(),
  enabled: true,
};

vi.mock('../../systems/camera-controller', () => ({
  CameraController: vi.fn(() => mockCameraController),
}));

// ── Mock for WorkerMachine ──────────────────────────────────────────────

function createMockWorkerMachine(config: {
  tileX: number;
  tileY: number;
  workerId: string;
  workerName?: string;
  initialState?: string;
}) {
  return {
    tileX: config.tileX,
    tileY: config.tileY,
    workerId: config.workerId,
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setFrame: vi.fn().mockReturnThis(),
    setWorkerState: vi.fn().mockReturnThis(),
    getState: vi.fn(() => config.initialState ?? 'WAITING'),
    destroy: vi.fn(),
  };
}

type MockWorkerMachineInstance = ReturnType<typeof createMockWorkerMachine>;
let lastMockWorkerMachine: MockWorkerMachineInstance | null = null;

vi.mock('../../objects/worker-machine', () => ({
  WorkerMachine: {
    create: vi.fn((_scene: unknown, config: {
      tileX: number;
      tileY: number;
      workerId: string;
      workerName?: string;
      initialState?: string;
    }) => {
      lastMockWorkerMachine = createMockWorkerMachine(config);
      return lastMockWorkerMachine;
    }),
  },
}));

vi.mock('@smithy/shared', () => ({
  WorkerState: {
    WAITING: 'WAITING',
    WORKING: 'WORKING',
    DONE: 'DONE',
    STUCK: 'STUCK',
    ERROR: 'ERROR',
  },
}));

import FactoryScene from '../factory-scene';
import {
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
} from '../factory-scene';
import { BRIDGE_EVENTS } from '../../bridge';
import { ASSET_KEYS } from '../../constants/asset-keys';
import { CameraController } from '../../systems/camera-controller';
import { WorkerMachine } from '../../objects/worker-machine';
import { WorkerState } from '@smithy/shared';

// ── Helpers ─────────────────────────────────────────────────────────────

function createMockSprite() {
  return {
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setFrame: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function createMockImage() {
  return {
    setDepth: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function createMockGroup() {
  const children: unknown[] = [];
  return {
    add: vi.fn((child: unknown) => {
      children.push(child);
    }),
    destroy: vi.fn(),
    getChildren: () => children,
  };
}

interface EventEntry {
  event: string;
  fn: (...args: unknown[]) => void;
  context?: unknown;
}

function createMockEvents() {
  const listeners: EventEntry[] = [];
  return {
    on: vi.fn((event: string, fn: (...args: unknown[]) => void, context?: unknown) => {
      listeners.push({ event, fn, context });
    }),
    off: vi.fn((event: string, fn: (...args: unknown[]) => void, context?: unknown) => {
      const idx = listeners.findIndex(
        (l) => l.event === event && l.fn === fn && l.context === context,
      );
      if (idx !== -1) listeners.splice(idx, 1);
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      for (const l of listeners) {
        if (l.event === event) l.fn(...args);
      }
    }),
    _listeners: listeners,
  };
}

function createMockInput() {
  const listeners: EventEntry[] = [];
  return {
    on: vi.fn((event: string, fn: (...args: unknown[]) => void, context?: unknown) => {
      listeners.push({ event, fn, context });
    }),
    off: vi.fn(),
    keyboard: { on: vi.fn(), off: vi.fn() },
    _listeners: listeners,
    emit(event: string, ...args: unknown[]) {
      for (const l of listeners) {
        if (l.event === event) {
          l.fn.call(l.context, ...args);
        }
      }
    },
  };
}

function createScene(): FactoryScene {
  const scene = new FactoryScene();

  const mockEvents = createMockEvents();
  const mockInput = createMockInput();
  const mockGroup = createMockGroup();

  (scene as unknown as Record<string, unknown>).events = mockEvents;
  (scene as unknown as Record<string, unknown>).input = mockInput;
  (scene as unknown as Record<string, unknown>).cameras = {
    main: {
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
      setBounds: vi.fn(),
    },
  };
  (scene as unknown as Record<string, unknown>).scale = {
    width: 800,
    height: 600,
  };

  const sprites: ReturnType<typeof createMockSprite>[] = [];
  const images: ReturnType<typeof createMockImage>[] = [];

  (scene as unknown as Record<string, unknown>).add = {
    group: vi.fn(() => createMockGroup()),
    sprite: vi.fn((..._args: unknown[]) => {
      const s = createMockSprite();
      sprites.push(s);
      return s;
    }),
    image: vi.fn((..._args: unknown[]) => {
      const img = createMockImage();
      images.push(img);
      return img;
    }),
  };

  (scene as unknown as Record<string, unknown>)._testHelpers = {
    events: mockEvents,
    input: mockInput,
    group: mockGroup,
    sprites,
    images,
  };

  return scene;
}

interface TestHelpers {
  events: ReturnType<typeof createMockEvents>;
  input: ReturnType<typeof createMockInput>;
  group: ReturnType<typeof createMockGroup>;
  sprites: ReturnType<typeof createMockSprite>[];
  images: ReturnType<typeof createMockImage>[];
}

function getHelpers(scene: FactoryScene): TestHelpers {
  return (scene as unknown as Record<string, unknown>)._testHelpers as TestHelpers;
}

function getAdd(scene: FactoryScene) {
  return (scene as unknown as { add: { group: ReturnType<typeof vi.fn>; sprite: ReturnType<typeof vi.fn>; image: ReturnType<typeof vi.fn> } }).add;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('FactoryScene', () => {
  let scene: FactoryScene;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCameraController.update.mockClear();
    mockCameraController.destroy.mockClear();
    mockCameraController.setBounds.mockClear();
    scene = createScene();
  });

  // ─── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('extends Phaser.Scene with key "FactoryScene"', () => {
      expect(
        (scene as unknown as { config: { key: string } }).config,
      ).toEqual({ key: 'FactoryScene' });
    });

    it('initializes workerMachines as empty Map', () => {
      expect(scene.workerMachines).toBeInstanceOf(Map);
      expect(scene.workerMachines.size).toBe(0);
    });

    it('initializes packageCrates as empty Map', () => {
      expect(scene.packageCrates).toBeInstanceOf(Map);
      expect(scene.packageCrates.size).toBe(0);
    });

    it('is not ready before create()', () => {
      expect(scene.isReady).toBe(false);
    });
  });

  // ─── create() ───────────────────────────────────────────────────────

  describe('create()', () => {
    it('sets ready flag to true', () => {
      scene.create();
      expect(scene.isReady).toBe(true);
    });

    it('creates a floor tile group', () => {
      const add = getAdd(scene);
      scene.create();
      expect(add.group).toHaveBeenCalled();
    });

    it('renders an isometric tile grid of default dimensions', () => {
      const add = getAdd(scene);
      scene.create();
      expect(add.image).toHaveBeenCalledTimes(
        DEFAULT_GRID_COLS * DEFAULT_GRID_ROWS,
      );
    });

    it('uses FLOOR_TILE asset key for grid tiles', () => {
      const add = getAdd(scene);
      scene.create();
      const firstCall = add.image.mock.calls[0]!;
      expect(firstCall[2]).toBe(ASSET_KEYS.FLOOR_TILE);
    });

    it('places tiles at isometric coordinates', () => {
      const add = getAdd(scene);
      scene.create();
      // Tile (0,0) should be at iso origin (0, 0)
      const firstCall = add.image.mock.calls[0]!;
      expect(firstCall[0]).toBe(0); // screenX for (0,0)
      expect(firstCall[1]).toBe(0); // screenY for (0,0)
    });

    it('sets depth on floor tiles', () => {
      scene.create();
      const { images } = getHelpers(scene);
      for (const img of images) {
        expect(img.setDepth).toHaveBeenCalled();
      }
    });

    it('initializes camera controller', () => {
      scene.create();
      expect(CameraController).toHaveBeenCalledWith(scene);
    });

    it('sets camera bounds matching floor dimensions', () => {
      scene.create();
      expect(mockCameraController.setBounds).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('registers bridge event listeners', () => {
      scene.create();
      const { events } = getHelpers(scene);
      const registeredEvents = events.on.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(registeredEvents).toContain(BRIDGE_EVENTS.WORKER_SELECTED);
      expect(registeredEvents).toContain(BRIDGE_EVENTS.PACKAGE_SELECTED);
      expect(registeredEvents).toContain(BRIDGE_EVENTS.SELECTION_CLEARED);
      expect(registeredEvents).toContain(BRIDGE_EVENTS.VIEW_MODE_CHANGED);
      expect(registeredEvents).toContain(BRIDGE_EVENTS.SOCKET_STATE_CHANGED);
    });

    it('registers click handler on input', () => {
      scene.create();
      const { input } = getHelpers(scene);
      const registeredEvents = input.on.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(registeredEvents).toContain('gameobjectdown');
    });

    it('flushes queued bridge events when bridge is set', () => {
      const mockBridge = {
        flushQueuedEvents: vi.fn(),
        onWorkerClicked: vi.fn(),
        onPackageClicked: vi.fn(),
        onDeselectAll: vi.fn(),
      };
      scene.setBridge(mockBridge as unknown as import('../../bridge').PhaserBridge);
      scene.create();
      expect(mockBridge.flushQueuedEvents).toHaveBeenCalledWith('FactoryScene');
    });

    it('does not throw if no bridge is set', () => {
      expect(() => scene.create()).not.toThrow();
    });
  });

  // ─── update() ───────────────────────────────────────────────────────

  describe('update()', () => {
    it('calls cameraController.update()', () => {
      scene.create();
      scene.update(0, 16);
      expect(mockCameraController.update).toHaveBeenCalled();
    });

    it('does not throw if cameraController is null', () => {
      // update() before create()
      expect(() => scene.update(0, 16)).not.toThrow();
    });
  });

  // ─── shutdown() ─────────────────────────────────────────────────────

  describe('shutdown()', () => {
    it('sets ready to false', () => {
      scene.create();
      scene.shutdown();
      expect(scene.isReady).toBe(false);
    });

    it('removes bridge event listeners', () => {
      scene.create();
      const { events } = getHelpers(scene);
      scene.shutdown();
      expect(events.off).toHaveBeenCalledWith(
        BRIDGE_EVENTS.WORKER_SELECTED,
        expect.any(Function),
        scene,
      );
      expect(events.off).toHaveBeenCalledWith(
        BRIDGE_EVENTS.PACKAGE_SELECTED,
        expect.any(Function),
        scene,
      );
      expect(events.off).toHaveBeenCalledWith(
        BRIDGE_EVENTS.SELECTION_CLEARED,
        expect.any(Function),
        scene,
      );
      expect(events.off).toHaveBeenCalledWith(
        BRIDGE_EVENTS.VIEW_MODE_CHANGED,
        expect.any(Function),
        scene,
      );
      expect(events.off).toHaveBeenCalledWith(
        BRIDGE_EVENTS.SOCKET_STATE_CHANGED,
        expect.any(Function),
        scene,
      );
    });

    it('destroys camera controller', () => {
      scene.create();
      scene.shutdown();
      expect(mockCameraController.destroy).toHaveBeenCalled();
    });

    it('nullifies camera controller after destroy', () => {
      scene.create();
      scene.shutdown();
      expect(scene.getCameraController()).toBeNull();
    });

    it('destroys and clears workerMachines', () => {
      scene.create();
      scene.addWorkerMachine('w-1', { tileX: 1, tileY: 1 });
      const sprite = scene.workerMachines.get('w-1')!;
      scene.shutdown();
      expect(sprite.destroy).toHaveBeenCalled();
      expect(scene.workerMachines.size).toBe(0);
    });

    it('destroys and clears packageCrates', () => {
      scene.create();
      scene.addPackageCrate('p-1', { tileX: 2, tileY: 2 });
      const sprite = scene.packageCrates.get('p-1')!;
      scene.shutdown();
      expect(sprite.destroy).toHaveBeenCalled();
      expect(scene.packageCrates.size).toBe(0);
    });

    it('destroys floor tile group', () => {
      scene.create();
      const add = getAdd(scene);
      const group = add.group.mock.results[0]!.value;
      scene.shutdown();
      expect(group.destroy).toHaveBeenCalledWith(true);
    });
  });

  // ─── Worker machine management ─────────────────────────────────────

  describe('addWorkerMachine()', () => {
    beforeEach(() => scene.create());

    it('creates a WorkerMachine via WorkerMachine.create', () => {
      scene.addWorkerMachine('w-1', { tileX: 3, tileY: 2 });
      expect(WorkerMachine.create).toHaveBeenCalledWith(
        scene,
        expect.objectContaining({ tileX: 3, tileY: 2, workerId: 'w-1' }),
      );
    });

    it('defaults to WAITING state', () => {
      const machine = scene.addWorkerMachine('w-1', { tileX: 0, tileY: 0 });
      expect(machine.getState()).toBe(WorkerState.WAITING);
    });

    it('passes initial state to WorkerMachine', () => {
      scene.addWorkerMachine('w-1', { tileX: 0, tileY: 0, initialState: WorkerState.STUCK });
      expect(WorkerMachine.create).toHaveBeenCalledWith(
        scene,
        expect.objectContaining({ initialState: WorkerState.STUCK }),
      );
    });

    it('stores machine in workerMachines map by ID', () => {
      const machine = scene.addWorkerMachine('w-1', { tileX: 1, tileY: 1 });
      expect(scene.workerMachines.get('w-1')).toBe(machine);
    });

    it('replaces existing machine with same ID', () => {
      const first = scene.addWorkerMachine('w-1', { tileX: 1, tileY: 1 });
      const second = scene.addWorkerMachine('w-1', { tileX: 2, tileY: 2 });
      expect(first.destroy).toHaveBeenCalled();
      expect(scene.workerMachines.get('w-1')).toBe(second);
      expect(scene.workerMachines.size).toBe(1);
    });

    it('returns the created machine', () => {
      const machine = scene.addWorkerMachine('w-1', { tileX: 0, tileY: 0 });
      expect(machine).toBeDefined();
      expect(machine.workerId).toBe('w-1');
    });
  });

  describe('removeWorkerMachine()', () => {
    beforeEach(() => scene.create());

    it('destroys the sprite and removes from map', () => {
      const sprite = scene.addWorkerMachine('w-1', { tileX: 1, tileY: 1 });
      scene.removeWorkerMachine('w-1');
      expect(sprite.destroy).toHaveBeenCalled();
      expect(scene.workerMachines.has('w-1')).toBe(false);
    });

    it('does nothing for non-existent IDs', () => {
      expect(() => scene.removeWorkerMachine('nonexistent')).not.toThrow();
    });
  });

  describe('updateWorkerState()', () => {
    beforeEach(() => scene.create());

    it('calls setWorkerState on the machine', () => {
      const machine = scene.addWorkerMachine('w-1', { tileX: 0, tileY: 0 });
      scene.updateWorkerState('w-1', WorkerState.ERROR);
      expect(machine.setWorkerState).toHaveBeenCalledWith(WorkerState.ERROR);
    });

    it('does nothing for non-existent IDs', () => {
      expect(() => scene.updateWorkerState('nonexistent', WorkerState.WORKING)).not.toThrow();
    });
  });

  // ─── Package crate management ──────────────────────────────────────

  describe('addPackageCrate()', () => {
    beforeEach(() => scene.create());

    it('creates a sprite at the correct isometric position', () => {
      const add = getAdd(scene);
      scene.addPackageCrate('p-1', { tileX: 4, tileY: 1 });
      const lastSpriteCall = add.sprite.mock.calls.at(-1)!;
      // cartToIso(4, 1) = screenX: (4-1)*32 = 96, screenY: (4+1)*16 = 80
      expect(lastSpriteCall[0]).toBe(96);
      expect(lastSpriteCall[1]).toBe(80);
      expect(lastSpriteCall[2]).toBe(ASSET_KEYS.PACKAGE_CRATE);
    });

    it('stores sprite in packageCrates map by ID', () => {
      const sprite = scene.addPackageCrate('p-1', { tileX: 0, tileY: 0 });
      expect(scene.packageCrates.get('p-1')).toBe(sprite);
    });

    it('makes the sprite interactive', () => {
      const sprite = scene.addPackageCrate('p-1', { tileX: 0, tileY: 0 });
      expect(sprite.setInteractive).toHaveBeenCalled();
    });

    it('sets depth above floor tile and worker', () => {
      const sprite = scene.addPackageCrate('p-1', { tileX: 4, tileY: 1 });
      // getDepth(4, 1) + 0.2 = 5.2
      expect(sprite.setDepth).toHaveBeenCalledWith(5.2);
    });

    it('replaces existing sprite with same ID', () => {
      const first = scene.addPackageCrate('p-1', { tileX: 0, tileY: 0 });
      const second = scene.addPackageCrate('p-1', { tileX: 1, tileY: 1 });
      expect(first.destroy).toHaveBeenCalled();
      expect(scene.packageCrates.get('p-1')).toBe(second);
    });
  });

  describe('removePackageCrate()', () => {
    beforeEach(() => scene.create());

    it('destroys the sprite and removes from map', () => {
      const sprite = scene.addPackageCrate('p-1', { tileX: 0, tileY: 0 });
      scene.removePackageCrate('p-1');
      expect(sprite.destroy).toHaveBeenCalled();
      expect(scene.packageCrates.has('p-1')).toBe(false);
    });

    it('does nothing for non-existent IDs', () => {
      expect(() => scene.removePackageCrate('nonexistent')).not.toThrow();
    });
  });

  // ─── Click handling ─────────────────────────────────────────────────

  describe('click handling', () => {
    let mockBridge: {
      flushQueuedEvents: ReturnType<typeof vi.fn>;
      onWorkerClicked: ReturnType<typeof vi.fn>;
      onPackageClicked: ReturnType<typeof vi.fn>;
      onDeselectAll: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockBridge = {
        flushQueuedEvents: vi.fn(),
        onWorkerClicked: vi.fn(),
        onPackageClicked: vi.fn(),
        onDeselectAll: vi.fn(),
      };
      scene.setBridge(mockBridge as unknown as import('../../bridge').PhaserBridge);
      scene.create();
    });

    it('does not forward worker machine clicks via gameobjectdown (handled by WorkerMachine internally)', () => {
      const machine = scene.addWorkerMachine('w-1', { tileX: 1, tileY: 1 });
      const { input } = getHelpers(scene);
      input.emit('gameobjectdown', {}, machine);
      // WorkerMachine handles its own click events via pointerdown listener,
      // so gameobjectdown should not trigger onWorkerClicked
      expect(mockBridge.onWorkerClicked).not.toHaveBeenCalled();
    });

    it('forwards package clicks to bridge', () => {
      const sprite = scene.addPackageCrate('p-1', { tileX: 1, tileY: 1 });
      const { input } = getHelpers(scene);
      input.emit('gameobjectdown', {}, sprite);
      expect(mockBridge.onPackageClicked).toHaveBeenCalledWith('p-1');
    });

    it('does nothing for unrecognised game objects', () => {
      const unknownObject = {};
      const { input } = getHelpers(scene);
      input.emit('gameobjectdown', {}, unknownObject);
      expect(mockBridge.onWorkerClicked).not.toHaveBeenCalled();
      expect(mockBridge.onPackageClicked).not.toHaveBeenCalled();
    });

    it('does nothing if bridge is not set', () => {
      const freshScene = createScene();
      freshScene.create();
      freshScene.addWorkerMachine('w-1', { tileX: 0, tileY: 0 });
      const { input } = getHelpers(freshScene);
      expect(() => input.emit('gameobjectdown', {}, {})).not.toThrow();
    });
  });

  // ─── Bridge event listeners ─────────────────────────────────────────

  describe('bridge event listeners', () => {
    it('handles worker:selected event without throwing', () => {
      scene.create();
      const { events } = getHelpers(scene);
      expect(() =>
        events.emit(BRIDGE_EVENTS.WORKER_SELECTED, { workerId: 'w-1' }),
      ).not.toThrow();
    });

    it('handles package:selected event without throwing', () => {
      scene.create();
      const { events } = getHelpers(scene);
      expect(() =>
        events.emit(BRIDGE_EVENTS.PACKAGE_SELECTED, { packageId: 'p-1' }),
      ).not.toThrow();
    });

    it('handles selection:cleared event without throwing', () => {
      scene.create();
      const { events } = getHelpers(scene);
      expect(() =>
        events.emit(BRIDGE_EVENTS.SELECTION_CLEARED),
      ).not.toThrow();
    });

    it('handles viewMode:changed event without throwing', () => {
      scene.create();
      const { events } = getHelpers(scene);
      expect(() =>
        events.emit(BRIDGE_EVENTS.VIEW_MODE_CHANGED, { viewMode: 'factory' }),
      ).not.toThrow();
    });

    it('handles socket:stateChanged event without throwing', () => {
      scene.create();
      const { events } = getHelpers(scene);
      expect(() =>
        events.emit(BRIDGE_EVENTS.SOCKET_STATE_CHANGED, {
          socketState: 'connected',
        }),
      ).not.toThrow();
    });
  });

  // ─── rebuild() ──────────────────────────────────────────────────────

  describe('rebuild()', () => {
    beforeEach(() => scene.create());

    it('clears all worker machines', () => {
      scene.addWorkerMachine('w-1', { tileX: 0, tileY: 0 });
      scene.addWorkerMachine('w-2', { tileX: 1, tileY: 0 });
      scene.rebuild();
      expect(scene.workerMachines.size).toBe(0);
    });

    it('clears all package crates', () => {
      scene.addPackageCrate('p-1', { tileX: 0, tileY: 0 });
      scene.rebuild();
      expect(scene.packageCrates.size).toBe(0);
    });

    it('destroys sprites before clearing', () => {
      const workerSprite = scene.addWorkerMachine('w-1', { tileX: 0, tileY: 0 });
      const packageSprite = scene.addPackageCrate('p-1', { tileX: 1, tileY: 1 });
      scene.rebuild();
      expect(workerSprite.destroy).toHaveBeenCalled();
      expect(packageSprite.destroy).toHaveBeenCalled();
    });

    it('recreates the floor grid', () => {
      const add = getAdd(scene);
      const imageCallsBefore = add.image.mock.calls.length;
      scene.rebuild();
      const imageCallsAfter = add.image.mock.calls.length;
      expect(imageCallsAfter - imageCallsBefore).toBe(
        DEFAULT_GRID_COLS * DEFAULT_GRID_ROWS,
      );
    });

    it('destroys old floor tile group', () => {
      const add = getAdd(scene);
      const firstGroup = add.group.mock.results[0]!.value;
      scene.rebuild();
      expect(firstGroup.destroy).toHaveBeenCalledWith(true);
    });
  });

  // ─── setBridge() ────────────────────────────────────────────────────

  describe('setBridge()', () => {
    it('stores bridge reference', () => {
      const mockBridge = {
        flushQueuedEvents: vi.fn(),
      };
      scene.setBridge(mockBridge as unknown as import('../../bridge').PhaserBridge);
      scene.create();
      expect(mockBridge.flushQueuedEvents).toHaveBeenCalled();
    });
  });

  // ─── getCameraController() ──────────────────────────────────────────

  describe('getCameraController()', () => {
    it('returns null before create()', () => {
      expect(scene.getCameraController()).toBeNull();
    });

    it('returns the controller after create()', () => {
      scene.create();
      expect(scene.getCameraController()).toBe(mockCameraController);
    });
  });

  // ─── Default grid dimensions ────────────────────────────────────────

  describe('default grid dimensions', () => {
    it('exports DEFAULT_GRID_COLS as 20', () => {
      expect(DEFAULT_GRID_COLS).toBe(20);
    });

    it('exports DEFAULT_GRID_ROWS as 20', () => {
      expect(DEFAULT_GRID_ROWS).toBe(20);
    });
  });
});
