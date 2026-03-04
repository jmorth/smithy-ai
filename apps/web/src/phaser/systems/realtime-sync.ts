import type {
  PackageCreatedEvent,
  JobStartedEvent,
  JobCompletedEvent,
  JobStuckEvent,
  JobErrorEvent,
  AssemblyLineCompletedEvent,
} from '@smithy/shared';
import { RoutingKeys, WorkerState, PackageStatus } from '@smithy/shared';
import type { SocketManager } from '@/api/socket';
import { useFactoryStore, type PackageCrateState } from '@/stores/factory.store';
import type { PackageMover } from './package-mover';
import type { ConveyorPath, FactoryLayout, MachinePosition } from './layout-generator';
import { cartToIso } from './isometric';
import type FactoryScene from '../scenes/factory-scene';
import { PackageCrate } from '../objects/package-crate';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Buffered event awaiting scene readiness. */
interface BufferedEvent {
  type: string;
  data: unknown;
}

/** Tracks crate processing state for out-of-order event handling. */
interface CrateTracker {
  currentMachineId: string | null;
  hasStarted: boolean;
}

// ---------------------------------------------------------------------------
// RealtimeSync
// ---------------------------------------------------------------------------

/**
 * Connects Socket.IO events to factory scene updates. Maps workflow domain
 * events (package created, job started/completed/stuck/error, assembly line
 * completed) to visual operations (sprite creation, crate movement, machine
 * state changes, effect triggers, sprite removal).
 *
 * Events arriving while a crate is mid-animation are automatically queued by
 * the PackageMover's per-crate animation queue. Events arriving before the
 * scene is ready are buffered and replayed once `sceneReady()` is called.
 */
export class RealtimeSync {
  private readonly socketManager: SocketManager;
  private readonly scene: FactoryScene;
  private readonly packageMover: PackageMover;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly eventBuffer: BufferedEvent[] = [];
  private readonly crateTrackers = new Map<string, CrateTracker>();

  private sceneIsReady = false;
  private destroyed = false;

  constructor(
    socketManager: SocketManager,
    scene: FactoryScene,
    packageMover: PackageMover,
  ) {
    this.socketManager = socketManager;
    this.scene = scene;
    this.packageMover = packageMover;
    this.subscribe();
  }

  // -----------------------------------------------------------------------
  // Subscription management
  // -----------------------------------------------------------------------

  private subscribe(): void {
    this.unsubscribers.push(
      this.socketManager.onEvent(
        '/workflows',
        RoutingKeys.PACKAGE_CREATED,
        (data: PackageCreatedEvent) => this.dispatch('package:created', data),
      ),
    );

    this.unsubscribers.push(
      this.socketManager.onEvent(
        '/jobs',
        RoutingKeys.JOB_STARTED,
        (data: JobStartedEvent) => this.dispatch('job:started', data),
      ),
    );

    this.unsubscribers.push(
      this.socketManager.onEvent(
        '/jobs',
        RoutingKeys.JOB_COMPLETED,
        (data: JobCompletedEvent) => this.dispatch('job:completed', data),
      ),
    );

    this.unsubscribers.push(
      this.socketManager.onEvent(
        '/jobs',
        RoutingKeys.JOB_STUCK,
        (data: JobStuckEvent) => this.dispatch('job:stuck', data),
      ),
    );

    this.unsubscribers.push(
      this.socketManager.onEvent(
        '/jobs',
        RoutingKeys.JOB_ERROR,
        (data: JobErrorEvent) => this.dispatch('job:error', data),
      ),
    );

    this.unsubscribers.push(
      this.socketManager.onEvent(
        '/workflows',
        RoutingKeys.ASSEMBLY_LINE_COMPLETED,
        (data: AssemblyLineCompletedEvent) =>
          this.dispatch('assembly-line:completed', data),
      ),
    );
  }

  private dispatch(type: string, data: unknown): void {
    if (this.destroyed) return;

    if (!this.sceneIsReady) {
      this.eventBuffer.push({ type, data });
      return;
    }

    this.processEvent(type, data);
  }

  // -----------------------------------------------------------------------
  // Scene readiness
  // -----------------------------------------------------------------------

  /**
   * Signal that the factory scene is ready to receive events.
   * Replays any buffered events in order.
   */
  sceneReady(): void {
    this.sceneIsReady = true;
    this.flushBuffer();
  }

  private flushBuffer(): void {
    const buffered = this.eventBuffer.splice(0);
    for (const event of buffered) {
      if (this.destroyed) break;
      this.processEvent(event.type, event.data);
    }
  }

  // -----------------------------------------------------------------------
  // Event routing
  // -----------------------------------------------------------------------

  private processEvent(type: string, data: unknown): void {
    switch (type) {
      case 'package:created':
        this.handlePackageCreated(data as PackageCreatedEvent);
        break;
      case 'job:started':
        this.handleJobStarted(data as JobStartedEvent);
        break;
      case 'job:completed':
        this.handleJobCompleted(data as JobCompletedEvent);
        break;
      case 'job:stuck':
        this.handleJobStuck(data as JobStuckEvent);
        break;
      case 'job:error':
        this.handleJobError(data as JobErrorEvent);
        break;
      case 'assembly-line:completed':
        this.handleAssemblyLineCompleted(data as AssemblyLineCompletedEvent);
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  private handlePackageCreated(event: PackageCreatedEvent): void {
    const { packageId, type } = event.payload;
    const layout = useFactoryStore.getState().layoutData;
    if (!layout) return;

    // Place crate at the entrance (first machine position of first room)
    const entrancePosition = this.getEntrancePosition(layout);

    // Add to factory store
    const crateState: PackageCrateState = {
      position: entrancePosition,
      type: type as PackageCrateState['type'],
      status: PackageStatus.PENDING,
      currentStep: 0,
    };
    useFactoryStore.getState().addPackage(packageId, crateState);

    // Create crate sprite in scene
    const iso = cartToIso(entrancePosition.tileX, entrancePosition.tileY);
    const crate = PackageCrate.create(this.scene, {
      screenX: iso.screenX,
      screenY: iso.screenY,
      packageId,
      packageType: type,
    });

    this.scene.packageCrates.set(packageId, crate);

    // Initialize tracker
    this.crateTrackers.set(packageId, {
      currentMachineId: null,
      hasStarted: false,
    });
  }

  private handleJobStarted(event: JobStartedEvent): void {
    const { packageId, workerVersionId } = event.payload;
    const machineId = this.findMachineByWorkerVersion(workerVersionId);
    if (!machineId) return;

    // Update worker state to WORKING
    useFactoryStore.getState().updateWorkerState(machineId, WorkerState.WORKING);
    this.scene.updateWorkerState(machineId, WorkerState.WORKING);

    // Update tracker
    const tracker = this.getOrCreateTracker(packageId);
    tracker.currentMachineId = machineId;
    tracker.hasStarted = true;

    // Update store status
    this.updatePackageStatus(packageId, PackageStatus.PROCESSING);

    // Animate crate entering machine
    const crate = this.getCrateSprite(packageId);
    const machine = this.scene.workerMachines.get(machineId);
    if (crate && machine) {
      this.packageMover.enterMachine(crate, machine);
    }
  }

  private handleJobCompleted(event: JobCompletedEvent): void {
    const { packageId, workerVersionId } = event.payload;
    const machineId = this.findMachineByWorkerVersion(workerVersionId);
    if (!machineId) return;

    const tracker = this.getOrCreateTracker(packageId);

    // Briefly set machine to DONE, then back to WAITING
    useFactoryStore.getState().updateWorkerState(machineId, WorkerState.DONE);
    this.scene.updateWorkerState(machineId, WorkerState.DONE);

    // Reset to WAITING after a brief visual delay
    setTimeout(() => {
      if (this.destroyed) return;
      useFactoryStore.getState().updateWorkerState(machineId, WorkerState.WAITING);
      this.scene.updateWorkerState(machineId, WorkerState.WAITING);
    }, 800);

    const layout = useFactoryStore.getState().layoutData;
    if (!layout) return;

    const crate = this.getCrateSprite(packageId);
    if (!crate) return;

    const machine = this.scene.workerMachines.get(machineId);
    const nextMachineId = this.getNextMachine(layout, machineId);

    if (!nextMachineId) {
      // Last machine in the line — crate stays here until assembly-line:completed
      tracker.currentMachineId = machineId;
      this.updatePackageStatus(packageId, PackageStatus.IN_TRANSIT);

      if (tracker.hasStarted && machine) {
        this.packageMover.exitMachine(crate, machine);
      }
      return;
    }

    const nextMachine = this.scene.workerMachines.get(nextMachineId);
    if (!machine || !nextMachine) return;

    // Update store
    this.updatePackageStatus(packageId, PackageStatus.IN_TRANSIT);

    const beltPath = this.getBeltPath(layout, machineId, nextMachineId);

    if (tracker.hasStarted) {
      // Normal flow: exit current machine → move along belt → enter next
      this.packageMover.processStep(crate, machine, nextMachine, beltPath);
    } else {
      // Out-of-order: job:completed arrived before job:started
      // Skip exit animation, move crate directly along belt path
      const isoCoords = beltPath.length > 0 ? beltPath : [{ x: nextMachine.x, y: nextMachine.y }];
      this.packageMover.moveAlongPath(crate, isoCoords);
      this.packageMover.enterMachine(crate, nextMachine);
    }

    // Update tracker to next machine
    tracker.currentMachineId = nextMachineId;
    tracker.hasStarted = false;

    // Update store position
    const nextMachinePos = this.findMachinePosition(layout, nextMachineId);
    if (nextMachinePos) {
      useFactoryStore.getState().movePackage(packageId, {
        tileX: nextMachinePos.tileX,
        tileY: nextMachinePos.tileY,
      });
    }
  }

  private handleJobStuck(event: JobStuckEvent): void {
    const { workerVersionId } = event.payload;
    const machineId = this.findMachineByWorkerVersion(workerVersionId);
    if (!machineId) return;

    useFactoryStore.getState().updateWorkerState(machineId, WorkerState.STUCK);
    this.scene.updateWorkerState(machineId, WorkerState.STUCK);
  }

  private handleJobError(event: JobErrorEvent): void {
    const { workerVersionId } = event.payload;
    const machineId = this.findMachineByWorkerVersion(workerVersionId);
    if (!machineId) return;

    useFactoryStore.getState().updateWorkerState(machineId, WorkerState.ERROR);
    this.scene.updateWorkerState(machineId, WorkerState.ERROR);
  }

  private handleAssemblyLineCompleted(event: AssemblyLineCompletedEvent): void {
    const { packageId } = event.payload;

    this.updatePackageStatus(packageId, PackageStatus.COMPLETED);

    // Remove crate from scene and store
    const crate = this.getCrateSprite(packageId);
    if (crate) {
      crate.destroy();
    }
    this.scene.packageCrates.delete(packageId);
    useFactoryStore.getState().removePackage(packageId);
    this.crateTrackers.delete(packageId);
  }

  // -----------------------------------------------------------------------
  // Layout helpers
  // -----------------------------------------------------------------------

  private getEntrancePosition(layout: FactoryLayout): { tileX: number; tileY: number } {
    if (layout.machinePositions.length > 0) {
      const first = layout.machinePositions[0]!;
      // Place crate one tile before the first machine
      return { tileX: Math.max(0, first.tileX - 1), tileY: first.tileY };
    }
    return { tileX: 0, tileY: 0 };
  }

  private findMachineByWorkerVersion(workerVersionId: string): string | null {
    const layout = useFactoryStore.getState().layoutData;
    if (!layout) return null;

    const pos = layout.machinePositions.find(
      (mp) => mp.workerVersionId === workerVersionId,
    );
    return pos?.id ?? null;
  }

  private findMachinePosition(
    layout: FactoryLayout,
    machineId: string,
  ): MachinePosition | undefined {
    return layout.machinePositions.find((mp) => mp.id === machineId);
  }

  private getNextMachine(
    layout: FactoryLayout,
    currentMachineId: string,
  ): string | null {
    // Find the conveyor path that starts from the current machine
    const path = layout.conveyorPaths.find(
      (cp) => cp.fromMachineId === currentMachineId,
    );
    return path?.toMachineId ?? null;
  }

  private getBeltPath(
    layout: FactoryLayout,
    fromMachineId: string,
    toMachineId: string,
  ): { x: number; y: number }[] {
    const conveyor = layout.conveyorPaths.find(
      (cp) =>
        cp.fromMachineId === fromMachineId &&
        cp.toMachineId === toMachineId,
    );

    if (!conveyor) return [];

    // Convert conveyor path endpoints to screen coordinates
    const startIso = cartToIso(conveyor.startX, conveyor.startY);
    const endIso = cartToIso(conveyor.endX, conveyor.endY);

    return [
      { x: startIso.screenX, y: startIso.screenY },
      { x: endIso.screenX, y: endIso.screenY },
    ];
  }

  // -----------------------------------------------------------------------
  // Crate helpers
  // -----------------------------------------------------------------------

  private getCrateSprite(packageId: string): PackageCrate | null {
    const sprite = this.scene.packageCrates.get(packageId);
    if (!sprite) return null;

    // PackageCrate instances are stored in the map; verify it's a PackageCrate
    if (sprite instanceof PackageCrate) {
      return sprite;
    }

    // If stored as plain Sprite (from addPackageCrate), return as PackageCrate
    // for type compatibility with PackageMover
    return sprite as unknown as PackageCrate;
  }

  private getOrCreateTracker(packageId: string): CrateTracker {
    let tracker = this.crateTrackers.get(packageId);
    if (!tracker) {
      tracker = { currentMachineId: null, hasStarted: false };
      this.crateTrackers.set(packageId, tracker);
    }
    return tracker;
  }

  private updatePackageStatus(packageId: string, status: PackageStatus): void {
    const store = useFactoryStore.getState();
    const existing = store.packageCrates.get(packageId);
    if (!existing) return;

    // Re-add with updated status (addPackage replaces existing entry)
    store.addPackage(packageId, { ...existing, status });
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /**
   * Unsubscribes from all Socket.IO events and cleans up internal state.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
    this.eventBuffer.length = 0;
    this.crateTrackers.clear();
  }
}
