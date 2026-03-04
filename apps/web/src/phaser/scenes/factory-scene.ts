import Phaser from 'phaser';

import { WorkerState } from '@smithy/shared';
import { ASSET_KEYS } from '../constants/asset-keys';
import { BRIDGE_EVENTS, type PhaserBridge } from '../bridge';
import { CameraController } from '../systems/camera-controller';
import {
  cartToIso,
  getDepth,
  TILE_WIDTH,
  TILE_HEIGHT,
} from '../systems/isometric';
import { WorkerMachine } from '../objects/worker-machine';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const DEFAULT_GRID_COLS = 20;
export const DEFAULT_GRID_ROWS = 20;

export interface PackageCrateConfig {
  tileX: number;
  tileY: number;
}

// ---------------------------------------------------------------------------
// FactoryScene
// ---------------------------------------------------------------------------

export default class FactoryScene extends Phaser.Scene {
  private cameraController: CameraController | null = null;
  private bridge: PhaserBridge | null = null;
  private ready = false;

  readonly workerMachines = new Map<string, WorkerMachine>();
  readonly packageCrates = new Map<string, Phaser.GameObjects.Sprite>();

  private floorTileGroup: Phaser.GameObjects.Group | null = null;
  private gridCols = DEFAULT_GRID_COLS;
  private gridRows = DEFAULT_GRID_ROWS;

  constructor() {
    super({ key: 'FactoryScene' });
  }

  // -----------------------------------------------------------------------
  // Bridge injection
  // -----------------------------------------------------------------------

  setBridge(bridge: PhaserBridge): void {
    this.bridge = bridge;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  create(): void {
    this.floorTileGroup = this.add.group();

    this.createFloorGrid(this.gridCols, this.gridRows);
    this.initCamera();
    this.registerBridgeListeners();
    this.registerClickHandler();

    this.ready = true;

    if (this.bridge) {
      this.bridge.flushQueuedEvents('FactoryScene');
    }
  }

  update(_time: number, _delta: number): void {
    if (this.cameraController) {
      this.cameraController.update();
    }
  }

  shutdown(): void {
    this.ready = false;
    this.removeBridgeListeners();

    if (this.cameraController) {
      this.cameraController.destroy();
      this.cameraController = null;
    }

    this.workerMachines.forEach((sprite) => sprite.destroy());
    this.workerMachines.clear();

    this.packageCrates.forEach((sprite) => sprite.destroy());
    this.packageCrates.clear();

    if (this.floorTileGroup) {
      this.floorTileGroup.destroy(true);
      this.floorTileGroup = null;
    }
  }

  // -----------------------------------------------------------------------
  // Floor grid
  // -----------------------------------------------------------------------

  private createFloorGrid(cols: number, rows: number): void {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const iso = cartToIso(col, row);
        const tile = this.add.image(
          iso.screenX,
          iso.screenY,
          ASSET_KEYS.FLOOR_TILE,
        );
        tile.setDepth(getDepth(col, row));
        this.floorTileGroup!.add(tile);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Camera
  // -----------------------------------------------------------------------

  private initCamera(): void {
    this.cameraController = new CameraController(this);

    const topLeft = cartToIso(0, 0);
    const bottomRight = cartToIso(this.gridCols, this.gridRows);
    const topRight = cartToIso(this.gridCols, 0);
    const bottomLeft = cartToIso(0, this.gridRows);

    const minX = Math.min(topLeft.screenX, bottomLeft.screenX, topRight.screenX, bottomRight.screenX);
    const maxX = Math.max(topLeft.screenX, bottomLeft.screenX, topRight.screenX, bottomRight.screenX);
    const minY = Math.min(topLeft.screenY, bottomLeft.screenY, topRight.screenY, bottomRight.screenY);
    const maxY = Math.max(topLeft.screenY, bottomLeft.screenY, topRight.screenY, bottomRight.screenY);

    const width = maxX - minX + TILE_WIDTH;
    const height = maxY - minY + TILE_HEIGHT;

    this.cameraController.setBounds(width, height);
  }

  // -----------------------------------------------------------------------
  // Bridge event listeners
  // -----------------------------------------------------------------------

  private registerBridgeListeners(): void {
    this.events.on(
      BRIDGE_EVENTS.WORKER_SELECTED,
      this.onWorkerSelected,
      this,
    );
    this.events.on(
      BRIDGE_EVENTS.PACKAGE_SELECTED,
      this.onPackageSelected,
      this,
    );
    this.events.on(
      BRIDGE_EVENTS.SELECTION_CLEARED,
      this.onSelectionCleared,
      this,
    );
    this.events.on(
      BRIDGE_EVENTS.VIEW_MODE_CHANGED,
      this.onViewModeChanged,
      this,
    );
    this.events.on(
      BRIDGE_EVENTS.SOCKET_STATE_CHANGED,
      this.onSocketStateChanged,
      this,
    );
    this.events.on(BRIDGE_EVENTS.ZOOM_TO, this.onZoomTo, this);
    this.events.on(BRIDGE_EVENTS.CENTER_ON, this.onCenterOn, this);
    this.events.on(BRIDGE_EVENTS.RESET_VIEW, this.onResetView, this);
  }

  private removeBridgeListeners(): void {
    this.events.off(
      BRIDGE_EVENTS.WORKER_SELECTED,
      this.onWorkerSelected,
      this,
    );
    this.events.off(
      BRIDGE_EVENTS.PACKAGE_SELECTED,
      this.onPackageSelected,
      this,
    );
    this.events.off(
      BRIDGE_EVENTS.SELECTION_CLEARED,
      this.onSelectionCleared,
      this,
    );
    this.events.off(
      BRIDGE_EVENTS.VIEW_MODE_CHANGED,
      this.onViewModeChanged,
      this,
    );
    this.events.off(
      BRIDGE_EVENTS.SOCKET_STATE_CHANGED,
      this.onSocketStateChanged,
      this,
    );
    this.events.off(BRIDGE_EVENTS.ZOOM_TO, this.onZoomTo, this);
    this.events.off(BRIDGE_EVENTS.CENTER_ON, this.onCenterOn, this);
    this.events.off(BRIDGE_EVENTS.RESET_VIEW, this.onResetView, this);
  }

  private onWorkerSelected(_payload: { workerId: string }): void {
    // Highlight selected worker — visual effects handled by task 119
  }

  private onPackageSelected(_payload: { packageId: string }): void {
    // Highlight selected package — visual effects handled by task 119
  }

  private onSelectionCleared(): void {
    // Clear highlights — visual effects handled by task 119
  }

  private onViewModeChanged(_payload: { viewMode: string }): void {
    // View mode toggle — handled by task 118/119
  }

  private onSocketStateChanged(_payload: { socketState: string }): void {
    // Socket state visual indicator — handled by task 118/119
  }

  private onZoomTo(payload: { level: number }): void {
    this.cameraController?.zoomTo(payload.level);
  }

  private onCenterOn(payload: { tileX: number; tileY: number }): void {
    this.cameraController?.centerOn(payload.tileX, payload.tileY);
  }

  private onResetView(): void {
    this.cameraController?.resetView();
  }

  // -----------------------------------------------------------------------
  // Click handling
  // -----------------------------------------------------------------------

  private registerClickHandler(): void {
    this.input.on('gameobjectdown', this.onGameObjectDown, this);
  }

  private onGameObjectDown(
    _pointer: Phaser.Input.Pointer,
    gameObject: Phaser.GameObjects.GameObject,
  ): void {
    if (!this.bridge) return;

    // WorkerMachine handles its own click events via pointerdown listener,
    // so we only need to handle package crates here.
    const packageId = this.findPackageIdBySprite(gameObject);
    if (packageId) {
      this.bridge.onPackageClicked(packageId);
    }
  }

  private findPackageIdBySprite(
    gameObject: Phaser.GameObjects.GameObject,
  ): string | undefined {
    for (const [id, sprite] of this.packageCrates) {
      if (sprite === gameObject) return id;
    }
    return undefined;
  }

  // -----------------------------------------------------------------------
  // Game object management
  // -----------------------------------------------------------------------

  addWorkerMachine(id: string, config: { tileX: number; tileY: number; workerName?: string; initialState?: WorkerState }): WorkerMachine {
    this.removeWorkerMachine(id);

    const machine = WorkerMachine.create(this, {
      tileX: config.tileX,
      tileY: config.tileY,
      workerId: id,
      workerName: config.workerName,
      initialState: config.initialState,
      bridge: this.bridge ?? undefined,
    });

    this.workerMachines.set(id, machine);
    return machine;
  }

  removeWorkerMachine(id: string): void {
    const existing = this.workerMachines.get(id);
    if (existing) {
      existing.destroy();
      this.workerMachines.delete(id);
    }
  }

  updateWorkerState(id: string, state: WorkerState): void {
    const machine = this.workerMachines.get(id);
    if (machine) {
      machine.setWorkerState(state);
    }
  }

  addPackageCrate(id: string, config: PackageCrateConfig): Phaser.GameObjects.Sprite {
    this.removePackageCrate(id);

    const iso = cartToIso(config.tileX, config.tileY);
    const sprite = this.add.sprite(
      iso.screenX,
      iso.screenY,
      ASSET_KEYS.PACKAGE_CRATE,
    );
    sprite.setDepth(getDepth(config.tileX, config.tileY) + 0.2);
    sprite.setInteractive();

    this.packageCrates.set(id, sprite);
    return sprite;
  }

  removePackageCrate(id: string): void {
    const existing = this.packageCrates.get(id);
    if (existing) {
      existing.destroy();
      this.packageCrates.delete(id);
    }
  }

  // -----------------------------------------------------------------------
  // Rebuild
  // -----------------------------------------------------------------------

  rebuild(): void {
    this.workerMachines.forEach((sprite) => sprite.destroy());
    this.workerMachines.clear();

    this.packageCrates.forEach((sprite) => sprite.destroy());
    this.packageCrates.clear();

    if (this.floorTileGroup) {
      this.floorTileGroup.destroy(true);
      this.floorTileGroup = this.add.group();
    }

    this.createFloorGrid(this.gridCols, this.gridRows);
  }

  // -----------------------------------------------------------------------
  // Accessors (for testing)
  // -----------------------------------------------------------------------

  get isReady(): boolean {
    return this.ready;
  }

  getCameraController(): CameraController | null {
    return this.cameraController;
  }
}
