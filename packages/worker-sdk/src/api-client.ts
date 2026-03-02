import type { JobStatus, QuestionOptions, WorkerLogger } from '@smithy/shared';
import type { ContextApiClient } from './context.js';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_INITIAL_DELAY_MS = 500;
const RETRY_BACKOFF_MULTIPLIER = 2;

const POLL_INITIAL_INTERVAL_MS = 500;
const POLL_MAX_INTERVAL_MS = 5_000;
const POLL_BACKOFF_MULTIPLIER = 1.5;
const DEFAULT_POLL_TIMEOUT_MS = 300_000; // 5 minutes

const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

export interface FileEntry {
  filename: string;
  content: Buffer | string;
  mimeType: string;
}

export interface SmithyApiClientOptions {
  baseUrl: string;
  apiKey: string;
  logger?: WorkerLogger;
  requestTimeoutMs?: number;
  maxRetries?: number;
  pollTimeoutMs?: number;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly url?: string,
    public readonly method?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class SmithyApiClient implements ContextApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger?: WorkerLogger;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly pollTimeoutMs: number;

  constructor(options: SmithyApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.logger = options.logger;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  }

  static fromEnv(logger?: WorkerLogger): SmithyApiClient {
    const baseUrl = process.env.SMITHY_API_URL;
    const apiKey = process.env.SMITHY_API_KEY;

    if (!baseUrl) {
      throw new ApiClientError(
        'SMITHY_API_URL environment variable is not set',
      );
    }
    if (!apiKey) {
      throw new ApiClientError(
        'SMITHY_API_KEY environment variable is not set',
      );
    }

    return new SmithyApiClient({ baseUrl, apiKey, logger });
  }

  async healthCheck(): Promise<{ status: string }> {
    return this.request<{ status: string }>('GET', '/api/health');
  }

  async updateStatus(jobId: string, state: JobStatus): Promise<void> {
    await this.request<void>(
      'PUT',
      `/api/jobs/${encodeURIComponent(jobId)}/status`,
      { state },
    );
  }

  async submitQuestion(
    jobId: string,
    question: string,
    options?: QuestionOptions,
  ): Promise<{ questionId: string }> {
    return this.request<{ questionId: string }>(
      'POST',
      `/api/jobs/${encodeURIComponent(jobId)}/questions`,
      { question, choices: options?.choices },
    );
  }

  async getAnswer(
    jobId: string,
    questionId: string,
  ): Promise<{ answer: string | null }> {
    return this.request<{ answer: string | null }>(
      'GET',
      `/api/jobs/${encodeURIComponent(jobId)}/questions/${encodeURIComponent(questionId)}`,
    );
  }

  async awaitAnswer(
    jobId: string,
    questionId: string,
    timeoutMs?: number,
  ): Promise<string> {
    const timeout = timeoutMs ?? this.pollTimeoutMs;
    const startTime = Date.now();
    let interval = POLL_INITIAL_INTERVAL_MS;

    while (Date.now() - startTime < timeout) {
      const { answer } = await this.getAnswer(jobId, questionId);
      if (answer !== null) {
        return answer;
      }

      await sleep(interval);
      interval = Math.min(
        interval * POLL_BACKOFF_MULTIPLIER,
        POLL_MAX_INTERVAL_MS,
      );
    }

    throw new ApiClientError(
      `Timed out waiting for answer to question "${questionId}" after ${timeout}ms`,
    );
  }

  async createOutputPackage(
    jobId: string,
    files: FileEntry[],
    metadata: Record<string, unknown>,
  ): Promise<{ packageId: string }> {
    const encodedFiles = files.map((f) => ({
      filename: f.filename,
      content:
        typeof f.content === 'string'
          ? Buffer.from(f.content).toString('base64')
          : f.content.toString('base64'),
      mimeType: f.mimeType,
    }));

    return this.request<{ packageId: string }>(
      'POST',
      `/api/jobs/${encodeURIComponent(jobId)}/output`,
      { files: encodedFiles, metadata },
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay =
          RETRY_INITIAL_DELAY_MS *
          Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1);
        this.logger?.debug('Retrying request', {
          method,
          url,
          attempt,
          delayMs: delay,
        });
        await sleep(delay);
      }

      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.requestTimeoutMs,
      );

      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        };

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (body !== undefined) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);
        const duration = Date.now() - startTime;

        this.logger?.debug('API request completed', {
          method,
          url,
          statusCode: response.status,
          durationMs: duration,
        });

        if (response.ok) {
          const text = await response.text();
          if (!text) {
            return undefined as T;
          }
          return JSON.parse(text) as T;
        }

        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          lastError = new ApiClientError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            url,
            method,
          );
          continue;
        }

        const errorBody = await response.text().catch(() => '');
        throw new ApiClientError(
          `HTTP ${response.status}: ${errorBody || response.statusText}`,
          response.status,
          url,
          method,
        );
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof ApiClientError && !RETRYABLE_STATUS_CODES.has(error.statusCode ?? 0)) {
          throw error;
        }

        if (error instanceof DOMException && error.name === 'AbortError') {
          lastError = new ApiClientError(
            `Request timed out after ${this.requestTimeoutMs}ms`,
            undefined,
            url,
            method,
          );
          continue;
        }

        if (error instanceof TypeError) {
          lastError = new ApiClientError(
            `Network error: ${error.message}`,
            undefined,
            url,
            method,
          );
          continue;
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError ?? new ApiClientError('Request failed after retries');
  }
}

/** Alias for barrel-export compatibility with the placeholder name. */
export { SmithyApiClient as APIClient };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
