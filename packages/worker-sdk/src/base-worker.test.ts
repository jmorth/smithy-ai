import { describe, it, expect, vi } from 'vitest';
import { SmithyWorker } from './base-worker.js';
import type {
  Package,
  WorkerContext,
  PackageOutput,
  WorkerLogger,
} from '@smithy/shared';

// --- Test helpers ---

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
    id: 'pkg-1',
    type: 'USER_INPUT' as Package['type'],
    status: 'PENDING' as Package['status'],
    metadata: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockContext(overrides: Partial<WorkerContext> = {}): WorkerContext {
  return {
    jobId: 'job-1',
    packageId: 'pkg-1',
    ai: {},
    inputPackage: {
      getFile: vi.fn(),
      getFileAsString: vi.fn(),
      listFiles: vi.fn().mockReturnValue([]),
      getMetadata: vi.fn().mockReturnValue({}),
    },
    outputBuilder: {
      addFile: vi.fn().mockReturnThis(),
      setMetadata: vi.fn().mockReturnThis(),
      setType: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue(createMockOutput()),
    },
    logger: createMockLogger(),
    askQuestion: vi.fn(),
    ...overrides,
  };
}

function createMockOutput(overrides: Partial<PackageOutput> = {}): PackageOutput {
  return {
    type: 'CODE',
    files: [],
    metadata: {},
    ...overrides,
  };
}

/** Concrete test implementation of SmithyWorker */
class TestWorker extends SmithyWorker {
  receivedPackage: Package | null = null;
  processedContext: WorkerContext | null = null;

  async onReceive(pkg: Package): Promise<void> {
    this.receivedPackage = pkg;
  }

  async onProcess(context: WorkerContext): Promise<PackageOutput> {
    this.processedContext = context;
    return createMockOutput();
  }
}

/** Worker that throws during onProcess */
class FailingWorker extends SmithyWorker {
  async onReceive(_pkg: Package): Promise<void> {
    // no-op
  }

  async onProcess(_context: WorkerContext): Promise<PackageOutput> {
    throw new Error('processing failed');
  }
}

/** Worker that throws during onReceive */
class ReceiveFailingWorker extends SmithyWorker {
  async onReceive(_pkg: Package): Promise<void> {
    throw new Error('validation failed');
  }

  async onProcess(_context: WorkerContext): Promise<PackageOutput> {
    return createMockOutput();
  }
}

/** Worker with custom onComplete and onError overrides */
class CustomLifecycleWorker extends SmithyWorker {
  completedOutput: PackageOutput | null = null;
  handledError: Error | null = null;

  async onReceive(_pkg: Package): Promise<void> {
    // no-op
  }

  async onProcess(_context: WorkerContext): Promise<PackageOutput> {
    return createMockOutput();
  }

  override async onComplete(output: PackageOutput): Promise<void> {
    this.completedOutput = output;
  }

  override async onError(error: Error): Promise<void> {
    this.handledError = error;
    // Does not re-throw — custom handling
  }
}

// --- Tests ---

describe('SmithyWorker', () => {
  describe('class structure', () => {
    it('is an abstract class (cannot be instantiated directly)', () => {
      const worker = new TestWorker();
      expect(worker).toBeInstanceOf(SmithyWorker);
    });

    it('has abstract onReceive method', () => {
      const worker = new TestWorker();
      expect(typeof worker.onReceive).toBe('function');
    });

    it('has abstract onProcess method', () => {
      const worker = new TestWorker();
      expect(typeof worker.onProcess).toBe('function');
    });

    it('has default onComplete method', () => {
      const worker = new TestWorker();
      expect(typeof worker.onComplete).toBe('function');
    });

    it('has default onError method', () => {
      const worker = new TestWorker();
      expect(typeof worker.onError).toBe('function');
    });
  });

  describe('name property', () => {
    it('defaults to the class name', () => {
      const worker = new TestWorker();
      expect(worker.name).toBe('TestWorker');
    });

    it('reflects the actual subclass name', () => {
      const worker = new FailingWorker();
      expect(worker.name).toBe('FailingWorker');
    });

    it('is readonly', () => {
      const worker = new TestWorker();
      expect(worker.name).toBe('TestWorker');
    });
  });

  describe('logger property', () => {
    it('is undefined by default', () => {
      const worker = new TestWorker();
      expect(worker.logger).toBeUndefined();
    });

    it('can be assigned a logger', () => {
      const worker = new TestWorker();
      const logger = createMockLogger();
      worker.logger = logger;
      expect(worker.logger).toBe(logger);
    });
  });

  describe('onReceive', () => {
    it('receives the package argument', async () => {
      const worker = new TestWorker();
      const pkg = createMockPackage({ id: 'pkg-receive-test' });

      await worker.onReceive(pkg);

      expect(worker.receivedPackage).toBe(pkg);
      expect(worker.receivedPackage?.id).toBe('pkg-receive-test');
    });

    it('can throw for validation failures', async () => {
      const worker = new ReceiveFailingWorker();
      const pkg = createMockPackage();

      await expect(worker.onReceive(pkg)).rejects.toThrow('validation failed');
    });
  });

  describe('onProcess', () => {
    it('receives the context and returns PackageOutput', async () => {
      const worker = new TestWorker();
      const context = createMockContext();

      const result = await worker.onProcess(context);

      expect(worker.processedContext).toBe(context);
      expect(result).toEqual({ type: 'CODE', files: [], metadata: {} });
    });

    it('can throw when processing fails', async () => {
      const worker = new FailingWorker();
      const context = createMockContext();

      await expect(worker.onProcess(context)).rejects.toThrow('processing failed');
    });
  });

  describe('onComplete (default implementation)', () => {
    it('logs completion when logger is available', async () => {
      const worker = new TestWorker();
      const logger = createMockLogger();
      worker.logger = logger;
      const output = createMockOutput();

      await worker.onComplete(output);

      expect(logger.info).toHaveBeenCalledWith('Worker completed successfully');
    });

    it('is a no-op when logger is not available', async () => {
      const worker = new TestWorker();
      const output = createMockOutput();

      await expect(worker.onComplete(output)).resolves.toBeUndefined();
    });

    it('can be overridden by subclasses', async () => {
      const worker = new CustomLifecycleWorker();
      const output = createMockOutput({ metadata: { custom: true } });

      await worker.onComplete(output);

      expect(worker.completedOutput).toBe(output);
      expect(worker.completedOutput?.metadata).toEqual({ custom: true });
    });
  });

  describe('onError (default implementation)', () => {
    it('logs the error and re-throws when logger is available', async () => {
      const worker = new TestWorker();
      const logger = createMockLogger();
      worker.logger = logger;
      const error = new Error('something went wrong');

      await expect(worker.onError(error)).rejects.toThrow('something went wrong');
      expect(logger.error).toHaveBeenCalledWith('Worker failed', {
        error: 'something went wrong',
      });
    });

    it('re-throws the error even when logger is not available', async () => {
      const worker = new TestWorker();
      const error = new Error('no logger error');

      await expect(worker.onError(error)).rejects.toThrow('no logger error');
    });

    it('re-throws the exact same error instance', async () => {
      const worker = new TestWorker();
      const error = new Error('exact instance');

      try {
        await worker.onError(error);
      } catch (caught) {
        expect(caught).toBe(error);
      }
    });

    it('can be overridden by subclasses without re-throw', async () => {
      const worker = new CustomLifecycleWorker();
      const error = new Error('handled gracefully');

      await expect(worker.onError(error)).resolves.toBeUndefined();
      expect(worker.handledError).toBe(error);
    });
  });

  describe('full lifecycle flow', () => {
    it('supports the complete lifecycle: onReceive → onProcess → onComplete', async () => {
      const worker = new TestWorker();
      const logger = createMockLogger();
      worker.logger = logger;
      const pkg = createMockPackage({ id: 'lifecycle-test' });
      const context = createMockContext({ packageId: 'lifecycle-test' });

      await worker.onReceive(pkg);
      expect(worker.receivedPackage?.id).toBe('lifecycle-test');

      const output = await worker.onProcess(context);
      expect(output.type).toBe('CODE');

      await worker.onComplete(output);
      expect(logger.info).toHaveBeenCalledWith('Worker completed successfully');
    });

    it('supports the error lifecycle: onReceive → onProcess (throws) → onError', async () => {
      const worker = new FailingWorker();
      const logger = createMockLogger();
      worker.logger = logger;
      const pkg = createMockPackage();
      const context = createMockContext();

      await worker.onReceive(pkg);

      await expect(worker.onProcess(context)).rejects.toThrow('processing failed');

      const error = new Error('processing failed');
      await expect(worker.onError(error)).rejects.toThrow('processing failed');
      expect(logger.error).toHaveBeenCalledWith('Worker failed', {
        error: 'processing failed',
      });
    });
  });
});
