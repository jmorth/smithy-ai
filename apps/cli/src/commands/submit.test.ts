import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from 'bun:test';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setJsonMode } from '../lib/output.js';
import { resetBaseUrl } from '../lib/api-client.js';

// ---------------------------------------------------------------------------
// Mock @inquirer/prompts before importing the command
// ---------------------------------------------------------------------------

const mockInput = mock((): Promise<string> => Promise.resolve(''));
mock.module('@inquirer/prompts', () => ({
  input: mockInput,
}));

// Import after mocking
import {
  run,
  parseMetadataFlags,
  validateFiles,
  promptForMetadata,
} from './submit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let fetchSpy: ReturnType<typeof spyOn>;
let stdoutData: string[];
let stderrData: string[];
let stdoutSpy: ReturnType<typeof spyOn>;
let stderrSpy: ReturnType<typeof spyOn>;
let tmpDir: string;
let originalIsTTY: boolean | undefined;

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `smithy-submit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function mockFetchResponse(body: unknown, status = 200) {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchError(
  status: number,
  body?: { message?: string; details?: Record<string, string[]> },
) {
  if (body) {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } else {
    fetchSpy.mockResolvedValueOnce(
      new Response('error', { status, statusText: 'Error' }),
    );
  }
}

function nthFetchCall(n: number): { url: string; init: RequestInit } {
  const call = fetchSpy.mock.calls[n];
  return { url: call[0] as string, init: call[1] as RequestInit };
}

const MOCK_PACKAGE = {
  id: 'pkg-123',
  type: 'review',
  status: 'PENDING',
  metadata: {},
  createdAt: '2026-03-06T00:00:00Z',
  updatedAt: '2026-03-06T00:00:00Z',
};

function makeMockCmd(opts: Record<string, unknown> = {}) {
  return { opts: () => opts } as any;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = makeTmpDir();
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
  fetchSpy = spyOn(globalThis, 'fetch');
  resetBaseUrl();
  setJsonMode(false);
  process.exitCode = 0;
  originalIsTTY = process.stdin.isTTY;
  // Default: non-interactive (not a TTY)
  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  mockInput.mockReset();
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  fetchSpy.mockRestore();
  rmSync(tmpDir, { recursive: true, force: true });
  setJsonMode(false);
  process.exitCode = 0;
  Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
});

// ---------------------------------------------------------------------------
// parseMetadataFlags
// ---------------------------------------------------------------------------

describe('parseMetadataFlags', () => {
  it('parses valid key=value pairs', () => {
    const result = parseMetadataFlags(['name=John', 'pr=42']);
    expect(result).toEqual({ name: 'John', pr: '42' });
  });

  it('handles values containing equals signs', () => {
    const result = parseMetadataFlags(['formula=a=b+c']);
    expect(result).toEqual({ formula: 'a=b+c' });
  });

  it('handles empty value', () => {
    const result = parseMetadataFlags(['key=']);
    expect(result).toEqual({ key: '' });
  });

  it('throws on missing equals sign', () => {
    expect(() => parseMetadataFlags(['noequals'])).toThrow(
      'Invalid metadata format',
    );
  });

  it('throws on equals as first character', () => {
    expect(() => parseMetadataFlags(['=value'])).toThrow(
      'Invalid metadata format',
    );
  });

  it('handles empty array', () => {
    expect(parseMetadataFlags([])).toEqual({});
  });

  it('overwrites duplicate keys', () => {
    const result = parseMetadataFlags(['key=first', 'key=second']);
    expect(result).toEqual({ key: 'second' });
  });
});

// ---------------------------------------------------------------------------
// validateFiles
// ---------------------------------------------------------------------------

describe('validateFiles', () => {
  it('resolves existing file paths', () => {
    const filePath = join(tmpDir, 'test.txt');
    writeFileSync(filePath, 'hello');
    const resolved = validateFiles([filePath]);
    expect(resolved).toEqual([filePath]);
  });

  it('throws for non-existent files', () => {
    expect(() => validateFiles([join(tmpDir, 'missing.txt')])).toThrow(
      'File not found',
    );
  });

  it('resolves multiple files', () => {
    const f1 = join(tmpDir, 'a.txt');
    const f2 = join(tmpDir, 'b.txt');
    writeFileSync(f1, 'a');
    writeFileSync(f2, 'b');
    const resolved = validateFiles([f1, f2]);
    expect(resolved).toHaveLength(2);
  });

  it('throws on first missing file', () => {
    const f1 = join(tmpDir, 'exists.txt');
    writeFileSync(f1, 'ok');
    expect(() =>
      validateFiles([f1, join(tmpDir, 'nope.txt')]),
    ).toThrow('File not found');
  });
});

// ---------------------------------------------------------------------------
// promptForMetadata
// ---------------------------------------------------------------------------

describe('promptForMetadata', () => {
  it('collects key-value pairs until blank key', async () => {
    mockInput
      .mockResolvedValueOnce('name')
      .mockResolvedValueOnce('John')
      .mockResolvedValueOnce('env')
      .mockResolvedValueOnce('prod')
      .mockResolvedValueOnce('');

    const result = await promptForMetadata();
    expect(result).toEqual({ name: 'John', env: 'prod' });
  });

  it('returns empty object when first key is blank', async () => {
    mockInput.mockResolvedValueOnce('');
    const result = await promptForMetadata();
    expect(result).toEqual({});
  });

  it('trims whitespace from keys', async () => {
    mockInput
      .mockResolvedValueOnce('  key  ')
      .mockResolvedValueOnce('value')
      .mockResolvedValueOnce('');

    const result = await promptForMetadata();
    expect(result).toEqual({ key: 'value' });
  });
});

// ---------------------------------------------------------------------------
// run() - argument validation
// ---------------------------------------------------------------------------

describe('run - validation', () => {
  it('errors when no type argument is provided', async () => {
    await run({}, makeMockCmd({ line: 'test-line' }));
    expect(process.exitCode).toBe(1);
    expect(stderrData.join('')).toContain('Package type is required');
  });

  it('errors when both --line and --pool are provided', async () => {
    await run({}, makeMockCmd({ line: 'l', pool: 'p' }), 'review');
    expect(process.exitCode).toBe(1);
    expect(stderrData.join('')).toContain('Cannot specify both');
  });

  it('errors when neither --line nor --pool and no default config', async () => {
    // Mock config.get to return empty string
    const configModule = await import('../lib/config.js');
    const configSpy = spyOn(configModule, 'get').mockResolvedValueOnce('');

    await run({}, makeMockCmd({}), 'review');
    expect(process.exitCode).toBe(1);
    expect(stderrData.join('')).toContain('Must specify --line');

    configSpy.mockRestore();
  });

  it('errors on invalid metadata format', async () => {
    await run(
      {},
      makeMockCmd({ line: 'test-line', metadata: ['bad-format'] }),
      'review',
    );
    expect(process.exitCode).toBe(1);
    expect(stderrData.join('')).toContain('Invalid metadata format');
  });

  it('errors on non-existent file', async () => {
    await run(
      {},
      makeMockCmd({
        line: 'test-line',
        file: [join(tmpDir, 'missing.txt')],
      }),
      'review',
    );
    expect(process.exitCode).toBe(1);
    expect(stderrData.join('')).toContain('File not found');
  });
});

// ---------------------------------------------------------------------------
// run() - default assembly line from config
// ---------------------------------------------------------------------------

describe('run - default assembly line', () => {
  it('uses defaultAssemblyLine from config when no --line/--pool', async () => {
    const configModule = await import('../lib/config.js');
    const configSpy = spyOn(configModule, 'get').mockResolvedValueOnce(
      'default-line',
    );

    mockFetchResponse(MOCK_PACKAGE, 201);

    await run({}, makeMockCmd({}), 'review');
    expect(process.exitCode).toBe(0);

    const { url, init } = nthFetchCall(0);
    expect(url).toContain('/assembly-lines/default-line/packages');
    expect(init.method).toBe('POST');

    configSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// run() - assembly line submission
// ---------------------------------------------------------------------------

describe('run - assembly line submission', () => {
  it('submits to assembly line with type and metadata', async () => {
    mockFetchResponse(MOCK_PACKAGE, 201);

    await run(
      {},
      makeMockCmd({
        line: 'review-line',
        metadata: ['pr=42', 'branch=main'],
      }),
      'review',
    );

    expect(process.exitCode).toBe(0);

    const { url, init } = nthFetchCall(0);
    expect(url).toContain('/assembly-lines/review-line/packages');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('review');
    expect(body.metadata).toEqual({ pr: '42', branch: 'main' });
  });

  it('displays package info on success', async () => {
    mockFetchResponse(MOCK_PACKAGE, 201);

    await run({}, makeMockCmd({ line: 'test-line' }), 'review');

    const output = stdoutData.join('');
    expect(output).toContain('pkg-123');
    expect(output).toContain('review');
    expect(output).toContain('Assembly Line');
    expect(output).toContain('test-line');
  });

  it('outputs JSON when --json flag is set', async () => {
    mockFetchResponse(MOCK_PACKAGE, 201);

    await run({ json: true }, makeMockCmd({ line: 'test-line' }), 'review');

    expect(process.exitCode).toBe(0);
    const output = stdoutData.join('');
    const parsed = JSON.parse(output);
    expect(parsed.id).toBe('pkg-123');
    expect(parsed.type).toBe('review');
  });
});

// ---------------------------------------------------------------------------
// run() - worker pool submission
// ---------------------------------------------------------------------------

describe('run - worker pool submission', () => {
  it('submits to worker pool with --pool flag', async () => {
    mockFetchResponse(MOCK_PACKAGE, 201);

    await run({}, makeMockCmd({ pool: 'summarize-pool' }), 'summarize');

    expect(process.exitCode).toBe(0);

    const { url } = nthFetchCall(0);
    expect(url).toContain('/worker-pools/summarize-pool/packages');
  });

  it('displays Worker Pool target on success', async () => {
    mockFetchResponse(MOCK_PACKAGE, 201);

    await run({}, makeMockCmd({ pool: 'test-pool' }), 'review');

    const output = stdoutData.join('');
    expect(output).toContain('Worker Pool');
    expect(output).toContain('test-pool');
  });
});

// ---------------------------------------------------------------------------
// run() - file upload
// ---------------------------------------------------------------------------

describe('run - file upload', () => {
  it('uploads files via presign/PUT/confirm flow', async () => {
    const filePath = join(tmpDir, 'test.txt');
    writeFileSync(filePath, 'file content here');

    // 1. Submit to assembly line
    mockFetchResponse(MOCK_PACKAGE, 201);
    // 2. Presign
    mockFetchResponse({
      uploadUrl: 'https://s3.example.com/presigned-url',
      fileKey: 'packages/pkg-123/abc/test.txt',
    });
    // 3. PUT to presigned URL
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    // 4. Confirm
    mockFetchResponse(
      {
        id: 'file-1',
        packageId: 'pkg-123',
        fileKey: 'packages/pkg-123/abc/test.txt',
        filename: 'test.txt',
        mimeType: 'text/plain;charset=utf-8',
        sizeBytes: 17,
        createdAt: '2026-03-06T00:00:00Z',
      },
      201,
    );

    await run(
      {},
      makeMockCmd({
        line: 'review-line',
        file: [filePath],
      }),
      'review',
    );

    expect(process.exitCode).toBe(0);

    // Verify 4 fetch calls were made
    expect(fetchSpy.mock.calls).toHaveLength(4);

    // Verify presign call
    const presign = nthFetchCall(1);
    expect(presign.url).toContain('/packages/pkg-123/files/presign');
    const presignBody = JSON.parse(presign.init.body as string);
    expect(presignBody.filename).toBe('test.txt');

    // Verify PUT to presigned URL
    const put = nthFetchCall(2);
    expect(put.url).toBe('https://s3.example.com/presigned-url');
    expect(put.init.method).toBe('PUT');

    // Verify confirm call
    const confirm = nthFetchCall(3);
    expect(confirm.url).toContain('/packages/pkg-123/files/confirm');
    const confirmBody = JSON.parse(confirm.init.body as string);
    expect(confirmBody.fileKey).toBe('packages/pkg-123/abc/test.txt');
    expect(confirmBody.filename).toBe('test.txt');
  });

  it('uploads multiple files sequentially', async () => {
    const f1 = join(tmpDir, 'a.txt');
    const f2 = join(tmpDir, 'b.txt');
    writeFileSync(f1, 'aaa');
    writeFileSync(f2, 'bbb');

    // Submit
    mockFetchResponse(MOCK_PACKAGE, 201);

    // File 1: presign, upload, confirm
    mockFetchResponse({ uploadUrl: 'https://s3.example.com/url1', fileKey: 'key1' });
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockFetchResponse({ id: 'f1' }, 201);

    // File 2: presign, upload, confirm
    mockFetchResponse({ uploadUrl: 'https://s3.example.com/url2', fileKey: 'key2' });
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockFetchResponse({ id: 'f2' }, 201);

    await run(
      {},
      makeMockCmd({
        line: 'test-line',
        file: [f1, f2],
      }),
      'review',
    );

    expect(process.exitCode).toBe(0);
    // 1 submit + 3 per file * 2 files = 7
    expect(fetchSpy.mock.calls).toHaveLength(7);
  });

  it('fails when file upload PUT returns error', async () => {
    const filePath = join(tmpDir, 'test.txt');
    writeFileSync(filePath, 'content');

    // Submit
    mockFetchResponse(MOCK_PACKAGE, 201);
    // Presign
    mockFetchResponse({
      uploadUrl: 'https://s3.example.com/url',
      fileKey: 'key',
    });
    // PUT fails
    fetchSpy.mockResolvedValueOnce(
      new Response('Forbidden', { status: 403, statusText: 'Forbidden' }),
    );

    await run(
      {},
      makeMockCmd({ line: 'test-line', file: [filePath] }),
      'review',
    );

    expect(process.exitCode).toBe(1);
    expect(stderrData.join('')).toContain('File upload failed');
  });
});

// ---------------------------------------------------------------------------
// run() - API errors
// ---------------------------------------------------------------------------

describe('run - API errors', () => {
  it('handles API error with details', async () => {
    mockFetchError(422, {
      message: 'Validation failed',
      details: { type: ['must not be empty'] },
    });

    await run({}, makeMockCmd({ line: 'test-line' }), 'review');

    expect(process.exitCode).toBe(1);
    const output = stderrData.join('');
    expect(output).toContain('API error (422)');
    expect(output).toContain('Validation failed');
    expect(output).toContain('type');
    expect(output).toContain('must not be empty');
  });

  it('handles non-JSON API error', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    await run({}, makeMockCmd({ line: 'test-line' }), 'review');

    expect(process.exitCode).toBe(1);
    expect(stderrData.join('')).toContain('API error (500)');
  });

  it('exit code is 0 on success', async () => {
    mockFetchResponse(MOCK_PACKAGE, 201);
    await run({}, makeMockCmd({ line: 'test-line' }), 'review');
    expect(process.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// run() - dry run
// ---------------------------------------------------------------------------

describe('run - dry run', () => {
  it('shows what would be submitted without making API calls', async () => {
    await run(
      {},
      makeMockCmd({
        line: 'review-line',
        metadata: ['pr=42'],
        dryRun: true,
      }),
      'review',
    );

    expect(process.exitCode).toBe(0);
    expect(fetchSpy.mock.calls).toHaveLength(0);

    const output = stdoutData.join('');
    expect(output).toContain('Dry run');
    expect(output).toContain('review');
    expect(output).toContain('review-line');
    expect(output).toContain('pr=42');
  });

  it('shows files in dry run', async () => {
    const filePath = join(tmpDir, 'doc.pdf');
    writeFileSync(filePath, 'pdf content');

    await run(
      {},
      makeMockCmd({
        pool: 'test-pool',
        file: [filePath],
        dryRun: true,
      }),
      'summarize',
    );

    expect(process.exitCode).toBe(0);
    const output = stdoutData.join('');
    expect(output).toContain('doc.pdf');
  });

  it('outputs JSON dry run when --json is set', async () => {
    await run(
      { json: true },
      makeMockCmd({
        line: 'test-line',
        metadata: ['key=val'],
        dryRun: true,
      }),
      'review',
    );

    expect(process.exitCode).toBe(0);
    const output = stdoutData.join('');
    const parsed = JSON.parse(output);
    expect(parsed.type).toBe('review');
    expect(parsed.target).toBe('line:test-line');
    expect(parsed.metadata).toEqual({ key: 'val' });
  });

  it('dry run with pool shows correct target', async () => {
    await run(
      {},
      makeMockCmd({
        pool: 'my-pool',
        dryRun: true,
      }),
      'summarize',
    );

    const output = stdoutData.join('');
    expect(output).toContain('Worker Pool');
    expect(output).toContain('my-pool');
  });
});

// ---------------------------------------------------------------------------
// run() - interactive mode
// ---------------------------------------------------------------------------

describe('run - interactive mode', () => {
  it('prompts for metadata when stdin is TTY and no --metadata given', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    mockInput
      .mockResolvedValueOnce('author')
      .mockResolvedValueOnce('John')
      .mockResolvedValueOnce('');

    mockFetchResponse(
      { ...MOCK_PACKAGE, metadata: { author: 'John' } },
      201,
    );

    await run({}, makeMockCmd({ line: 'test-line' }), 'review');

    expect(process.exitCode).toBe(0);
    expect(mockInput).toHaveBeenCalled();

    // Verify metadata was sent in the API call
    const { init } = nthFetchCall(0);
    const body = JSON.parse(init.body as string);
    expect(body.metadata).toEqual({ author: 'John' });
  });

  it('does not prompt when --metadata is provided', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    mockFetchResponse(MOCK_PACKAGE, 201);

    await run(
      {},
      makeMockCmd({ line: 'test-line', metadata: ['key=val'] }),
      'review',
    );

    expect(process.exitCode).toBe(0);
    expect(mockInput).not.toHaveBeenCalled();
  });

  it('does not prompt in JSON mode even if TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

    mockFetchResponse(MOCK_PACKAGE, 201);

    await run(
      { json: true },
      makeMockCmd({ line: 'test-line' }),
      'review',
    );

    expect(process.exitCode).toBe(0);
    expect(mockInput).not.toHaveBeenCalled();
  });

  it('does not prompt when stdin is not a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    mockFetchResponse(MOCK_PACKAGE, 201);

    await run({}, makeMockCmd({ line: 'test-line' }), 'review');

    expect(process.exitCode).toBe(0);
    expect(mockInput).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// run() - JSON mode
// ---------------------------------------------------------------------------

describe('run - JSON mode', () => {
  it('sets json mode from global opts', async () => {
    mockFetchResponse(MOCK_PACKAGE, 201);
    await run({ json: true }, makeMockCmd({ line: 'test-line' }), 'review');
    expect(process.exitCode).toBe(0);
    const output = stdoutData.join('');
    // Should be valid JSON
    const parsed = JSON.parse(output);
    expect(parsed.id).toBe('pkg-123');
  });
});

// ---------------------------------------------------------------------------
// CLI integration
// ---------------------------------------------------------------------------

describe('CLI integration', () => {
  it('submit command registers type argument and all flags', async () => {
    const { createProgram } = await import('../index.js');
    const program = createProgram();
    const submitCmd = program.commands.find((c) => c.name() === 'submit');
    expect(submitCmd).toBeDefined();

    // Check argument
    const args = submitCmd!.registeredArguments;
    expect(args.length).toBeGreaterThanOrEqual(1);
    expect(args[0]?.name()).toBe('type');

    // Check options
    const optionNames = submitCmd!.options.map((o) => o.long);
    expect(optionNames).toContain('--line');
    expect(optionNames).toContain('--pool');
    expect(optionNames).toContain('--file');
    expect(optionNames).toContain('--metadata');
    expect(optionNames).toContain('--dry-run');
  });
});
