import Phaser from 'phaser';

import { cartToIso } from './isometric';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.0;
export const ZOOM_LERP_SPEED = 0.1;
export const PAN_LERP_SPEED = 0.15;
export const ZOOM_STEP = 0.1;
export const BOUNDS_PADDING = 200;
export const KEYBOARD_PAN_SPEED = 10;

export class CameraController {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private targetZoom: number;
  private targetScrollX: number;
  private targetScrollY: number;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private cameraStartX = 0;
  private cameraStartY = 0;

  enabled = true;

  private handlePointerMove: (pointer: Phaser.Input.Pointer) => void;
  private handlePointerDown: (pointer: Phaser.Input.Pointer) => void;
  private handlePointerUp: (pointer: Phaser.Input.Pointer) => void;
  private handleWheel: (
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number,
  ) => void;
  private handleKeyDown: (event: KeyboardEvent) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.targetZoom = this.camera.zoom;
    this.targetScrollX = this.camera.scrollX;
    this.targetScrollY = this.camera.scrollY;

    this.handlePointerDown = this.onPointerDown.bind(this);
    this.handlePointerMove = this.onPointerMove.bind(this);
    this.handlePointerUp = this.onPointerUp.bind(this);
    this.handleWheel = this.onWheel.bind(this);
    this.handleKeyDown = this.onKeyDown.bind(this);

    scene.input.on('pointerdown', this.handlePointerDown);
    scene.input.on('pointermove', this.handlePointerMove);
    scene.input.on('pointerup', this.handlePointerUp);
    scene.input.on('wheel', this.handleWheel);

    if (scene.input.keyboard) {
      scene.input.keyboard.on('keydown', this.handleKeyDown);
    }
  }

  private isCanvasPointerDown(pointer: Phaser.Input.Pointer): boolean {
    const downElement = pointer.downElement as HTMLElement | undefined;
    if (!downElement) return true;
    return downElement.tagName === 'CANVAS';
  }

  private shouldPan(pointer: Phaser.Input.Pointer): boolean {
    if (!this.enabled) return false;
    if (!this.isCanvasPointerDown(pointer)) return false;
    if (pointer.middleButtonDown()) return true;
    if (pointer.leftButtonDown() && pointer.event?.shiftKey) return true;
    return false;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.shouldPan(pointer)) return;
    this.isDragging = true;
    this.dragStartX = pointer.x;
    this.dragStartY = pointer.y;
    this.cameraStartX = this.camera.scrollX;
    this.cameraStartY = this.camera.scrollY;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isDragging || !this.enabled) return;
    if (!pointer.isDown) {
      this.isDragging = false;
      return;
    }
    const dx = (this.dragStartX - pointer.x) / this.camera.zoom;
    const dy = (this.dragStartY - pointer.y) / this.camera.zoom;
    this.targetScrollX = this.cameraStartX + dx;
    this.targetScrollY = this.cameraStartY + dy;
  }

  private onPointerUp(): void {
    this.isDragging = false;
  }

  private onWheel(
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void {
    if (!this.enabled) return;
    const target = pointer.event?.target as HTMLElement | undefined;
    if (target && target.tagName !== 'CANVAS') return;

    const direction = deltaY < 0 ? 1 : -1;
    this.targetZoom = Phaser.Math.Clamp(
      this.targetZoom + direction * ZOOM_STEP,
      MIN_ZOOM,
      MAX_ZOOM,
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;
    const panAmount = KEYBOARD_PAN_SPEED / this.camera.zoom;
    switch (event.key) {
      case 'ArrowLeft':
        this.targetScrollX -= panAmount;
        break;
      case 'ArrowRight':
        this.targetScrollX += panAmount;
        break;
      case 'ArrowUp':
        this.targetScrollY -= panAmount;
        break;
      case 'ArrowDown':
        this.targetScrollY += panAmount;
        break;
      case '+':
      case '=':
        this.targetZoom = Phaser.Math.Clamp(
          this.targetZoom + ZOOM_STEP,
          MIN_ZOOM,
          MAX_ZOOM,
        );
        break;
      case '-':
        this.targetZoom = Phaser.Math.Clamp(
          this.targetZoom - ZOOM_STEP,
          MIN_ZOOM,
          MAX_ZOOM,
        );
        break;
      case 'Home':
        this.resetView();
        break;
    }
  }

  update(): void {
    if (!this.enabled) return;
    this.camera.zoom += (this.targetZoom - this.camera.zoom) * ZOOM_LERP_SPEED;
    this.camera.scrollX += (this.targetScrollX - this.camera.scrollX) * PAN_LERP_SPEED;
    this.camera.scrollY += (this.targetScrollY - this.camera.scrollY) * PAN_LERP_SPEED;
  }

  centerOn(tileX: number, tileY: number): void {
    const iso = cartToIso(tileX, tileY);
    this.targetScrollX =
      iso.screenX - this.scene.scale.width / (2 * this.camera.zoom);
    this.targetScrollY =
      iso.screenY - this.scene.scale.height / (2 * this.camera.zoom);
  }

  zoomTo(level: number): void {
    this.targetZoom = Phaser.Math.Clamp(level, MIN_ZOOM, MAX_ZOOM);
  }

  setBounds(
    originX: number,
    originY: number,
    width: number,
    height: number,
  ): void {
    this.camera.setBounds(
      originX - BOUNDS_PADDING,
      originY - BOUNDS_PADDING,
      width + BOUNDS_PADDING * 2,
      height + BOUNDS_PADDING * 2,
    );
  }

  resetView(): void {
    this.targetZoom = 1;
    this.targetScrollX = 0;
    this.targetScrollY = 0;
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.handlePointerDown);
    this.scene.input.off('pointermove', this.handlePointerMove);
    this.scene.input.off('pointerup', this.handlePointerUp);
    this.scene.input.off('wheel', this.handleWheel);
    if (this.scene.input.keyboard) {
      this.scene.input.keyboard.off('keydown', this.handleKeyDown);
    }
  }
}
