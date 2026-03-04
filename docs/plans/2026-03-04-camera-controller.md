# Camera Controller Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a camera controller for the Phaser factory scene with drag-to-pan, scroll-to-zoom, smooth tweening, camera bounds, and programmatic control methods.

**Architecture:** The CameraController is a standalone class instantiated with a `Phaser.Scene` reference. It registers input listeners (pointermove, wheel, keydown) on the scene, manages a target zoom that lerps each frame via `update()`, and exposes public methods (`centerOn`, `zoomTo`, `setBounds`). It does NOT extend any Phaser class — it's a plain composition wrapper around `scene.cameras.main`.

**Tech Stack:** Phaser 3.90, TypeScript, Vitest (jsdom), no Phaser runtime in tests (mock `scene` object).

---

### Task 1: Create CameraController with constructor, enabled flag, and destroy

**Files:**
- Create: `apps/web/src/phaser/systems/camera-controller.ts`
- Create: `apps/web/src/phaser/systems/__tests__/camera-controller.test.ts`

**Step 1: Write the failing test for constructor and destroy**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CameraController } from '../camera-controller';

function createMockScene() {
  const offHandlers: Record<string, Function> = {};
  const onHandlers: Record<string, Function> = {};
  return {
    cameras: {
      main: {
        scrollX: 0,
        scrollY: 0,
        zoom: 1,
        setBounds: vi.fn(),
        centerOn: vi.fn(),
        setScroll: vi.fn(),
      },
    },
    input: {
      on: vi.fn((event: string, handler: Function) => {
        onHandlers[event] = handler;
      }),
      off: vi.fn((event: string, handler: Function) => {
        offHandlers[event] = handler;
      }),
      activePointer: { x: 0, y: 0 },
      keyboard: {
        on: vi.fn(),
        off: vi.fn(),
      },
    },
    scale: { width: 800, height: 600 },
    tweens: {
      add: vi.fn(),
      killTweensOf: vi.fn(),
    },
    _onHandlers: onHandlers,
    _offHandlers: offHandlers,
  } as unknown as Phaser.Scene;
}

describe('CameraController', () => {
  let scene: Phaser.Scene;

  beforeEach(() => {
    scene = createMockScene();
  });

  describe('constructor', () => {
    it('registers input event listeners', () => {
      new CameraController(scene);
      expect(scene.input.on).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(scene.input.on).toHaveBeenCalledWith('wheel', expect.any(Function));
    });

    it('is enabled by default', () => {
      const controller = new CameraController(scene);
      expect(controller.enabled).toBe(true);
    });
  });

  describe('destroy', () => {
    it('removes all event listeners', () => {
      const controller = new CameraController(scene);
      controller.destroy();
      expect(scene.input.off).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(scene.input.off).toHaveBeenCalledWith('wheel', expect.any(Function));
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/phaser/systems/__tests__/camera-controller.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
import Phaser from 'phaser';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_LERP_SPEED = 0.1;
const PAN_LERP_SPEED = 0.15;
const ZOOM_STEP = 0.1;
const BOUNDS_PADDING = 200;
const KEYBOARD_PAN_SPEED = 10;

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

  private isCanvasEvent(pointer: Phaser.Input.Pointer): boolean {
    const downElement = pointer.downElement as HTMLElement | undefined;
    if (!downElement) return true;
    return downElement.tagName === 'CANVAS';
  }

  private shouldPan(pointer: Phaser.Input.Pointer): boolean {
    if (!this.enabled) return false;
    if (!this.isCanvasEvent(pointer)) return false;
    if (pointer.middleButtonDown()) return true;
    if (pointer.leftButtonDown && pointer.event?.shiftKey) return true;
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

  private onPointerUp(_pointer: Phaser.Input.Pointer): void {
    this.isDragging = false;
  }

  private onWheel(
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void {
    if (!this.enabled) return;
    const downElement = pointer.event?.target as HTMLElement | undefined;
    if (downElement && downElement.tagName !== 'CANVAS') return;

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
        this.targetZoom = Phaser.Math.Clamp(this.targetZoom + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
        break;
      case '-':
        this.targetZoom = Phaser.Math.Clamp(this.targetZoom - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
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
    const { cartToIso } = require('./isometric');
    const iso = cartToIso(tileX, tileY);
    this.targetScrollX = iso.screenX - this.scene.scale.width / (2 * this.camera.zoom);
    this.targetScrollY = iso.screenY - this.scene.scale.height / (2 * this.camera.zoom);
  }

  zoomTo(level: number): void {
    this.targetZoom = Phaser.Math.Clamp(level, MIN_ZOOM, MAX_ZOOM);
  }

  setBounds(width: number, height: number): void {
    this.camera.setBounds(
      -BOUNDS_PADDING,
      -BOUNDS_PADDING,
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
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/phaser/systems/__tests__/camera-controller.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/phaser/systems/camera-controller.ts apps/web/src/phaser/systems/__tests__/camera-controller.test.ts
git commit -m "feat(web): create camera controller with pan, zoom, and bounds (task 105)"
```

### Task 2: Write comprehensive tests for all acceptance criteria

**Files:**
- Modify: `apps/web/src/phaser/systems/__tests__/camera-controller.test.ts`

Test coverage targets:
- Constructor and destroy lifecycle
- Middle mouse drag panning
- Shift + left click panning
- Left click passthrough (NOT consumed)
- Scroll wheel zoom with bounds (0.5x–2.0x)
- Smooth lerp in update()
- centerOn() with isometric conversion
- zoomTo() with clamping
- setBounds() delegation
- Keyboard shortcuts (arrows, +/-, Home)
- enabled flag pauses all input
- Canvas event check (ignores non-canvas events)
- resetView()

### Task 3: Run full checks and fix any issues

Run: lint, typecheck, build, tests with coverage

### Task 4: Validate, commit, merge, push
