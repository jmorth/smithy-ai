# Scaffold Shared Types Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the `@smithy/shared` package skeleton — a zero-dependency, isomorphic TypeScript package that is the single source of truth for all cross-package types, enums, and event contracts.

**Architecture:** The package lives at `packages/shared/`, extends the root `tsconfig.base.json`, and points its `main`/`types`/`exports` directly at `src/` for zero-build-step workspace consumption. Subdirectory barrel files (`types/`, `events/`, `constants/`) re-export from the root `src/index.ts`.

**Tech Stack:** TypeScript 5, pnpm workspaces, vitest (for compile verification tests)

---

### Task 1: Create the git feature branch

**Files:** (none, git ops only)

**Step 1: Create and switch to the feature branch**

```bash
cd /home/jmorth/Source/Opus/smithy-ai
git checkout -b feature/task-005
```

Expected: `Switched to a new branch 'feature/task-005'`

---

### Task 2: Create the package directory structure

**Files:**
- Create: `packages/shared/src/types/`
- Create: `packages/shared/src/events/`
- Create: `packages/shared/src/constants/`

**Step 1: Create directories**

```bash
mkdir -p packages/shared/src/types
mkdir -p packages/shared/src/events
mkdir -p packages/shared/src/constants
```

---

### Task 3: Write the placeholder barrel files (TDD first — compile test will verify them)

**Files:**
- Create: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/events/index.ts`
- Create: `packages/shared/src/constants/index.ts`
- Create: `packages/shared/src/index.ts`

Each subdirectory barrel:
```ts
export {};
```

Root `src/index.ts`:
```ts
export * from './types/index.js';
export * from './events/index.js';
export * from './constants/index.js';
```

---

### Task 4: Create `packages/shared/tsconfig.json`

**Files:**
- Create: `packages/shared/tsconfig.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {}
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

---

### Task 5: Create `packages/shared/package.json`

**Files:**
- Create: `packages/shared/package.json`

```json
{
  "name": "@smithy/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "import": "./src/index.ts",
      "types": "./src/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

---

### Task 6: Create `packages/shared/vitest.config.ts` and a smoke test

**Files:**
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.test.ts`

vitest.config.ts:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
  },
});
```

Smoke test (`src/index.test.ts`) — verifies the package compiles and barrel exports work:
```ts
import { describe, it, expect } from 'vitest';
import * as shared from './index.js';

describe('@smithy/shared barrel export', () => {
  it('exports an object (even if empty)', () => {
    expect(typeof shared).toBe('object');
  });
});
```

---

### Task 7: Install dependencies and run checks

**Steps:**

```bash
cd /home/jmorth/Source/Opus/smithy-ai
pnpm install
cd packages/shared
pnpm typecheck
pnpm test
```

Expected: typecheck passes with 0 errors; vitest reports 1 passing test.

---

### Task 8: Commit and finish

```bash
cd /home/jmorth/Source/Opus/smithy-ai
git add packages/shared/
git commit -m "feat(shared): scaffold @smithy/shared package skeleton"
```
