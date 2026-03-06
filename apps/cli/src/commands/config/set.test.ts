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
const mockSet = mock(() => Promise.resolve());
const mockIsValidKey = mock((key: string) =>
  ['apiUrl', 'defaultPackageType', 'defaultAssemblyLine'].includes(key),
);

mock.module('../../lib/config.js', () => ({
  get: mock(() => Promise.resolve('')),
  set: mockSet,
  list: mock(() => Promise.resolve({})),
  initialize: mock(() => Promise.resolve()),
  isValidKey: mockIsValidKey,
  getConfigDir: () => '/home/test/.smithy',
  getConfigPath: () => '/home/test/.smithy/config.json',
}));

// Import after mocking
const { run } = await import('./set.js');

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
  mockSet.mockReset();
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

describe('config set - validation', () => {
  it('errors when no key is provided', async () => {
    await run({}, makeMockCmd());

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Key is required');
  });

  it('errors for unknown key', async () => {
    mockIsValidKey.mockReturnValue(false);
    await run({}, makeMockCmd(), 'unknownKey', 'value');

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Unknown config key');
    expect(stderr()).toContain('unknownKey');
  });

  it('errors when no value is provided', async () => {
    await run({}, makeMockCmd(), 'apiUrl');

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Value is required');
  });

  it('validates apiUrl must start with http:// or https://', async () => {
    await run({}, makeMockCmd(), 'apiUrl', 'not-a-url');

    expect(process.exitCode).toBe(1);
    expect(stderr()).toContain('Invalid apiUrl');
    expect(stderr()).toContain('http://');
    expect(stderr()).toContain('https://');
  });

  it('accepts http:// apiUrl', async () => {
    await run({}, makeMockCmd(), 'apiUrl', 'http://localhost:3000/api');

    expect(process.exitCode).toBe(0);
    expect(mockSet).toHaveBeenCalledWith('apiUrl', 'http://localhost:3000/api');
  });

  it('accepts https:// apiUrl', async () => {
    await run({}, makeMockCmd(), 'apiUrl', 'https://api.smithy.dev/v1');

    expect(process.exitCode).toBe(0);
    expect(mockSet).toHaveBeenCalledWith('apiUrl', 'https://api.smithy.dev/v1');
  });

  it('does not validate non-apiUrl keys', async () => {
    await run({}, makeMockCmd(), 'defaultPackageType', 'USER_INPUT');

    expect(process.exitCode).toBe(0);
    expect(mockSet).toHaveBeenCalledWith('defaultPackageType', 'USER_INPUT');
  });
});

// ---------------------------------------------------------------------------
// Normal mode
// ---------------------------------------------------------------------------

describe('config set - normal mode', () => {
  it('writes the value and confirms', async () => {
    await run({}, makeMockCmd(), 'apiUrl', 'http://localhost:9999');

    expect(process.exitCode).toBe(0);
    expect(mockSet).toHaveBeenCalledWith('apiUrl', 'http://localhost:9999');
    expect(stdout()).toContain('Set apiUrl = http://localhost:9999');
  });

  it('sets defaultAssemblyLine', async () => {
    await run({}, makeMockCmd(), 'defaultAssemblyLine', 'my-pipeline');

    expect(process.exitCode).toBe(0);
    expect(mockSet).toHaveBeenCalledWith('defaultAssemblyLine', 'my-pipeline');
    expect(stdout()).toContain('Set defaultAssemblyLine = my-pipeline');
  });
});

// ---------------------------------------------------------------------------
// JSON mode
// ---------------------------------------------------------------------------

describe('config set - JSON mode', () => {
  it('outputs key-value pair as JSON', async () => {
    await run({ json: true }, makeMockCmd(), 'apiUrl', 'http://localhost:9999');

    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(parsed.key).toBe('apiUrl');
    expect(parsed.value).toBe('http://localhost:9999');
  });
});

// ---------------------------------------------------------------------------
// Exit codes
// ---------------------------------------------------------------------------

describe('config set - exit codes', () => {
  it('exit code 0 on success', async () => {
    await run({}, makeMockCmd(), 'defaultPackageType', 'CODE');
    expect(process.exitCode).toBe(0);
  });

  it('exit code 1 on missing key', async () => {
    await run({}, makeMockCmd());
    expect(process.exitCode).toBe(1);
  });

  it('exit code 1 on invalid key', async () => {
    mockIsValidKey.mockReturnValue(false);
    await run({}, makeMockCmd(), 'badKey', 'value');
    expect(process.exitCode).toBe(1);
  });

  it('exit code 1 on missing value', async () => {
    await run({}, makeMockCmd(), 'apiUrl');
    expect(process.exitCode).toBe(1);
  });

  it('exit code 1 on invalid apiUrl', async () => {
    await run({}, makeMockCmd(), 'apiUrl', 'ftp://nope');
    expect(process.exitCode).toBe(1);
  });
});
