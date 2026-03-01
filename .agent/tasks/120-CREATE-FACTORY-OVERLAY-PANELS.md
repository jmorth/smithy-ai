# Task 120: Create Factory Overlay Panels

## Summary
Create React overlay panels for the factory view — Worker detail panel, Package detail panel, and interactive question panel — rendered as absolutely positioned HTML elements on top of the Phaser canvas. These panels provide rich, accessible detail views that complement the visual factory floor, triggered by clicking game objects or receiving stuck/question events.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 085 (Tailwind + shadcn/ui — panel UI components), 088 (Zustand App Store — reads workflow data), 106 (Zustand-Phaser Bridge — receives selection events from Phaser)
- **Blocks**: 121 (Factory Toolbar — shares the overlay container)

## Architecture Reference
Overlay panels are React components rendered inside the factory page's overlay container (`absolute inset-0 pointer-events-none` div on top of the Phaser canvas). Individual panels use `pointer-events-auto` to capture mouse/keyboard input while allowing clicks on the non-panel area to pass through to the Phaser canvas below. Panels read from the factory Zustand store for selection state and from the app Zustand store (or TanStack Query) for domain data about the selected entity.

## Files and Folders
- `/apps/web/src/pages/factory/components/worker-detail-panel.tsx` — Worker detail slide-in panel
- `/apps/web/src/pages/factory/components/package-detail-panel.tsx` — Package detail slide-in panel
- `/apps/web/src/pages/factory/components/interactive-panel.tsx` — Interactive question/answer panel for STUCK Workers

## Acceptance Criteria
- [ ] Worker detail panel slides in from the right when a Worker machine is clicked (selected in factory store)
- [ ] Worker panel displays: Worker name, version, current state, current job progress (if working), recent execution logs, Worker configuration summary
- [ ] Package detail panel slides in from the right when a Package crate is clicked
- [ ] Package panel displays: Package type, metadata, file list with download links (presigned URLs), current position in workflow (which step/Worker)
- [ ] Interactive panel appears when a Worker enters STUCK state with a question: shows the question text, answer input field, submit button
- [ ] Submitting an answer in the interactive panel dispatches the answer to the API and clears the STUCK state
- [ ] All panels use shadcn/ui components (Card, Button, Input, Badge, Separator, etc.)
- [ ] Panels have a semi-transparent backdrop/background (`bg-background/90` or similar)
- [ ] Close button on each panel that clears the selection in the factory store
- [ ] `pointer-events: none` on the overlay container; `pointer-events: auto` on individual panels — Phaser receives clicks outside panels
- [ ] Panels are keyboard accessible (focus trap, Escape to close)
- [ ] Panels are responsive — adapt width on smaller screens
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Panel visibility is driven by Zustand state: `const selectedMachine = useFactoryStore(s => s.selectedMachine)`. If non-null, render the worker panel.
- Slide-in animation: use CSS `transform: translateX(100%)` → `translateX(0)` with a transition, or use Radix UI Sheet component from shadcn/ui for a pre-built slide-in drawer.
- The interactive panel for stuck Workers should be more prominent than detail panels — consider centering it or using a Dialog/Modal pattern since it requires user action.
- Worker detail panel data flow: the panel receives the `workerId` from the factory store selection, then uses TanStack Query to fetch full Worker details from the API (`useQuery(['worker', workerId], ...)`).
- Package file downloads: use presigned URLs from the storage service (task 030). Display file names with download icons.
- The overlay container in the factory page (`index.tsx`) should be structured:
  ```tsx
  <div className="relative w-screen h-screen">
    <PhaserGame /> {/* canvas fills container */}
    <div className="absolute inset-0 pointer-events-none z-10">
      <WorkerDetailPanel />
      <PackageDetailPanel />
      <InteractivePanel />
      <FactoryToolbar /> {/* task 121 */}
    </div>
  </div>
  ```
- Consider debouncing panel open/close to prevent flicker when rapidly clicking between game objects.
- Test that closing a panel (clearing selection) does not cause the Phaser scene to lose focus or input capability.
