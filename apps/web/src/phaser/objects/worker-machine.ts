import Phaser from 'phaser';

import { ASSET_KEYS } from '../constants/asset-keys';
import type { PhaserBridge } from '../bridge';
import { cartToIso, getDepth } from '../systems/isometric';
import { WorkerState } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Depth offset so machines render above conveyor belts (0.05) and floor tiles. */
export const MACHINE_DEPTH_OFFSET = 0.1;

/** Frame indices corresponding to each WorkerState in the spritesheet. */
export const STATE_FRAME_MAP: Record<WorkerState, number> = {
  [WorkerState.WAITING]: 0,
  [WorkerState.WORKING]: 1,
  [WorkerState.STUCK]: 2,
  [WorkerState.ERROR]: 3,
  [WorkerState.DONE]: 4,
};

/** Tint colours for state visual effects. */
export const STATE_TINTS = {
  STUCK: 0xffff00,
  ERROR: 0xff0000,
  DONE: 0x00ff00,
} as const;

/** Configuration for idle bobbing tween. */
const IDLE_BOB = { offsetY: -2, duration: 800 } as const;

/** Configuration for error shake tween. */
const ERROR_SHAKE = { offsetX: 2, repeats: 3, duration: 50 } as const;

/** Tooltip vertical offset above the machine sprite. */
const TOOLTIP_OFFSET_Y = -40;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WorkerMachineConfig {
  tileX: number;
  tileY: number;
  workerId: string;
  workerName?: string;
  initialState?: WorkerState;
  bridge?: PhaserBridge;
}

// ---------------------------------------------------------------------------
// WorkerMachine
// ---------------------------------------------------------------------------

/**
 * Interactive sprite representing a Worker on the isometric factory floor.
 *
 * Displays state-dependent animations (idle bobbing, working glow, stuck pulse,
 * error shake, done pulse), a hover tooltip with the Worker's name and status,
 * and dispatches click events through the Zustand bridge.
 */
export class WorkerMachine extends Phaser.GameObjects.Sprite {
  readonly tileX: number;
  readonly tileY: number;
  readonly workerId: string;

  private workerName: string;
  private bridge: PhaserBridge | null;
  private currentState: WorkerState;
  private tooltip: Phaser.GameObjects.Text | null = null;
  private statusIndicator: Phaser.GameObjects.Arc | null = null;

  private idleTween: Phaser.Tweens.Tween | null = null;
  private errorTween: Phaser.Tweens.Tween | null = null;
  private pulseTween: Phaser.Tweens.Tween | null = null;
  private readonly isoOriginY: number;
  private readonly isoOriginX: number;

  constructor(scene: Phaser.Scene, config: WorkerMachineConfig) {
    const iso = cartToIso(config.tileX, config.tileY);
    const initialState = config.initialState ?? WorkerState.WAITING;
    const frame = STATE_FRAME_MAP[initialState];

    super(scene, iso.screenX, iso.screenY, ASSET_KEYS.WORKER_MACHINE, frame);

    this.tileX = config.tileX;
    this.tileY = config.tileY;
    this.workerId = config.workerId;
    this.workerName = config.workerName ?? 'Worker';
    this.bridge = config.bridge ?? null;
    this.currentState = initialState;
    this.isoOriginX = iso.screenX;
    this.isoOriginY = iso.screenY;

    this.setDepth(getDepth(config.tileX, config.tileY) + MACHINE_DEPTH_OFFSET);
    this.setInteractive({ useHandCursor: true });

    this.createTooltip();
    this.createStatusIndicator();
    this.registerInputListeners();
    this.applyStateEffects(initialState);

    scene.add.existing(this as unknown as Phaser.GameObjects.Sprite);
  }

  // -----------------------------------------------------------------------
  // State management
  // -----------------------------------------------------------------------

  /** Transitions the machine to a new WorkerState, updating frame, tint, and animations. */
  setWorkerState(state: WorkerState): this {
    if (state === this.currentState) return this;

    this.clearStateEffects();
    this.currentState = state;
    this.setFrame(STATE_FRAME_MAP[state]);
    this.applyStateEffects(state);
    this.updateTooltipText();
    this.updateStatusIndicator();
    return this;
  }

  /** Returns the current WorkerState. */
  getState(): WorkerState {
    return this.currentState;
  }

  // -----------------------------------------------------------------------
  // Tooltip
  // -----------------------------------------------------------------------

  private createTooltip(): void {
    this.tooltip = this.scene.add.text(
      this.isoOriginX,
      this.isoOriginY + TOOLTIP_OFFSET_Y,
      this.formatTooltipText(),
      {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 4, y: 2 },
      },
    );
    this.tooltip.setOrigin(0.5, 1);
    this.tooltip.setDepth(getDepth(this.tileX, this.tileY) + MACHINE_DEPTH_OFFSET + 1);
    this.tooltip.setVisible(false);
  }

  private formatTooltipText(): string {
    return `${this.workerName}\n${this.currentState}`;
  }

  private updateTooltipText(): void {
    if (this.tooltip) {
      this.tooltip.setText(this.formatTooltipText());
    }
  }

  // -----------------------------------------------------------------------
  // Status indicator (colored circle for colorblind accessibility)
  // -----------------------------------------------------------------------

  private createStatusIndicator(): void {
    this.statusIndicator = this.scene.add.circle(
      this.isoOriginX,
      this.isoOriginY + 24,
      4,
      this.getStatusColor(),
    ) as unknown as Phaser.GameObjects.Arc;
    (this.statusIndicator as Phaser.GameObjects.Arc & { setDepth(d: number): void })
      .setDepth(getDepth(this.tileX, this.tileY) + MACHINE_DEPTH_OFFSET + 0.5);
  }

  private updateStatusIndicator(): void {
    if (this.statusIndicator) {
      (this.statusIndicator as Phaser.GameObjects.Arc & { setFillStyle(color: number): void })
        .setFillStyle(this.getStatusColor());
    }
  }

  private getStatusColor(): number {
    switch (this.currentState) {
      case WorkerState.WAITING: return 0x4488ff;
      case WorkerState.WORKING: return 0x44ff88;
      case WorkerState.STUCK: return 0xffaa44;
      case WorkerState.ERROR: return 0xff4444;
      case WorkerState.DONE: return 0x8844ff;
    }
  }

  // -----------------------------------------------------------------------
  // Input listeners
  // -----------------------------------------------------------------------

  private registerInputListeners(): void {
    this.on('pointerover', this.onPointerOver, this);
    this.on('pointerout', this.onPointerOut, this);
    this.on('pointerdown', this.onPointerDown, this);
  }

  private onPointerOver(): void {
    if (this.tooltip) {
      this.tooltip.setVisible(true);
    }
  }

  private onPointerOut(): void {
    if (this.tooltip) {
      this.tooltip.setVisible(false);
    }
  }

  private onPointerDown(): void {
    if (this.bridge) {
      this.bridge.onWorkerClicked(this.workerId);
    }
  }

  // -----------------------------------------------------------------------
  // State visual effects
  // -----------------------------------------------------------------------

  private applyStateEffects(state: WorkerState): void {
    switch (state) {
      case WorkerState.WAITING:
        this.startIdleBob();
        break;
      case WorkerState.WORKING:
        this.setTint(0x44ff88);
        break;
      case WorkerState.STUCK:
        this.setTint(STATE_TINTS.STUCK);
        this.startPulseTween();
        break;
      case WorkerState.ERROR:
        this.setTint(STATE_TINTS.ERROR);
        this.startErrorShake();
        break;
      case WorkerState.DONE:
        this.setTint(STATE_TINTS.DONE);
        this.startPulseTween();
        break;
    }
  }

  private clearStateEffects(): void {
    this.stopIdleBob();
    this.stopErrorShake();
    this.stopPulseTween();
    this.clearTint();

    // Reset position in case tweens left it offset
    this.setPosition(this.isoOriginX, this.isoOriginY);
  }

  private startIdleBob(): void {
    this.idleTween = this.scene.tweens.add({
      targets: this,
      y: this.isoOriginY + IDLE_BOB.offsetY,
      yoyo: true,
      repeat: -1,
      duration: IDLE_BOB.duration,
      ease: 'Sine.easeInOut',
    });
  }

  private stopIdleBob(): void {
    if (this.idleTween) {
      this.idleTween.stop();
      this.idleTween = null;
    }
  }

  private startErrorShake(): void {
    this.errorTween = this.scene.tweens.add({
      targets: this,
      x: this.isoOriginX + ERROR_SHAKE.offsetX,
      yoyo: true,
      repeat: ERROR_SHAKE.repeats,
      duration: ERROR_SHAKE.duration,
    });
  }

  private stopErrorShake(): void {
    if (this.errorTween) {
      this.errorTween.stop();
      this.errorTween = null;
    }
  }

  private startPulseTween(): void {
    this.pulseTween = this.scene.tweens.add({
      targets: this,
      alpha: 0.5,
      yoyo: true,
      repeat: -1,
      duration: 600,
      ease: 'Sine.easeInOut',
    });
  }

  private stopPulseTween(): void {
    if (this.pulseTween) {
      this.pulseTween.stop();
      this.pulseTween = null;
      this.setAlpha(1);
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  destroy(fromScene?: boolean): void {
    this.off('pointerover', this.onPointerOver, this);
    this.off('pointerout', this.onPointerOut, this);
    this.off('pointerdown', this.onPointerDown, this);

    this.stopIdleBob();
    this.stopErrorShake();
    this.stopPulseTween();

    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }

    if (this.statusIndicator) {
      this.statusIndicator.destroy();
      this.statusIndicator = null;
    }

    super.destroy(fromScene);
  }

  // -----------------------------------------------------------------------
  // Static factory
  // -----------------------------------------------------------------------

  static create(scene: Phaser.Scene, config: WorkerMachineConfig): WorkerMachine {
    return new WorkerMachine(scene, config);
  }
}
