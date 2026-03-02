import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  Package,
  WorkerContext,
  InputPackage,
  OutputBuilder,
  PackageOutput,
  WorkerLogger,
} from '@smithy/shared';
import { CodeReviewerWorker, extractPatch } from './worker.js';

// Mock the 'ai' module
vi.mock('ai', () => ({
  generateText: vi.fn(),
  tool: vi.fn((config: Record<string, unknown>) => ({
    ...config,
    _isTool: true,
  })),
  stepCountIs: vi.fn((n: number) => ({ _stepCount: n })),
}));

vi.mock('zod', () => {
  const stringFn = () => ({
    describe: () => 'zod-string-described',
  });
  const objectFn = (shape: Record<string, unknown>) => ({
    ...shape,
    _type: 'zod-object',
  });
  return {
    z: {
      object: objectFn,
      string: stringFn,
    },
  };
});

import { generateText, tool as aiTool } from 'ai';

const mockGenerateText = vi.mocked(generateText);

// Use a looser type for the tool mock to avoid complex generics
const mockTool = aiTool as unknown as ReturnType<typeof vi.fn>;

// --- Test Helpers ---

function createMockLogger(): WorkerLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createMockPackage(overrides: Partial<Package> = {}): Package {
  return {
    id: 'pkg-001',
    type: 'CODE' as Package['type'],
    status: 'PROCESSING' as Package['status'],
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createMockInputPackage(
  files: Record<string, string> = {},
): InputPackage {
  const fileNames = Object.keys(files);
  return {
    listFiles: vi.fn().mockReturnValue(fileNames),
    getFile: vi.fn((name: string) => Buffer.from(files[name] ?? '')),
    getFileAsString: vi.fn((name: string) => files[name] ?? ''),
    getMetadata: vi.fn().mockReturnValue({}),
  };
}

interface MockOutputBuilder extends OutputBuilder {
  _files: Array<{
    filename: string;
    content: Buffer | string;
    mimeType: string;
  }>;
  _metadata: Record<string, unknown>;
  _type: string | undefined;
}

function createMockOutputBuilder(): MockOutputBuilder {
  const builder: MockOutputBuilder = {
    _files: [],
    _metadata: {},
    _type: undefined,
    addFile(name: string, content: Buffer | string, mimeType?: string) {
      builder._files.push({
        filename: name,
        content,
        mimeType: mimeType ?? 'application/octet-stream',
      });
      return builder;
    },
    setMetadata(key: string, value: unknown) {
      builder._metadata[key] = value;
      return builder;
    },
    setType(packageType: string) {
      builder._type = packageType;
      return builder;
    },
    build(): PackageOutput {
      return {
        type: builder._type ?? '',
        files: [...builder._files],
        metadata: { ...builder._metadata },
      };
    },
  };
  return builder;
}

function createMockContext(
  inputPackage: InputPackage,
  outputBuilder?: MockOutputBuilder,
): WorkerContext {
  const ob = outputBuilder ?? createMockOutputBuilder();
  return {
    jobId: 'job-001',
    packageId: 'pkg-001',
    ai: { mockModel: true },
    inputPackage,
    outputBuilder: ob,
    logger: createMockLogger(),
    askQuestion: vi.fn(),
  };
}

// --- Tests ---

describe('CodeReviewerWorker', () => {
  let worker: CodeReviewerWorker;

  beforeEach(() => {
    vi.resetAllMocks();

    // Re-setup tool mock to capture execute functions
    mockTool.mockImplementation(
      (config: Record<string, unknown>) => ({
        ...config,
        _isTool: true,
      }),
    );

    worker = new CodeReviewerWorker();
    worker.logger = createMockLogger();
  });

  describe('class structure', () => {
    it('extends SmithyWorker', () => {
      expect(worker.name).toBe('CodeReviewerWorker');
    });

    it('has onReceive method', () => {
      expect(typeof worker.onReceive).toBe('function');
    });

    it('has onProcess method', () => {
      expect(typeof worker.onProcess).toBe('function');
    });
  });

  describe('onReceive', () => {
    it('accepts a valid package', async () => {
      const pkg = createMockPackage();
      await expect(worker.onReceive(pkg)).resolves.toBeUndefined();
    });

    it('logs receipt of package', async () => {
      const pkg = createMockPackage({ id: 'pkg-test' });
      await worker.onReceive(pkg);
      expect(worker.logger?.info).toHaveBeenCalledWith(
        'Code reviewer received package',
        { packageId: 'pkg-test' },
      );
    });

    it('throws when package has no ID', async () => {
      const pkg = createMockPackage({ id: '' });
      await expect(worker.onReceive(pkg)).rejects.toThrow(
        'Package must have an ID',
      );
    });
  });

  describe('onProcess', () => {
    it('generates a code review from source files', async () => {
      const inputPackage = createMockInputPackage({
        'index.ts': 'export const hello = "world";',
      });
      const outputBuilder = createMockOutputBuilder();
      const context = createMockContext(inputPackage, outputBuilder);

      const reviewText =
        '## Summary\nCode looks good.\n\n## index.ts\nNo issues found.';
      mockGenerateText.mockResolvedValueOnce({
        text: reviewText,
        steps: [],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);

      expect(mockGenerateText).toHaveBeenCalledOnce();
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: context.ai,
          system: expect.stringContaining('expert code reviewer'),
          prompt: expect.stringContaining('index.ts'),
          tools: expect.objectContaining({
            readFile: expect.any(Object),
            listFiles: expect.any(Object),
          }),
          stopWhen: expect.objectContaining({ _stepCount: 20 }),
        }),
      );

      expect(output.type).toBe('CODE');
      expect(output.files).toHaveLength(1);
      expect(output.files[0]?.filename).toBe('review.md');
      expect(output.files[0]?.content).toBe(reviewText);
      expect(output.files[0]?.mimeType).toBe('text/markdown');
    });

    it('generates review from multiple files', async () => {
      const inputPackage = createMockInputPackage({
        'src/app.ts': 'const app = express();',
        'src/routes.ts': 'router.get("/", handler);',
        'package.json': '{"name": "test"}',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review of 3 files.',
        steps: [],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);

      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      expect(callArgs?.prompt).toContain('src/app.ts');
      expect(callArgs?.prompt).toContain('src/routes.ts');
      expect(callArgs?.prompt).toContain('package.json');

      expect(output.metadata['filesReviewed']).toBe(3);
    });

    it('sets output metadata correctly', async () => {
      const inputPackage = createMockInputPackage({
        'file1.ts': 'code 1',
        'file2.ts': 'code 2',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review.',
        steps: [{ toolCalls: [{}, {}] }],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);

      expect(output.metadata['filesReviewed']).toBe(2);
      expect(output.metadata['toolCalls']).toBe(2);
      expect(output.metadata['model']).toBe('claude-sonnet-4-20250514');
      expect(output.metadata['generatedAt']).toBeDefined();
      expect(typeof output.metadata['generatedAt']).toBe('string');
    });

    it('counts tool calls across multiple steps', async () => {
      const inputPackage = createMockInputPackage({
        'main.ts': 'code',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review.',
        steps: [
          { toolCalls: [{}] },
          { toolCalls: [{}, {}] },
          { toolCalls: [{}, {}, {}] },
        ],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);
      expect(output.metadata['toolCalls']).toBe(6);
    });

    it('handles steps with no toolCalls property', async () => {
      const inputPackage = createMockInputPackage({
        'main.ts': 'code',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review.',
        steps: [{ toolCalls: [{}] }, {}, { toolCalls: [{}, {}] }],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);
      expect(output.metadata['toolCalls']).toBe(3);
    });

    it('handles undefined steps', async () => {
      const inputPackage = createMockInputPackage({
        'main.ts': 'code',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review.',
        steps: undefined,
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);
      expect(output.metadata['toolCalls']).toBe(0);
    });

    it('throws when input package has no files', async () => {
      const inputPackage = createMockInputPackage({});
      const context = createMockContext(inputPackage);

      await expect(worker.onProcess(context)).rejects.toThrow(
        'Input package contains no files',
      );
    });

    it('extracts patch from review and adds suggestions.patch', async () => {
      const inputPackage = createMockInputPackage({
        'app.ts': 'const x = 1;',
      });
      const outputBuilder = createMockOutputBuilder();
      const context = createMockContext(inputPackage, outputBuilder);

      const reviewWithPatch = `## Review
Some issues found.

\`\`\`diff
--- a/app.ts
+++ b/app.ts
@@ -1 +1 @@
-const x = 1;
+const x: number = 1;
\`\`\``;
      mockGenerateText.mockResolvedValueOnce({
        text: reviewWithPatch,
        steps: [],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);

      expect(output.files).toHaveLength(2);
      expect(output.files[0]?.filename).toBe('review.md');
      expect(output.files[1]?.filename).toBe('suggestions.patch');
      expect(output.files[1]?.mimeType).toBe('text/x-diff');
      expect(output.files[1]?.content).toContain('-const x = 1;');
      expect(output.files[1]?.content).toContain('+const x: number = 1;');
    });

    it('does not add suggestions.patch when no diff blocks present', async () => {
      const inputPackage = createMockInputPackage({
        'app.ts': 'const x = 1;',
      });
      const outputBuilder = createMockOutputBuilder();
      const context = createMockContext(inputPackage, outputBuilder);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Code looks perfect, no changes needed.',
        steps: [],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);

      expect(output.files).toHaveLength(1);
      expect(output.files[0]?.filename).toBe('review.md');
    });

    it('logs patch extraction when patch is found', async () => {
      const inputPackage = createMockInputPackage({
        'app.ts': 'code',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: '```diff\n-old\n+new\n```',
        steps: [],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      expect(context.logger.info).toHaveBeenCalledWith(
        'Patch file extracted from review',
      );
    });

    it('passes the AI model from context', async () => {
      const inputPackage = createMockInputPackage({
        'doc.ts': 'content',
      });
      const customModel = { provider: 'test', modelId: 'test-model' };
      const context = createMockContext(inputPackage);
      (context as { ai: unknown }).ai = customModel;

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review.',
        steps: [],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      expect(callArgs?.model).toBe(customModel);
    });

    it('logs starting and completion info', async () => {
      const inputPackage = createMockInputPackage({
        'file1.ts': 'code1',
        'file2.ts': 'code2',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review text here.',
        steps: [{ toolCalls: [{}] }],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      expect(context.logger.info).toHaveBeenCalledWith('Starting code review', {
        fileCount: 2,
      });
      expect(context.logger.info).toHaveBeenCalledWith(
        'Code review generated',
        expect.objectContaining({
          reviewLength: 'Review text here.'.length,
          filesAvailable: 2,
          toolCalls: 1,
        }),
      );
    });

    it('propagates AI errors', async () => {
      const inputPackage = createMockInputPackage({
        'doc.ts': 'content',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockRejectedValueOnce(
        new Error('API rate limit exceeded'),
      );

      await expect(worker.onProcess(context)).rejects.toThrow(
        'API rate limit exceeded',
      );
    });

    it('includes system prompt with review categories', async () => {
      const inputPackage = createMockInputPackage({
        'doc.ts': 'content',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review.',
        steps: [],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      expect(callArgs?.system).toContain('Correctness');
      expect(callArgs?.system).toContain('Style');
      expect(callArgs?.system).toContain('Security');
      expect(callArgs?.system).toContain('Performance');
      expect(callArgs?.system).toContain('Maintainability');
    });

    it('configures readFile and listFiles tools', async () => {
      const inputPackage = createMockInputPackage({
        'main.ts': 'code',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review.',
        steps: [],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      // tool() should have been called twice — once for readFile, once for listFiles
      expect(mockTool).toHaveBeenCalledTimes(2);

      // Check readFile tool config
      const readFileCall = mockTool.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(readFileCall?.description).toContain('Read the contents');
      expect(readFileCall?.execute).toBeDefined();

      // Check listFiles tool config
      const listFilesCall = mockTool.mock.calls[1]?.[0] as Record<string, unknown>;
      expect(listFilesCall?.description).toContain('List all files');
      expect(listFilesCall?.execute).toBeDefined();
    });

    it('readFile tool returns file contents for valid files', async () => {
      const inputPackage = createMockInputPackage({
        'main.ts': 'const x = 42;',
        'utils.ts': 'export function add(a: number, b: number) { return a + b; }',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review.',
        steps: [],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      // Extract the readFile execute function from the tool mock
      const readFileToolConfig = mockTool.mock.calls[0]?.[0] as Record<string, unknown>;
      const executeFn = readFileToolConfig?.execute as (args: {
        filename: string;
      }) => Promise<string>;

      const result = await executeFn({ filename: 'main.ts' });
      expect(result).toBe('const x = 42;');
    });

    it('readFile tool returns error for non-existent files', async () => {
      const inputPackage = createMockInputPackage({
        'main.ts': 'code',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review.',
        steps: [],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      const readFileToolConfig = mockTool.mock.calls[0]?.[0] as Record<string, unknown>;
      const executeFn = readFileToolConfig?.execute as (args: {
        filename: string;
      }) => Promise<string>;

      const result = await executeFn({ filename: 'nonexistent.ts' });
      expect(result).toContain('Error: File "nonexistent.ts" not found');
      expect(result).toContain('main.ts');
    });

    it('listFiles tool returns all file names', async () => {
      const inputPackage = createMockInputPackage({
        'src/app.ts': 'code1',
        'src/routes.ts': 'code2',
        'package.json': '{}',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Review.',
        steps: [],
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      const listFilesToolConfig = mockTool.mock.calls[1]?.[0] as Record<string, unknown>;
      const executeFn = listFilesToolConfig?.execute as () => Promise<string>;

      const result = await executeFn();
      expect(result).toContain('src/app.ts');
      expect(result).toContain('src/routes.ts');
      expect(result).toContain('package.json');
    });
  });

  describe('onComplete (inherited)', () => {
    it('calls default onComplete without error', async () => {
      const output: PackageOutput = {
        type: 'CODE',
        files: [
          { filename: 'review.md', content: 'Review.', mimeType: 'text/markdown' },
        ],
        metadata: { filesReviewed: 1 },
      };
      await expect(worker.onComplete(output)).resolves.toBeUndefined();
    });

    it('logs completion via inherited behavior', async () => {
      const output: PackageOutput = {
        type: 'CODE',
        files: [],
        metadata: {},
      };
      await worker.onComplete(output);
      expect(worker.logger?.info).toHaveBeenCalledWith(
        'Worker completed successfully',
      );
    });
  });

  describe('onError (inherited)', () => {
    it('re-throws errors via inherited behavior', async () => {
      const error = new Error('test error');
      await expect(worker.onError(error)).rejects.toThrow('test error');
    });

    it('logs the error before re-throwing', async () => {
      const error = new Error('processing failed');
      try {
        await worker.onError(error);
      } catch {
        // expected
      }
      expect(worker.logger?.error).toHaveBeenCalledWith('Worker failed', {
        error: 'processing failed',
      });
    });
  });
});

describe('extractPatch', () => {
  it('returns null when no diff blocks present', () => {
    expect(extractPatch('Just some text, no code blocks.')).toBeNull();
  });

  it('returns null for non-diff code blocks', () => {
    expect(extractPatch('```typescript\nconst x = 1;\n```')).toBeNull();
  });

  it('extracts a single diff block', () => {
    const review = `Some review text.

\`\`\`diff
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new
\`\`\``;
    const result = extractPatch(review);
    expect(result).toContain('-old');
    expect(result).toContain('+new');
  });

  it('extracts a patch block', () => {
    const review = `Review.

\`\`\`patch
--- a/file.ts
+++ b/file.ts
-remove
+add
\`\`\``;
    const result = extractPatch(review);
    expect(result).toContain('-remove');
    expect(result).toContain('+add');
  });

  it('concatenates multiple diff blocks', () => {
    const review = `\`\`\`diff
-first
+first-new
\`\`\`

Some text.

\`\`\`diff
-second
+second-new
\`\`\``;
    const result = extractPatch(review);
    expect(result).toContain('-first');
    expect(result).toContain('+first-new');
    expect(result).toContain('-second');
    expect(result).toContain('+second-new');
  });

  it('trims whitespace from extracted patches', () => {
    const review = `\`\`\`diff

  -old
  +new

\`\`\``;
    const result = extractPatch(review);
    expect(result).toBe('-old\n  +new');
  });

  it('returns null for empty string', () => {
    expect(extractPatch('')).toBeNull();
  });
});
