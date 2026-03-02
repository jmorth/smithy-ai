import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  Package,
  WorkerContext,
  InputPackage,
  OutputBuilder,
  PackageOutput,
  WorkerLogger,
} from '@smithy/shared';
import { SpecWriterWorker } from './worker.js';

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

describe('SpecWriterWorker', () => {
  let worker: SpecWriterWorker;

  beforeEach(() => {
    vi.resetAllMocks();
    worker = new SpecWriterWorker();
    worker.logger = createMockLogger();
  });

  describe('class structure', () => {
    it('extends SmithyWorker', () => {
      expect(worker.name).toBe('SpecWriterWorker');
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
        'Spec writer received package',
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
    function setupHappyPath(
      context: WorkerContext,
      answers: { audience: string; platform: string; constraints: string } = {
        audience: 'Small business owners',
        platform: 'Web',
        constraints: 'Must use PostgreSQL',
      },
    ) {
      const mockAskQuestion = vi.mocked(context.askQuestion);
      mockAskQuestion
        .mockResolvedValueOnce(answers.audience)
        .mockResolvedValueOnce(answers.platform)
        .mockResolvedValueOnce(answers.constraints);

      mockGenerateText.mockResolvedValueOnce({
        text: '## Overview\nA task management app.\n\n## Requirements\n### Functional Requirements\n1. User login\n\n### Non-Functional Requirements\n- Fast\n\n## Constraints\nPostgreSQL\n\n## Timeline\nPhase 1: MVP\n\n## Acceptance Criteria\n- [ ] Users can log in',
      } as Awaited<ReturnType<typeof generateText>>);
    }

    it('generates a specification from user input and question answers', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'I want to build a task management app',
      });
      const outputBuilder = createMockOutputBuilder();
      const context = createMockContext(inputPackage, outputBuilder);
      setupHappyPath(context);

      const output = await worker.onProcess(context);

      expect(output.type).toBe('SPECIFICATION');
      expect(output.files).toHaveLength(1);
      expect(output.files[0]?.filename).toBe('specification.md');
      expect(output.files[0]?.mimeType).toBe('text/markdown');
      expect(output.files[0]?.content).toContain('## Overview');
    });

    it('asks exactly 3 clarifying questions sequentially', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build a CRM system',
      });
      const context = createMockContext(inputPackage);
      setupHappyPath(context);

      await worker.onProcess(context);

      const mockAskQuestion = vi.mocked(context.askQuestion);
      expect(mockAskQuestion).toHaveBeenCalledTimes(3);

      // Verify question order
      expect(mockAskQuestion.mock.calls[0]![0]).toContain('target audience');
      expect(mockAskQuestion.mock.calls[1]![0]).toContain('platform');
      expect(mockAskQuestion.mock.calls[2]![0]).toContain('technical requirements');
    });

    it('passes timeout option to all askQuestion calls', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build something',
      });
      const context = createMockContext(inputPackage);
      setupHappyPath(context);

      await worker.onProcess(context);

      const mockAskQuestion = vi.mocked(context.askQuestion);
      // All three calls should include a timeout
      for (let i = 0; i < 3; i++) {
        const options = mockAskQuestion.mock.calls[i]![1];
        expect(options).toBeDefined();
        expect(options!.timeout).toBe(30 * 60 * 1000);
      }
    });

    it('uses developer-oriented platform choices when audience includes "developer"', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build a developer tool',
      });
      const context = createMockContext(inputPackage);
      setupHappyPath(context, {
        audience: 'Software developers',
        platform: 'CLI',
        constraints: 'None',
      });

      await worker.onProcess(context);

      const mockAskQuestion = vi.mocked(context.askQuestion);
      const platformOptions = mockAskQuestion.mock.calls[1]![1];
      expect(platformOptions?.choices).toEqual(['Web', 'CLI', 'API', 'All']);
    });

    it('uses general platform choices when audience does not include "developer"', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build a shopping app',
      });
      const context = createMockContext(inputPackage);
      setupHappyPath(context, {
        audience: 'Small business owners',
        platform: 'Mobile',
        constraints: 'None',
      });

      await worker.onProcess(context);

      const mockAskQuestion = vi.mocked(context.askQuestion);
      const platformOptions = mockAskQuestion.mock.calls[1]![1];
      expect(platformOptions?.choices).toEqual(['Web', 'Mobile', 'Desktop', 'All']);
    });

    it('combines user input and answers into AI prompt', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'I want to build a task management app',
      });
      const context = createMockContext(inputPackage);
      setupHappyPath(context, {
        audience: 'Project managers',
        platform: 'Web',
        constraints: 'Must integrate with Jira',
      });

      await worker.onProcess(context);

      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      const prompt = callArgs?.prompt as string;
      expect(prompt).toContain('I want to build a task management app');
      expect(prompt).toContain('Project managers');
      expect(prompt).toContain('Web');
      expect(prompt).toContain('Must integrate with Jira');
    });

    it('includes structured system prompt with specification sections', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build something',
      });
      const context = createMockContext(inputPackage);
      setupHappyPath(context);

      await worker.onProcess(context);

      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      const system = callArgs?.system as string;
      expect(system).toContain('Overview');
      expect(system).toContain('Requirements');
      expect(system).toContain('Constraints');
      expect(system).toContain('Timeline');
      expect(system).toContain('Acceptance Criteria');
    });

    it('passes the AI model from context', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build something',
      });
      const customModel = { provider: 'test', modelId: 'test-model' };
      const context = createMockContext(inputPackage);
      (context as { ai: unknown }).ai = customModel;
      setupHappyPath(context);

      await worker.onProcess(context);

      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      expect(callArgs?.model).toBe(customModel);
    });

    it('sets output metadata correctly', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build a CRM',
      });
      const context = createMockContext(inputPackage);
      setupHappyPath(context);

      const output = await worker.onProcess(context);

      expect(output.metadata['questionsAsked']).toBe(3);
      expect(output.metadata['model']).toBe('claude-sonnet-4-20250514');
      expect(output.metadata['generatedAt']).toBeDefined();
      expect(typeof output.metadata['generatedAt']).toBe('string');
    });

    it('reads input from multiple files', async () => {
      const inputPackage = createMockInputPackage({
        'idea.txt': 'Build a CRM',
        'notes.md': 'Extra context about requirements',
      });
      const context = createMockContext(inputPackage);
      setupHappyPath(context);

      await worker.onProcess(context);

      const callArgs = mockGenerateText.mock.calls[0]?.[0];
      const prompt = callArgs?.prompt as string;
      expect(prompt).toContain('Build a CRM');
      expect(prompt).toContain('Extra context about requirements');
    });

    it('throws when input package has no files', async () => {
      const inputPackage = createMockInputPackage({});
      const context = createMockContext(inputPackage);

      await expect(worker.onProcess(context)).rejects.toThrow(
        'Input package contains no files',
      );
    });

    it('propagates askQuestion errors', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build something',
      });
      const context = createMockContext(inputPackage);
      vi.mocked(context.askQuestion).mockRejectedValueOnce(
        new Error('Question timeout exceeded'),
      );

      await expect(worker.onProcess(context)).rejects.toThrow(
        'Question timeout exceeded',
      );
    });

    it('propagates AI generation errors', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build something',
      });
      const context = createMockContext(inputPackage);
      setupHappyPath(context);
      // Override the generateText mock to reject
      mockGenerateText.mockReset();
      mockGenerateText.mockRejectedValueOnce(
        new Error('API rate limit exceeded'),
      );

      // Re-setup askQuestion since resetAllMocks cleared it
      vi.mocked(context.askQuestion)
        .mockResolvedValueOnce('Everyone')
        .mockResolvedValueOnce('Web')
        .mockResolvedValueOnce('None');

      await expect(worker.onProcess(context)).rejects.toThrow(
        'API rate limit exceeded',
      );
    });

    it('logs each step of the process', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build a task manager',
      });
      const context = createMockContext(inputPackage);
      setupHappyPath(context);

      await worker.onProcess(context);

      expect(context.logger.info).toHaveBeenCalledWith(
        'Starting spec writer',
        expect.objectContaining({ inputLength: expect.any(Number) }),
      );
      expect(context.logger.info).toHaveBeenCalledWith(
        'Received audience answer',
        expect.objectContaining({ answer: expect.any(String) }),
      );
      expect(context.logger.info).toHaveBeenCalledWith(
        'Received platform answer',
        expect.objectContaining({ answer: expect.any(String) }),
      );
      expect(context.logger.info).toHaveBeenCalledWith(
        'Received constraints answer',
        expect.objectContaining({ answer: expect.any(String) }),
      );
      expect(context.logger.info).toHaveBeenCalledWith(
        'Generating specification',
        expect.objectContaining({ promptLength: expect.any(Number) }),
      );
      expect(context.logger.info).toHaveBeenCalledWith(
        'Specification generated',
        expect.objectContaining({ specLength: expect.any(Number) }),
      );
    });

    it('handles case-insensitive developer audience detection', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build a dev tool',
      });
      const context = createMockContext(inputPackage);
      setupHappyPath(context, {
        audience: 'Backend DEVELOPERS and DevOps engineers',
        platform: 'API',
        constraints: 'None',
      });

      await worker.onProcess(context);

      const mockAskQuestion = vi.mocked(context.askQuestion);
      const platformOptions = mockAskQuestion.mock.calls[1]![1];
      expect(platformOptions?.choices).toEqual(['Web', 'CLI', 'API', 'All']);
    });

    it('askQuestion calls are sequential not parallel', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build something',
      });
      const context = createMockContext(inputPackage);

      const callOrder: string[] = [];
      vi.mocked(context.askQuestion)
        .mockImplementationOnce(async () => {
          callOrder.push('q1-start');
          callOrder.push('q1-end');
          return 'answer1';
        })
        .mockImplementationOnce(async () => {
          callOrder.push('q2-start');
          callOrder.push('q2-end');
          return 'answer2';
        })
        .mockImplementationOnce(async () => {
          callOrder.push('q3-start');
          callOrder.push('q3-end');
          return 'answer3';
        });

      mockGenerateText.mockResolvedValueOnce({
        text: 'Spec.',
      } as Awaited<ReturnType<typeof generateText>>);

      await worker.onProcess(context);

      expect(callOrder).toEqual([
        'q1-start', 'q1-end',
        'q2-start', 'q2-end',
        'q3-start', 'q3-end',
      ]);
    });

    it('second askQuestion error stops execution before third question', async () => {
      const inputPackage = createMockInputPackage({
        'input.txt': 'Build something',
      });
      const context = createMockContext(inputPackage);
      vi.mocked(context.askQuestion)
        .mockResolvedValueOnce('Everyone')
        .mockRejectedValueOnce(new Error('Connection lost'));

      await expect(worker.onProcess(context)).rejects.toThrow('Connection lost');
      expect(context.askQuestion).toHaveBeenCalledTimes(2);
    });
  });

  describe('onComplete (inherited)', () => {
    it('calls default onComplete without error', async () => {
      const output: PackageOutput = {
        type: 'SPECIFICATION',
        files: [
          {
            filename: 'specification.md',
            content: 'Spec content.',
            mimeType: 'text/markdown',
          },
        ],
        metadata: { questionsAsked: 3 },
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
