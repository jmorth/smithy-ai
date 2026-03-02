import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import pino from 'pino';
import type { JobStatus, WorkerLogger } from '@smithy/shared';
import { SmithyWorker } from './base-worker.js';
import { WorkerContext } from './context.js';
import { SmithyApiClient } from './api-client.js';
import { createModel } from './ai.js';
import type { AiProviderConfig } from './ai.js';
import { InputPackageImpl } from './input-package.js';
import { OutputBuilderImpl } from './output-builder.js';

/** Shape of the Worker's YAML config at /config/worker.yaml. */
export interface WorkerYamlConfig {
  name: string;
  timeout?: number;
  ai: AiProviderConfig;
}

/** Exit codes used by the runner. */
export const EXIT_CODES = {
  SUCCESS: 0,
  RUNTIME_ERROR: 1,
  INVALID_WORKER: 2,
  TIMEOUT: 124,
} as const;

const CONFIG_PATH = '/config/worker.yaml';
const WORKER_MODULE_PATH = '/worker/worker.ts';
const INPUT_DIR = '/input';

/**
 * Loads and parses the Worker YAML config from the given path.
 * @throws if the file doesn't exist or contains invalid YAML.
 */
export function loadYamlConfig(configPath: string): WorkerYamlConfig {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw) as WorkerYamlConfig;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid YAML config: expected an object, got ${typeof parsed}`);
  }
  if (!parsed.name || typeof parsed.name !== 'string') {
    throw new Error('YAML config missing required field: name');
  }
  if (!parsed.ai || typeof parsed.ai !== 'object') {
    throw new Error('YAML config missing required field: ai');
  }
  if (!parsed.ai.name || !parsed.ai.model || !parsed.ai.apiKeyEnv) {
    throw new Error('YAML config ai section must include: name, model, apiKeyEnv');
  }

  return parsed;
}

/**
 * Dynamically imports the Worker module and validates it exports a SmithyWorker subclass.
 * @throws if the module doesn't export a default class extending SmithyWorker.
 */
export async function loadWorkerClass(
  modulePath: string,
): Promise<new () => SmithyWorker> {
  const mod = await import(modulePath);
  const keys = Object.keys(mod);
  const firstKey = keys.length > 0 ? keys[0] : undefined;
  const WorkerClass =
    mod.default ?? mod.Worker ?? (firstKey ? mod[firstKey] : undefined);

  if (typeof WorkerClass !== 'function') {
    throw new InvalidWorkerError(
      `Worker module at "${modulePath}" does not export a class. ` +
        'Expected a default export or named export extending SmithyWorker.',
    );
  }

  // Verify the class prototype chain includes SmithyWorker
  let proto = WorkerClass.prototype;
  let isSmithyWorker = false;
  while (proto) {
    if (proto === SmithyWorker.prototype) {
      isSmithyWorker = true;
      break;
    }
    proto = Object.getPrototypeOf(proto);
  }

  if (!isSmithyWorker) {
    throw new InvalidWorkerError(
      `Worker class "${WorkerClass.name}" does not extend SmithyWorker.`,
    );
  }

  return WorkerClass as new () => SmithyWorker;
}

export class InvalidWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWorkerError';
  }
}

/**
 * Reads required environment variables for the runner.
 * @throws if any required variable is missing.
 */
export function readEnvVars(): {
  jobId: string;
  packageId: string;
  workerId: string;
} {
  const jobId = process.env.SMITHY_JOB_ID;
  const packageId = process.env.SMITHY_PACKAGE_ID;
  const workerId = process.env.SMITHY_WORKER_ID;

  if (!jobId) throw new Error('SMITHY_JOB_ID environment variable is not set');
  if (!packageId) throw new Error('SMITHY_PACKAGE_ID environment variable is not set');
  if (!workerId) throw new Error('SMITHY_WORKER_ID environment variable is not set');

  return { jobId, packageId, workerId };
}

/**
 * Creates a Pino logger for the runner.
 */
export function createLogger(jobId: string, workerId: string): WorkerLogger {
  const pinoLogger = pino({
    base: { jobId, workerId, component: 'runner' },
  });

  return {
    info: (message: string, meta?: Record<string, unknown>) =>
      pinoLogger.info(meta ?? {}, message),
    warn: (message: string, meta?: Record<string, unknown>) =>
      pinoLogger.warn(meta ?? {}, message),
    error: (message: string, meta?: Record<string, unknown>) =>
      pinoLogger.error(meta ?? {}, message),
    debug: (message: string, meta?: Record<string, unknown>) =>
      pinoLogger.debug(meta ?? {}, message),
  };
}

/** Options for the run function, allowing DI for testing. */
export interface RunOptions {
  configPath?: string;
  workerModulePath?: string;
  inputDir?: string;
  exit?: (code: number) => void;
}

/**
 * Main runner entry point. Orchestrates the full Worker lifecycle.
 *
 * 1. Load YAML config
 * 2. Read environment variables
 * 3. Create API client, AI provider, logger
 * 4. Dynamically import and validate Worker class
 * 5. Create WorkerContext with all dependencies
 * 6. Execute lifecycle: onReceive → onProcess → onComplete
 * 7. On error: onError → report to API → exit 1
 */
export async function run(options: RunOptions = {}): Promise<void> {
  const configPath = options.configPath ?? CONFIG_PATH;
  const workerModulePath = options.workerModulePath ?? WORKER_MODULE_PATH;
  const inputDir = options.inputDir ?? INPUT_DIR;
  const exit = options.exit ?? ((code: number) => process.exit(code));

  let logger: WorkerLogger | undefined;
  let apiClient: SmithyApiClient | undefined;
  let jobId: string | undefined;
  let worker: SmithyWorker | undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    process.removeListener('uncaughtException', onUncaughtException);
    process.removeListener('unhandledRejection', onUnhandledRejection);
  };

  const reportError = async (err: Error) => {
    logger?.error('Runner failed', { error: err.message, stack: err.stack });
    if (worker) {
      try {
        await worker.onError(err);
      } catch {
        // onError may re-throw by default; that's fine
      }
    }
    if (apiClient && jobId) {
      try {
        await apiClient.updateStatus(jobId, 'ERROR' as JobStatus);
      } catch {
        logger?.error('Failed to update job status to ERROR');
      }
    }
  };

  // Install process-level error handlers
  const onUncaughtException = async (error: Error) => {
    logger?.error('Uncaught exception', { error: error.message, stack: error.stack });
    await reportError(error);
    cleanup();
    exit(EXIT_CODES.RUNTIME_ERROR);
  };

  const onUnhandledRejection = async (reason: unknown) => {
    const error =
      reason instanceof Error ? reason : new Error(String(reason));
    logger?.error('Unhandled rejection', { error: error.message, stack: error.stack });
    await reportError(error);
    cleanup();
    exit(EXIT_CODES.RUNTIME_ERROR);
  };

  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);

  try {
    // Step 1: Load YAML config
    const config = loadYamlConfig(configPath);

    // Step 2: Read environment variables
    const env = readEnvVars();
    jobId = env.jobId;

    // Step 3: Create logger and API client
    logger = createLogger(env.jobId, env.workerId);
    logger.info('Runner starting', { workerName: config.name });

    apiClient = SmithyApiClient.fromEnv(logger);
    logger.info('API client created');

    // Step 4: Update status to RUNNING
    await apiClient.updateStatus(env.jobId, 'RUNNING' as JobStatus);
    logger.info('Job status updated to RUNNING');

    // Step 5: Set timeout if configured
    if (config.timeout && config.timeout > 0) {
      const timeoutMs = config.timeout * 1000;
      timeoutHandle = setTimeout(() => {
        logger?.error('Worker timed out', { timeoutSeconds: config.timeout });
        if (apiClient && jobId) {
          apiClient.updateStatus(jobId, 'ERROR' as JobStatus).catch(() => {});
        }
        exit(EXIT_CODES.TIMEOUT);
      }, timeoutMs);
      // Unref so the timer doesn't keep the process alive if everything else completes
      if (typeof timeoutHandle === 'object' && 'unref' in timeoutHandle) {
        timeoutHandle.unref();
      }
      logger.info('Timeout set', { timeoutSeconds: config.timeout });
    }

    // Step 6: Create AI provider
    const aiModel = createModel(config.ai);
    logger.info('AI provider created', { provider: config.ai.name, model: config.ai.model });

    // Step 7: Dynamically import Worker class
    let WorkerClass: new () => SmithyWorker;
    try {
      WorkerClass = await loadWorkerClass(workerModulePath);
    } catch (error) {
      if (error instanceof InvalidWorkerError) {
        logger.error('Invalid worker module', { error: error.message });
        await apiClient.updateStatus(env.jobId, 'ERROR' as JobStatus);
        cleanup();
        exit(EXIT_CODES.INVALID_WORKER);
        return;
      }
      throw error;
    }
    logger.info('Worker class loaded', { workerClass: WorkerClass.name });

    // Step 8: Instantiate Worker and inject logger
    worker = new WorkerClass();
    worker.logger = logger;

    // Step 9: Create input package and output builder
    const inputMetadata = process.env.SMITHY_PACKAGE_METADATA
      ? (JSON.parse(process.env.SMITHY_PACKAGE_METADATA) as Record<string, unknown>)
      : {};
    const inputPackage = new InputPackageImpl(inputDir, inputMetadata);
    const outputBuilder = new OutputBuilderImpl();

    // Step 10: Create WorkerContext
    const context = WorkerContext.create({
      jobId: env.jobId,
      packageId: env.packageId,
      workerId: env.workerId,
      ai: aiModel,
      inputPackage,
      outputBuilder,
      apiClient,
    });
    logger.info('Worker context created');

    // Step 11: Execute lifecycle — onReceive
    const pkg = {
      id: env.packageId,
      type: 'USER_INPUT' as const,
      status: 'PROCESSING' as const,
      metadata: inputMetadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await worker.onReceive(pkg);
    logger.info('onReceive completed');

    // Step 12: Execute lifecycle — onProcess
    const output = await worker.onProcess(context);
    logger.info('onProcess completed');

    // Step 13: Submit output to API
    const files = output.files.map((f) => ({
      filename: f.filename,
      content: f.content,
      mimeType: f.mimeType,
    }));
    await apiClient.createOutputPackage(env.jobId, files, output.metadata);
    logger.info('Output package submitted to API');

    // Step 14: Execute lifecycle — onComplete
    await worker.onComplete(output);
    logger.info('onComplete completed');

    // Step 15: Update status to COMPLETED
    await apiClient.updateStatus(env.jobId, 'COMPLETED' as JobStatus);
    logger.info('Job status updated to COMPLETED');

    cleanup();
    exit(EXIT_CODES.SUCCESS);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await reportError(err);
    cleanup();
    exit(EXIT_CODES.RUNTIME_ERROR);
  }
}
