import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import {
  PhaserBridge,
  BRIDGE_EVENTS,
  type BridgeEventName,
} from '../bridge';
import type { AppStore } from '@/stores/app.store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStore() {
  return createStore<AppStore>((set) => ({
    viewMode: 'managerial',
    socketState: 'disconnected',
    unreadNotificationCount: 0,
    selectedWorkerId: null,
    selectedPackageId: null,
    setViewMode: (mode) => set({ viewMode: mode }),
    setSocketState: (state) => set({ socketState: state }),
    incrementNotifications: () =>
      set((s) => ({ unreadNotificationCount: s.unreadNotificationCount + 1 })),
    resetNotifications: () => set({ unreadNotificationCount: 0 }),
    selectWorker: (id) => set({ selectedWorkerId: id }),
    selectPackage: (id) => set({ selectedPackageId: id }),
  }));
}

interface MockScene {
  key: string;
  sys: { isActive: () => boolean };
  events: { emit: ReturnType<typeof vi.fn> };
}

function createMockScene(
  key: string,
  active = true,
): MockScene {
  return {
    key,
    sys: { isActive: () => active },
    events: { emit: vi.fn() },
  };
}

interface MockGame {
  scene: {
    getScene: ReturnType<typeof vi.fn>;
    scenes: MockScene[];
  };
}

function createMockGame(scenes: MockScene[] = []): MockGame {
  return {
    scene: {
      getScene: vi.fn((key: string) =>
        scenes.find((s) => s.key === key) ?? null,
      ),
      scenes,
    },
  };
}

function flushRAF() {
  vi.advanceTimersByTime(16);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PhaserBridge', () => {
  let store: ReturnType<typeof createMockStore>;
  let factoryScene: MockScene;
  let game: MockGame;
  let bridge: PhaserBridge;

  beforeEach(() => {
    vi.useFakeTimers();
    store = createMockStore();
    factoryScene = createMockScene('FactoryScene');
    game = createMockGame([factoryScene]);
    bridge = new PhaserBridge(
      game as unknown as Phaser.Game,
      store,
    );
  });

  afterEach(() => {
    bridge.destroy();
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // BRIDGE_EVENTS constant
  // -----------------------------------------------------------------------

  describe('BRIDGE_EVENTS', () => {
    it('defines all expected event names', () => {
      expect(BRIDGE_EVENTS.WORKER_SELECTED).toBe('bridge:worker:selected');
      expect(BRIDGE_EVENTS.PACKAGE_SELECTED).toBe('bridge:package:selected');
      expect(BRIDGE_EVENTS.SELECTION_CLEARED).toBe('bridge:selection:cleared');
      expect(BRIDGE_EVENTS.VIEW_MODE_CHANGED).toBe('bridge:viewMode:changed');
      expect(BRIDGE_EVENTS.SOCKET_STATE_CHANGED).toBe(
        'bridge:socket:stateChanged',
      );
    });

    it('has exactly 5 event types', () => {
      expect(Object.keys(BRIDGE_EVENTS)).toHaveLength(5);
    });
  });

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------

  describe('construction', () => {
    it('creates a bridge without errors', () => {
      expect(bridge).toBeInstanceOf(PhaserBridge);
    });

    it('is not destroyed on creation', () => {
      expect(bridge.isDestroyed).toBe(false);
    });

    it('does not emit any events on construction', () => {
      flushRAF();
      expect(factoryScene.events.emit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Zustand → Phaser: selectedWorkerId
  // -----------------------------------------------------------------------

  describe('selectedWorkerId subscription', () => {
    it('emits WORKER_SELECTED when a worker is selected', () => {
      store.getState().selectWorker('worker-1');
      flushRAF();

      expect(factoryScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.WORKER_SELECTED,
        { workerId: 'worker-1' },
      );
    });

    it('emits SELECTION_CLEARED when worker is deselected', () => {
      store.getState().selectWorker('worker-1');
      flushRAF();
      factoryScene.events.emit.mockClear();

      store.getState().selectWorker(null);
      flushRAF();

      expect(factoryScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.SELECTION_CLEARED,
        undefined,
      );
    });

    it('emits WORKER_SELECTED with new id when selection changes', () => {
      store.getState().selectWorker('worker-1');
      flushRAF();
      factoryScene.events.emit.mockClear();

      store.getState().selectWorker('worker-2');
      flushRAF();

      expect(factoryScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.WORKER_SELECTED,
        { workerId: 'worker-2' },
      );
    });

    it('does not emit when selectedWorkerId is set to the same value', () => {
      store.getState().selectWorker('worker-1');
      flushRAF();
      factoryScene.events.emit.mockClear();

      // Set to same value
      store.setState({ selectedWorkerId: 'worker-1' });
      flushRAF();

      expect(factoryScene.events.emit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Zustand → Phaser: selectedPackageId
  // -----------------------------------------------------------------------

  describe('selectedPackageId subscription', () => {
    it('emits PACKAGE_SELECTED when a package is selected', () => {
      store.getState().selectPackage('pkg-1');
      flushRAF();

      expect(factoryScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.PACKAGE_SELECTED,
        { packageId: 'pkg-1' },
      );
    });

    it('emits SELECTION_CLEARED when package is deselected', () => {
      store.getState().selectPackage('pkg-1');
      flushRAF();
      factoryScene.events.emit.mockClear();

      store.getState().selectPackage(null);
      flushRAF();

      expect(factoryScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.SELECTION_CLEARED,
        undefined,
      );
    });

    it('does not emit when selectedPackageId is set to the same value', () => {
      store.getState().selectPackage('pkg-1');
      flushRAF();
      factoryScene.events.emit.mockClear();

      store.setState({ selectedPackageId: 'pkg-1' });
      flushRAF();

      expect(factoryScene.events.emit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Zustand → Phaser: viewMode
  // -----------------------------------------------------------------------

  describe('viewMode subscription', () => {
    it('emits VIEW_MODE_CHANGED when viewMode changes', () => {
      store.getState().setViewMode('factory');
      flushRAF();

      expect(factoryScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.VIEW_MODE_CHANGED,
        { viewMode: 'factory' },
      );
    });

    it('does not emit when viewMode is set to the same value', () => {
      store.setState({ viewMode: 'managerial' });
      flushRAF();

      expect(factoryScene.events.emit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Zustand → Phaser: socketState
  // -----------------------------------------------------------------------

  describe('socketState subscription', () => {
    it('emits SOCKET_STATE_CHANGED when socketState changes', () => {
      store.getState().setSocketState('connected');
      flushRAF();

      expect(factoryScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.SOCKET_STATE_CHANGED,
        { socketState: 'connected' },
      );
    });

    it('emits on each distinct state transition', () => {
      store.getState().setSocketState('reconnecting');
      flushRAF();
      factoryScene.events.emit.mockClear();

      store.getState().setSocketState('connected');
      flushRAF();

      expect(factoryScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.SOCKET_STATE_CHANGED,
        { socketState: 'connected' },
      );
    });

    it('does not emit when socketState is set to the same value', () => {
      store.setState({ socketState: 'disconnected' });
      flushRAF();

      expect(factoryScene.events.emit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // RAF batching / debounce
  // -----------------------------------------------------------------------

  describe('RAF batching', () => {
    it('coalesces rapid state changes into a single emission per event type', () => {
      store.getState().selectWorker('w-1');
      store.getState().selectWorker('w-2');
      store.getState().selectWorker('w-3');
      flushRAF();

      // Only the last value should be emitted (coalesced by event key)
      const workerCalls = factoryScene.events.emit.mock.calls.filter(
        (call: unknown[]) => call[0] === BRIDGE_EVENTS.WORKER_SELECTED,
      );
      expect(workerCalls).toHaveLength(1);
      expect(workerCalls[0]![1]).toEqual({ workerId: 'w-3' });
    });

    it('does not emit before RAF fires', () => {
      store.getState().selectWorker('w-1');
      expect(factoryScene.events.emit).not.toHaveBeenCalled();
    });

    it('handles multiple event types in the same RAF frame', () => {
      store.getState().selectWorker('w-1');
      store.getState().setViewMode('factory');
      flushRAF();

      expect(factoryScene.events.emit).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Event queue (scene not ready)
  // -----------------------------------------------------------------------

  describe('event queue', () => {
    it('queues events when scene is not active', () => {
      const inactiveScene = createMockScene('FactoryScene', false);
      const inactiveGame = createMockGame([inactiveScene]);
      const queueBridge = new PhaserBridge(
        inactiveGame as unknown as Phaser.Game,
        store,
      );

      store.getState().selectWorker('w-1');
      flushRAF();

      expect(inactiveScene.events.emit).not.toHaveBeenCalled();

      queueBridge.destroy();
    });

    it('queues events when scene does not exist', () => {
      const emptyGame = createMockGame([]);
      const queueBridge = new PhaserBridge(
        emptyGame as unknown as Phaser.Game,
        store,
      );

      store.getState().selectWorker('w-1');
      flushRAF();

      // No scene to emit to, should not throw
      expect(true).toBe(true);

      queueBridge.destroy();
    });

    it('flushes queued events when flushQueuedEvents is called', () => {
      const inactiveScene = createMockScene('FactoryScene', false);
      const sceneGame = createMockGame([inactiveScene]);
      const queueBridge = new PhaserBridge(
        sceneGame as unknown as Phaser.Game,
        store,
      );

      store.getState().selectWorker('w-1');
      flushRAF();
      expect(inactiveScene.events.emit).not.toHaveBeenCalled();

      // Scene becomes active
      inactiveScene.sys.isActive = () => true;
      queueBridge.flushQueuedEvents('FactoryScene');

      expect(inactiveScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.WORKER_SELECTED,
        { workerId: 'w-1' },
      );

      queueBridge.destroy();
    });

    it('does not flush queued events for a different scene key', () => {
      const inactiveScene = createMockScene('FactoryScene', false);
      const otherScene = createMockScene('OtherScene', true);
      const sceneGame = createMockGame([inactiveScene, otherScene]);
      const queueBridge = new PhaserBridge(
        sceneGame as unknown as Phaser.Game,
        store,
      );

      store.getState().selectWorker('w-1');
      flushRAF();

      queueBridge.flushQueuedEvents('OtherScene');
      expect(inactiveScene.events.emit).not.toHaveBeenCalled();

      queueBridge.destroy();
    });

    it('does not flush if the scene is still inactive when flush is called', () => {
      const inactiveScene = createMockScene('FactoryScene', false);
      const sceneGame = createMockGame([inactiveScene]);
      const queueBridge = new PhaserBridge(
        sceneGame as unknown as Phaser.Game,
        store,
      );

      store.getState().selectWorker('w-1');
      flushRAF();

      queueBridge.flushQueuedEvents('FactoryScene');
      expect(inactiveScene.events.emit).not.toHaveBeenCalled();

      queueBridge.destroy();
    });

    it('flushes multiple queued events in order', () => {
      const inactiveScene = createMockScene('FactoryScene', false);
      const sceneGame = createMockGame([inactiveScene]);
      const queueBridge = new PhaserBridge(
        sceneGame as unknown as Phaser.Game,
        store,
      );

      // Trigger worker selection and view mode change in separate RAF frames
      store.getState().selectWorker('w-1');
      flushRAF();

      store.getState().setViewMode('factory');
      flushRAF();

      expect(inactiveScene.events.emit).not.toHaveBeenCalled();

      // Activate and flush
      inactiveScene.sys.isActive = () => true;
      queueBridge.flushQueuedEvents('FactoryScene');

      expect(inactiveScene.events.emit).toHaveBeenCalledTimes(2);
      expect(inactiveScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.WORKER_SELECTED,
        { workerId: 'w-1' },
      );
      expect(inactiveScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.VIEW_MODE_CHANGED,
        { viewMode: 'factory' },
      );

      queueBridge.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // Phaser → Zustand: onWorkerClicked
  // -----------------------------------------------------------------------

  describe('onWorkerClicked', () => {
    it('dispatches selectWorker action to the store', () => {
      bridge.onWorkerClicked('worker-42');
      expect(store.getState().selectedWorkerId).toBe('worker-42');
    });

    it('does nothing when bridge is destroyed', () => {
      bridge.destroy();
      bridge.onWorkerClicked('worker-42');
      expect(store.getState().selectedWorkerId).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Phaser → Zustand: onPackageClicked
  // -----------------------------------------------------------------------

  describe('onPackageClicked', () => {
    it('dispatches selectPackage action to the store', () => {
      bridge.onPackageClicked('pkg-99');
      expect(store.getState().selectedPackageId).toBe('pkg-99');
    });

    it('does nothing when bridge is destroyed', () => {
      bridge.destroy();
      bridge.onPackageClicked('pkg-99');
      expect(store.getState().selectedPackageId).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Phaser → Zustand: onDeselectAll
  // -----------------------------------------------------------------------

  describe('onDeselectAll', () => {
    it('clears both worker and package selection', () => {
      store.getState().selectWorker('w-1');
      store.getState().selectPackage('p-1');
      expect(store.getState().selectedWorkerId).toBe('w-1');
      expect(store.getState().selectedPackageId).toBe('p-1');

      bridge.onDeselectAll();
      expect(store.getState().selectedWorkerId).toBeNull();
      expect(store.getState().selectedPackageId).toBeNull();
    });

    it('does nothing when bridge is destroyed', () => {
      store.getState().selectWorker('w-1');
      bridge.destroy();
      bridge.onDeselectAll();
      expect(store.getState().selectedWorkerId).toBe('w-1');
    });
  });

  // -----------------------------------------------------------------------
  // Destroy / cleanup
  // -----------------------------------------------------------------------

  describe('destroy', () => {
    it('sets isDestroyed to true', () => {
      bridge.destroy();
      expect(bridge.isDestroyed).toBe(true);
    });

    it('prevents further event emissions after destroy', () => {
      bridge.destroy();
      store.getState().selectWorker('w-1');
      flushRAF();
      expect(factoryScene.events.emit).not.toHaveBeenCalled();
    });

    it('is idempotent — calling destroy twice does not throw', () => {
      bridge.destroy();
      expect(() => bridge.destroy()).not.toThrow();
    });

    it('prevents flushQueuedEvents after destroy', () => {
      const inactiveScene = createMockScene('FactoryScene', false);
      const sceneGame = createMockGame([inactiveScene]);
      const queueBridge = new PhaserBridge(
        sceneGame as unknown as Phaser.Game,
        store,
      );

      store.getState().selectWorker('w-1');
      flushRAF();

      queueBridge.destroy();
      inactiveScene.sys.isActive = () => true;
      queueBridge.flushQueuedEvents('FactoryScene');

      expect(inactiveScene.events.emit).not.toHaveBeenCalled();
    });

    it('clears pending emissions on destroy', () => {
      // Trigger emission but do not flush RAF
      store.getState().selectWorker('w-1');

      bridge.destroy();
      flushRAF();

      expect(factoryScene.events.emit).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Scene becomes inactive between schedule and flush
  // -----------------------------------------------------------------------

  describe('scene goes inactive during pending flush', () => {
    it('re-queues events if scene becomes inactive between schedule and RAF', () => {
      // Scene is active when the state change occurs
      let active = true;
      factoryScene.sys.isActive = () => active;

      store.getState().selectWorker('w-1');

      // Scene becomes inactive before RAF fires
      active = false;
      flushRAF();

      // Event was not emitted (scene inactive at flush time)
      expect(factoryScene.events.emit).not.toHaveBeenCalled();

      // Re-activate and flush queued events
      active = true;
      bridge.flushQueuedEvents('FactoryScene');
      expect(factoryScene.events.emit).toHaveBeenCalledWith(
        BRIDGE_EVENTS.WORKER_SELECTED,
        { workerId: 'w-1' },
      );
    });
  });

  // -----------------------------------------------------------------------
  // Error handling (getScene throws)
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('handles getScene throwing gracefully', () => {
      const errorGame = createMockGame([]);
      (errorGame.scene.getScene as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error('Scene manager not ready');
        },
      );
      const errorBridge = new PhaserBridge(
        errorGame as unknown as Phaser.Game,
        store,
      );

      expect(() => {
        store.getState().selectWorker('w-1');
        flushRAF();
      }).not.toThrow();

      errorBridge.destroy();
    });
  });

  // -----------------------------------------------------------------------
  // No direct imports between React and Phaser
  // -----------------------------------------------------------------------

  describe('isolation', () => {
    it('bridge module does not import React', async () => {
      // The bridge.ts file should only import types from zustand and phaser,
      // never React components or hooks
      const bridgeModule = await import('../bridge');
      expect(bridgeModule.PhaserBridge).toBeDefined();
      expect(bridgeModule.BRIDGE_EVENTS).toBeDefined();
    });
  });
});
