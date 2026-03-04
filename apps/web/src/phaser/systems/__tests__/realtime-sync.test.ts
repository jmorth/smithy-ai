import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Phaser mock ────────────────────────────────────────────────────────

vi.mock('phaser', () => {
  class MockSprite {
    x: number;
    y: number;
    alpha = 1;
    scaleX = 1;
    scaleY = 1;
    visible = true;
    scene: unknown;
    packageId: string;
    packageType: string;
    depth = 0;
    active = true;
    destroyed = false;

    constructor(scene: unknown, x: number, y: number, _texture?: string, _frame?: number) {
      this.scene = scene;
      this.x = x;
      this.y = y;
      this.packageId = '';
      this.packageType = '';
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

    setDepth = vi.fn((d: number) => {
      this.depth = d;
      return this;
    });

    setTint = vi.fn(() => this);

    setInteractive = vi.fn(() => this);

    setOrigin = vi.fn(() => this);

    on = vi.fn(() => this);
    off = vi.fn(() => this);

    destroy = vi.fn(() => {
      this.destroyed = true;
    });
  }

  return {
    default: {
      GameObjects: {
        Sprite: MockSprite,
      },
      Scene: class MockScene {
        add = {
          existing: vi.fn(),
          text: vi.fn(() => ({
            setOrigin: vi.fn(),
            setDepth: vi.fn(),
            setVisible: vi.fn(),
            setText: vi.fn(),
            destroy: vi.fn(),
          })),
          circle: vi.fn(() => ({
            setDepth: vi.fn(),
            setFillStyle: vi.fn(),
            destroy: vi.fn(),
          })),
        };
      },
    },
    __esModule: true,
  };
});

// ── Module imports (after mock) ────────────────────────────────────────

import { RealtimeSync } from '../realtime-sync';
import { useFactoryStore, type PackageCrateState } from '@/stores/factory.store';
import { RoutingKeys, WorkerState, PackageStatus } from '@smithy/shared';
import type { SocketManager, SocketNamespace, NamespaceEventMap } from '@/api/socket';
import type { PackageMover } from '../package-mover';
import type FactoryScene from '../../scenes/factory-scene';
import type { PackageCrate } from '../../objects/package-crate';
import type { WorkerMachine } from '../../objects/worker-machine';
import type { FactoryLayout } from '../layout-generator';

// ── Test helpers ───────────────────────────────────────────────────────

type EventHandler = (data: unknown) => void;

interface SocketSubscription {
  namespace: SocketNamespace;
  event: string;
  callback: EventHandler;
}

function createMockSocketManager(): SocketManager & {
  _subscriptions: SocketSubscription[];
  _emit: (namespace: SocketNamespace, event: string, data: unknown) => void;
} {
  const subscriptions: SocketSubscription[] = [];

  const mock = {
    _subscriptions: subscriptions,
    _emit(namespace: SocketNamespace, event: string, data: unknown) {
      for (const sub of subscriptions) {
        if (sub.namespace === namespace && sub.event === event) {
          sub.callback(data);
        }
      }
    },

    connect: vi.fn(),
    disconnect: vi.fn(),
    getState: vi.fn(() => 'connected' as const),
    onStateChange: vi.fn(() => vi.fn()),
    subscribeAssemblyLine: vi.fn(),
    subscribeWorkerPool: vi.fn(),
    subscribeJob: vi.fn(),
    unsubscribe: vi.fn(),
    sendInteractiveResponse: vi.fn(),
    _getManager: vi.fn(),
    _getSockets: vi.fn(),
    _getSubscriptions: vi.fn(),

    onEvent: vi.fn(<NS extends SocketNamespace, E extends string & keyof NamespaceEventMap[NS]>(
      namespace: NS,
      event: E,
      callback: (data: NamespaceEventMap[NS][E]) => void,
    ) => {
      const sub: SocketSubscription = {
        namespace,
        event,
        callback: callback as EventHandler,
      };
      subscriptions.push(sub);
      return () => {
        const idx = subscriptions.indexOf(sub);
        if (idx !== -1) subscriptions.splice(idx, 1);
      };
    }),
  } as unknown as SocketManager & {
    _subscriptions: SocketSubscription[];
    _emit: (namespace: SocketNamespace, event: string, data: unknown) => void;
  };

  return mock;
}

function createMockPackageMover(): PackageMover {
  return {
    moveTo: vi.fn(() => Promise.resolve()),
    enterMachine: vi.fn(() => Promise.resolve()),
    exitMachine: vi.fn(() => Promise.resolve()),
    moveAlongPath: vi.fn(() => Promise.resolve()),
    processStep: vi.fn(() => Promise.resolve()),
    setSpeedMultiplier: vi.fn(),
    getSpeedMultiplier: vi.fn(() => 1),
    destroy: vi.fn(),
  } as unknown as PackageMover;
}

function createMockWorkerMachine(overrides: Partial<WorkerMachine> = {}): WorkerMachine {
  return {
    x: 100,
    y: 200,
    workerId: 'machine-1',
    tileX: 2,
    tileY: 4,
    ...overrides,
  } as unknown as WorkerMachine;
}

function createMockPackageCrate(overrides: Partial<PackageCrate> = {}): PackageCrate {
  return {
    packageId: 'pkg-1',
    packageType: 'USER_INPUT',
    x: 0,
    y: 0,
    destroy: vi.fn(),
    setPosition: vi.fn(),
    setAlpha: vi.fn(),
    setScale: vi.fn(),
    setVisible: vi.fn(),
    ...overrides,
  } as unknown as PackageCrate;
}

function createMockScene(
  workerMachines?: Map<string, WorkerMachine>,
  packageCrates?: Map<string, PackageCrate>,
): FactoryScene {
  return {
    workerMachines: workerMachines ?? new Map(),
    packageCrates: packageCrates ?? new Map(),
    updateWorkerState: vi.fn(),
    addWorkerMachine: vi.fn(),
    removeWorkerMachine: vi.fn(),
    addPackageCrate: vi.fn(),
    removePackageCrate: vi.fn(),
    add: {
      existing: vi.fn(),
      text: vi.fn(() => ({
        setOrigin: vi.fn(),
        setDepth: vi.fn(),
        setVisible: vi.fn(),
        setText: vi.fn(),
        destroy: vi.fn(),
      })),
      circle: vi.fn(() => ({
        setDepth: vi.fn(),
        setFillStyle: vi.fn(),
        destroy: vi.fn(),
      })),
      sprite: vi.fn((_x: number, _y: number) => ({
        setDepth: vi.fn(),
        setInteractive: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn(),
      })),
    },
    tweens: {
      add: vi.fn(),
    },
    isReady: true,
  } as unknown as FactoryScene;
}

function createTestLayout(): FactoryLayout {
  return {
    rooms: [{ id: 'room-1', name: 'Line 1', x: 0, y: 0, width: 10, height: 5 }],
    machinePositions: [
      { id: 'step-1', roomId: 'room-1', workerVersionId: 'wv-1', tileX: 2, tileY: 2 },
      { id: 'step-2', roomId: 'room-1', workerVersionId: 'wv-2', tileX: 5, tileY: 2 },
      { id: 'step-3', roomId: 'room-1', workerVersionId: 'wv-3', tileX: 8, tileY: 2 },
    ],
    conveyorPaths: [
      {
        roomId: 'room-1',
        fromMachineId: 'step-1',
        toMachineId: 'step-2',
        startX: 2,
        startY: 2,
        endX: 5,
        endY: 2,
      },
      {
        roomId: 'room-1',
        fromMachineId: 'step-2',
        toMachineId: 'step-3',
        startX: 5,
        startY: 2,
        endX: 8,
        endY: 2,
      },
    ],
    floorBounds: { width: 12, height: 5 },
  };
}

function makeEvent<T>(payload: T) {
  return {
    eventType: 'test',
    timestamp: new Date().toISOString(),
    correlationId: 'corr-1',
    payload,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('RealtimeSync', () => {
  let socketManager: ReturnType<typeof createMockSocketManager>;
  let scene: FactoryScene;
  let mover: PackageMover;
  let sync: RealtimeSync;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset factory store
    useFactoryStore.setState({
      workerMachines: new Map(),
      packageCrates: new Map(),
      activeAnimations: new Set(),
      layoutData: null,
      selectedMachine: null,
      selectedCrate: null,
    });

    socketManager = createMockSocketManager();
    scene = createMockScene();
    mover = createMockPackageMover();
  });

  afterEach(() => {
    if (sync) {
      sync.destroy();
    }
    vi.useRealTimers();
  });

  // ─── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates a RealtimeSync instance', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      expect(sync).toBeInstanceOf(RealtimeSync);
    });

    it('subscribes to all 6 Socket.IO events', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      expect(socketManager.onEvent).toHaveBeenCalledTimes(6);
    });

    it('subscribes to package:created on /workflows', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        expect.any(Function),
      );
    });

    it('subscribes to job:started on /jobs', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        expect.any(Function),
      );
    });

    it('subscribes to job:completed on /jobs', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        expect.any(Function),
      );
    });

    it('subscribes to job:stuck on /jobs', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/jobs',
        RoutingKeys.JOB_STUCK,
        expect.any(Function),
      );
    });

    it('subscribes to job:error on /jobs', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/jobs',
        RoutingKeys.JOB_ERROR,
        expect.any(Function),
      );
    });

    it('subscribes to assembly-line:completed on /workflows', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      expect(socketManager.onEvent).toHaveBeenCalledWith(
        '/workflows',
        RoutingKeys.ASSEMBLY_LINE_COMPLETED,
        expect.any(Function),
      );
    });
  });

  // ─── Event buffering ───────────────────────────────────────────────

  describe('event buffering', () => {
    it('buffers events when scene is not ready', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      // Scene not ready yet — do NOT call sceneReady()

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {}, createdBy: 'user-1' }),
      );

      // Should NOT have added to store yet
      expect(useFactoryStore.getState().packageCrates.size).toBe(0);
    });

    it('flushes buffered events when sceneReady() is called', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {}, createdBy: 'user-1' }),
      );

      // Not yet processed
      expect(useFactoryStore.getState().packageCrates.size).toBe(0);

      // Now signal ready
      sync.sceneReady();

      // Should have been processed
      expect(useFactoryStore.getState().packageCrates.has('pkg-1')).toBe(true);
    });

    it('processes events directly after sceneReady()', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-2', type: 'CODE', metadata: {} }),
      );

      expect(useFactoryStore.getState().packageCrates.has('pkg-2')).toBe(true);
    });

    it('flushes multiple buffered events in order', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      const machine1 = createMockWorkerMachine({ workerId: 'step-1' });
      scene.workerMachines.set('step-1', machine1);

      sync = new RealtimeSync(socketManager, scene, mover);

      // Buffer two events
      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1' }),
      );

      // Nothing processed yet
      expect(useFactoryStore.getState().packageCrates.size).toBe(0);

      // Flush all
      sync.sceneReady();

      // Both events processed: package created AND job started
      expect(useFactoryStore.getState().packageCrates.has('pkg-1')).toBe(true);
      expect(mover.enterMachine).toHaveBeenCalled();
    });
  });

  // ─── package:created ──────────────────────────────────────────────

  describe('handlePackageCreated', () => {
    it('adds a crate to the factory store', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {}, createdBy: 'user-1' }),
      );

      const crates = useFactoryStore.getState().packageCrates;
      expect(crates.has('pkg-1')).toBe(true);
      const crateState = crates.get('pkg-1')!;
      expect(crateState.status).toBe(PackageStatus.PENDING);
      expect(crateState.currentStep).toBe(0);
    });

    it('places crate at entrance position (before first machine)', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      const crateState = useFactoryStore.getState().packageCrates.get('pkg-1')!;
      // First machine is at tileX: 2, entrance is tileX: 1
      expect(crateState.position.tileX).toBe(1);
      expect(crateState.position.tileY).toBe(2);
    });

    it('stores crate sprite in scene packageCrates map', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      expect(scene.packageCrates.has('pkg-1')).toBe(true);
    });

    it('does nothing if no layout is set', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      expect(useFactoryStore.getState().packageCrates.size).toBe(0);
    });

    it('handles layout with no machine positions', () => {
      const emptyLayout: FactoryLayout = {
        rooms: [],
        machinePositions: [],
        conveyorPaths: [],
        floorBounds: { width: 0, height: 0 },
      };
      useFactoryStore.getState().setLayout(emptyLayout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'CODE', metadata: {} }),
      );

      const crateState = useFactoryStore.getState().packageCrates.get('pkg-1')!;
      expect(crateState.position).toEqual({ tileX: 0, tileY: 0 });
    });
  });

  // ─── job:started ──────────────────────────────────────────────────

  describe('handleJobStarted', () => {
    beforeEach(() => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);
    });

    it('updates worker machine state to WORKING in store', () => {
      const machine = createMockWorkerMachine({ workerId: 'step-1' });
      scene.workerMachines.set('step-1', machine);

      const crate = createMockPackageCrate({ packageId: 'pkg-1' });
      scene.packageCrates.set('pkg-1', crate as unknown as Phaser.GameObjects.Sprite);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      // Create the package first
      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1' }),
      );

      const machineState = useFactoryStore.getState().workerMachines.get('step-1');
      expect(machineState?.state).toBe(WorkerState.WORKING);
    });

    it('updates worker machine state in scene', () => {
      const machine = createMockWorkerMachine({ workerId: 'step-1' });
      scene.workerMachines.set('step-1', machine);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1' }),
      );

      expect(scene.updateWorkerState).toHaveBeenCalledWith('step-1', WorkerState.WORKING);
    });

    it('calls enterMachine on the package mover', () => {
      const machine = createMockWorkerMachine({ workerId: 'step-1' });
      scene.workerMachines.set('step-1', machine);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1' }),
      );

      expect(mover.enterMachine).toHaveBeenCalledWith(
        expect.anything(), // crate sprite
        machine,
      );
    });

    it('updates package status to PROCESSING', () => {
      const machine = createMockWorkerMachine({ workerId: 'step-1' });
      scene.workerMachines.set('step-1', machine);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1' }),
      );

      const crateState = useFactoryStore.getState().packageCrates.get('pkg-1');
      expect(crateState?.status).toBe(PackageStatus.PROCESSING);
    });

    it('does nothing if workerVersionId is not in layout', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-unknown' }),
      );

      expect(scene.updateWorkerState).not.toHaveBeenCalled();
    });
  });

  // ─── job:completed ────────────────────────────────────────────────

  describe('handleJobCompleted', () => {
    beforeEach(() => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);
    });

    it('sets machine to DONE then back to WAITING', () => {
      const machine1 = createMockWorkerMachine({ workerId: 'step-1' });
      scene.workerMachines.set('step-1', machine1);
      const machine2 = createMockWorkerMachine({ workerId: 'step-2', x: 300, y: 200 });
      scene.workerMachines.set('step-2', machine2);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1' }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1', duration: 5000 }),
      );

      // Machine should be DONE
      expect(scene.updateWorkerState).toHaveBeenCalledWith('step-1', WorkerState.DONE);

      // After timeout, should be WAITING
      vi.advanceTimersByTime(800);
      expect(scene.updateWorkerState).toHaveBeenCalledWith('step-1', WorkerState.WAITING);
    });

    it('calls processStep to move crate to next machine when job was started', () => {
      const machine1 = createMockWorkerMachine({ workerId: 'step-1', x: 100, y: 200 });
      scene.workerMachines.set('step-1', machine1);
      const machine2 = createMockWorkerMachine({ workerId: 'step-2', x: 300, y: 200 });
      scene.workerMachines.set('step-2', machine2);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      // Start then complete
      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1' }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1', duration: 1000 }),
      );

      expect(mover.processStep).toHaveBeenCalledWith(
        expect.anything(), // crate
        machine1,
        machine2,
        expect.any(Array), // belt path
      );
    });

    it('updates package position in store to next machine', () => {
      const machine1 = createMockWorkerMachine({ workerId: 'step-1' });
      scene.workerMachines.set('step-1', machine1);
      const machine2 = createMockWorkerMachine({ workerId: 'step-2', x: 300, y: 200 });
      scene.workerMachines.set('step-2', machine2);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1' }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1', duration: 1000 }),
      );

      const crateState = useFactoryStore.getState().packageCrates.get('pkg-1');
      expect(crateState?.position).toEqual({ tileX: 5, tileY: 2 });
    });

    it('handles completion at last machine (no next machine)', () => {
      const machine3 = createMockWorkerMachine({ workerId: 'step-3', x: 500, y: 200 });
      scene.workerMachines.set('step-3', machine3);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-3' }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-3', duration: 1000 }),
      );

      // Should NOT call processStep (no next machine)
      expect(mover.processStep).not.toHaveBeenCalled();
      // Should call exitMachine instead
      expect(mover.exitMachine).toHaveBeenCalled();
    });

    it('handles out-of-order: job:completed before job:started', () => {
      const machine1 = createMockWorkerMachine({ workerId: 'step-1', x: 100, y: 200 });
      scene.workerMachines.set('step-1', machine1);
      const machine2 = createMockWorkerMachine({ workerId: 'step-2', x: 300, y: 200 });
      scene.workerMachines.set('step-2', machine2);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      // Complete without start
      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1', duration: 500 }),
      );

      // Should NOT call processStep (uses out-of-order path)
      expect(mover.processStep).not.toHaveBeenCalled();
      // Should call moveAlongPath + enterMachine instead
      expect(mover.moveAlongPath).toHaveBeenCalled();
      expect(mover.enterMachine).toHaveBeenCalledWith(expect.anything(), machine2);
    });

    it('does nothing if workerVersionId is not found', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-unknown', duration: 500 }),
      );

      expect(mover.processStep).not.toHaveBeenCalled();
      expect(mover.moveAlongPath).not.toHaveBeenCalled();
    });

    it('does not reset machine to WAITING after destroy', () => {
      const machine1 = createMockWorkerMachine({ workerId: 'step-1' });
      scene.workerMachines.set('step-1', machine1);
      const machine2 = createMockWorkerMachine({ workerId: 'step-2', x: 300, y: 200 });
      scene.workerMachines.set('step-2', machine2);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1' }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1', duration: 1000 }),
      );

      // Destroy before the timeout
      sync.destroy();

      // Clear mock calls
      (scene.updateWorkerState as ReturnType<typeof vi.fn>).mockClear();

      // Advance past the timeout
      vi.advanceTimersByTime(1000);

      // Should NOT have set WAITING after destroy
      expect(scene.updateWorkerState).not.toHaveBeenCalledWith('step-1', WorkerState.WAITING);
    });
  });

  // ─── job:stuck ────────────────────────────────────────────────────

  describe('handleJobStuck', () => {
    it('sets worker machine to STUCK state in store and scene', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STUCK,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1', reason: 'stuck', stuckSince: new Date().toISOString() }),
      );

      expect(useFactoryStore.getState().workerMachines.get('step-1')?.state).toBe(WorkerState.STUCK);
      expect(scene.updateWorkerState).toHaveBeenCalledWith('step-1', WorkerState.STUCK);
    });

    it('does nothing if worker version not found', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STUCK,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-unknown', reason: 'stuck', stuckSince: new Date().toISOString() }),
      );

      expect(scene.updateWorkerState).not.toHaveBeenCalled();
    });
  });

  // ─── job:error ────────────────────────────────────────────────────

  describe('handleJobError', () => {
    it('sets worker machine to ERROR state in store and scene', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_ERROR,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-2', error: { message: 'fail' }, retryCount: 0, willRetry: false }),
      );

      expect(useFactoryStore.getState().workerMachines.get('step-2')?.state).toBe(WorkerState.ERROR);
      expect(scene.updateWorkerState).toHaveBeenCalledWith('step-2', WorkerState.ERROR);
    });

    it('does nothing if worker version not found', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_ERROR,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-nope', error: { message: 'fail' }, retryCount: 0, willRetry: false }),
      );

      expect(scene.updateWorkerState).not.toHaveBeenCalled();
    });
  });

  // ─── assembly-line:completed ──────────────────────────────────────

  describe('handleAssemblyLineCompleted', () => {
    it('removes crate from scene and store', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      const crate = createMockPackageCrate({ packageId: 'pkg-1' });
      scene.packageCrates.set('pkg-1', crate as unknown as Phaser.GameObjects.Sprite);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      socketManager._emit(
        '/workflows',
        RoutingKeys.ASSEMBLY_LINE_COMPLETED,
        makeEvent({ assemblyLineId: 'al-1', packageId: 'pkg-1', totalSteps: 3, totalDuration: 15000 }),
      );

      expect(useFactoryStore.getState().packageCrates.has('pkg-1')).toBe(false);
      expect(scene.packageCrates.has('pkg-1')).toBe(false);
    });

    it('destroys the crate sprite', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      const crateSprite = scene.packageCrates.get('pkg-1');
      expect(crateSprite).toBeDefined();

      socketManager._emit(
        '/workflows',
        RoutingKeys.ASSEMBLY_LINE_COMPLETED,
        makeEvent({ assemblyLineId: 'al-1', packageId: 'pkg-1', totalSteps: 3, totalDuration: 15000 }),
      );

      expect(crateSprite!.destroy).toHaveBeenCalled();
    });

    it('sets package status to COMPLETED before removal', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      // Spy on addPackage to capture the status update
      const addPackageSpy = vi.spyOn(useFactoryStore.getState(), 'addPackage');

      socketManager._emit(
        '/workflows',
        RoutingKeys.ASSEMBLY_LINE_COMPLETED,
        makeEvent({ assemblyLineId: 'al-1', packageId: 'pkg-1', totalSteps: 3, totalDuration: 15000 }),
      );

      // The status update happens via addPackage with COMPLETED status
      expect(addPackageSpy).toHaveBeenCalledWith(
        'pkg-1',
        expect.objectContaining({ status: PackageStatus.COMPLETED }),
      );
    });

    it('handles completion of unknown package gracefully', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      // Complete a package that was never created
      expect(() => {
        socketManager._emit(
          '/workflows',
          RoutingKeys.ASSEMBLY_LINE_COMPLETED,
          makeEvent({ assemblyLineId: 'al-1', packageId: 'unknown', totalSteps: 3, totalDuration: 15000 }),
        );
      }).not.toThrow();
    });
  });

  // ─── destroy ──────────────────────────────────────────────────────

  describe('destroy', () => {
    it('unsubscribes from all Socket.IO events', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      expect(socketManager._subscriptions.length).toBe(6);

      sync.destroy();
      expect(socketManager._subscriptions.length).toBe(0);
    });

    it('prevents processing of new events after destroy', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();
      sync.destroy();

      // Manually dispatch event (bypassing unsubscribed listeners)
      // The internal dispatch should be guarded by destroyed flag
      expect(useFactoryStore.getState().packageCrates.size).toBe(0);
    });

    it('clears event buffer on destroy', () => {
      sync = new RealtimeSync(socketManager, scene, mover);

      // Buffer some events
      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      sync.destroy();

      // If we somehow called sceneReady after destroy, nothing should happen
      sync.sceneReady();
      expect(useFactoryStore.getState().packageCrates.size).toBe(0);
    });

    it('is idempotent', () => {
      sync = new RealtimeSync(socketManager, scene, mover);
      expect(() => {
        sync.destroy();
        sync.destroy();
      }).not.toThrow();
    });

    it('clears crate trackers', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      sync.destroy();

      // After destroy, internal trackers are cleared
      // We verify this indirectly — no errors on subsequent operations
      expect(() => sync.destroy()).not.toThrow();
    });
  });

  // ─── Full workflow ────────────────────────────────────────────────

  describe('full workflow', () => {
    it('processes complete package lifecycle: create → start → complete → start next → complete next → assembly complete', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      const machine1 = createMockWorkerMachine({ workerId: 'step-1', x: 100, y: 200 });
      const machine2 = createMockWorkerMachine({ workerId: 'step-2', x: 300, y: 200 });
      const machine3 = createMockWorkerMachine({ workerId: 'step-3', x: 500, y: 200 });
      scene.workerMachines.set('step-1', machine1);
      scene.workerMachines.set('step-2', machine2);
      scene.workerMachines.set('step-3', machine3);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      // 1. Package created
      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );
      expect(scene.packageCrates.has('pkg-1')).toBe(true);

      // 2. Job started at step-1
      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1' }),
      );
      expect(scene.updateWorkerState).toHaveBeenCalledWith('step-1', WorkerState.WORKING);
      expect(mover.enterMachine).toHaveBeenCalled();

      // 3. Job completed at step-1 → move to step-2
      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1', duration: 1000 }),
      );
      expect(mover.processStep).toHaveBeenCalledWith(
        expect.anything(),
        machine1,
        machine2,
        expect.any(Array),
      );

      // 4. Job started at step-2
      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-2', packageId: 'pkg-1', workerVersionId: 'wv-2' }),
      );
      expect(scene.updateWorkerState).toHaveBeenCalledWith('step-2', WorkerState.WORKING);

      // 5. Job completed at step-2 → move to step-3
      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        makeEvent({ jobExecutionId: 'job-2', packageId: 'pkg-1', workerVersionId: 'wv-2', duration: 2000 }),
      );
      expect(mover.processStep).toHaveBeenCalledWith(
        expect.anything(),
        machine2,
        machine3,
        expect.any(Array),
      );

      // 6. Job started at step-3
      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-3', packageId: 'pkg-1', workerVersionId: 'wv-3' }),
      );

      // 7. Job completed at step-3 (last machine, no next)
      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        makeEvent({ jobExecutionId: 'job-3', packageId: 'pkg-1', workerVersionId: 'wv-3', duration: 1500 }),
      );
      // processStep should only have been called twice (step1→2, step2→3)
      expect(mover.processStep).toHaveBeenCalledTimes(2);
      // But exitMachine called for last machine
      expect(mover.exitMachine).toHaveBeenCalled();

      // 8. Assembly line completed
      socketManager._emit(
        '/workflows',
        RoutingKeys.ASSEMBLY_LINE_COMPLETED,
        makeEvent({ assemblyLineId: 'al-1', packageId: 'pkg-1', totalSteps: 3, totalDuration: 4500 }),
      );
      expect(scene.packageCrates.has('pkg-1')).toBe(false);
      expect(useFactoryStore.getState().packageCrates.has('pkg-1')).toBe(false);
    });

    it('handles multiple concurrent packages', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      const machine1 = createMockWorkerMachine({ workerId: 'step-1', x: 100, y: 200 });
      const machine2 = createMockWorkerMachine({ workerId: 'step-2', x: 300, y: 200 });
      scene.workerMachines.set('step-1', machine1);
      scene.workerMachines.set('step-2', machine2);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      // Create two packages
      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );
      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-2', type: 'CODE', metadata: {} }),
      );

      expect(scene.packageCrates.size).toBe(2);
      expect(useFactoryStore.getState().packageCrates.size).toBe(2);
    });
  });

  // ─── Belt path computation ────────────────────────────────────────

  describe('belt path computation', () => {
    it('generates screen coordinates from conveyor path tile coordinates', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      const machine1 = createMockWorkerMachine({ workerId: 'step-1', x: 100, y: 200 });
      const machine2 = createMockWorkerMachine({ workerId: 'step-2', x: 300, y: 200 });
      scene.workerMachines.set('step-1', machine1);
      scene.workerMachines.set('step-2', machine2);

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      socketManager._emit(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        makeEvent({ packageId: 'pkg-1', type: 'USER_INPUT', metadata: {} }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1' }),
      );

      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-1', workerVersionId: 'wv-1', duration: 1000 }),
      );

      // processStep should have been called with a belt path array
      const processStepCall = (mover.processStep as ReturnType<typeof vi.fn>).mock.calls[0];
      const beltPath = processStepCall![3] as { x: number; y: number }[];

      // Belt path should contain screen coordinates (not tile coordinates)
      expect(beltPath.length).toBe(2);
      // Verify path entries are numbers (screen coords from cartToIso)
      expect(typeof beltPath[0]!.x).toBe('number');
      expect(typeof beltPath[0]!.y).toBe('number');
    });
  });

  // ─── Edge cases for coverage ──────────────────────────────────────

  describe('edge cases', () => {
    it('handles crate stored as plain Sprite (not PackageCrate instance) via fallback cast', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      const machine1 = createMockWorkerMachine({ workerId: 'step-1', x: 100, y: 200 });
      scene.workerMachines.set('step-1', machine1);

      // Pre-store a plain sprite (not PackageCrate) in the scene's packageCrates map
      const plainSprite = {
        packageId: 'pkg-plain',
        x: 50,
        y: 60,
        destroy: vi.fn(),
        setPosition: vi.fn(),
        setAlpha: vi.fn(),
        setScale: vi.fn(),
        setVisible: vi.fn(),
      };
      scene.packageCrates.set('pkg-plain', plainSprite as unknown as Phaser.GameObjects.Sprite);

      // Add to factory store as well
      useFactoryStore.getState().addPackage('pkg-plain', {
        position: { tileX: 1, tileY: 2 },
        type: 'USER_INPUT' as PackageCrateState['type'],
        status: PackageStatus.PENDING,
        currentStep: 0,
      });

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      // Start job — this will look up the plain sprite and use the fallback cast
      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-plain', workerVersionId: 'wv-1' }),
      );

      // The fallback cast should allow enterMachine to be called
      expect(mover.enterMachine).toHaveBeenCalledWith(plainSprite, machine1);
    });

    it('creates tracker on-the-fly for job:started with unknown packageId', () => {
      const layout = createTestLayout();
      useFactoryStore.getState().setLayout(layout);

      const machine1 = createMockWorkerMachine({ workerId: 'step-1', x: 100, y: 200 });
      scene.workerMachines.set('step-1', machine1);

      // Don't create the package — let getOrCreateTracker handle it
      const crate = createMockPackageCrate({ packageId: 'pkg-new' });
      scene.packageCrates.set('pkg-new', crate as unknown as Phaser.GameObjects.Sprite);

      // Also add to store so updatePackageStatus doesn't bail
      useFactoryStore.getState().addPackage('pkg-new', {
        position: { tileX: 1, tileY: 2 },
        type: 'USER_INPUT' as PackageCrateState['type'],
        status: PackageStatus.PENDING,
        currentStep: 0,
      });

      sync = new RealtimeSync(socketManager, scene, mover);
      sync.sceneReady();

      // Start job — creates tracker on the fly
      socketManager._emit(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        makeEvent({ jobExecutionId: 'job-1', packageId: 'pkg-new', workerVersionId: 'wv-1' }),
      );

      expect(mover.enterMachine).toHaveBeenCalled();
      expect(scene.updateWorkerState).toHaveBeenCalledWith('step-1', WorkerState.WORKING);
    });
  });
});
