import pino from 'pino';
import type {
  WorkerContext as IWorkerContext,
  InputPackage,
  OutputBuilder,
  WorkerLogger,
  QuestionOptions,
} from '@smithy/shared';
import { QuestionTimeoutError } from './errors.js';

const DEFAULT_QUESTION_TIMEOUT_MS = 300_000; // 5 minutes
const INITIAL_POLL_INTERVAL_MS = 500;
const MAX_POLL_INTERVAL_MS = 5_000;
const BACKOFF_MULTIPLIER = 1.5;

/**
 * Minimal interface for the API client methods that WorkerContext needs.
 * The full APIClient (task 059) implements this; we depend only on the subset we use.
 */
export interface ContextApiClient {
  submitQuestion(
    jobId: string,
    question: string,
    options?: QuestionOptions,
  ): Promise<{ questionId: string }>;
  getAnswer(
    jobId: string,
    questionId: string,
  ): Promise<{ answer: string | null }>;
}

/**
 * Dependencies injected into WorkerContext by the runner.
 */
export interface WorkerContextDeps {
  jobId: string;
  packageId: string;
  workerId: string;
  ai: unknown;
  inputPackage: InputPackage;
  outputBuilder: OutputBuilder;
  apiClient: ContextApiClient;
}

/**
 * Runtime context passed to a Worker's onProcess hook.
 *
 * Constructed by the runner (task 061) with all dependencies injected.
 * Not self-constructing — Workers receive this, they don't create it.
 */
export class WorkerContext implements IWorkerContext {
  readonly jobId: string;
  readonly packageId: string;
  readonly ai: unknown;
  readonly inputPackage: InputPackage;
  readonly outputBuilder: OutputBuilder;
  readonly logger: WorkerLogger;

  private readonly apiClient: ContextApiClient;

  /** Use WorkerContext.create() — constructor is internal to the SDK. */
  constructor(deps: WorkerContextDeps) {
    this.jobId = deps.jobId;
    this.packageId = deps.packageId;
    this.ai = deps.ai;
    this.inputPackage = deps.inputPackage;
    this.outputBuilder = deps.outputBuilder;
    this.apiClient = deps.apiClient;

    const pinoLogger = pino({
      base: { jobId: deps.jobId, workerId: deps.workerId },
    });

    this.logger = {
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

  /**
   * Static factory method — the recommended way the runner creates contexts.
   */
  static create(deps: WorkerContextDeps): WorkerContext {
    return new WorkerContext(deps);
  }

  /**
   * Sends a question to the API (enters STUCK state), polls for an answer
   * with exponential backoff, and returns the answer string.
   *
   * @throws QuestionTimeoutError if no answer is received within the timeout.
   */
  async askQuestion(
    question: string,
    options?: QuestionOptions,
  ): Promise<string> {
    const timeout = options?.timeout ?? DEFAULT_QUESTION_TIMEOUT_MS;
    const { questionId } = await this.apiClient.submitQuestion(
      this.jobId,
      question,
      options,
    );

    const startTime = Date.now();
    let interval = INITIAL_POLL_INTERVAL_MS;

    while (Date.now() - startTime < timeout) {
      await sleep(interval);

      const { answer } = await this.apiClient.getAnswer(
        this.jobId,
        questionId,
      );
      if (answer !== null) {
        return answer;
      }

      interval = Math.min(interval * BACKOFF_MULTIPLIER, MAX_POLL_INTERVAL_MS);
    }

    throw new QuestionTimeoutError(questionId, timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
