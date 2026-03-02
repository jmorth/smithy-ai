# ESLint Shared Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `@smithy/eslint-config` — a shared ESLint v9 flat-config package that every workspace package can depend on for consistent TypeScript-aware linting.

**Architecture:** A config-only package under `packages/eslint-config` that exports a flat ESLint config array. Plain JavaScript (ESM) with no build step. Consuming packages spread the exported config array into their own `eslint.config.js`.

**Tech Stack:** ESLint v9 (flat config), @typescript-eslint v8, eslint-config-prettier, pnpm workspaces, Turborepo

---

### Task 1: Create the git feature branch

**Step 1: Create and switch to branch**

```bash
cd /home/jmorth/Source/Opus/smithy-ai
git checkout -b feature/task-004
```

Expected: switched to new branch `feature/task-004`

---

### Task 2: Scaffold the package directory and package.json

**Files:**
- Create: `packages/eslint-config/package.json`

**Step 1: Create the directory**

```bash
mkdir -p packages/eslint-config
```

**Step 2: Write package.json**

```json
{
  "name": "@smithy/eslint-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.js"
  },
  "files": [
    "index.js"
  ],
  "peerDependencies": {
    "eslint": ">=9.0.0"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^10.0.0"
  }
}
```

**Step 3: Install dependencies from workspace root**

```bash
pnpm install
```

Expected: lockfile updated, dependencies installed under `packages/eslint-config/node_modules` (hoisted).

---

### Task 3: Write the flat ESLint config (index.js)

**Files:**
- Create: `packages/eslint-config/index.js`

**Step 1: Write the flat config**

```js
// @smithy/eslint-config — ESLint v9 flat config
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

/** @type {import("eslint").Linter.Config[]} */
const base = [
  {
    // Apply to all JS/TS source files
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // Base ESLint rules
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  // Prettier must come last to disable conflicting style rules
  prettierConfig,
];

export { base };
export default base;
```

---

### Task 4: Write tsconfig.json for the package

**Files:**
- Create: `packages/eslint-config/tsconfig.json`

**Step 1: Write tsconfig.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["index.js"],
  "exclude": ["node_modules", "dist"]
}
```

---

### Task 5: Validate the package loads without error

**Step 1: Verify the package can be imported**

```bash
cd packages/eslint-config
node --input-type=module <<'EOF'
import config from './index.js'
console.log('Config loaded. Items:', config.length)
console.log('All configs are objects:', config.every(c => typeof c === 'object'))
EOF
```

Expected output:
```
Config loaded. Items: 2
All configs are objects: true
```

**Step 2: Commit initial package**

```bash
cd /home/jmorth/Source/Opus/smithy-ai
git add packages/eslint-config/
git commit -m "feat(eslint-config): scaffold @smithy/eslint-config package with flat config"
```

---

### Task 6: Write tests for the config package

**Files:**
- Create: `packages/eslint-config/test/config.test.js`
- Modify: `packages/eslint-config/package.json` (add test script and vitest devDependency)

Since this is a config-only JavaScript package, tests verify:
1. The config loads without error
2. The exported array has the correct structure
3. Expected rules are present

**Step 1: Add vitest to package.json devDependencies and test script**

Update `packages/eslint-config/package.json`:
```json
{
  "name": "@smithy/eslint-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.js"
  },
  "files": [
    "index.js"
  ],
  "scripts": {
    "lint": "eslint .",
    "test": "vitest run"
  },
  "peerDependencies": {
    "eslint": ">=9.0.0"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^10.0.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create test directory and test file**

```bash
mkdir -p packages/eslint-config/test
```

**Step 3: Write the test file**

```js
// packages/eslint-config/test/config.test.js
import { describe, it, expect } from 'vitest'
import config, { base } from '../index.js'

describe('@smithy/eslint-config', () => {
  describe('default export', () => {
    it('exports an array', () => {
      expect(Array.isArray(config)).toBe(true)
    })

    it('exports at least one config object', () => {
      expect(config.length).toBeGreaterThan(0)
    })

    it('each item is a plain object', () => {
      for (const item of config) {
        expect(typeof item).toBe('object')
        expect(item).not.toBeNull()
      }
    })
  })

  describe('named export: base', () => {
    it('base is the same array as the default export', () => {
      expect(base).toBe(config)
    })
  })

  describe('TypeScript config object', () => {
    const tsConfig = config.find(c => c.plugins?.['@typescript-eslint'])

    it('includes @typescript-eslint plugin', () => {
      expect(tsConfig).toBeDefined()
    })

    it('includes TypeScript parser', () => {
      expect(tsConfig?.languageOptions?.parser).toBeDefined()
    })

    it('files pattern targets JS and TS files', () => {
      expect(tsConfig?.files).toBeDefined()
      const pattern = tsConfig?.files?.join(',') ?? ''
      expect(pattern).toContain('ts')
      expect(pattern).toContain('js')
    })

    it('no-unused-vars rule is set to warn', () => {
      const rule = tsConfig?.rules?.['@typescript-eslint/no-unused-vars']
      expect(rule).toBeDefined()
      const severity = Array.isArray(rule) ? rule[0] : rule
      expect(severity).toBe('warn')
    })

    it('no-explicit-any rule is set to warn', () => {
      const rule = tsConfig?.rules?.['@typescript-eslint/no-explicit-any']
      expect(rule).toBe('warn')
    })

    it('consistent-type-imports rule is set to error', () => {
      const rule = tsConfig?.rules?.['@typescript-eslint/consistent-type-imports']
      const severity = Array.isArray(rule) ? rule[0] : rule
      expect(severity).toBe('error')
    })

    it('prefer-const rule is set to error', () => {
      expect(tsConfig?.rules?.['prefer-const']).toBe('error')
    })

    it('no-var rule is set to error', () => {
      expect(tsConfig?.rules?.['no-var']).toBe('error')
    })
  })

  describe('prettier config', () => {
    // The last config should be from eslint-config-prettier
    // It should not have any 'rules' that conflict with prettier (or they should be 'off')
    it('includes prettier config as the last item', () => {
      const last = config[config.length - 1]
      expect(last).toBeDefined()
      // eslint-config-prettier sets rules to 'off' to disable conflicting rules
      // Its object will have a 'rules' property with 'off' values
      expect(last).toHaveProperty('rules')
    })
  })
})
```

**Step 4: Run tests to verify they fail first (TDD — code already written, so expect pass)**

```bash
cd /home/jmorth/Source/Opus/smithy-ai
pnpm --filter @smithy/eslint-config install
pnpm --filter @smithy/eslint-config test
```

Expected: all tests PASS

**Step 5: Check coverage**

```bash
pnpm --filter @smithy/eslint-config exec vitest run --coverage
```

**Step 6: Commit tests**

```bash
git add packages/eslint-config/test/ packages/eslint-config/package.json
git commit -m "test(eslint-config): add structural tests for @smithy/eslint-config"
```

---

### Task 7: Validate turbo lint integration

The turbo `lint` task needs each package to have its own `eslint.config.js`. Since there's only one package so far (eslint-config itself), create a self-referential `eslint.config.js` within it.

**Files:**
- Create: `packages/eslint-config/eslint.config.js`

**Step 1: Write eslint.config.js for the package**

```js
// packages/eslint-config/eslint.config.js
import config from './index.js'

export default config
```

**Step 2: Run turbo lint to verify**

```bash
cd /home/jmorth/Source/Opus/smithy-ai
pnpm turbo lint
```

Expected: lint task completes (may produce warnings, but should not error)

**Step 3: Commit**

```bash
git add packages/eslint-config/eslint.config.js
git commit -m "chore(eslint-config): add self-referential eslint.config.js for turbo lint"
```

---

### Task 8: Final verification and merge

**Step 1: Run all checks**

```bash
cd /home/jmorth/Source/Opus/smithy-ai
pnpm --filter @smithy/eslint-config test
pnpm turbo lint
```

**Step 2: Update PROGRESS.md to task 005**

```bash
echo "Current task: 005" > .agent/PROGRESS.md
```

**Step 3: Commit PROGRESS.md**

```bash
git add .agent/PROGRESS.md
git commit -m "chore(progress): advance to task 005"
```

**Step 4: Merge to main**

```bash
git checkout main
git merge --no-ff feature/task-004 -m "Merge feature/task-004: create @smithy/eslint-config shared ESLint config"
git checkout feature/task-004
```

**Step 5: Push to remote (if configured)**

```bash
git remote | grep origin && git push origin main || echo "No remote origin configured"
```
