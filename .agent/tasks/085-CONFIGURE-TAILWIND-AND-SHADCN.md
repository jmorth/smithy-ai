# Task 085: Configure Tailwind CSS and shadcn/ui

## Summary
Configure Tailwind CSS with the shadcn/ui theming system (CSS variables for colors, dark mode via class strategy) and install the base set of shadcn/ui components needed across all dashboard pages. This establishes the design system foundation for every UI component in the application.

## Phase
Phase 5: Frontend Dashboard

## Dependencies
- **Depends on**: 084 (Initialize Vite + React App)
- **Blocks**: 089 (App Shell Layout), 091-101 (all UI pages depend on shadcn components)

## Architecture Reference
The design system uses Tailwind CSS for utility-first styling and shadcn/ui for pre-built, accessible, customizable components. shadcn/ui components are installed locally (not as npm packages) into `src/components/ui/` and can be modified freely. The theming system uses CSS custom properties defined in `index.css`, enabling light/dark mode switching via the `dark` class on `<html>`. The `cn()` utility (combining clsx + tailwind-merge) is the standard way to compose class names.

## Files and Folders
- `/apps/web/tailwind.config.ts` — Tailwind configuration with shadcn/ui theme extension, content paths, dark mode class strategy
- `/apps/web/postcss.config.js` — PostCSS configuration with tailwindcss and autoprefixer plugins
- `/apps/web/src/index.css` — Tailwind directives (@tailwind base/components/utilities) plus CSS custom properties for light and dark themes
- `/apps/web/components.json` — shadcn/ui configuration file (style, RSC, aliases, Tailwind config path)
- `/apps/web/src/lib/utils.ts` — `cn()` utility function combining `clsx` and `tailwind-merge`
- `/apps/web/src/components/ui/button.tsx` — shadcn Button component
- `/apps/web/src/components/ui/card.tsx` — shadcn Card component
- `/apps/web/src/components/ui/input.tsx` — shadcn Input component
- `/apps/web/src/components/ui/dialog.tsx` — shadcn Dialog component
- `/apps/web/src/components/ui/sheet.tsx` — shadcn Sheet component (used for mobile sidebar)
- `/apps/web/src/components/ui/dropdown-menu.tsx` — shadcn DropdownMenu component
- `/apps/web/src/components/ui/table.tsx` — shadcn Table component
- `/apps/web/src/components/ui/badge.tsx` — shadcn Badge component
- `/apps/web/src/components/ui/tabs.tsx` — shadcn Tabs component
- `/apps/web/src/components/ui/separator.tsx` — shadcn Separator component

## Acceptance Criteria
- [ ] Tailwind CSS classes apply correctly in React components (verified by rendering a styled element)
- [ ] `tailwind.config.ts` extends the theme with shadcn/ui CSS variable references (e.g., `colors.background: "hsl(var(--background))"`)
- [ ] `tailwind.config.ts` sets `darkMode: "class"`
- [ ] `tailwind.config.ts` content paths include `./src/**/*.{ts,tsx}`
- [ ] `index.css` defines CSS custom properties for both `:root` (light) and `.dark` (dark) themes
- [ ] `index.css` includes `@tailwind base`, `@tailwind components`, `@tailwind utilities` directives
- [ ] `components.json` is configured with correct aliases (`@/components`, `@/lib/utils`)
- [ ] `cn()` utility is exported from `src/lib/utils.ts` and combines `clsx` + `tailwind-merge`
- [ ] All 10 base shadcn components are installed and importable: Button, Card, Input, Dialog, Sheet, DropdownMenu, Table, Badge, Tabs, Separator
- [ ] Dark mode toggle works — adding `dark` class to `<html>` switches the color scheme
- [ ] `pnpm --filter web build` completes without errors after Tailwind is configured
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- Install dependencies: `tailwindcss`, `postcss`, `autoprefixer`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react` (icon library used by shadcn), `@radix-ui/react-*` packages as needed by each component.
- Use `npx shadcn@latest init` to generate `components.json` and base config, then `npx shadcn@latest add button card input dialog sheet dropdown-menu table badge tabs separator` to install components. Alternatively, install them manually from the shadcn/ui source.
- The CSS variables in `index.css` follow shadcn's convention using HSL values without the `hsl()` wrapper (e.g., `--background: 0 0% 100%;`). The Tailwind config wraps them in `hsl()`.
- Ensure `postcss.config.js` exists — Vite uses PostCSS under the hood, and Tailwind requires it.
- The `components.json` should set `"rsc": false` since this is not a Next.js RSC project.
- `lucide-react` is the icon library used by shadcn/ui components. It will also be used throughout the dashboard for sidebar icons, action buttons, etc.
- Do NOT implement a dark mode toggle UI component yet — that comes with the app shell (task 089). Just ensure the CSS infrastructure supports it.
