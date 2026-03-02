# Worker YAML Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a YAML parser and Zod-based validator for Worker configuration files that transforms raw YAML text into a validated, typed `WorkerConfig` object.

**Architecture:** The validator lives in the workers module and is the bridge between raw user YAML input and the database. It uses the `yaml` npm package for parsing and Zod for schema validation, consistent with the project's existing Zod usage in the config module.

**Tech Stack:** TypeScript, Zod (already in api), `yaml` npm package (to install), NestJS `BadRequestException`

---

### Task 1: Install `yaml` dependency

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Install the package**

```bash
cd apps/api && pnpm add yaml
```

**Step 2: Verify installation**

Check `apps/api/package.json` has `"yaml"` in dependencies.

---

### Task 2: Create the validator with failing tests

**Files:**
- Create: `apps/api/src/modules/workers/worker-yaml.validator.ts`
- Create: `apps/api/src/modules/workers/worker-yaml.validator.spec.ts`

**Step 1: Write the failing tests**

```typescript
// worker-yaml.validator.spec.ts
import { BadRequestException } from '@nestjs/common';
import { describe, it, expect } from 'vitest';
import { validateWorkerYaml, validateWorkerConfig } from './worker-yaml.validator';

const VALID_YAML = `
name: my-worker
inputTypes:
  - text
outputType: text
provider:
  name: anthropic
  model: claude-3-5-sonnet-latest
  apiKeyEnv: ANTHROPIC_API_KEY
`;

describe('validateWorkerYaml', () => {
  it('parses and validates a valid YAML string', () => {
    const result = validateWorkerYaml(VALID_YAML);
    expect(result.name).toBe('my-worker');
    expect(result.inputTypes).toEqual(['text']);
    expect(result.outputType).toBe('text');
    expect(result.provider.name).toBe('anthropic');
    expect(result.provider.model).toBe('claude-3-5-sonnet-latest');
    expect(result.provider.apiKeyEnv).toBe('ANTHROPIC_API_KEY');
  });

  it('applies default timeout of 300', () => {
    const result = validateWorkerYaml(VALID_YAML);
    expect(result.timeout).toBe(300);
  });

  it('applies default retries of 0', () => {
    const result = validateWorkerYaml(VALID_YAML);
    expect(result.retries).toBe(0);
  });

  it('applies default tools of []', () => {
    const result = validateWorkerYaml(VALID_YAML);
    expect(result.tools).toEqual([]);
  });

  it('throws BadRequestException for malformed YAML', () => {
    expect(() => validateWorkerYaml('{ invalid: yaml: here:')).toThrow(BadRequestException);
  });

  it('throws BadRequestException with clear message for malformed YAML', () => {
    expect(() => validateWorkerYaml('{ invalid: yaml: here:')).toThrow(/Invalid YAML syntax/);
  });

  it('throws BadRequestException when name is missing', () => {
    const yaml = `
inputTypes: [text]
outputType: text
provider:
  name: anthropic
  model: claude-3-5-sonnet-latest
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when inputTypes is empty array', () => {
    const yaml = `
name: test
inputTypes: []
outputType: text
provider:
  name: anthropic
  model: claude-3-5-sonnet-latest
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when provider.model is missing', () => {
    const yaml = `
name: test
inputTypes: [text]
outputType: text
provider:
  name: anthropic
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('error message contains field name for missing provider.model', () => {
    const yaml = `
name: test
inputTypes: [text]
outputType: text
provider:
  name: anthropic
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    expect(() => validateWorkerYaml(yaml)).toThrow(/provider\.model/);
  });

  it('parses optional systemPrompt', () => {
    const yaml = VALID_YAML + '\nsystemPrompt: You are helpful.';
    const result = validateWorkerYaml(yaml);
    expect(result.systemPrompt).toBe('You are helpful.');
  });

  it('parses custom timeout', () => {
    const yaml = VALID_YAML + '\ntimeout: 600';
    const result = validateWorkerYaml(yaml);
    expect(result.timeout).toBe(600);
  });

  it('parses custom retries', () => {
    const yaml = VALID_YAML + '\nretries: 3';
    const result = validateWorkerYaml(yaml);
    expect(result.retries).toBe(3);
  });

  it('throws BadRequestException when timeout is not a positive integer', () => {
    const yaml = VALID_YAML + '\ntimeout: -5';
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when retries is negative', () => {
    const yaml = VALID_YAML + '\nretries: -1';
    expect(() => validateWorkerYaml(yaml)).toThrow(BadRequestException);
  });

  it('parses tools array', () => {
    const yaml = VALID_YAML + `
tools:
  - name: search
    description: Search the web
`;
    const result = validateWorkerYaml(yaml);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]?.name).toBe('search');
  });
});

describe('validateWorkerConfig', () => {
  it('validates a pre-parsed object', () => {
    const config = {
      name: 'my-worker',
      inputTypes: ['text'],
      outputType: 'text',
      provider: { name: 'anthropic', model: 'claude-3-5-sonnet-latest', apiKeyEnv: 'KEY' },
    };
    const result = validateWorkerConfig(config);
    expect(result.name).toBe('my-worker');
  });

  it('throws BadRequestException for invalid pre-parsed object', () => {
    expect(() => validateWorkerConfig({ name: 'test' })).toThrow(BadRequestException);
  });

  it('throws BadRequestException with field-level errors for invalid object', () => {
    expect(() => validateWorkerConfig({ name: 'test' })).toThrow(/inputTypes/);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm test -- worker-yaml.validator
```

Expected: FAIL - module not found

**Step 3: Implement the validator**

```typescript
// worker-yaml.validator.ts
import { BadRequestException } from '@nestjs/common';
import { parse } from 'yaml';
import { z } from 'zod';

const toolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  parameters: z.record(z.unknown()).optional(),
});

export const workerConfigSchema = z.object({
  name: z.string().min(1),
  inputTypes: z.array(z.string()).min(1),
  outputType: z.string().min(1),
  provider: z.object({
    name: z.string().min(1),
    model: z.string().min(1),
    apiKeyEnv: z.string().min(1),
  }),
  tools: z.array(toolSchema).optional().default([]),
  timeout: z.number().int().positive().optional().default(300),
  retries: z.number().int().nonnegative().optional().default(0),
  systemPrompt: z.string().optional(),
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export function validateWorkerConfig(config: unknown): WorkerConfig {
  const result = workerConfigSchema.safeParse(config);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const field = issue.path.join('.');
      return field ? `${field}: ${issue.message}` : issue.message;
    });
    throw new BadRequestException(messages.join('; '));
  }
  return result.data;
}

export function validateWorkerYaml(yamlString: string): WorkerConfig {
  let parsed: unknown;
  try {
    parsed = parse(yamlString);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BadRequestException(`Invalid YAML syntax: ${message}`);
  }
  return validateWorkerConfig(parsed);
}
```

**Step 4: Run tests to verify they pass**

```bash
cd apps/api && pnpm test -- worker-yaml.validator
```

Expected: all tests PASS

**Step 5: Run full test suite and checks**

```bash
cd apps/api && pnpm test && pnpm typecheck && pnpm lint
```

**Step 6: Commit**

```bash
git add apps/api/src/modules/workers/worker-yaml.validator.ts \
        apps/api/src/modules/workers/worker-yaml.validator.spec.ts \
        apps/api/package.json pnpm-lock.yaml
git commit -m "feat(workers): add YAML validator with Zod schema and full test coverage"
```
