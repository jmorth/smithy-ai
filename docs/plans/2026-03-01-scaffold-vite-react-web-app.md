# Scaffold Vite + React Web Application — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold `apps/web` as a Vite + React TypeScript SPA that renders a placeholder "Smithy AI Dashboard" page and integrates with the pnpm monorepo.

**Architecture:** Single HTML entry point → `src/main.tsx` bootstraps React into `#root` → `src/app.tsx` renders minimal placeholder. Vite serves and bundles; a `/api` proxy in `vite.config.ts` forwards requests to the NestJS backend during development.

**Tech Stack:** React 18, Vite 5, TypeScript 5, `@vitejs/plugin-react`, `@smithy/shared` (workspace dep)

---

### Task 1: Create the git branch

**Step 1: Create and checkout the feature branch**

```bash
git checkout -b feature/task-008
```

Expected: `Switched to a new branch 'feature/task-008'`

---

### Task 2: Scaffold `apps/web/package.json`

**Files:**
- Create: `apps/web/package.json`

**Step 1: Write the file**

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.app.json --noEmit && vite build",
    "preview": "vite preview",
    "lint": "tsc --noEmit",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@smithy/shared": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.3",
    "vite": "^6.0.0"
  }
}
```

---

### Task 3: Scaffold `apps/web/tsconfig.json` and `apps/web/tsconfig.app.json`

**Files:**
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.app.json`
- Create: `apps/web/tsconfig.node.json`

**Step 1: Write `tsconfig.json` (references-style root)**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

**Step 2: Write `tsconfig.app.json` (app source — DOM + JSX)**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "composite": true,
    "noEmit": false
  },
  "include": ["src"]
}
```

**Step 3: Write `tsconfig.node.json` (Vite config — Node environment)**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "composite": true
  },
  "include": ["vite.config.ts"]
}
```

---

### Task 4: Scaffold `apps/web/vite.config.ts`

**Files:**
- Create: `apps/web/vite.config.ts`

**Step 1: Write the file**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
```

---

### Task 5: Scaffold `apps/web/index.html`

**Files:**
- Create: `apps/web/index.html`

**Step 1: Write the file**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Smithy AI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

### Task 6: Scaffold React source files

**Files:**
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app.tsx`

**Step 1: Write `src/main.tsx`**

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Step 2: Write `src/app.tsx`**

```typescript
export default function App() {
  return (
    <main>
      <h1>Smithy AI Dashboard</h1>
      <p>Frontend dashboard coming soon.</p>
    </main>
  );
}
```

---

### Task 7: Create public directory

**Files:**
- Create: `apps/web/public/.gitkeep`

**Step 1: Create empty file**

```bash
mkdir -p apps/web/public && touch apps/web/public/.gitkeep
```

---

### Task 8: Install dependencies

**Step 1: Run pnpm install from the workspace root**

```bash
pnpm install
```

Expected: pnpm resolves workspace deps including react, react-dom, vite, etc.

---

### Task 9: Validate typecheck

**Step 1: Run typecheck for the web app**

```bash
pnpm --filter web typecheck
```

Expected: exits 0 with no errors.

---

### Task 10: Validate build

**Step 1: Run build for the web app**

```bash
pnpm --filter web build
```

Expected: `dist/` directory created with `index.html`, `assets/`.

---

### Task 11: Commit and merge

**Step 1: Stage and commit**

```bash
git add apps/web/
git commit -m "feat(web): scaffold Vite + React web application skeleton (task 008)"
```

**Step 2: Merge to main**

```bash
git checkout main
git merge --no-ff feature/task-008 -m "Merge feature/task-008: scaffold Vite + React web application"
```
