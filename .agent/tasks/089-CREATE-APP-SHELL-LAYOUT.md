# Task 089: Create Application Shell Layout

## Summary
Create the application shell layout with a collapsible sidebar navigation, a header bar with notification bell and view mode toggle, and a main content area where page routes render. This is the persistent chrome around every page in the dashboard.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 085 (Tailwind + shadcn — provides UI components), 088 (Zustand Store — provides viewMode, socketState, notificationCount)
- **Blocks**: 091-101 (all pages render inside the shell layout)

## Architecture Reference
The shell layout is a classic sidebar + header + content arrangement. The sidebar contains navigation links to all major sections. The header shows the app title, a Socket.IO connection indicator, a notification bell with unread count, and a toggle to switch between managerial and factory views. On mobile (< 768px), the sidebar collapses into a Sheet (slide-over drawer) triggered by a hamburger button in the header. The layout wraps a React Router `<Outlet />` for page content.

## Files and Folders
- `/apps/web/src/layouts/shell.tsx` — Shell layout component composing Sidebar, Header, and `<Outlet />`
- `/apps/web/src/layouts/sidebar.tsx` — Sidebar navigation with links, icons, active route highlighting, collapse toggle
- `/apps/web/src/layouts/header.tsx` — Header bar with app title, connection indicator, notification bell, view mode toggle

## Acceptance Criteria
- [ ] Shell layout renders Sidebar on the left, Header at the top, and `<Outlet />` as the main content area
- [ ] Sidebar navigation links: Dashboard (`/`), Assembly Lines (`/assembly-lines`), Worker Pools (`/worker-pools`), Packages (`/packages`), Workers (`/workers`), Logs (`/logs`), Factory (`/factory`)
- [ ] Each sidebar link has an icon from `lucide-react` (e.g., LayoutDashboard, GitBranch, Users, Package, Cpu, FileText, Factory)
- [ ] Active route is visually highlighted in the sidebar (using React Router's `useLocation` or `NavLink`)
- [ ] Sidebar is collapsible on desktop — toggle button shrinks it to icon-only mode
- [ ] Sidebar uses shadcn Sheet on mobile (< 768px breakpoint) — triggered by hamburger icon in header
- [ ] Header displays "Smithy" as the app title
- [ ] Header shows a Socket.IO connection status indicator (green dot = connected, yellow = reconnecting, red = disconnected) reading from Zustand `socketState`
- [ ] Header shows a notification bell icon with a Badge showing `unreadNotificationCount` from Zustand store (hidden when 0)
- [ ] Header shows a view mode toggle button: "Dashboard" / "Factory" reading from Zustand `viewMode`, calling `setViewMode`
- [ ] Layout is responsive — content area takes remaining width after sidebar
- [ ] Factory link in sidebar is visually distinct (e.g., separator above it, different icon color) to indicate it is a different mode

## Implementation Notes
- Use `NavLink` from React Router for sidebar links — it provides an `isActive` prop for styling the active route.
- The sidebar collapse state should be local component state (not Zustand) — it is UI-only state. Use a `useState<boolean>` with `localStorage` persistence for user preference.
- For the mobile Sheet sidebar, render the same navigation links inside a `<Sheet>` component that slides in from the left. Close the sheet on navigation (listen to `useLocation` changes).
- The connection indicator is a small colored circle (8px) — use Tailwind classes like `bg-green-500`, `bg-yellow-500`, `bg-red-500` with a `rounded-full` utility.
- The view mode toggle could be a segmented control or a simple Button with text. When toggled to "Factory", the router should navigate to `/factory`. When toggled to "Dashboard", navigate to `/` (or the last visited dashboard route).
- Use Tailwind's `transition-all` and `duration-200` for smooth sidebar collapse animation.
- The layout should set `min-h-screen` and use flexbox or grid for the sidebar/content split.
