import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  Package,
  WorkerContext,
  InputPackage,
  OutputBuilder,
  PackageOutput,
  WorkerLogger,
} from '@smithy/shared';
import { SummarizerWorker } from './worker.js';

// Mock the 'ai' module's generateText function
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { generateText } from 'ai';

const mockGenerateText = vi.mocked(generateText);

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
    type: 'USER_INPUT' as Package['type'],
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
  _files: Array<{ filename: string; content: Buffer | string; mimeType: string }>;
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

describe('SummarizerWorker', () => {
  let worker: SummarizerWorker;

  beforeEach(() => {
    vi.resetAllMocks();
    worker = new SummarizerWorker();
    worker.logger = createMockLogger();
  });

  describe('class structure', () => {
    it('extends SmithyWorker', () => {
      // The SmithyWorker base class sets this.name = this.constructor.name
      expect(worker.name).toBe('SummarizerWorker');
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
        'Summarizer received package',
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
    it('generates a summary from a single text file', async () => {
      const inputPackage = createMockInputPackage({
        'readme.md': 'This is a test document about testing.',
      });
      const outputBuilder = createMockOutputBuilder();
      const context = createMockContext(inputPackage, outputBuilder);

      const summaryText = '## Overview\nTest summary.\n\n## Key Points\n- Testing\n\n## Action Items\nNo action items identified.';
      mockGenerateText.mockResolvedValueOnce({
        text: summaryText,
      } as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);

      expect(mockGenerateText).toHaveBeenCalledOnce();
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: context.ai,
          system: expect.stringContaining('document summarizer'),
          prompt: expect.stringContaining('readme.md'),
        }),
      );

      expect(output.type).toBe('SPECIFICATION');
      expect(output.files).toHaveLength(1);
      expect(output.files[0]?.filename).toBe('summary.md');
      expect(output.files[0]?.content).toBe(summaryText);
      expect(output.files[0]?.mimeType).toBe('text/markdown');
    });

    it('generates a summary from multiple text files', async () => {
      const inputPackage = createMockInputPackage({
        'doc1.txt': 'First document content.',
        'doc2.md': 'Second document content.',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Combined summary.',
      } as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);

      // Verify the prompt includes both files
      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      expect(callArgs?.prompt).toContain('doc1.txt');
      expect(callArgs?.prompt).toContain('doc2.md');
      expect(callArgs?.prompt).toContain('First document content.');
      expect(callArgs?.prompt).toContain('Second document content.');

      expect(output.files).toHaveLength(1);
      expect(output.files[0]?.content).toBe('Combined summary.');
    });

    it('sets output metadata correctly', async () => {
      const inputPackage = createMockInputPackage({
        'file1.txt': 'Content 1.',
        'file2.txt': 'Content 2.',
        'file3.txt': 'Content 3.',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Summary text.',
      } as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);

      expect(output.metadata['sourceFiles']).toBe(3);
      expect(output.metadata['model']).toBe('claude-sonnet-4-20250514');
      expect(output.metadata['generatedAt']).toBeDefined();
      expect(typeof output.metadata['generatedAt']).toBe('string');
    });

    it('throws when input package has no files', async () => {
      const inputPackage = createMockInputPackage({});
      const context = createMockContext(inputPackage);

      await expect(worker.onProcess(context)).rejects.toThrow(
        'Input package contains no files',
      );
    });

    it('throws when input package has only binary files', async () => {
      // Binary files have non-text extensions
      const inputPackage = createMockInputPackage({
        'image.png': 'binary data',
        'archive.zip': 'binary data',
      });
      const context = createMockContext(inputPackage);

      await expect(worker.onProcess(context)).rejects.toThrow(
        'Input package contains no text files',
      );
    });

    it('skips binary files and warns about them', async () => {
      const inputPackage = createMockInputPackage({
        'readme.md': 'Text content.',
        'image.png': 'binary data',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Summary.',
      } as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      expect(context.logger.warn).toHaveBeenCalledWith(
        'Skipping binary file',
        { filename: 'image.png' },
      );
      // Only the text file should be in the prompt
      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      expect(callArgs?.prompt).toContain('readme.md');
      expect(callArgs?.prompt).not.toContain('image.png');
    });

    it('handles various text file extensions', async () => {
      const textFiles: Record<string, string> = {
        'file.txt': 'txt content',
        'file.json': 'json content',
        'file.yaml': 'yaml content',
        'file.ts': 'ts content',
        'file.py': 'py content',
        'file.md': 'md content',
        'file.csv': 'csv content',
        'file.html': 'html content',
        'file.sql': 'sql content',
        'file.sh': 'sh content',
      };
      const inputPackage = createMockInputPackage(textFiles);
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Summary of many files.',
      } as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);

      expect(output.metadata['sourceFiles']).toBe(10);
      expect(context.logger.warn).not.toHaveBeenCalled();
    });

    it('treats files without extension as text', async () => {
      const inputPackage = createMockInputPackage({
        'Makefile': 'all: build',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Summary.',
      } as Awaited<ReturnType<typeof generateText>>);

      const output = await worker.onProcess(context);
      expect(output.metadata['sourceFiles']).toBe(1);
    });

    it('uses the structured summarization system prompt', async () => {
      const inputPackage = createMockInputPackage({
        'doc.txt': 'Some content.',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Summary.',
      } as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      expect(callArgs?.system).toContain('Overview');
      expect(callArgs?.system).toContain('Key Points');
      expect(callArgs?.system).toContain('Action Items');
    });

    it('passes the AI model from context', async () => {
      const inputPackage = createMockInputPackage({
        'doc.txt': 'Content.',
      });
      const customModel = { provider: 'test', modelId: 'test-model' };
      const context = createMockContext(inputPackage);
      (context as { ai: unknown }).ai = customModel;

      mockGenerateText.mockResolvedValueOnce({
        text: 'Summary.',
      } as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      expect(callArgs?.model).toBe(customModel);
    });

    it('logs processing info and summary generation', async () => {
      const inputPackage = createMockInputPackage({
        'file1.txt': 'Content.',
        'file2.txt': 'More content.',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'A nice summary.',
      } as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      expect(context.logger.info).toHaveBeenCalledWith(
        'Processing text files',
        { count: 2 },
      );
      expect(context.logger.info).toHaveBeenCalledWith(
        'Summary generated',
        expect.objectContaining({
          sourceFiles: 2,
          summaryLength: 'A nice summary.'.length,
        }),
      );
    });

    it('propagates AI errors', async () => {
      const inputPackage = createMockInputPackage({
        'doc.txt': 'Content.',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      await expect(worker.onProcess(context)).rejects.toThrow(
        'API rate limit exceeded',
      );
    });

    it('formats file contents with filename separators', async () => {
      const inputPackage = createMockInputPackage({
        'intro.md': 'Introduction text.',
        'details.txt': 'Detailed information.',
      });
      const context = createMockContext(inputPackage);

      mockGenerateText.mockResolvedValueOnce({
        text: 'Summary.',
      } as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      const prompt = callArgs?.prompt as string;
      expect(prompt).toContain('--- intro.md ---');
      expect(prompt).toContain('Introduction text.');
      expect(prompt).toContain('--- details.txt ---');
      expect(prompt).toContain('Detailed information.');
    });
  });

  describe('onComplete (inherited)', () => {
    it('calls default onComplete without error', async () => {
      const output: PackageOutput = {
        type: 'SPECIFICATION',
        files: [{ filename: 'summary.md', content: 'Summary.', mimeType: 'text/markdown' }],
        metadata: { sourceFiles: 1 },
      };
      await expect(worker.onComplete(output)).resolves.toBeUndefined();
    });

    it('logs completion via inherited behavior', async () => {
      const output: PackageOutput = {
        type: 'SPECIFICATION',
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
