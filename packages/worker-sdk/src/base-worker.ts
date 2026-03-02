import type {
  Package,
  WorkerContext,
  PackageOutput,
  WorkerLogger,
} from '@smithy/shared';

/**
 * Abstract base class for all Smithy Workers.
 *
 * Every Worker extends this class and implements the lifecycle hooks
 * to define its behavior. The runner (task 061) instantiates Workers
 * and calls the hooks in order: onReceive → onProcess → onComplete/onError.
 */
export abstract class SmithyWorker {
  /** Worker name — defaults to the class name. Useful for logging and debugging. */
  readonly name: string;

  /** Optional logger injected by the runner before lifecycle hooks are called. */
  logger?: WorkerLogger;

  constructor() {
    this.name = this.constructor.name;
  }

  /**
   * Called when the Worker receives its input Package.
   * Use for validation or preprocessing before the main work begins.
   */
  abstract onReceive(pkg: Package): Promise<void>;

  /**
   * The main processing hook. Receives the full runtime context
   * (AI provider, files, logger) and returns the output.
   */
  abstract onProcess(context: WorkerContext): Promise<PackageOutput>;

  /**
   * Called after successful processing. Override to add custom completion logic.
   * Default implementation logs completion if a logger is available.
   */
  async onComplete(output: PackageOutput): Promise<void> {
    this.logger?.info('Worker completed successfully');
  }

  /**
   * Called when processing fails. Override to add custom error handling.
   * Default implementation logs the error and re-throws it so the runner captures it.
   */
  async onError(error: Error): Promise<void> {
    this.logger?.error('Worker failed', { error: error.message });
    throw error;
  }
}
