import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from 'bun:test';
import { setJsonMode } from '../../lib/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let stdoutData: string[];
let stderrData: string[];
let stdoutSpy: ReturnType<typeof spyOn>;
let stderrSpy: ReturnType<typeof spyOn>;

function stdout(): string {
  return stdoutData.join('');
}

function stderr(): string {
  return stderrData.join('');
}

// Mock config module
const mockList = mock(() =>
  Promise.resolve({
    apiUrl: 'http://localhost:3000/api',
    defaultPackageType: '',
    defaultAssemblyLine: '',
  }),
);

mock.module('../../lib/config.js', () => ({
  get: mock(() => Promise.resolve('')),
  set: mock(() => Promise.resolve()),
  list: mockList,
  initialize: mock(() => Promise.resolve()),
  isValidKey: (key: string) =>
    ['apiUrl', 'defaultPackageType', 'defaultAssemblyLine'].includes(key),
  getConfigDir: () => '/home/test/.smithy',
  getConfigPath: () => '/home/test/.smithy/config.json',
}));

// Import after mocking
const { run } = await import('./list.js');

function makeMockCmd(opts: Record<string, unknown> = {}) {
  return { opts: () => opts } as any;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  stdoutData = [];
  stderrData = [];
  stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(
    (chunk: string | Uint8Array) => {
      stdoutData.push(String(chunk));
      return true;
    },
  );
  stderrSpy = spyOn(process.stderr, 'write').mockImplementation(
    (chunk: string | Uint8Array) => {
      stderrData.push(String(chunk));
      return true;
    },
  );
  setJsonMode(false);
  process.exitCode = 0;
  mockList.mockReset();
  mockList.mockResolvedValue({
    apiUrl: 'http://localhost:3000/api',
    defaultPackageType: '',
    defaultAssemblyLine: '',
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  setJsonMode(false);
  process.exitCode = 0;
});

// ---------------------------------------------------------------------------
// Normal mode
// ---------------------------------------------------------------------------

describe('config list - normal mode', () => {
  it('shows config file path as header', async () => {
    await run({}, makeMockCmd());

    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('Config file: /home/test/.smithy/config.json');
  });

  it('shows a table with Key and Value columns', async () => {
    await run({}, makeMockCmd());

    const out = stdout();
    expect(out).toContain('Key');
    expect(out).toContain('Value');
    expect(out).toContain('apiUrl');
    expect(out).toContain('http://localhost:3000/api');
    expect(out).toContain('defaultPackageType');
    expect(out).toContain('defaultAssemblyLine');
  });

  it('shows "(empty)" for empty values', async () => {
    await run({}, makeMockCmd());

    expect(stdout()).toContain('(empty)');
  });

  it('shows custom values', async () => {
    mockList.mockResolvedValue({
      apiUrl: 'https://api.smithy.dev',
      defaultPackageType: 'USER_INPUT',
      defaultAssemblyLine: 'my-line',
    });

    await run({}, makeMockCmd());

    const out = stdout();
    expect(out).toContain('https://api.smithy.dev');
    expect(out).toContain('USER_INPUT');
    expect(out).toContain('my-line');
    expect(out).not.toContain('(empty)');
  });
});

// ---------------------------------------------------------------------------
// JSON mode
// ---------------------------------------------------------------------------

describe('config list - JSON mode', () => {
  it('outputs all config values as JSON with path', async () => {
    await run({ json: true }, makeMockCmd());

    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(parsed.path).toBe('/home/test/.smithy/config.json');
    expect(parsed.apiUrl).toBe('http://localhost:3000/api');
    expect(parsed.defaultPackageType).toBe('');
    expect(parsed.defaultAssemblyLine).toBe('');
  });

  it('includes custom values in JSON output', async () => {
    mockList.mockResolvedValue({
      apiUrl: 'https://custom.api',
      defaultPackageType: 'CODE',
      defaultAssemblyLine: 'pipeline-1',
    });

    await run({ json: true }, makeMockCmd());

    const parsed = JSON.parse(stdout());
    expect(parsed.apiUrl).toBe('https://custom.api');
    expect(parsed.defaultPackageType).toBe('CODE');
    expect(parsed.defaultAssemblyLine).toBe('pipeline-1');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('config list - error handling', () => {
  it('handles errors from config.list()', async () => {
    mockList.mockRejectedValue(new Error('Permission denied'));

    await run({}, makeMockCmd());

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Failed to read config');
    expect(stderr()).toContain('Permission denied');
  });
});

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

describe('config list - exit codes', () => {
  it('exit code 0 on success', async () => {
    await run({}, makeMockCmd());
    expect(process.exitCode).toBe(0);
  });

  it('exit code 1 on error', async () => {
    mockList.mockRejectedValue(new Error('fail'));
    await run({}, makeMockCmd());
    expect(process.exitCode).toBe(1);
  });
});
