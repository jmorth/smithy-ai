# Initialize pnpm Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Initialize the root pnpm workspace with `package.json` and `pnpm-workspace.yaml` to enable monorepo management.

**Architecture:** A minimal root package.json and pnpm-workspace.yaml that register the `apps/*`, `packages/*`, and `workers/*` workspace directories. No workspace packages exist yet — this scaffolds the container for all future packages.

**Tech Stack:** pnpm@10.x, Turborepo, Node.js >=20

---

### Task 1: Create root package.json

**Files:**
- Create: `package.json`

**Step 1: Create package.json with all required fields**

```json
{
  "name": "smithy-ai",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.28.0",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  }
}
```

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid')"`
Expected: `valid`

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add root package.json with workspace config"
```

---

### Task 2: Create pnpm-workspace.yaml

**Files:**
- Create: `pnpm-workspace.yaml`

**Step 1: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "workers/*"
```

**Step 2: Run pnpm install to verify no errors**

Run: `pnpm install`
Expected: lockfile created, no errors

**Step 3: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: add pnpm-workspace.yaml with apps/packages/workers globs"
```
