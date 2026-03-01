# Task 105: Create Camera Controller

## Summary
Create a camera controller for the Phaser scene — drag-to-pan with middle mouse or shift+left click, scroll-to-zoom with smooth tweening, camera bounds limiting to the factory floor dimensions, and smooth movement with easing. The controller must work on both desktop mice and trackpads without interfering with game object click interactions.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 103 (Phaser Game Config — scene and camera exist)
- **Blocks**: 108 (Factory Scene — initializes and uses the camera controller)

## Architecture Reference
The camera controller wraps Phaser's built-in camera system (`scene.cameras.main`) with custom input handling for pan and zoom. It is instantiated by the FactoryScene and updated each frame. The controller manages its own input listeners for drag, scroll, and keyboard modifiers, and exposes methods for programmatic camera control (e.g., center on a specific tile, zoom to fit).

## Files and Folders
- `/apps/web/src/phaser/systems/camera-controller.ts` — CameraController class

## Acceptance Criteria
- [ ] Drag with middle mouse button pans the camera smoothly
- [ ] Drag with shift + left mouse button pans the camera (alternative for users without middle mouse)
- [ ] Scroll wheel zooms in/out with smooth tween interpolation (not instant snaps)
- [ ] Zoom is bounded: minimum 0.5x, maximum 2.0x
- [ ] Camera is bounded to the factory floor dimensions (configurable bounds) — cannot pan infinitely
- [ ] Smooth pan and zoom transitions using Phaser tweens or linear interpolation
- [ ] Left-click without shift is NOT consumed by the controller — passes through to game objects for selection
- [ ] Works on desktop mouse and trackpad (two-finger scroll = zoom, two-finger drag = pan)
- [ ] `centerOn(tileX: number, tileY: number)` method smoothly pans to center on a specific tile
- [ ] `zoomTo(level: number)` method smoothly tweens zoom to a target level within bounds
- [ ] `setBounds(width: number, height: number)` method updates the camera bounds (called when layout changes)
- [ ] Controller cleans up all event listeners on destroy

## Implementation Notes
- Use `scene.input.on('pointermove', ...)` with `pointer.isDown` and button checks rather than Phaser's built-in drag camera plugin, which has limited customization.
- For zoom smoothing, use a target zoom value that the actual zoom lerps toward each frame in the `update` method, or use a Phaser tween.
- Middle mouse button is `pointer.middleButtonDown()` or `pointer.button === 1`.
- Trackpad pinch-to-zoom fires as scroll events in most browsers — the scroll handler covers both mouse wheel and trackpad zoom.
- Be careful with event propagation: the controller should check if the pointer is over a UI element (React overlay) and skip camera movement if so. Use `pointer.downElement` to check if the event originated from the canvas.
- Camera bounds should use `camera.setBounds(x, y, width, height)` with some padding around the factory floor.
- Consider adding keyboard shortcuts: arrow keys for panning, +/- for zoom, Home to reset view.
- The controller should be pausable (e.g., when a modal dialog is open) via an `enabled` flag.
