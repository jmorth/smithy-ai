# Task 121: Create Factory Toolbar

## Summary
Create the factory toolbar overlay — a React component positioned at the top of the factory view providing zoom controls, Assembly Line/Pool selector dropdown, submit Package button, and a toggle to switch to the managerial dashboard view. The toolbar uses shadcn/ui components and coexists with the Phaser canvas without blocking game interaction outside its bounds.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 085 (Tailwind + shadcn/ui — toolbar UI components), 088 (Zustand App Store — viewMode toggle)
- **Blocks**: None

## Architecture Reference
The factory toolbar is a React component rendered in the overlay container on top of the Phaser canvas, positioned at the top of the viewport. It provides high-level controls for the factory view that are easier to implement as HTML elements than as Phaser UI objects. The toolbar communicates with the factory Zustand store for zoom level and active filters, and with the camera controller (indirectly via the bridge) for zoom commands.

## Files and Folders
- `/apps/web/src/pages/factory/components/factory-toolbar.tsx` — Factory toolbar React component

## Acceptance Criteria
- [ ] Toolbar positioned at the top of the factory view (`absolute top-0 left-0 right-0`)
- [ ] Zoom in button (`+`): triggers camera zoom in (dispatches via bridge or factory store action)
- [ ] Zoom out button (`-`): triggers camera zoom out
- [ ] Current zoom level displayed (e.g., "100%", "150%")
- [ ] Assembly Line / Worker Pool selector dropdown: lists available Assembly Lines and Pools, selecting one filters/centers the factory view on that entity
- [ ] "Submit Package" button: opens a submission dialog/modal for creating a new Package
- [ ] "Switch to Dashboard" button: changes `viewMode` in Zustand store, navigating to the dashboard view
- [ ] Toolbar uses shadcn/ui components: Button, DropdownMenu (or Select), Badge
- [ ] `pointer-events: auto` on the toolbar itself so buttons are clickable
- [ ] Toolbar does not block Phaser canvas interaction outside its bounds
- [ ] Toolbar is visually distinct from the canvas (semi-transparent background, border, or shadow)
- [ ] Toolbar is responsive — collapses to icon buttons on smaller screens
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Toolbar layout: use a flex row with items spaced between. Left side: zoom controls. Center: Assembly Line selector. Right side: submit + dashboard toggle.
- Zoom controls dispatch to the factory store or directly call bridge methods:
  ```ts
  const zoomIn = () => bridge.zoomCamera(currentZoom + 0.25);
  const zoomOut = () => bridge.zoomCamera(currentZoom - 0.25);
  ```
  Alternatively, store a `targetZoom` in the factory Zustand store and let the bridge forward it to the camera controller.
- Assembly Line selector: use shadcn's `Select` or `DropdownMenu` component. The list of Assembly Lines and Pools comes from TanStack Query or the app Zustand store. Selecting an entry:
  1. Filters the factory store to show only that line/pool's Workers and Packages
  2. Centers the camera on that line/pool's room position
- "Submit Package" button opens a Dialog (shadcn Dialog component) with a form for Package type, files, and target Assembly Line. Submission calls the API via TanStack Query mutation.
- "Switch to Dashboard" button: `navigate('/dashboard')` via React Router, or toggle `viewMode` in Zustand if the factory and dashboard share a layout.
- Toolbar background: `bg-background/80 backdrop-blur-sm border-b` for a frosted glass effect over the canvas.
- Consider adding a "Reset View" button (home icon) that centers the camera and resets zoom to 1.0x.
- On mobile/small screens, collapse secondary actions into a "more" dropdown menu to save horizontal space.
