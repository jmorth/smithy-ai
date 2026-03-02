import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkerContext,
  type ContextApiClient,
  type WorkerContextDeps,
} from './context.js';
import { QuestionTimeoutError } from './errors.js';
import type { InputPackage, OutputBuilder, PackageOutput } from '@smithy/shared';

// --- Test helpers ---

function createMockInputPackage(): InputPackage {
  return {
    getFile: vi.fn().mockReturnValue(Buffer.from('file-content')),
    getFileAsString: vi.fn().mockReturnValue('string-content'),
    listFiles: vi.fn().mockReturnValue(['file1.txt', 'file2.md']),
    getMetadata: vi.fn().mockReturnValue({ key: 'value' }),
  };
}

function createMockOutputBuilder(): OutputBuilder {
  const builder: OutputBuilder = {
    addFile: vi.fn().mockReturnThis(),
    setMetadata: vi.fn().mockReturnThis(),
    setType: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue({
      type: 'CODE',
      files: [],
      metadata: {},
    } satisfies PackageOutput),
  };
  return builder;
}

function createMockApiClient(
  overrides?: Partial<ContextApiClient>,
): ContextApiClient {
  return {
    submitQuestion: vi
      .fn()
      .mockResolvedValue({ questionId: 'q-123' }),
    getAnswer: vi.fn().mockResolvedValue({ answer: null }),
    ...overrides,
  };
}

function createDeps(
  overrides?: Partial<WorkerContextDeps>,
): WorkerContextDeps {
  return {
    jobId: 'job-001',
    packageId: 'pkg-001',
    workerId: 'worker-001',
    ai: { provider: 'mock-ai' },
    inputPackage: createMockInputPackage(),
    outputBuilder: createMockOutputBuilder(),
    apiClient: createMockApiClient(),
    ...overrides,
  };
}

/**
 * Helper to advance fake timers and catch the expected rejection
 * so vitest doesn't report it as unhandled.
 */
async function advanceAndCatch(
  promise: Promise<unknown>,
  ms: number,
): Promise<unknown> {
  // Attach a no-op catch to prevent unhandled rejection warning
  const caught = promise.catch((e: unknown) => e);
  await vi.advanceTimersByTimeAsync(ms);
  return caught;
}

// --- Tests ---

describe('WorkerContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('construction', () => {
    it('creates a context with all required properties', () => {
      const deps = createDeps();
      const ctx = new WorkerContext(deps);

      expect(ctx.jobId).toBe('job-001');
      expect(ctx.packageId).toBe('pkg-001');
      expect(ctx.ai).toEqual({ provider: 'mock-ai' });
      expect(ctx.inputPackage).toBe(deps.inputPackage);
      expect(ctx.outputBuilder).toBe(deps.outputBuilder);
    });

    it('has a static create factory method', () => {
      const deps = createDeps();
      const ctx = WorkerContext.create(deps);

      expect(ctx).toBeInstanceOf(WorkerContext);
      expect(ctx.jobId).toBe('job-001');
    });
  });

  describe('logger', () => {
    it('provides a logger with info, warn, error, debug methods', () => {
      const ctx = new WorkerContext(createDeps());

      expect(typeof ctx.logger.info).toBe('function');
      expect(typeof ctx.logger.warn).toBe('function');
      expect(typeof ctx.logger.error).toBe('function');
      expect(typeof ctx.logger.debug).toBe('function');
    });

    it('does not throw when calling logger methods', () => {
      const ctx = new WorkerContext(createDeps());

      expect(() => ctx.logger.info('test message')).not.toThrow();
      expect(() => ctx.logger.warn('warn message')).not.toThrow();
      expect(() => ctx.logger.error('error message')).not.toThrow();
      expect(() => ctx.logger.debug('debug message')).not.toThrow();
    });

    it('accepts metadata as second argument', () => {
      const ctx = new WorkerContext(createDeps());

      expect(() =>
        ctx.logger.info('with meta', { requestId: 'r-1' }),
      ).not.toThrow();
      expect(() =>
        ctx.logger.error('with meta', { error: 'fail' }),
      ).not.toThrow();
    });
  });

  describe('inputPackage delegation', () => {
    it('delegates getFile to the injected inputPackage', () => {
      const inputPkg = createMockInputPackage();
      const ctx = new WorkerContext(createDeps({ inputPackage: inputPkg }));

      ctx.inputPackage.getFile('test.txt');

      expect(inputPkg.getFile).toHaveBeenCalledWith('test.txt');
    });

    it('delegates listFiles to the injected inputPackage', () => {
      const inputPkg = createMockInputPackage();
      const ctx = new WorkerContext(createDeps({ inputPackage: inputPkg }));

      const result = ctx.inputPackage.listFiles();

      expect(result).toEqual(['file1.txt', 'file2.md']);
    });
  });

  describe('outputBuilder delegation', () => {
    it('delegates addFile to the injected outputBuilder', () => {
      const outputBuilder = createMockOutputBuilder();
      const ctx = new WorkerContext(createDeps({ outputBuilder }));

      ctx.outputBuilder.addFile('out.txt', 'data');

      expect(outputBuilder.addFile).toHaveBeenCalledWith('out.txt', 'data');
    });

    it('delegates build to the injected outputBuilder', () => {
      const outputBuilder = createMockOutputBuilder();
      const ctx = new WorkerContext(createDeps({ outputBuilder }));

      const result = ctx.outputBuilder.build();

      expect(result).toEqual({ type: 'CODE', files: [], metadata: {} });
    });
  });

  describe('askQuestion', () => {
    it('submits a question and returns the answer when available immediately', async () => {
      vi.useFakeTimers();
      const apiClient = createMockApiClient({
        getAnswer: vi.fn().mockResolvedValue({ answer: 'the answer' }),
      });
      const ctx = new WorkerContext(createDeps({ apiClient }));

      const promise = ctx.askQuestion('What is the meaning of life?');
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(apiClient.submitQuestion).toHaveBeenCalledWith(
        'job-001',
        'What is the meaning of life?',
        undefined,
      );
      expect(result).toBe('the answer');
    });

    it('passes question options to the API client', async () => {
      vi.useFakeTimers();
      const apiClient = createMockApiClient({
        getAnswer: vi.fn().mockResolvedValue({ answer: 'choice-a' }),
      });
      const ctx = new WorkerContext(createDeps({ apiClient }));

      const options = { choices: ['a', 'b', 'c'], timeout: 10000 };
      const promise = ctx.askQuestion('Pick one', options);
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(apiClient.submitQuestion).toHaveBeenCalledWith(
        'job-001',
        'Pick one',
        options,
      );
      expect(result).toBe('choice-a');
    });

    it('polls with exponential backoff until answer is received', async () => {
      vi.useFakeTimers();
      const getAnswer = vi
        .fn()
        .mockResolvedValueOnce({ answer: null })
        .mockResolvedValueOnce({ answer: null })
        .mockResolvedValueOnce({ answer: 'finally' });
      const apiClient = createMockApiClient({ getAnswer });
      const ctx = new WorkerContext(createDeps({ apiClient }));

      const promise = ctx.askQuestion('waiting');

      // First poll at 500ms
      await vi.advanceTimersByTimeAsync(500);
      expect(getAnswer).toHaveBeenCalledTimes(1);

      // Second poll at 500 + 750 = 1250ms
      await vi.advanceTimersByTimeAsync(750);
      expect(getAnswer).toHaveBeenCalledTimes(2);

      // Third poll at 1250 + 1125 = 2375ms
      await vi.advanceTimersByTimeAsync(1125);
      const result = await promise;

      expect(result).toBe('finally');
      expect(getAnswer).toHaveBeenCalledTimes(3);
    });

    it('throws QuestionTimeoutError when timeout is exceeded', async () => {
      vi.useFakeTimers();
      const apiClient = createMockApiClient({
        getAnswer: vi.fn().mockResolvedValue({ answer: null }),
      });
      const ctx = new WorkerContext(createDeps({ apiClient }));

      const promise = ctx.askQuestion('will timeout', { timeout: 2000 });
      const result = await advanceAndCatch(promise, 3000);

      expect(result).toBeInstanceOf(QuestionTimeoutError);
      expect((result as QuestionTimeoutError).message).toContain(
        'timed out after 2000ms',
      );
    });

    it('uses default timeout of 5 minutes when not specified', async () => {
      vi.useFakeTimers();
      const apiClient = createMockApiClient({
        getAnswer: vi.fn().mockResolvedValue({ answer: null }),
      });
      const ctx = new WorkerContext(createDeps({ apiClient }));

      const promise = ctx.askQuestion('default timeout');
      // Use a short timeout to verify default, advance in chunks to avoid
      // processing too many timer ticks at once
      const caught = promise.catch((e: unknown) => e);
      for (let elapsed = 0; elapsed < 310_000; elapsed += 10_000) {
        await vi.advanceTimersByTimeAsync(10_000);
      }
      const result = await caught;

      expect(result).toBeInstanceOf(QuestionTimeoutError);
      expect((result as QuestionTimeoutError).timeoutMs).toBe(300_000);
    }, 30_000);

    it('propagates API client errors from submitQuestion', async () => {
      const apiClient = createMockApiClient({
        submitQuestion: vi
          .fn()
          .mockRejectedValue(new Error('network error')),
      });
      const ctx = new WorkerContext(createDeps({ apiClient }));

      await expect(ctx.askQuestion('fail')).rejects.toThrow('network error');
    });

    it('propagates API client errors from getAnswer', async () => {
      vi.useFakeTimers();
      const apiClient = createMockApiClient({
        getAnswer: vi
          .fn()
          .mockRejectedValue(new Error('poll error')),
      });
      const ctx = new WorkerContext(createDeps({ apiClient }));

      const promise = ctx.askQuestion('fail on poll');
      const result = await advanceAndCatch(promise, 600);

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe('poll error');
    });
  });
});
