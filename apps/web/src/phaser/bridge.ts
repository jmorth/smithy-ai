import type Phaser from 'phaser';
import type { AppStore } from '@/stores/app.store';
import type { StoreApi } from 'zustand';

// ---------------------------------------------------------------------------
// Bridge Event Types
// ---------------------------------------------------------------------------

export const BRIDGE_EVENTS = {
  WORKER_SELECTED: 'bridge:worker:selected',
  PACKAGE_SELECTED: 'bridge:package:selected',
  SELECTION_CLEARED: 'bridge:selection:cleared',
  VIEW_MODE_CHANGED: 'bridge:viewMode:changed',
  SOCKET_STATE_CHANGED: 'bridge:socket:stateChanged',
} as const;

export type BridgeEventName =
  (typeof BRIDGE_EVENTS)[keyof typeof BRIDGE_EVENTS];

export interface BridgeEventPayloads {
  [BRIDGE_EVENTS.WORKER_SELECTED]: { workerId: string };
  [BRIDGE_EVENTS.PACKAGE_SELECTED]: { packageId: string };
  [BRIDGE_EVENTS.SELECTION_CLEARED]: undefined;
  [BRIDGE_EVENTS.VIEW_MODE_CHANGED]: { viewMode: AppStore['viewMode'] };
  [BRIDGE_EVENTS.SOCKET_STATE_CHANGED]: {
    socketState: AppStore['socketState'];
  };
}

// ---------------------------------------------------------------------------
// Queued Event
// ---------------------------------------------------------------------------

interface QueuedEvent {
  sceneKey: string;
  event: BridgeEventName;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// PhaserBridge
// ---------------------------------------------------------------------------

export class PhaserBridge {
  private readonly game: Phaser.Game;
  private readonly store: StoreApi<AppStore>;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly eventQueue: QueuedEvent[] = [];
  private destroyed = false;
  private flushScheduled = false;
  private pendingEmissions = new Map<
    string,
    { sceneKey: string; event: BridgeEventName; payload: unknown }
  >();

  constructor(game: Phaser.Game, store: StoreApi<AppStore>) {
    this.game = game;
    this.store = store;
    this.setupSubscriptions();
  }

  // -------------------------------------------------------------------------
  // Zustand → Phaser (state changes emit scene events)
  // -------------------------------------------------------------------------

  private setupSubscriptions(): void {
    this.subscribeSlice(
      (s) => s.selectedWorkerId,
      (workerId) => {
        if (workerId) {
          this.emitToScene(
            'FactoryScene',
            BRIDGE_EVENTS.WORKER_SELECTED,
            { workerId },
          );
        } else {
          this.emitToScene(
            'FactoryScene',
            BRIDGE_EVENTS.SELECTION_CLEARED,
            undefined,
          );
        }
      },
    );

    this.subscribeSlice(
      (s) => s.selectedPackageId,
      (packageId) => {
        if (packageId) {
          this.emitToScene(
            'FactoryScene',
            BRIDGE_EVENTS.PACKAGE_SELECTED,
            { packageId },
          );
        } else {
          this.emitToScene(
            'FactoryScene',
            BRIDGE_EVENTS.SELECTION_CLEARED,
            undefined,
          );
        }
      },
    );

    this.subscribeSlice(
      (s) => s.viewMode,
      (viewMode) => {
        this.emitToScene(
          'FactoryScene',
          BRIDGE_EVENTS.VIEW_MODE_CHANGED,
          { viewMode },
        );
      },
    );

    this.subscribeSlice(
      (s) => s.socketState,
      (socketState) => {
        this.emitToScene(
          'FactoryScene',
          BRIDGE_EVENTS.SOCKET_STATE_CHANGED,
          { socketState },
        );
      },
    );
  }

  private subscribeSlice<T>(
    selector: (state: AppStore) => T,
    callback: (value: T) => void,
  ): void {
    let prevValue = selector(this.store.getState());
    const unsub = this.store.subscribe((state) => {
      const nextValue = selector(state);
      if (nextValue !== prevValue) {
        prevValue = nextValue;
        callback(nextValue);
      }
    });
    this.unsubscribers.push(unsub);
  }

  private emitToScene(
    sceneKey: string,
    event: BridgeEventName,
    payload: unknown,
  ): void {
    if (this.destroyed) return;

    const scene = this.getScene(sceneKey);
    if (!scene || !scene.sys?.isActive()) {
      this.eventQueue.push({ sceneKey, event, payload });
      return;
    }

    // Batch emissions using RAF to align with Phaser's game loop.
    // Multiple rapid changes to the same event are coalesced — only the
    // latest payload is emitted.
    const key = `${sceneKey}:${event}`;
    this.pendingEmissions.set(key, { sceneKey, event, payload });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.destroyed) return;
    this.flushScheduled = true;
    requestAnimationFrame(() => {
      this.flushScheduled = false;
      if (this.destroyed) return;
      this.flushPendingEmissions();
    });
  }

  private flushPendingEmissions(): void {
    for (const [, { sceneKey, event, payload }] of this.pendingEmissions) {
      const scene = this.getScene(sceneKey);
      if (scene?.sys?.isActive()) {
        scene.events.emit(event, payload);
      } else {
        this.eventQueue.push({ sceneKey, event, payload });
      }
    }
    this.pendingEmissions.clear();
  }

  /**
   * Flush any queued events for a scene that has just become active.
   * Call this from the scene's `create()` method.
   */
  flushQueuedEvents(sceneKey: string): void {
    if (this.destroyed) return;

    const scene = this.getScene(sceneKey);
    if (!scene?.sys?.isActive()) return;

    const remaining: QueuedEvent[] = [];
    for (const queued of this.eventQueue) {
      if (queued.sceneKey === sceneKey) {
        scene.events.emit(queued.event, queued.payload);
      } else {
        remaining.push(queued);
      }
    }
    this.eventQueue.length = 0;
    this.eventQueue.push(...remaining);
  }

  private getScene(key: string): Phaser.Scene | undefined {
    try {
      return this.game.scene.getScene(key) ?? undefined;
    } catch {
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Phaser → Zustand (user interactions dispatch store actions)
  // -------------------------------------------------------------------------

  onWorkerClicked(workerId: string): void {
    if (this.destroyed) return;
    this.store.getState().selectWorker(workerId);
  }

  onPackageClicked(packageId: string): void {
    if (this.destroyed) return;
    this.store.getState().selectPackage(packageId);
  }

  onDeselectAll(): void {
    if (this.destroyed) return;
    const state = this.store.getState();
    state.selectWorker(null);
    state.selectPackage(null);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
    this.eventQueue.length = 0;
    this.pendingEmissions.clear();
  }
}
