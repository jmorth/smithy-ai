# Task 113: Create Worker Machine Sprite

## Summary
Create the WorkerMachine Phaser game object — a sprite representing a Worker on the factory floor with state-dependent animations (idle, working, stuck, error, done), hover tooltip showing Worker name and status, and click handler that dispatches selection events through the Zustand bridge to open the React detail panel.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 104 (Isometric Coordinate System — positioning and depth), 107 (Boot Scene — loads sprite sheets), 116 (Animation Manager — defines animation frames)
- **Blocks**: 118 (Realtime Sync — updates machine states in real time)

## Architecture Reference
WorkerMachine is the primary interactive game object on the factory floor. Each machine corresponds to a Worker entity in the domain model. The machine sprite reflects the Worker's current state through animations and visual effects. User interactions (hover, click) are captured by Phaser's input system and forwarded through the bridge to Zustand, which triggers React overlay panels to open. Machines are created and managed by the FactoryScene based on layout positions.

## Files and Folders
- `/apps/web/src/phaser/objects/worker-machine.ts` — WorkerMachine game object class

## Acceptance Criteria
- [ ] `WorkerMachine` extends `Phaser.GameObjects.Sprite`
- [ ] Positioned on the isometric grid using `cartToIso(tileX, tileY)` with correct depth sorting
- [ ] State animations mapped to Worker states:
  - `WAITING` (idle): gentle bobbing/breathing animation
  - `WORKING`: gears turning / glowing / active animation
  - `STUCK`: flashing yellow pulse
  - `ERROR`: red glow with shake
  - `DONE`: green pulse / success animation
- [ ] `setState(state: WorkerState)` method transitions to the corresponding animation
- [ ] Hover: shows tooltip text with Worker name and current status (using Phaser text or a DOM tooltip)
- [ ] Click: dispatches `selectWorker(workerId)` via the bridge — React panel opens
- [ ] Interactive: `setInteractive()` is called with the sprite's hit area
- [ ] Machine stores its domain `workerId` for bridge event correlation
- [ ] Smooth animation transitions (crossfade or immediate swap depending on state change)
- [ ] `destroy()` cleans up input listeners and tooltip
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- The sprite uses animations defined by the AnimationManager (task 116). Call `this.play('worker-idle')` for the idle state, `this.play('worker-working')` for working, etc.
- Tooltip: use `this.scene.add.text(x, y, text)` positioned above the machine, hidden by default, shown on `'pointerover'` and hidden on `'pointerout'`. Set the text's depth higher than the machine.
- For the bobbing idle animation, use a Phaser tween on the Y position: `scene.tweens.add({ targets: this, y: originalY - 2, yoyo: true, repeat: -1, duration: 800 })`.
- For error shake: `scene.tweens.add({ targets: this, x: originalX + 2, yoyo: true, repeat: 3, duration: 50 })`.
- For glow effects: use `this.setTint(0xff0000)` for error red, `this.setTint(0xffff00)` for stuck yellow, `this.clearTint()` for normal.
- Click detection: `this.on('pointerdown', () => bridge.onWorkerClicked(this.workerId))`. The bridge reference should be passed in the constructor or accessed via the scene.
- Hit area: use `this.setInteractive({ useHandCursor: true })` to show a pointer cursor on hover.
- Consider adding a small status indicator (colored circle) below the machine sprite as an additional visual cue for colorblind accessibility.
