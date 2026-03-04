# Factory Visual Effects Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a VisualEffects utility class for the Phaser factory scene providing particle bursts, shake, glow, and pop-in animations triggered by workflow events.

**Architecture:** A stateless utility class instantiated per-scene that exposes four effect methods. Each effect creates transient Phaser tweens/particles that auto-cleanup. A `prefersReducedMotion` check and `enabled` flag allow disabling all effects. No persistent game objects — fire-and-forget pattern.

**Tech Stack:** Phaser 3 tweens, programmatic texture generation, Vitest with Phaser mocks

---

### Task 1: Create VisualEffects system class

**Files:**
- Create: `apps/web/src/phaser/systems/visual-effects.ts`

**Implementation:**
- Export class `VisualEffects` with static methods (no instance state needed beyond enabled flag)
- `enabled` flag defaulting to `true`, checked via `prefersReducedMotion()`
- `completionEffect(scene, x, y)` — particle burst using programmatic circle texture, 15 particles, ~1s lifespan, auto-destroy emitter
- `errorEffect(scene, target)` — ±3px shake tween (50ms × 6 yoyo cycles) + red tint, auto-revert
- `stuckEffect(scene, target)` — looping alpha + yellow tint oscillation, returns cleanup function
- `newPackageEffect(scene, target)` — scale 0→1.2→1.0 with Back.Out easing, ~400ms

### Task 2: Write comprehensive tests

**Files:**
- Create: `apps/web/src/phaser/systems/__tests__/visual-effects.test.ts`

**Coverage targets:**
- Each effect method: correct tween config, callback behavior
- `stuckEffect` returns callable cleanup function
- `enabled = false` skips all effects
- `prefersReducedMotion` detection
- Particle emitter creation and auto-destroy
- No memory leaks: repeated calls don't accumulate objects

### Task 3: Run typecheck and coverage

- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- Verify 100% critical path, 80%+ overall coverage

### Task 4: Validate, commit, merge
