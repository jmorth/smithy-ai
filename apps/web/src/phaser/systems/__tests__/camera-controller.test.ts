import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  CameraController,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_LERP_SPEED,
  PAN_LERP_SPEED,
  ZOOM_STEP,
  BOUNDS_PADDING,
  KEYBOARD_PAN_SPEED,
} from '../camera-controller';
import { cartToIso } from '../isometric';

// Minimal Phaser.Math.Clamp polyfill for tests since Phaser isn't loaded in jsdom
vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (val: number, min: number, max: number) =>
        Math.min(Math.max(val, min), max),
    },
  },
}));

interface MockPointer {
  x: number;
  y: number;
  isDown: boolean;
  middleButtonDown: () => boolean;
  leftButtonDown: () => boolean;
  downElement: HTMLElement | undefined;
  event: { shiftKey: boolean; target?: HTMLElement } | undefined;
  button: number;
}

function createMockPointer(overrides: Partial<MockPointer> = {}): MockPointer {
  return {
    x: 0,
    y: 0,
    isDown: false,
    middleButtonDown: () => false,
    leftButtonDown: () => false,
    downElement: undefined,
    event: { shiftKey: false },
    button: 0,
    ...overrides,
  };
}

type InputHandler = (...args: unknown[]) => void;

interface MockScene {
  cameras: {
    main: {
      scrollX: number;
      scrollY: number;
      zoom: number;
      setBounds: ReturnType<typeof vi.fn>;
    };
  };
  input: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    activePointer: { x: number; y: number };
    keyboard: {
      on: ReturnType<typeof vi.fn>;
      off: ReturnType<typeof vi.fn>;
    } | null;
  };
  scale: { width: number; height: number };
}

function createMockScene(opts?: { noKeyboard?: boolean }): MockScene {
  return {
    cameras: {
      main: {
        scrollX: 0,
        scrollY: 0,
        zoom: 1,
        setBounds: vi.fn(),
      },
    },
    input: {
      on: vi.fn(),
      off: vi.fn(),
      activePointer: { x: 0, y: 0 },
      keyboard: opts?.noKeyboard
        ? null
        : {
            on: vi.fn(),
            off: vi.fn(),
          },
    },
    scale: { width: 800, height: 600 },
  };
}

function getHandler(
  scene: MockScene,
  eventName: string,
): InputHandler {
  const call = (scene.input.on as ReturnType<typeof vi.fn>).mock.calls.find(
    (c: unknown[]) => c[0] === eventName,
  );
  if (!call) throw new Error(`No handler registered for '${eventName}'`);
  return call[1] as InputHandler;
}

function getKeyboardHandler(scene: MockScene): InputHandler {
  if (!scene.input.keyboard) throw new Error('No keyboard');
  const call = (scene.input.keyboard.on as ReturnType<typeof vi.fn>).mock.calls.find(
    (c: unknown[]) => c[0] === 'keydown',
  );
  if (!call) throw new Error('No keydown handler registered');
  return call[1] as InputHandler;
}

describe('CameraController', () => {
  let scene: MockScene;
  let controller: CameraController;

  beforeEach(() => {
    scene = createMockScene();
    controller = new CameraController(scene as unknown as Phaser.Scene);
  });

  describe('constructor', () => {
    it('registers pointerdown, pointermove, pointerup, and wheel listeners', () => {
      const events = (scene.input.on as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect(events).toContain('pointerdown');
      expect(events).toContain('pointermove');
      expect(events).toContain('pointerup');
      expect(events).toContain('wheel');
    });

    it('registers keyboard keydown listener', () => {
      expect(scene.input.keyboard!.on).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
      );
    });

    it('is enabled by default', () => {
      expect(controller.enabled).toBe(true);
    });

    it('initializes target values from camera state', () => {
      scene.cameras.main.scrollX = 50;
      scene.cameras.main.scrollY = 75;
      scene.cameras.main.zoom = 1.5;
      const c = new CameraController(scene as unknown as Phaser.Scene);
      // After one update, values should lerp toward targets (which start at camera values)
      c.update();
      // Camera should stay at its initial values (target === current)
      expect(scene.cameras.main.scrollX).toBe(50);
      expect(scene.cameras.main.scrollY).toBe(75);
    });

    it('skips keyboard registration when scene.input.keyboard is null', () => {
      const noKbScene = createMockScene({ noKeyboard: true });
      // Should not throw
      const c = new CameraController(noKbScene as unknown as Phaser.Scene);
      expect(noKbScene.input.keyboard).toBeNull();
      c.destroy(); // should also not throw
    });
  });

  describe('destroy', () => {
    it('removes all input event listeners', () => {
      controller.destroy();
      const offEvents = (scene.input.off as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect(offEvents).toContain('pointerdown');
      expect(offEvents).toContain('pointermove');
      expect(offEvents).toContain('pointerup');
      expect(offEvents).toContain('wheel');
    });

    it('removes keyboard keydown listener', () => {
      controller.destroy();
      expect(scene.input.keyboard!.off).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
      );
    });

    it('removes the exact same handler references that were registered', () => {
      const onCalls = (scene.input.on as ReturnType<typeof vi.fn>).mock.calls;
      controller.destroy();
      const offCalls = (scene.input.off as ReturnType<typeof vi.fn>).mock.calls;
      for (const onCall of onCalls) {
        const matchingOff = offCalls.find(
          (offCall: unknown[]) =>
            offCall[0] === onCall[0] && offCall[1] === onCall[1],
        );
        expect(matchingOff).toBeDefined();
      }
    });
  });

  describe('middle mouse drag panning', () => {
    it('starts drag on pointerdown with middle button on canvas', () => {
      const pointerDown = getHandler(scene, 'pointerdown');
      const pointerMove = getHandler(scene, 'pointermove');

      const pointer = createMockPointer({
        x: 100,
        y: 100,
        middleButtonDown: () => true,
        isDown: true,
        downElement: document.createElement('canvas'),
      });

      pointerDown(pointer);
      pointer.x = 150;
      pointer.y = 120;
      pointerMove(pointer);

      controller.update();
      // targetScrollX = 0 + (100 - 150) / 1 = -50
      // After one lerp: scrollX = 0 + (-50 - 0) * 0.15 = -7.5
      expect(scene.cameras.main.scrollX).toBeCloseTo(-50 * PAN_LERP_SPEED, 5);
      expect(scene.cameras.main.scrollY).toBeCloseTo(-20 * PAN_LERP_SPEED, 5);
    });

    it('stops drag on pointerup', () => {
      const pointerDown = getHandler(scene, 'pointerdown');
      const pointerUp = getHandler(scene, 'pointerup');
      const pointerMove = getHandler(scene, 'pointermove');

      const pointer = createMockPointer({
        x: 100,
        y: 100,
        middleButtonDown: () => true,
        isDown: true,
        downElement: document.createElement('canvas'),
      });

      pointerDown(pointer);
      pointerUp(pointer);

      pointer.x = 200;
      pointer.y = 200;
      pointer.isDown = true;
      pointerMove(pointer);

      // After pointerup, drag should not affect scroll
      controller.update();
      expect(scene.cameras.main.scrollX).toBeCloseTo(0, 5);
      expect(scene.cameras.main.scrollY).toBeCloseTo(0, 5);
    });

    it('stops drag when pointer.isDown becomes false during move', () => {
      const pointerDown = getHandler(scene, 'pointerdown');
      const pointerMove = getHandler(scene, 'pointermove');

      const pointer = createMockPointer({
        x: 100,
        y: 100,
        middleButtonDown: () => true,
        isDown: true,
        downElement: document.createElement('canvas'),
      });

      pointerDown(pointer);
      pointer.isDown = false;
      pointer.x = 200;
      pointerMove(pointer);

      // Subsequent move with isDown should not pan
      pointer.isDown = true;
      pointer.x = 300;
      pointerMove(pointer);

      controller.update();
      expect(scene.cameras.main.scrollX).toBeCloseTo(0, 5);
    });

    it('accounts for camera zoom when calculating pan delta', () => {
      scene.cameras.main.zoom = 2;
      const s2 = createMockScene();
      s2.cameras.main.zoom = 2;
      const c2 = new CameraController(s2 as unknown as Phaser.Scene);

      const pointerDown = getHandler(s2, 'pointerdown');
      const pointerMove = getHandler(s2, 'pointermove');

      const pointer = createMockPointer({
        x: 100,
        y: 100,
        middleButtonDown: () => true,
        isDown: true,
        downElement: document.createElement('canvas'),
      });

      pointerDown(pointer);
      pointer.x = 150;
      pointer.y = 100;
      pointerMove(pointer);

      c2.update();
      // delta = (100-150)/2 = -25, lerped: -25 * 0.15 = -3.75
      expect(s2.cameras.main.scrollX).toBeCloseTo(-25 * PAN_LERP_SPEED, 5);
      c2.destroy();
    });
  });

  describe('shift + left click panning', () => {
    it('starts drag with shift + left click', () => {
      const pointerDown = getHandler(scene, 'pointerdown');
      const pointerMove = getHandler(scene, 'pointermove');

      const pointer = createMockPointer({
        x: 100,
        y: 100,
        leftButtonDown: () => true,
        isDown: true,
        event: { shiftKey: true },
        downElement: document.createElement('canvas'),
      });

      pointerDown(pointer);
      pointer.x = 160;
      pointer.y = 130;
      pointerMove(pointer);

      controller.update();
      expect(scene.cameras.main.scrollX).toBeCloseTo(-60 * PAN_LERP_SPEED, 5);
      expect(scene.cameras.main.scrollY).toBeCloseTo(-30 * PAN_LERP_SPEED, 5);
    });
  });

  describe('left click passthrough', () => {
    it('does NOT start drag on plain left click without shift', () => {
      const pointerDown = getHandler(scene, 'pointerdown');
      const pointerMove = getHandler(scene, 'pointermove');

      const pointer = createMockPointer({
        x: 100,
        y: 100,
        leftButtonDown: () => true,
        isDown: true,
        event: { shiftKey: false },
        downElement: document.createElement('canvas'),
      });

      pointerDown(pointer);
      pointer.x = 200;
      pointer.y = 200;
      pointerMove(pointer);

      controller.update();
      expect(scene.cameras.main.scrollX).toBeCloseTo(0, 5);
      expect(scene.cameras.main.scrollY).toBeCloseTo(0, 5);
    });

    it('does NOT start drag on right click', () => {
      const pointerDown = getHandler(scene, 'pointerdown');

      const pointer = createMockPointer({
        x: 100,
        y: 100,
        button: 2,
        isDown: true,
        downElement: document.createElement('canvas'),
      });

      pointerDown(pointer);
      controller.update();
      expect(scene.cameras.main.scrollX).toBeCloseTo(0, 5);
    });
  });

  describe('scroll wheel zoom', () => {
    it('zooms in on scroll up (negative deltaY)', () => {
      const wheelHandler = getHandler(scene, 'wheel');
      const pointer = createMockPointer({
        event: { shiftKey: false, target: document.createElement('canvas') },
      });

      wheelHandler(pointer, [], 0, -100);
      controller.update();

      const expected = 1 + (1 + ZOOM_STEP - 1) * ZOOM_LERP_SPEED;
      expect(scene.cameras.main.zoom).toBeCloseTo(expected, 5);
    });

    it('zooms out on scroll down (positive deltaY)', () => {
      const wheelHandler = getHandler(scene, 'wheel');
      const pointer = createMockPointer({
        event: { shiftKey: false, target: document.createElement('canvas') },
      });

      wheelHandler(pointer, [], 0, 100);
      controller.update();

      const expected = 1 + (1 - ZOOM_STEP - 1) * ZOOM_LERP_SPEED;
      expect(scene.cameras.main.zoom).toBeCloseTo(expected, 5);
    });

    it('clamps zoom to MIN_ZOOM', () => {
      const wheelHandler = getHandler(scene, 'wheel');
      const pointer = createMockPointer({
        event: { shiftKey: false, target: document.createElement('canvas') },
      });

      // Scroll down many times to try to go below min
      for (let i = 0; i < 100; i++) {
        wheelHandler(pointer, [], 0, 100);
        controller.update();
      }

      expect(scene.cameras.main.zoom).toBeGreaterThanOrEqual(MIN_ZOOM - 0.01);
    });

    it('clamps zoom to MAX_ZOOM', () => {
      const wheelHandler = getHandler(scene, 'wheel');
      const pointer = createMockPointer({
        event: { shiftKey: false, target: document.createElement('canvas') },
      });

      for (let i = 0; i < 100; i++) {
        wheelHandler(pointer, [], 0, -100);
        controller.update();
      }

      expect(scene.cameras.main.zoom).toBeLessThanOrEqual(MAX_ZOOM + 0.01);
    });

    it('ignores wheel events when target is not canvas', () => {
      const wheelHandler = getHandler(scene, 'wheel');
      const div = document.createElement('div');
      const pointer = createMockPointer({
        event: { shiftKey: false, target: div },
      });

      wheelHandler(pointer, [], 0, -100);
      controller.update();

      // Zoom should not change (stays at ~1)
      expect(scene.cameras.main.zoom).toBeCloseTo(1, 5);
    });

    it('handles wheel event when pointer.event is undefined', () => {
      const wheelHandler = getHandler(scene, 'wheel');
      const pointer = createMockPointer({ event: undefined });

      // Should not throw, and zoom should change (no target check = allow)
      wheelHandler(pointer, [], 0, -100);
      controller.update();
      expect(scene.cameras.main.zoom).toBeGreaterThan(1);
    });
  });

  describe('smooth lerp interpolation (update)', () => {
    it('lerps camera zoom toward target each frame', () => {
      controller.zoomTo(1.5);
      const before = scene.cameras.main.zoom;
      controller.update();
      const after = scene.cameras.main.zoom;
      expect(after).toBeGreaterThan(before);
      expect(after).toBeLessThan(1.5);
      expect(after).toBeCloseTo(before + (1.5 - before) * ZOOM_LERP_SPEED, 5);
    });

    it('lerps camera scroll toward target each frame', () => {
      controller.centerOn(5, 5);
      const before = scene.cameras.main.scrollX;
      controller.update();
      const after = scene.cameras.main.scrollX;
      expect(after).not.toBe(before);
    });

    it('converges to target after many updates', () => {
      controller.zoomTo(1.8);
      for (let i = 0; i < 200; i++) {
        controller.update();
      }
      expect(scene.cameras.main.zoom).toBeCloseTo(1.8, 2);
    });

    it('does nothing when disabled', () => {
      controller.enabled = false;
      controller.zoomTo(1.5);
      controller.update();
      expect(scene.cameras.main.zoom).toBe(1);
    });
  });

  describe('centerOn', () => {
    it('sets target scroll to center the given tile coordinate', () => {
      controller.centerOn(5, 3);
      const iso = cartToIso(5, 3);
      // After enough updates, camera should converge
      for (let i = 0; i < 200; i++) {
        controller.update();
      }
      const expectedX = iso.screenX - 800 / 2;
      const expectedY = iso.screenY - 600 / 2;
      expect(scene.cameras.main.scrollX).toBeCloseTo(expectedX, 1);
      expect(scene.cameras.main.scrollY).toBeCloseTo(expectedY, 1);
    });

    it('accounts for current zoom level', () => {
      scene.cameras.main.zoom = 2;
      const s = createMockScene();
      s.cameras.main.zoom = 2;
      const c = new CameraController(s as unknown as Phaser.Scene);

      c.centerOn(0, 0);
      for (let i = 0; i < 200; i++) {
        c.update();
      }
      const iso = cartToIso(0, 0);
      const expectedX = iso.screenX - 800 / (2 * 2);
      const expectedY = iso.screenY - 600 / (2 * 2);
      expect(s.cameras.main.scrollX).toBeCloseTo(expectedX, 1);
      expect(s.cameras.main.scrollY).toBeCloseTo(expectedY, 1);
      c.destroy();
    });
  });

  describe('zoomTo', () => {
    it('sets target zoom within bounds', () => {
      controller.zoomTo(1.5);
      for (let i = 0; i < 200; i++) {
        controller.update();
      }
      expect(scene.cameras.main.zoom).toBeCloseTo(1.5, 2);
    });

    it('clamps to MIN_ZOOM', () => {
      controller.zoomTo(0.1);
      for (let i = 0; i < 200; i++) {
        controller.update();
      }
      expect(scene.cameras.main.zoom).toBeCloseTo(MIN_ZOOM, 2);
    });

    it('clamps to MAX_ZOOM', () => {
      controller.zoomTo(5.0);
      for (let i = 0; i < 200; i++) {
        controller.update();
      }
      expect(scene.cameras.main.zoom).toBeCloseTo(MAX_ZOOM, 2);
    });
  });

  describe('setBounds', () => {
    it('delegates to camera.setBounds with padding', () => {
      controller.setBounds(-300, -100, 1000, 800);
      expect(scene.cameras.main.setBounds).toHaveBeenCalledWith(
        -300 - BOUNDS_PADDING,
        -100 - BOUNDS_PADDING,
        1000 + BOUNDS_PADDING * 2,
        800 + BOUNDS_PADDING * 2,
      );
    });
  });

  describe('resetView', () => {
    it('resets zoom and scroll targets to defaults', () => {
      controller.zoomTo(1.8);
      controller.centerOn(10, 10);
      for (let i = 0; i < 50; i++) {
        controller.update();
      }

      controller.resetView();
      for (let i = 0; i < 200; i++) {
        controller.update();
      }

      expect(scene.cameras.main.zoom).toBeCloseTo(1, 2);
      expect(scene.cameras.main.scrollX).toBeCloseTo(0, 1);
      expect(scene.cameras.main.scrollY).toBeCloseTo(0, 1);
    });
  });

  describe('keyboard shortcuts', () => {
    it('ArrowLeft decreases target scrollX', () => {
      const keyHandler = getKeyboardHandler(scene);
      keyHandler({ key: 'ArrowLeft' });
      controller.update();
      expect(scene.cameras.main.scrollX).toBeLessThan(0);
    });

    it('ArrowRight increases target scrollX', () => {
      const keyHandler = getKeyboardHandler(scene);
      keyHandler({ key: 'ArrowRight' });
      controller.update();
      expect(scene.cameras.main.scrollX).toBeGreaterThan(0);
    });

    it('ArrowUp decreases target scrollY', () => {
      const keyHandler = getKeyboardHandler(scene);
      keyHandler({ key: 'ArrowUp' });
      controller.update();
      expect(scene.cameras.main.scrollY).toBeLessThan(0);
    });

    it('ArrowDown increases target scrollY', () => {
      const keyHandler = getKeyboardHandler(scene);
      keyHandler({ key: 'ArrowDown' });
      controller.update();
      expect(scene.cameras.main.scrollY).toBeGreaterThan(0);
    });

    it('+ key increases target zoom', () => {
      const keyHandler = getKeyboardHandler(scene);
      keyHandler({ key: '+' });
      controller.update();
      expect(scene.cameras.main.zoom).toBeGreaterThan(1);
    });

    it('= key increases target zoom (alternative)', () => {
      const keyHandler = getKeyboardHandler(scene);
      keyHandler({ key: '=' });
      controller.update();
      expect(scene.cameras.main.zoom).toBeGreaterThan(1);
    });

    it('- key decreases target zoom', () => {
      const keyHandler = getKeyboardHandler(scene);
      keyHandler({ key: '-' });
      controller.update();
      expect(scene.cameras.main.zoom).toBeLessThan(1);
    });

    it('Home key resets view', () => {
      controller.zoomTo(1.5);
      for (let i = 0; i < 50; i++) {
        controller.update();
      }
      expect(scene.cameras.main.zoom).toBeGreaterThan(1.1);

      const keyHandler = getKeyboardHandler(scene);
      keyHandler({ key: 'Home' });
      for (let i = 0; i < 200; i++) {
        controller.update();
      }
      expect(scene.cameras.main.zoom).toBeCloseTo(1, 2);
    });

    it('keyboard pan accounts for zoom level', () => {
      scene.cameras.main.zoom = 2;
      const s = createMockScene();
      s.cameras.main.zoom = 2;
      const c = new CameraController(s as unknown as Phaser.Scene);

      const keyHandler = getKeyboardHandler(s);
      keyHandler({ key: 'ArrowRight' });
      c.update();

      // Pan amount = KEYBOARD_PAN_SPEED / zoom = 10 / 2 = 5
      // After lerp: 5 * PAN_LERP_SPEED
      expect(s.cameras.main.scrollX).toBeCloseTo(
        (KEYBOARD_PAN_SPEED / 2) * PAN_LERP_SPEED,
        5,
      );
      c.destroy();
    });

    it('does nothing when disabled', () => {
      controller.enabled = false;
      const keyHandler = getKeyboardHandler(scene);
      keyHandler({ key: 'ArrowRight' });
      controller.update();
      expect(scene.cameras.main.scrollX).toBe(0);
    });

    it('ignores unrecognized keys', () => {
      const keyHandler = getKeyboardHandler(scene);
      keyHandler({ key: 'a' });
      controller.update();
      expect(scene.cameras.main.scrollX).toBeCloseTo(0, 5);
      expect(scene.cameras.main.scrollY).toBeCloseTo(0, 5);
      expect(scene.cameras.main.zoom).toBeCloseTo(1, 5);
    });

    it('clamps zoom from keyboard + to MAX_ZOOM', () => {
      const keyHandler = getKeyboardHandler(scene);
      for (let i = 0; i < 50; i++) {
        keyHandler({ key: '+' });
      }
      for (let i = 0; i < 200; i++) {
        controller.update();
      }
      expect(scene.cameras.main.zoom).toBeLessThanOrEqual(MAX_ZOOM + 0.01);
    });

    it('clamps zoom from keyboard - to MIN_ZOOM', () => {
      const keyHandler = getKeyboardHandler(scene);
      for (let i = 0; i < 50; i++) {
        keyHandler({ key: '-' });
      }
      for (let i = 0; i < 200; i++) {
        controller.update();
      }
      expect(scene.cameras.main.zoom).toBeGreaterThanOrEqual(MIN_ZOOM - 0.01);
    });
  });

  describe('enabled flag', () => {
    it('blocks panning when disabled', () => {
      controller.enabled = false;
      const pointerDown = getHandler(scene, 'pointerdown');
      const pointerMove = getHandler(scene, 'pointermove');

      const pointer = createMockPointer({
        x: 100,
        y: 100,
        middleButtonDown: () => true,
        isDown: true,
        downElement: document.createElement('canvas'),
      });

      pointerDown(pointer);
      pointer.x = 200;
      pointerMove(pointer);
      controller.update();

      expect(scene.cameras.main.scrollX).toBe(0);
    });

    it('blocks zooming when disabled', () => {
      controller.enabled = false;
      const wheelHandler = getHandler(scene, 'wheel');
      const pointer = createMockPointer({
        event: { shiftKey: false, target: document.createElement('canvas') },
      });

      wheelHandler(pointer, [], 0, -100);
      controller.update();

      expect(scene.cameras.main.zoom).toBe(1);
    });

    it('can be re-enabled', () => {
      controller.enabled = false;
      controller.enabled = true;
      controller.zoomTo(1.5);
      controller.update();
      expect(scene.cameras.main.zoom).toBeGreaterThan(1);
    });
  });

  describe('canvas event check', () => {
    it('ignores pointerdown when downElement is not canvas', () => {
      const pointerDown = getHandler(scene, 'pointerdown');
      const pointerMove = getHandler(scene, 'pointermove');

      const div = document.createElement('div');
      const pointer = createMockPointer({
        x: 100,
        y: 100,
        middleButtonDown: () => true,
        isDown: true,
        downElement: div,
      });

      pointerDown(pointer);
      pointer.x = 200;
      pointerMove(pointer);
      controller.update();

      expect(scene.cameras.main.scrollX).toBeCloseTo(0, 5);
    });

    it('allows pointerdown when downElement is undefined (fallback)', () => {
      const pointerDown = getHandler(scene, 'pointerdown');
      const pointerMove = getHandler(scene, 'pointermove');

      const pointer = createMockPointer({
        x: 100,
        y: 100,
        middleButtonDown: () => true,
        isDown: true,
        downElement: undefined,
      });

      pointerDown(pointer);
      pointer.x = 150;
      pointerMove(pointer);
      controller.update();

      expect(scene.cameras.main.scrollX).not.toBe(0);
    });
  });

  describe('exported constants', () => {
    it('MIN_ZOOM is 0.5', () => {
      expect(MIN_ZOOM).toBe(0.5);
    });

    it('MAX_ZOOM is 2.0', () => {
      expect(MAX_ZOOM).toBe(2.0);
    });

    it('ZOOM_LERP_SPEED is 0.1', () => {
      expect(ZOOM_LERP_SPEED).toBe(0.1);
    });

    it('PAN_LERP_SPEED is 0.15', () => {
      expect(PAN_LERP_SPEED).toBe(0.15);
    });

    it('ZOOM_STEP is 0.1', () => {
      expect(ZOOM_STEP).toBe(0.1);
    });

    it('BOUNDS_PADDING is 200', () => {
      expect(BOUNDS_PADDING).toBe(200);
    });

    it('KEYBOARD_PAN_SPEED is 10', () => {
      expect(KEYBOARD_PAN_SPEED).toBe(10);
    });
  });
});
