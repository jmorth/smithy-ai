import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SmithyApiClient,
  ApiClientError,
  type SmithyApiClientOptions,
  type FileEntry,
} from './api-client.js';
import type { WorkerLogger } from '@smithy/shared';

// --- Test helpers ---

function createMockLogger(): WorkerLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createClient(
  overrides?: Partial<SmithyApiClientOptions>,
): SmithyApiClient {
  return new SmithyApiClient({
    baseUrl: 'https://api.smithy.test',
    apiKey: 'test-api-key',
    logger: createMockLogger(),
    ...overrides,
  });
}

function jsonResponse(
  body: unknown,
  status = 200,
  statusText = 'OK',
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status = 204, statusText = 'No Content'): Response {
  return new Response(null, { status, statusText });
}

function errorResponse(
  status: number,
  body?: string,
  statusText = 'Error',
): Response {
  return new Response(body ?? '', { status, statusText });
}

// --- Tests ---

describe('SmithyApiClient', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('construction', () => {
    it('creates a client with required options', () => {
      const client = createClient();
      expect(client).toBeInstanceOf(SmithyApiClient);
    });

    it('strips trailing slashes from baseUrl', async () => {
      const client = createClient({ baseUrl: 'https://api.smithy.test///' });
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      await client.healthCheck();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.smithy.test/api/health',
        expect.any(Object),
      );
    });

    it('uses default timeout of 30 seconds', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      await client.healthCheck();

      // Verify AbortController is used (signal is present)
      const callArgs = fetchSpy.mock.calls[0]!;
      expect(callArgs[1].signal).toBeDefined();
    });

    it('accepts custom timeout', () => {
      const client = createClient({ requestTimeoutMs: 5000 });
      expect(client).toBeInstanceOf(SmithyApiClient);
    });
  });

  describe('fromEnv', () => {
    it('creates a client from environment variables', () => {
      vi.stubEnv('SMITHY_API_URL', 'https://env.smithy.test');
      vi.stubEnv('SMITHY_API_KEY', 'env-key');

      const client = SmithyApiClient.fromEnv();
      expect(client).toBeInstanceOf(SmithyApiClient);
    });

    it('throws when SMITHY_API_URL is not set', () => {
      vi.stubEnv('SMITHY_API_URL', '');
      vi.stubEnv('SMITHY_API_KEY', 'env-key');

      expect(() => SmithyApiClient.fromEnv()).toThrow(
        'SMITHY_API_URL environment variable is not set',
      );
    });

    it('throws when SMITHY_API_KEY is not set', () => {
      vi.stubEnv('SMITHY_API_URL', 'https://env.smithy.test');
      vi.stubEnv('SMITHY_API_KEY', '');

      expect(() => SmithyApiClient.fromEnv()).toThrow(
        'SMITHY_API_KEY environment variable is not set',
      );
    });

    it('passes logger to the created client', async () => {
      vi.stubEnv('SMITHY_API_URL', 'https://env.smithy.test');
      vi.stubEnv('SMITHY_API_KEY', 'env-key');
      const logger = createMockLogger();

      const client = SmithyApiClient.fromEnv(logger);
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
      await client.healthCheck();

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('authorization', () => {
    it('includes Bearer token in all requests', async () => {
      const client = createClient({ apiKey: 'my-secret-key' });
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      await client.healthCheck();

      const [, options] = fetchSpy.mock.calls[0]!;
      expect(options.headers.Authorization).toBe('Bearer my-secret-key');
    });

    it('includes Content-Type: application/json in all requests', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      await client.healthCheck();

      const [, options] = fetchSpy.mock.calls[0]!;
      expect(options.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('healthCheck', () => {
    it('sends GET to /api/health', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      const result = await client.healthCheck();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.smithy.test/api/health',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('updateStatus', () => {
    it('sends PUT to /api/jobs/{jobId}/status with state', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(emptyResponse());

      await client.updateStatus('job-123', 'RUNNING');

      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('https://api.smithy.test/api/jobs/job-123/status');
      expect(options.method).toBe('PUT');
      expect(JSON.parse(options.body)).toEqual({ state: 'RUNNING' });
    });

    it('encodes jobId in the URL', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(emptyResponse());

      await client.updateStatus('job/with spaces', 'COMPLETED');

      const [url] = fetchSpy.mock.calls[0]!;
      expect(url).toBe(
        'https://api.smithy.test/api/jobs/job%2Fwith%20spaces/status',
      );
    });
  });

  describe('submitQuestion', () => {
    it('sends POST to /api/jobs/{jobId}/questions', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ questionId: 'q-456' }),
      );

      const result = await client.submitQuestion(
        'job-123',
        'What framework?',
      );

      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toBe(
        'https://api.smithy.test/api/jobs/job-123/questions',
      );
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        question: 'What framework?',
        choices: undefined,
      });
      expect(result).toEqual({ questionId: 'q-456' });
    });

    it('includes choices when provided', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ questionId: 'q-789' }),
      );

      await client.submitQuestion('job-123', 'Pick one', {
        choices: ['React', 'Vue', 'Angular'],
      });

      const [, options] = fetchSpy.mock.calls[0]!;
      expect(JSON.parse(options.body)).toEqual({
        question: 'Pick one',
        choices: ['React', 'Vue', 'Angular'],
      });
    });
  });

  describe('getAnswer', () => {
    it('sends GET to /api/jobs/{jobId}/questions/{questionId}', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ answer: 'React' }),
      );

      const result = await client.getAnswer('job-123', 'q-456');

      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toBe(
        'https://api.smithy.test/api/jobs/job-123/questions/q-456',
      );
      expect(options.method).toBe('GET');
      expect(result).toEqual({ answer: 'React' });
    });

    it('returns null answer when question is not yet answered', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ answer: null }));

      const result = await client.getAnswer('job-123', 'q-456');
      expect(result).toEqual({ answer: null });
    });
  });

  describe('awaitAnswer', () => {
    it('returns immediately when answer is available on first poll', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ answer: 'yes' }));

      const result = await client.awaitAnswer('job-123', 'q-456');

      expect(result).toBe('yes');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('polls until answer is available', async () => {
      vi.useFakeTimers();
      const client = createClient({ maxRetries: 0 });

      fetchSpy
        .mockResolvedValueOnce(jsonResponse({ answer: null }))
        .mockResolvedValueOnce(jsonResponse({ answer: null }))
        .mockResolvedValueOnce(jsonResponse({ answer: 'finally!' }));

      const promise = client.awaitAnswer('job-123', 'q-456');

      // First call returns null, then sleeps 500ms
      await vi.advanceTimersByTimeAsync(600);
      // Second call returns null, then sleeps 750ms
      await vi.advanceTimersByTimeAsync(800);
      // Third call returns answer

      const result = await promise;
      expect(result).toBe('finally!');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('throws ApiClientError on timeout', async () => {
      vi.useFakeTimers();
      const client = createClient({ maxRetries: 0 });

      fetchSpy.mockImplementation(() =>
        Promise.resolve(jsonResponse({ answer: null })),
      );

      const promise = client.awaitAnswer('job-123', 'q-456', 2000);
      const caught = promise.catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(3000);
      const result = await caught;

      expect(result).toBeInstanceOf(ApiClientError);
      expect((result as ApiClientError).message).toContain('Timed out');
      expect((result as ApiClientError).message).toContain('2000ms');
    });

    it('uses default poll timeout when not specified', async () => {
      vi.useFakeTimers();
      const client = createClient({ maxRetries: 0, pollTimeoutMs: 1000 });

      fetchSpy.mockImplementation(() =>
        Promise.resolve(jsonResponse({ answer: null })),
      );

      const promise = client.awaitAnswer('job-123', 'q-456');
      const caught = promise.catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(2000);
      const result = await caught;

      expect(result).toBeInstanceOf(ApiClientError);
      expect((result as ApiClientError).message).toContain('1000ms');
    });
  });

  describe('createOutputPackage', () => {
    it('sends POST to /api/jobs/{jobId}/output with base64-encoded files', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ packageId: 'pkg-out-1' }),
      );

      const files: FileEntry[] = [
        {
          filename: 'result.txt',
          content: 'Hello World',
          mimeType: 'text/plain',
        },
      ];
      const metadata = { version: 1 };

      const result = await client.createOutputPackage(
        'job-123',
        files,
        metadata,
      );

      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toBe('https://api.smithy.test/api/jobs/job-123/output');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.metadata).toEqual({ version: 1 });
      expect(body.files).toHaveLength(1);
      expect(body.files[0].filename).toBe('result.txt');
      expect(body.files[0].mimeType).toBe('text/plain');
      // Verify base64 encoding
      expect(Buffer.from(body.files[0].content, 'base64').toString()).toBe(
        'Hello World',
      );
      expect(result).toEqual({ packageId: 'pkg-out-1' });
    });

    it('handles Buffer content', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ packageId: 'pkg-out-2' }),
      );

      const files: FileEntry[] = [
        {
          filename: 'binary.bin',
          content: Buffer.from([0x00, 0x01, 0xff]),
          mimeType: 'application/octet-stream',
        },
      ];

      await client.createOutputPackage('job-123', files, {});

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      const decoded = Buffer.from(body.files[0].content, 'base64');
      expect(decoded).toEqual(Buffer.from([0x00, 0x01, 0xff]));
    });

    it('handles multiple files', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ packageId: 'pkg-out-3' }),
      );

      const files: FileEntry[] = [
        { filename: 'a.txt', content: 'AAA', mimeType: 'text/plain' },
        { filename: 'b.txt', content: 'BBB', mimeType: 'text/plain' },
        { filename: 'c.json', content: '{}', mimeType: 'application/json' },
      ];

      await client.createOutputPackage('job-123', files, { count: 3 });

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.files).toHaveLength(3);
      expect(body.files.map((f: { filename: string }) => f.filename)).toEqual([
        'a.txt',
        'b.txt',
        'c.json',
      ]);
    });
  });

  describe('retry logic', () => {
    it('retries on HTTP 500', async () => {
      vi.useFakeTimers();
      const client = createClient({ maxRetries: 2 });

      fetchSpy
        .mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'))
        .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      const promise = client.healthCheck();
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result).toEqual({ status: 'ok' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retries on HTTP 502', async () => {
      vi.useFakeTimers();
      const client = createClient({ maxRetries: 2 });

      fetchSpy
        .mockResolvedValueOnce(errorResponse(502, 'Bad Gateway'))
        .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      const promise = client.healthCheck();
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result).toEqual({ status: 'ok' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retries on HTTP 503', async () => {
      vi.useFakeTimers();
      const client = createClient({ maxRetries: 2 });

      fetchSpy
        .mockResolvedValueOnce(errorResponse(503, 'Service Unavailable'))
        .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      const promise = client.healthCheck();
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result).toEqual({ status: 'ok' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retries on HTTP 504', async () => {
      vi.useFakeTimers();
      const client = createClient({ maxRetries: 2 });

      fetchSpy
        .mockResolvedValueOnce(errorResponse(504, 'Gateway Timeout'))
        .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      const promise = client.healthCheck();
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result).toEqual({ status: 'ok' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retries on network errors (TypeError)', async () => {
      vi.useFakeTimers();
      const client = createClient({ maxRetries: 2 });

      fetchSpy
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      const promise = client.healthCheck();
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result).toEqual({ status: 'ok' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('uses exponential backoff between retries', async () => {
      vi.useFakeTimers();
      const client = createClient({ maxRetries: 3 });

      fetchSpy
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      const promise = client.healthCheck();

      // First retry after 500ms
      await vi.advanceTimersByTimeAsync(500);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Second retry after 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      // Third retry after 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result).toEqual({ status: 'ok' });
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('throws after exhausting all retries', async () => {
      vi.useFakeTimers();
      const client = createClient({ maxRetries: 2 });

      fetchSpy.mockResolvedValue(errorResponse(500, 'Internal Server Error'));

      const promise = client.healthCheck();
      const caught = promise.catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(5000);
      const result = await caught;

      expect(result).toBeInstanceOf(ApiClientError);
      expect((result as ApiClientError).statusCode).toBe(500);
      expect(fetchSpy).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('does not retry 4xx errors', async () => {
      const client = createClient({ maxRetries: 3 });

      fetchSpy.mockResolvedValueOnce(errorResponse(400, 'Bad Request'));

      await expect(client.healthCheck()).rejects.toThrow(ApiClientError);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does not retry 404 errors', async () => {
      const client = createClient({ maxRetries: 3 });

      fetchSpy.mockResolvedValueOnce(errorResponse(404, 'Not Found'));

      await expect(client.healthCheck()).rejects.toThrow(ApiClientError);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does not retry 401 errors', async () => {
      const client = createClient({ maxRetries: 3 });

      fetchSpy.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'));

      await expect(client.healthCheck()).rejects.toThrow(ApiClientError);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does not retry 422 errors', async () => {
      const client = createClient({ maxRetries: 3 });

      fetchSpy.mockResolvedValueOnce(
        errorResponse(422, '{"message":"Validation failed"}'),
      );

      await expect(client.healthCheck()).rejects.toThrow(ApiClientError);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('throws ApiClientError with status code for HTTP errors', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        errorResponse(404, 'Not found'),
      );

      try {
        await client.healthCheck();
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiErr = error as ApiClientError;
        expect(apiErr.statusCode).toBe(404);
        expect(apiErr.url).toBe('https://api.smithy.test/api/health');
        expect(apiErr.method).toBe('GET');
      }
    });

    it('includes response body in error message', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        errorResponse(400, '{"message":"Invalid job ID"}'),
      );

      await expect(client.updateStatus('bad', 'RUNNING')).rejects.toThrow(
        'Invalid job ID',
      );
    });

    it('handles timeout via AbortController', async () => {
      vi.useFakeTimers();
      const client = createClient({
        requestTimeoutMs: 100,
        maxRetries: 0,
      });

      fetchSpy.mockImplementation(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            });
          }),
      );

      const promise = client.healthCheck();
      const caught = promise.catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(200);
      const result = await caught;

      expect(result).toBeInstanceOf(ApiClientError);
      expect((result as ApiClientError).message).toContain('timed out');
    });

    it('rethrows unexpected non-retryable errors', async () => {
      const client = createClient({ maxRetries: 3 });

      const unexpectedError = new RangeError('unexpected');
      fetchSpy.mockRejectedValueOnce(unexpectedError);

      await expect(client.healthCheck()).rejects.toThrow(unexpectedError);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('retries timeout errors', async () => {
      vi.useFakeTimers();
      const client = createClient({
        requestTimeoutMs: 100,
        maxRetries: 1,
      });

      let callCount = 0;
      fetchSpy.mockImplementation(
        (_url: string, options: { signal: AbortSignal }) => {
          callCount++;
          if (callCount === 1) {
            return new Promise((_resolve, reject) => {
              options.signal.addEventListener('abort', () => {
                reject(
                  new DOMException('The operation was aborted', 'AbortError'),
                );
              });
            });
          }
          return Promise.resolve(jsonResponse({ status: 'ok' }));
        },
      );

      const promise = client.healthCheck();
      // Advance past the timeout + retry delay
      await vi.advanceTimersByTimeAsync(700);
      const result = await promise;

      expect(result).toEqual({ status: 'ok' });
      expect(callCount).toBe(2);
    });
  });

  describe('logging', () => {
    it('logs request details at debug level', async () => {
      const logger = createMockLogger();
      const client = createClient({ logger });
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      await client.healthCheck();

      expect(logger.debug).toHaveBeenCalledWith(
        'API request completed',
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.smithy.test/api/health',
          statusCode: 200,
          durationMs: expect.any(Number),
        }),
      );
    });

    it('logs retry attempts at debug level', async () => {
      vi.useFakeTimers();
      const logger = createMockLogger();
      const client = createClient({ logger, maxRetries: 1 });

      fetchSpy
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      const promise = client.healthCheck();
      await vi.advanceTimersByTimeAsync(600);
      await promise;

      expect(logger.debug).toHaveBeenCalledWith(
        'Retrying request',
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.smithy.test/api/health',
          attempt: 1,
          delayMs: 500,
        }),
      );
    });

    it('works without a logger', async () => {
      const client = createClient({ logger: undefined });
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      await expect(client.healthCheck()).resolves.toEqual({ status: 'ok' });
    });
  });

  describe('request body handling', () => {
    it('does not send body for GET requests', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      await client.healthCheck();

      const [, options] = fetchSpy.mock.calls[0]!;
      expect(options.body).toBeUndefined();
    });

    it('sends JSON body for POST requests', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ questionId: 'q-1' }),
      );

      await client.submitQuestion('job-1', 'Question?');

      const [, options] = fetchSpy.mock.calls[0]!;
      expect(typeof options.body).toBe('string');
      expect(JSON.parse(options.body)).toEqual({
        question: 'Question?',
        choices: undefined,
      });
    });

    it('sends JSON body for PUT requests', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(emptyResponse());

      await client.updateStatus('job-1', 'RUNNING');

      const [, options] = fetchSpy.mock.calls[0]!;
      expect(JSON.parse(options.body)).toEqual({ state: 'RUNNING' });
    });
  });

  describe('response handling', () => {
    it('handles empty response bodies', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(emptyResponse());

      const result = await client.updateStatus('job-1', 'RUNNING');
      expect(result).toBeUndefined();
    });

    it('parses JSON response bodies', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ status: 'healthy', uptime: 1234 }),
      );

      const result = await client.healthCheck();
      expect(result).toEqual({ status: 'healthy', uptime: 1234 });
    });
  });

  describe('edge cases', () => {
    it('falls back to statusText when error response body is empty', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        new Response('', { status: 400, statusText: 'Bad Request' }),
      );

      try {
        await client.healthCheck();
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiErr = error as ApiClientError;
        expect(apiErr.message).toContain('Bad Request');
      }
    });

    it('handles response.text() failure during error handling', async () => {
      const client = createClient();
      const badResponse = {
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: () => Promise.reject(new Error('read body failed')),
      } as unknown as Response;
      fetchSpy.mockResolvedValueOnce(badResponse);

      try {
        await client.healthCheck();
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiErr = error as ApiClientError;
        // Should fall back to statusText since text() failed
        expect(apiErr.message).toContain('Unprocessable Entity');
      }
    });
  });

  describe('ContextApiClient interface compliance', () => {
    it('implements submitQuestion matching the ContextApiClient interface', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ questionId: 'q-test' }),
      );

      const result = await client.submitQuestion(
        'job-1',
        'Question?',
        { choices: ['a', 'b'] },
      );

      expect(result).toEqual({ questionId: 'q-test' });
    });

    it('implements getAnswer matching the ContextApiClient interface', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ answer: 'reply' }));

      const result = await client.getAnswer('job-1', 'q-1');

      expect(result).toEqual({ answer: 'reply' });
    });
  });
});
