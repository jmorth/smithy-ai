import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Package, WorkerContext, PackageOutput } from '@smithy/shared';
import { SmithyWorker } from './base-worker.js';
import {
  loadYamlConfig,
  loadWorkerClass,
  readEnvVars,
  createLogger,
  run,
  InvalidWorkerError,
  EXIT_CODES,
} from './runner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validYaml(): string {
  return `
name: test-worker
timeout: 60
ai:
  name: anthropic
  model: claude-sonnet-4-20250514
  apiKeyEnv: ANTHROPIC_API_KEY
`;
}

function writeYaml(dir: string, content: string): string {
  const filePath = path.join(dir, 'worker.yaml');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/** Creates a temp directory with a valid YAML config. Returns [tmpDir, configPath]. */
function setupTmpConfig(yamlContent?: string): [string, string] {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-'));
  const configPath = writeYaml(tmpDir, yamlContent ?? validYaml());
  return [tmpDir, configPath];
}

/** Creates a temp worker module that extends SmithyWorker. */
function createWorkerModule(
  dir: string,
  {
    onReceive,
    onProcess,
    onComplete,
    onError,
  }: {
    onReceive?: string;
    onProcess?: string;
    onComplete?: string;
    onError?: string;
  } = {},
): string {
  const filePath = path.join(dir, 'worker.mjs');
  const code = `
import { SmithyWorker } from '${path.resolve('src/base-worker.js')}';

export default class TestWorker extends SmithyWorker {
  async onReceive(pkg) {
    ${onReceive ?? ''}
  }
  async onProcess(context) {
    ${
      onProcess ??
      `return {
        type: 'test-output',
        files: [{ filename: 'out.txt', content: 'hello', mimeType: 'text/plain' }],
        metadata: { result: 'ok' },
      };`
    }
  }
  ${onComplete ? `async onComplete(output) { ${onComplete} }` : ''}
  ${onError ? `async onError(error) { ${onError} }` : ''}
}
`;
  fs.writeFileSync(filePath, code, 'utf-8');
  return filePath;
}

/** Creates a module that does NOT extend SmithyWorker. */
function createNonWorkerModule(dir: string): string {
  const filePath = path.join(dir, 'bad-worker.mjs');
  fs.writeFileSync(
    filePath,
    'export default class NotAWorker { doStuff() {} }',
    'utf-8',
  );
  return filePath;
}

/** Creates a module with no class export. */
function createNoClassModule(dir: string): string {
  const filePath = path.join(dir, 'no-class.mjs');
  fs.writeFileSync(filePath, 'export const config = { x: 1 };', 'utf-8');
  return filePath;
}

function setRequiredEnvVars() {
  process.env.SMITHY_JOB_ID = 'job-123';
  process.env.SMITHY_PACKAGE_ID = 'pkg-456';
  process.env.SMITHY_WORKER_ID = 'wkr-789';
  process.env.SMITHY_API_URL = 'http://localhost:3000';
  process.env.SMITHY_API_KEY = 'test-key';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
}

function clearEnvVars() {
  delete process.env.SMITHY_JOB_ID;
  delete process.env.SMITHY_PACKAGE_ID;
  delete process.env.SMITHY_WORKER_ID;
  delete process.env.SMITHY_API_URL;
  delete process.env.SMITHY_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.SMITHY_PACKAGE_METADATA;
}

// Mock fetch globally for API client calls
let fetchSpy: Mock;

// ---------------------------------------------------------------------------
// Tests: loadYamlConfig
// ---------------------------------------------------------------------------

describe('loadYamlConfig', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses a valid YAML config', () => {
    [tmpDir] = setupTmpConfig();
    const configPath = path.join(tmpDir, 'worker.yaml');
    const config = loadYamlConfig(configPath);

    expect(config.name).toBe('test-worker');
    expect(config.timeout).toBe(60);
    expect(config.ai.name).toBe('anthropic');
    expect(config.ai.model).toBe('claude-sonnet-4-20250514');
    expect(config.ai.apiKeyEnv).toBe('ANTHROPIC_API_KEY');
  });

  it('parses config without timeout', () => {
    const yaml = `
name: no-timeout-worker
ai:
  name: openai
  model: gpt-4o
  apiKeyEnv: OPENAI_API_KEY
`;
    [tmpDir] = setupTmpConfig(yaml);
    const configPath = path.join(tmpDir, 'worker.yaml');
    const config = loadYamlConfig(configPath);

    expect(config.name).toBe('no-timeout-worker');
    expect(config.timeout).toBeUndefined();
  });

  it('throws on missing file', () => {
    expect(() => loadYamlConfig('/nonexistent/path/worker.yaml')).toThrow();
  });

  it('throws on missing name field', () => {
    const yaml = `
ai:
  name: anthropic
  model: claude-sonnet-4-20250514
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    [tmpDir] = setupTmpConfig(yaml);
    const configPath = path.join(tmpDir, 'worker.yaml');
    expect(() => loadYamlConfig(configPath)).toThrow('missing required field: name');
  });

  it('throws on missing ai field', () => {
    const yaml = 'name: test\n';
    [tmpDir] = setupTmpConfig(yaml);
    const configPath = path.join(tmpDir, 'worker.yaml');
    expect(() => loadYamlConfig(configPath)).toThrow('missing required field: ai');
  });

  it('throws on incomplete ai section', () => {
    const yaml = `
name: test
ai:
  name: anthropic
`;
    [tmpDir] = setupTmpConfig(yaml);
    const configPath = path.join(tmpDir, 'worker.yaml');
    expect(() => loadYamlConfig(configPath)).toThrow(
      'ai section must include: name, model, apiKeyEnv',
    );
  });

  it('throws on non-object YAML content', () => {
    const yaml = '"just a string"';
    [tmpDir] = setupTmpConfig(yaml);
    const configPath = path.join(tmpDir, 'worker.yaml');
    expect(() => loadYamlConfig(configPath)).toThrow('expected an object');
  });
});

// ---------------------------------------------------------------------------
// Tests: loadWorkerClass
// ---------------------------------------------------------------------------

describe('loadWorkerClass', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-worker-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a valid worker class (default export)', async () => {
    const modulePath = createWorkerModule(tmpDir);
    const WorkerClass = await loadWorkerClass(modulePath);

    expect(typeof WorkerClass).toBe('function');
    const instance = new WorkerClass();
    expect(instance).toBeInstanceOf(SmithyWorker);
  });

  it('throws InvalidWorkerError for non-SmithyWorker class', async () => {
    const modulePath = createNonWorkerModule(tmpDir);
    await expect(loadWorkerClass(modulePath)).rejects.toThrow(
      InvalidWorkerError,
    );
    await expect(loadWorkerClass(modulePath)).rejects.toThrow(
      'does not extend SmithyWorker',
    );
  });

  it('throws InvalidWorkerError when module exports no class', async () => {
    const modulePath = createNoClassModule(tmpDir);
    await expect(loadWorkerClass(modulePath)).rejects.toThrow(
      InvalidWorkerError,
    );
    await expect(loadWorkerClass(modulePath)).rejects.toThrow(
      'does not export a class',
    );
  });

  it('throws on non-existent module', async () => {
    await expect(
      loadWorkerClass('/nonexistent/module.ts'),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: readEnvVars
// ---------------------------------------------------------------------------

describe('readEnvVars', () => {
  beforeEach(() => clearEnvVars());
  afterEach(() => clearEnvVars());

  it('reads all required environment variables', () => {
    process.env.SMITHY_JOB_ID = 'j1';
    process.env.SMITHY_PACKAGE_ID = 'p1';
    process.env.SMITHY_WORKER_ID = 'w1';

    const env = readEnvVars();
    expect(env).toEqual({ jobId: 'j1', packageId: 'p1', workerId: 'w1' });
  });

  it('throws when SMITHY_JOB_ID is missing', () => {
    process.env.SMITHY_PACKAGE_ID = 'p1';
    process.env.SMITHY_WORKER_ID = 'w1';
    expect(() => readEnvVars()).toThrow('SMITHY_JOB_ID');
  });

  it('throws when SMITHY_PACKAGE_ID is missing', () => {
    process.env.SMITHY_JOB_ID = 'j1';
    process.env.SMITHY_WORKER_ID = 'w1';
    expect(() => readEnvVars()).toThrow('SMITHY_PACKAGE_ID');
  });

  it('throws when SMITHY_WORKER_ID is missing', () => {
    process.env.SMITHY_JOB_ID = 'j1';
    process.env.SMITHY_PACKAGE_ID = 'p1';
    expect(() => readEnvVars()).toThrow('SMITHY_WORKER_ID');
  });
});

// ---------------------------------------------------------------------------
// Tests: createLogger
// ---------------------------------------------------------------------------

describe('createLogger', () => {
  it('creates a logger with all four methods', () => {
    const logger = createLogger('job-1', 'worker-1');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('does not throw when logging', () => {
    const logger = createLogger('job-1', 'worker-1');
    expect(() => logger.info('test message')).not.toThrow();
    expect(() => logger.warn('test warning', { extra: true })).not.toThrow();
    expect(() => logger.error('test error')).not.toThrow();
    expect(() => logger.debug('test debug')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: run (integration)
// ---------------------------------------------------------------------------

describe('run', () => {
  let tmpDir: string;
  let configPath: string;
  let workerPath: string;
  let inputDir: string;
  let exitCode: number | undefined;
  const exitMock = vi.fn((code: number) => {
    exitCode = code;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    clearEnvVars();
    exitCode = undefined;
    exitMock.mockClear();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-run-test-'));
    configPath = writeYaml(tmpDir, validYaml());
    workerPath = createWorkerModule(tmpDir);
    inputDir = path.join(tmpDir, 'input');
    fs.mkdirSync(inputDir);
    fs.writeFileSync(path.join(inputDir, 'data.txt'), 'test input data');

    setRequiredEnvVars();

    // Mock global fetch for API client
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'ok', packageId: 'out-pkg-1' }),
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    clearEnvVars();
    vi.unstubAllGlobals();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('happy path: runs full lifecycle and exits with code 0', async () => {
    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);

    // Should have called fetch for:
    // 1. updateStatus(RUNNING)
    // 2. createOutputPackage
    // 3. updateStatus(COMPLETED)
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // First call: updateStatus(RUNNING)
    const firstCall = fetchSpy.mock.calls[0]!;
    expect(firstCall[0]).toContain('/api/jobs/job-123/status');
    expect(JSON.parse(firstCall[1].body)).toEqual({ state: 'RUNNING' });

    // Last call: updateStatus(COMPLETED)
    const lastCall = fetchSpy.mock.calls[2]!;
    expect(lastCall[0]).toContain('/api/jobs/job-123/status');
    expect(JSON.parse(lastCall[1].body)).toEqual({ state: 'COMPLETED' });
  });

  it('calls onReceive with a package object', async () => {
    let receivedPkg: unknown;
    const workerModulePath = createWorkerModule(tmpDir, {
      onReceive: 'globalThis.__testReceivedPkg = pkg;',
    });

    await run({
      configPath,
      workerModulePath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
  });

  it('submits output files to API via createOutputPackage', async () => {
    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    // Second call is createOutputPackage
    const outputCall = fetchSpy.mock.calls[1]!;
    expect(outputCall[0]).toContain('/api/jobs/job-123/output');
    const body = JSON.parse(outputCall[1].body);
    expect(body.files).toHaveLength(1);
    expect(body.files[0].filename).toBe('out.txt');
    expect(body.metadata).toEqual({ result: 'ok' });
  });

  it('exits with code 1 when onProcess throws', async () => {
    const failWorkerPath = createWorkerModule(tmpDir, {
      onProcess: 'throw new Error("process failed");',
      onError: '// swallow error',
    });

    await run({
      configPath,
      workerModulePath: failWorkerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);

    // Should have updated status to ERROR
    const errorStatusCall = fetchSpy.mock.calls.find((call) => {
      if (!call[1]?.body) return false;
      const body = JSON.parse(call[1].body);
      return body.state === 'ERROR';
    });
    expect(errorStatusCall).toBeTruthy();
  });

  it('exits with code 1 when onReceive throws', async () => {
    const failWorkerPath = createWorkerModule(tmpDir, {
      onReceive: 'throw new Error("receive failed");',
      onError: '// swallow error',
    });

    await run({
      configPath,
      workerModulePath: failWorkerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);
  });

  it('calls worker.onError when lifecycle throws', async () => {
    const onErrorCalled = false;
    const failWorkerPath = createWorkerModule(tmpDir, {
      onProcess: 'throw new Error("kaboom");',
      onError: 'globalThis.__testOnErrorCalled = true;',
    });

    await run({
      configPath,
      workerModulePath: failWorkerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);
  });

  it('exits with code 2 for invalid worker module (not extending SmithyWorker)', async () => {
    const badWorkerPath = createNonWorkerModule(tmpDir);

    await run({
      configPath,
      workerModulePath: badWorkerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.INVALID_WORKER);
  });

  it('exits with code 1 when config file is missing', async () => {
    await run({
      configPath: '/nonexistent/worker.yaml',
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);
  });

  it('exits with code 1 when env vars are missing', async () => {
    delete process.env.SMITHY_JOB_ID;

    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);
  });

  it('exits with code 1 when API client env vars are missing', async () => {
    delete process.env.SMITHY_API_URL;

    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);
  });

  it('parses SMITHY_PACKAGE_METADATA env var as JSON', async () => {
    process.env.SMITHY_PACKAGE_METADATA = JSON.stringify({ source: 'test' });

    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
  });

  it('uses empty metadata when SMITHY_PACKAGE_METADATA is not set', async () => {
    delete process.env.SMITHY_PACKAGE_METADATA;

    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
  });

  it('handles timeout configuration', async () => {
    vi.useFakeTimers();

    // Create a worker that takes a long time
    const slowWorkerPath = createWorkerModule(tmpDir, {
      onProcess: `
        return new Promise((resolve) => {
          setTimeout(() => resolve({
            type: 'test',
            files: [],
            metadata: {},
          }), 120000);
        });
      `,
    });

    // Use a short timeout config
    const shortTimeoutYaml = `
name: slow-worker
timeout: 1
ai:
  name: anthropic
  model: claude-sonnet-4-20250514
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    const shortConfigPath = writeYaml(
      fs.mkdtempSync(path.join(os.tmpdir(), 'runner-timeout-')),
      shortTimeoutYaml,
    );

    const runPromise = run({
      configPath: shortConfigPath,
      workerModulePath: slowWorkerPath,
      inputDir,
      exit: exitMock,
    });

    // Advance past the 1-second timeout
    await vi.advanceTimersByTimeAsync(1500);

    // The timeout handler should have called exit with code 124
    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.TIMEOUT);

    vi.useRealTimers();
  });

  it('updates job status to RUNNING on startup', async () => {
    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    const firstStatusCall = fetchSpy.mock.calls[0]!;
    expect(firstStatusCall[0]).toContain('/api/jobs/job-123/status');
    expect(firstStatusCall[1].method).toBe('PUT');
    expect(JSON.parse(firstStatusCall[1].body)).toEqual({ state: 'RUNNING' });
  });

  it('handles worker module import failure (non-InvalidWorkerError)', async () => {
    await run({
      configPath,
      workerModulePath: '/nonexistent/worker.mjs',
      inputDir,
      exit: exitMock,
    });

    // Dynamic import of non-existent file throws a generic error, not InvalidWorkerError
    // So it should exit with RUNTIME_ERROR, not INVALID_WORKER
    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);
  });

  it('config without timeout does not set timer', async () => {
    const noTimeoutYaml = `
name: no-timeout
ai:
  name: anthropic
  model: claude-sonnet-4-20250514
  apiKeyEnv: ANTHROPIC_API_KEY
`;
    const noTimeoutConfigPath = writeYaml(
      fs.mkdtempSync(path.join(os.tmpdir(), 'runner-no-timeout-')),
      noTimeoutYaml,
    );

    await run({
      configPath: noTimeoutConfigPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
  });
});

// ---------------------------------------------------------------------------
// Tests: InvalidWorkerError
// ---------------------------------------------------------------------------

describe('InvalidWorkerError', () => {
  it('has correct name property', () => {
    const error = new InvalidWorkerError('test message');
    expect(error.name).toBe('InvalidWorkerError');
  });

  it('has correct message', () => {
    const error = new InvalidWorkerError('specific error message');
    expect(error.message).toBe('specific error message');
  });

  it('is an instance of Error', () => {
    const error = new InvalidWorkerError('test');
    expect(error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// Tests: EXIT_CODES
// ---------------------------------------------------------------------------

describe('EXIT_CODES', () => {
  it('has correct values', () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
    expect(EXIT_CODES.RUNTIME_ERROR).toBe(1);
    expect(EXIT_CODES.INVALID_WORKER).toBe(2);
    expect(EXIT_CODES.TIMEOUT).toBe(124);
  });
});

// ---------------------------------------------------------------------------
// Tests: process-level error handlers
// ---------------------------------------------------------------------------

describe('process-level error handlers', () => {
  let tmpDir: string;
  let configPath: string;
  let inputDir: string;
  const exitMock = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    clearEnvVars();
    exitMock.mockClear();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-proc-test-'));
    configPath = writeYaml(tmpDir, validYaml());
    inputDir = path.join(tmpDir, 'input');
    fs.mkdirSync(inputDir);

    setRequiredEnvVars();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: 'ok', packageId: 'p1' }),
      }),
    );
  });

  afterEach(() => {
    clearEnvVars();
    vi.unstubAllGlobals();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers uncaughtException handler during run', async () => {
    const processSpy = vi.spyOn(process, 'on');
    const workerPath = createWorkerModule(tmpDir);

    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    const uncaughtCalls = processSpy.mock.calls.filter(
      ([event]) => event === 'uncaughtException',
    );
    expect(uncaughtCalls.length).toBeGreaterThan(0);
  });

  it('registers unhandledRejection handler during run', async () => {
    const processSpy = vi.spyOn(process, 'on');
    const workerPath = createWorkerModule(tmpDir);

    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    const rejectionCalls = processSpy.mock.calls.filter(
      ([event]) => event === 'unhandledRejection',
    );
    expect(rejectionCalls.length).toBeGreaterThan(0);
  });

  it('cleans up event handlers after successful run', async () => {
    const removeSpy = vi.spyOn(process, 'removeListener');
    const workerPath = createWorkerModule(tmpDir);

    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    const uncaughtRemovals = removeSpy.mock.calls.filter(
      ([event]) => event === 'uncaughtException',
    );
    const rejectionRemovals = removeSpy.mock.calls.filter(
      ([event]) => event === 'unhandledRejection',
    );
    expect(uncaughtRemovals.length).toBeGreaterThan(0);
    expect(rejectionRemovals.length).toBeGreaterThan(0);
  });

  it('cleans up event handlers after failed run', async () => {
    const removeSpy = vi.spyOn(process, 'removeListener');
    const failWorkerPath = createWorkerModule(tmpDir, {
      onProcess: 'throw new Error("fail");',
      onError: '// swallow',
    });

    await run({
      configPath,
      workerModulePath: failWorkerPath,
      inputDir,
      exit: exitMock,
    });

    const uncaughtRemovals = removeSpy.mock.calls.filter(
      ([event]) => event === 'uncaughtException',
    );
    expect(uncaughtRemovals.length).toBeGreaterThan(0);
  });

  it('invokes onUncaughtException handler which calls exit with RUNTIME_ERROR', async () => {
    const processSpy = vi.spyOn(process, 'on');
    // Use a slow worker so we can intercept the handler before run completes
    const slowWorkerPath = createWorkerModule(tmpDir, {
      onProcess: `
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          type: 'test-output',
          files: [{ filename: 'out.txt', content: 'hello', mimeType: 'text/plain' }],
          metadata: {},
        };
      `,
    });

    // Start run but don't await — we want to trigger the uncaught exception handler
    const runPromise = run({
      configPath,
      workerModulePath: slowWorkerPath,
      inputDir,
      exit: exitMock,
    });

    // Wait for the handler to be registered
    await new Promise(resolve => setTimeout(resolve, 10));

    // Extract the registered uncaughtException handler
    const uncaughtCalls = processSpy.mock.calls.filter(
      ([event]) => event === 'uncaughtException',
    );
    if (uncaughtCalls.length > 0) {
      const handler = uncaughtCalls[0]![1] as (error: Error) => Promise<void>;
      await handler(new Error('simulated uncaught'));
    }

    await runPromise;

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);
  });

  it('invokes onUnhandledRejection handler which calls exit with RUNTIME_ERROR', async () => {
    const processSpy = vi.spyOn(process, 'on');
    const slowWorkerPath = createWorkerModule(tmpDir, {
      onProcess: `
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          type: 'test-output',
          files: [{ filename: 'out.txt', content: 'hello', mimeType: 'text/plain' }],
          metadata: {},
        };
      `,
    });

    const runPromise = run({
      configPath,
      workerModulePath: slowWorkerPath,
      inputDir,
      exit: exitMock,
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    // Extract the registered unhandledRejection handler
    const rejectionCalls = processSpy.mock.calls.filter(
      ([event]) => event === 'unhandledRejection',
    );
    if (rejectionCalls.length > 0) {
      const handler = rejectionCalls[0]![1] as (reason: unknown) => Promise<void>;
      // Test with non-Error reason to cover the String coercion path
      await handler('string rejection reason');
    }

    await runPromise;

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);
  });
});

// ---------------------------------------------------------------------------
// Tests: reportError edge cases
// ---------------------------------------------------------------------------

describe('reportError edge cases', () => {
  let tmpDir: string;
  let configPath: string;
  let inputDir: string;
  let fetchSpy: Mock;
  const exitMock = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    clearEnvVars();
    exitMock.mockClear();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-report-test-'));
    configPath = writeYaml(tmpDir, validYaml());
    inputDir = path.join(tmpDir, 'input');
    fs.mkdirSync(inputDir);

    setRequiredEnvVars();
  });

  afterEach(() => {
    clearEnvVars();
    vi.unstubAllGlobals();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles worker.onError that does not re-throw', async () => {
    // Worker with a custom onError that doesn't re-throw
    const workerPath = createWorkerModule(tmpDir, {
      onProcess: 'throw new Error("process failed");',
      onError: '/* swallow the error, do not re-throw */',
    });

    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'ok', packageId: 'p1' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);
  });

  it('handles apiClient.updateStatus failure during error reporting', async () => {
    const workerPath = createWorkerModule(tmpDir, {
      onProcess: 'throw new Error("process failed");',
      onError: '/* swallow */',
    });

    let callCount = 0;
    fetchSpy = vi.fn().mockImplementation(() => {
      callCount++;
      // First call is updateStatus(RUNNING) — succeeds
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'ok' }),
        });
      }
      // Second call is updateStatus(ERROR) — fails
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'server down',
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    await run({
      configPath,
      workerModulePath: workerPath,
      inputDir,
      exit: exitMock,
    });

    // Should still exit with RUNTIME_ERROR despite the status update failure
    expect(exitMock).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);
  });
});
