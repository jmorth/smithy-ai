import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';

const DOCKERFILE_PATH = path.resolve(
  import.meta.dirname,
  '..',
  'Dockerfile.base',
);
const DOCKERIGNORE_PATH = path.resolve(
  import.meta.dirname,
  '..',
  '.dockerignore',
);

const dockerfile = fs.readFileSync(DOCKERFILE_PATH, 'utf-8');
const dockerignore = fs.readFileSync(DOCKERIGNORE_PATH, 'utf-8');

describe('Dockerfile.base', () => {
  it('uses node:20-alpine as the base image', () => {
    expect(dockerfile).toMatch(/FROM\s+node:20-alpine/);
  });

  it('uses a multi-stage build', () => {
    const stageCount = (dockerfile.match(/^FROM\s+/gm) ?? []).length;
    expect(stageCount).toBeGreaterThanOrEqual(2);
  });

  it('installs pnpm via corepack', () => {
    expect(dockerfile).toMatch(/corepack enable/);
    expect(dockerfile).toMatch(/corepack prepare pnpm/);
  });

  it('prunes monorepo for @smithy/worker-sdk', () => {
    expect(dockerfile).toMatch(/turbo prune @smithy\/worker-sdk --docker/);
  });

  it('installs tsx for TypeScript execution', () => {
    expect(dockerfile).toMatch(/npm install -g tsx/);
  });

  it('sets WORKDIR to /app', () => {
    expect(dockerfile).toMatch(/WORKDIR\s+\/app/);
  });

  it('sets NODE_ENV=production as default', () => {
    expect(dockerfile).toMatch(/ENV\s+NODE_ENV=production/);
  });

  it('runs ENTRYPOINT with tsx pointing to runner.ts', () => {
    expect(dockerfile).toMatch(
      /ENTRYPOINT\s+\["tsx",\s*"\/app\/packages\/worker-sdk\/src\/runner\.ts"\]/,
    );
  });

  it('creates volume mount directories for /config, /worker, and /input', () => {
    expect(dockerfile).toMatch(/mkdir -p \/config \/worker \/input/);
  });

  it('includes a HEALTHCHECK', () => {
    expect(dockerfile).toMatch(/HEALTHCHECK/);
    expect(dockerfile).toMatch(/node -e "console\.log\('ok'\)"/);
  });

  it('creates a non-root user', () => {
    expect(dockerfile).toMatch(/addgroup -S smithy/);
    expect(dockerfile).toMatch(/adduser -S smithy -G smithy/);
    expect(dockerfile).toMatch(/USER\s+smithy/);
  });

  it('conditionally installs pino-pretty only in non-production', () => {
    expect(dockerfile).toMatch(/ARG\s+NODE_ENV=production/);
    expect(dockerfile).toMatch(
      /if \[ "\$NODE_ENV" != "production" \].*pino-pretty/s,
    );
  });

  it('copies tsconfig.base.json for TypeScript resolution', () => {
    expect(dockerfile).toMatch(/COPY.*tsconfig\.base\.json/);
  });

  it('installs production dependencies with frozen lockfile', () => {
    expect(dockerfile).toMatch(/pnpm install --frozen-lockfile --prod/);
  });
});

describe('.dockerignore', () => {
  it('excludes node_modules', () => {
    expect(dockerignore).toMatch(/node_modules/);
  });

  it('excludes .git', () => {
    expect(dockerignore).toMatch(/\.git/);
  });

  it('excludes test files', () => {
    expect(dockerignore).toMatch(/\*\*\/\*\.test\.ts/);
  });

  it('excludes coverage directories', () => {
    expect(dockerignore).toMatch(/coverage/);
  });

  it('excludes dist directory', () => {
    expect(dockerignore).toMatch(/^dist$/m);
  });

  it('excludes .turbo cache', () => {
    expect(dockerignore).toMatch(/\.turbo/);
  });

  it('excludes __tests__ directories', () => {
    expect(dockerignore).toMatch(/__tests__/);
  });

  it('excludes environment files', () => {
    expect(dockerignore).toMatch(/\.env\*/);
  });
});
