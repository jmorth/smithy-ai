# Factory Overlay Panels Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create three React overlay panels (Worker detail, Package detail, Interactive question) rendered as absolutely positioned HTML on top of the Phaser canvas, triggered by factory store selection state.

**Architecture:** Panels are React components inside the factory page's `pointer-events-none` overlay div. Each panel uses `pointer-events-auto` for interaction while letting clicks pass through to Phaser. Worker/Package panels use Sheet-like slide-in from the right. Interactive panel uses a centered Dialog/Modal. All driven by factory store selection state and socket events.

**Tech Stack:** React 18, Zustand (factory.store + app.store), shadcn/ui (Card, Badge, Button, Input, Separator, Progress, Dialog), Tailwind CSS, Vitest + Testing Library, Socket.IO client (interactive namespace)

---

### Task 1: Worker Detail Panel

**Files:**
- Create: `apps/web/src/pages/factory/components/worker-detail-panel.tsx`
- Create: `apps/web/src/pages/factory/components/__tests__/worker-detail-panel.test.tsx`

**Step 1: Write the test file**

Tests for:
- Not rendered when `selectedMachine` is null
- Renders when `selectedMachine` is set, shows worker name/state
- Displays worker state badge with correct variant
- Shows job progress bar when state is WORKING
- Shows configuration summary section
- Close button clears selection (calls `selectMachine(null)`)
- Has `pointer-events-auto` class
- Escape key closes the panel
- Panel has correct ARIA attributes (role, aria-label)
- Responsive: panel width adapts (w-full sm:w-96)

**Step 2: Implement the component**

- Subscribe to `useFactoryStore(s => s.selectedMachine)` and `useFactoryStore(s => s.workerMachines)`
- When selectedMachine is non-null, look up WorkerMachineState from the map
- Render a slide-in panel (right side) with:
  - Header: Worker name + close button (X icon)
  - State badge (color-coded: WAITING=secondary, WORKING=default, STUCK=warning, ERROR=destructive, DONE=green)
  - Worker ID display
  - Progress bar (indeterminate when WORKING)
  - Configuration summary (workerId, position)
- CSS transition for slide-in: `transform translateX` with transition-transform
- Focus management: auto-focus close button, Escape to close
- `pointer-events-auto` on the panel root

**Step 3: Run tests**

**Step 4: Commit**

---

### Task 2: Package Detail Panel

**Files:**
- Create: `apps/web/src/pages/factory/components/package-detail-panel.tsx`
- Create: `apps/web/src/pages/factory/components/__tests__/package-detail-panel.test.tsx`

**Step 1: Write the test file**

Tests for:
- Not rendered when `selectedCrate` is null
- Renders when `selectedCrate` is set, shows package type
- Displays package type badge with color
- Shows package status
- Shows current step in workflow
- Shows file list section (placeholder when no files loaded)
- Close button clears selection (calls `selectCrate(null)`)
- Has `pointer-events-auto` class
- Escape key closes the panel
- Responsive width
- Mutual exclusion: does not render when a machine is selected

**Step 2: Implement the component**

- Subscribe to `useFactoryStore(s => s.selectedCrate)` and `useFactoryStore(s => s.packageCrates)`
- When selectedCrate is non-null, look up PackageCrateState from the map
- Render a slide-in panel (right side) with:
  - Header: Package type + close button
  - Type badge (color-coded per PackageType)
  - Status badge
  - Current step indicator
  - Position info
  - File list placeholder (actual file fetching would need API integration)
- Same slide-in animation pattern as worker panel
- Focus management + Escape to close

**Step 3: Run tests**

**Step 4: Commit**

---

### Task 3: Interactive Panel

**Files:**
- Create: `apps/web/src/pages/factory/components/interactive-panel.tsx`
- Create: `apps/web/src/pages/factory/components/__tests__/interactive-panel.test.tsx`

**Step 1: Write the test file**

Tests for:
- Not rendered when no stuck workers
- Renders when a worker is in STUCK state with a question
- Shows question text
- Option buttons rendered when choices provided
- Clicking option populates the answer input
- Submit button disabled when answer is empty
- Submit button disabled for whitespace-only
- Calls socketManager.sendInteractiveResponse on submit
- Shows confirmation state after submission
- Centered modal/dialog styling
- Has `pointer-events-auto` class
- Escape key closes the panel
- Has role="alertdialog" for accessibility (requires user action)

**Step 2: Implement the component**

- Listen to socket events on `/interactive` namespace for questions
- Maintain local state for active questions (Map<workerId, question>)
- When a worker in factory store is STUCK and has an active question, show the interactive panel
- Use Dialog-like centered overlay pattern
- Reuse the InteractiveResponse component pattern from packages page
- On submit, call `socketManager.sendInteractiveResponse(jobId, { questionId, answer })`
- Show confirmation, then auto-dismiss after a few seconds

**Step 3: Run tests**

**Step 4: Commit**

---

### Task 4: Wire Panels into Factory Page

**Files:**
- Modify: `apps/web/src/pages/factory/index.tsx`
- Modify: `apps/web/src/pages/factory/__tests__/factory-page.test.tsx`

**Step 1: Update factory page tests**

- Test that overlay contains WorkerDetailPanel
- Test that overlay contains PackageDetailPanel
- Test that overlay contains InteractivePanel
- Test overlay has z-10 class

**Step 2: Update factory page**

- Import and render all three panels inside the overlay div
- Add z-10 to overlay for proper stacking

**Step 3: Run tests**

**Step 4: Run typecheck**

**Step 5: Commit**

---

### Task 5: Coverage & Final Verification

**Step 1: Run full test suite with coverage**
**Step 2: Fix any coverage gaps**
**Step 3: Run typecheck**
**Step 4: Final commit**
