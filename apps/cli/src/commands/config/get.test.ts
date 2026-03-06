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
const mockGet = mock(() => Promise.resolve('http://localhost:3000/api'));
const mockIsValidKey = mock((key: string) =>
  ['apiUrl', 'defaultPackageType', 'defaultAssemblyLine'].includes(key),
);

mock.module('../../lib/config.js', () => ({
  get: mockGet,
  set: mock(() => Promise.resolve()),
  list: mock(() => Promise.resolve({})),
  initialize: mock(() => Promise.resolve()),
  isValidKey: mockIsValidKey,
  getConfigDir: () => '/home/test/.smithy',
  getConfigPath: () => '/home/test/.smithy/config.json',
}));

// Import after mocking
const { run } = await import('./get.js');

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
  mockGet.mockReset();
  mockIsValidKey.mockReset();
  mockIsValidKey.mockImplementation((key: string) =>
    ['apiUrl', 'defaultPackageType', 'defaultAssemblyLine'].includes(key),
  );
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  setJsonMode(false);
  process.exitCode = 0;
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('config get - validation', () => {
  it('errors when no key is provided', async () => {
    await run({}, makeMockCmd());

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Key is required');
  });

  it('errors for unknown key', async () => {
    mockIsValidKey.mockReturnValue(false);
    await run({}, makeMockCmd(), 'unknownKey');

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Unknown config key');
    expect(stderr()).toContain('unknownKey');
    expect(stderr()).toContain('apiUrl');
  });
});

// ---------------------------------------------------------------------------
// Normal mode
// ---------------------------------------------------------------------------

describe('config get - normal mode', () => {
  it('prints the value for a known key', async () => {
    mockGet.mockResolvedValue('http://custom:9000/api');

    await run({}, makeMockCmd(), 'apiUrl');

    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('http://custom:9000/api');
    expect(stdout()).not.toContain('(default)');
  });

  it('shows "(default)" note when value equals the default', async () => {
    mockGet.mockResolvedValue('http://localhost:3000/api');

    await run({}, makeMockCmd(), 'apiUrl');

    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('http://localhost:3000/api');
    expect(stdout()).toContain('(default)');
  });

  it('shows "(default)" for empty default values', async () => {
    mockGet.mockResolvedValue('');

    await run({}, makeMockCmd(), 'defaultPackageType');

    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('(default)');
  });

  it('shows custom value without default note', async () => {
    mockGet.mockResolvedValue('USER_INPUT');

    await run({}, makeMockCmd(), 'defaultPackageType');

    expect(process.exitCode).toBe(0);
    expect(stdout()).toContain('USER_INPUT');
    expect(stdout()).not.toContain('(default)');
  });
});

// ---------------------------------------------------------------------------
// JSON mode
// ---------------------------------------------------------------------------

describe('config get - JSON mode', () => {
  it('outputs key-value pair as JSON', async () => {
    mockGet.mockResolvedValue('http://custom:9000/api');

    await run({ json: true }, makeMockCmd(), 'apiUrl');

    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(parsed.key).toBe('apiUrl');
    expect(parsed.value).toBe('http://custom:9000/api');
  });
});

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

describe('config get - exit codes', () => {
  it('exit code 0 on success', async () => {
    mockGet.mockResolvedValue('value');

    await run({}, makeMockCmd(), 'apiUrl');
    expect(process.exitCode).toBe(0);
  });

  it('exit code 1 on missing key', async () => {
    await run({}, makeMockCmd());
    expect(process.exitCode).toBe(1);
  });

  it('exit code 1 on invalid key', async () => {
    mockIsValidKey.mockReturnValue(false);
    await run({}, makeMockCmd(), 'badKey');
    expect(process.exitCode).toBe(1);
  });
});
