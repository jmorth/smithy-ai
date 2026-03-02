import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function makeHost(url = '/api/test', method = 'GET'): ArgumentsHost {
  const mockResponse = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const mockRequest = { url, method };

  return {
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue(mockRequest),
      getResponse: vi.fn().mockReturnValue(mockResponse),
    }),
  } as unknown as ArgumentsHost;
}

function getResponseData(host: ArgumentsHost): {
  statusSpy: ReturnType<typeof vi.fn>;
  jsonSpy: ReturnType<typeof vi.fn>;
} {
  const http = (host.switchToHttp as ReturnType<typeof vi.fn>)();
  const res = http.getResponse();
  return { statusSpy: res.status, jsonSpy: res.json };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    vi.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['NODE_ENV'];
  });

  describe('HttpException handling', () => {
    it('should return 404 status and correct body for NotFoundException', () => {
      const host = makeHost('/api/items/99');
      const exception = new NotFoundException('Item not found');

      filter.catch(exception, host);

      const { statusSpy, jsonSpy } = getResponseData(host);
      expect(statusSpy).toHaveBeenCalledWith(404);
      const body = jsonSpy.mock.calls[0][0];
      expect(body.statusCode).toBe(404);
      expect(body.message).toBe('Item not found');
      expect(body.error).toBe('Not Found');
      expect(body.path).toBe('/api/items/99');
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should return 403 for ForbiddenException', () => {
      const host = makeHost('/api/admin');
      const exception = new ForbiddenException('Access denied');

      filter.catch(exception, host);

      const { statusSpy, jsonSpy } = getResponseData(host);
      expect(statusSpy).toHaveBeenCalledWith(403);
      const body = jsonSpy.mock.calls[0][0];
      expect(body.statusCode).toBe(403);
      expect(body.error).toBe('Forbidden');
    });

    it('should preserve array of messages from BadRequestException with validation errors', () => {
      const host = makeHost('/api/users');
      const validationMessages = ['name must not be empty', 'email is invalid'];
      const exception = new BadRequestException(validationMessages);

      filter.catch(exception, host);

      const { jsonSpy } = getResponseData(host);
      const body = jsonSpy.mock.calls[0][0];
      expect(body.statusCode).toBe(400);
      expect(body.message).toEqual(validationMessages);
      expect(body.error).toBe('Bad Request');
    });

    it('should handle HttpException with plain string response', () => {
      const host = makeHost('/api/test');
      const exception = new HttpException('Custom error text', 422);

      filter.catch(exception, host);

      const { statusSpy, jsonSpy } = getResponseData(host);
      expect(statusSpy).toHaveBeenCalledWith(422);
      const body = jsonSpy.mock.calls[0][0];
      expect(body.statusCode).toBe(422);
      expect(body.message).toBe('Custom error text');
    });

    it('should log 4xx errors with warn level (not error)', () => {
      const host = makeHost('/api/items/1');
      const exception = new NotFoundException('Not found');

      filter.catch(exception, host);

      expect(filter['logger'].warn).toHaveBeenCalledTimes(1);
      expect(filter['logger'].error).not.toHaveBeenCalled();
    });

    it('should log 5xx errors with error level including stack trace', () => {
      const host = makeHost('/api/broken');
      const exception = new InternalServerErrorException('DB failure');

      filter.catch(exception, host);

      expect(filter['logger'].error).toHaveBeenCalledTimes(1);
      expect(filter['logger'].warn).not.toHaveBeenCalled();
    });

    it('should include the request path in the response body', () => {
      const host = makeHost('/api/specific-path');
      const exception = new BadRequestException();

      filter.catch(exception, host);

      const { jsonSpy } = getResponseData(host);
      expect(jsonSpy.mock.calls[0][0].path).toBe('/api/specific-path');
    });

    it('should produce an ISO 8601 timestamp', () => {
      const host = makeHost('/api/test');
      const exception = new NotFoundException();

      filter.catch(exception, host);

      const { jsonSpy } = getResponseData(host);
      const { timestamp } = jsonSpy.mock.calls[0][0];
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('should handle HttpException with object response missing message key', () => {
      const host = makeHost('/api/test');
      const exceptionResponse = { error: 'Custom Error', code: 42 };
      const exception = new HttpException(exceptionResponse, 400);

      filter.catch(exception, host);

      const { jsonSpy } = getResponseData(host);
      const body = jsonSpy.mock.calls[0][0];
      expect(body.error).toBe('Custom Error');
    });

    it('should fall back to exception.message when object response has no message key', () => {
      const host = makeHost('/api/test');
      // Response object has no `message` key — should fall back to exception.message
      const exception = new HttpException({ error: 'Conflict' }, 409);

      filter.catch(exception, host);

      const { jsonSpy } = getResponseData(host);
      const body = jsonSpy.mock.calls[0][0];
      // HttpException.message defaults to the HTTP status text "Conflict"
      expect(typeof body.message).toBe('string');
    });

    it('should fall back to HttpStatus text when object response has no error key', () => {
      const host = makeHost('/api/test');
      // Response object has no `error` key
      const exception = new HttpException({ message: 'Something went wrong' }, 400);

      filter.catch(exception, host);

      const { jsonSpy } = getResponseData(host);
      const body = jsonSpy.mock.calls[0][0];
      expect(body.error).toBe('Bad Request');
    });

    it('should fall back to "Unknown Error" for non-standard status code with string response', () => {
      const host = makeHost('/api/test');
      // Use a non-standard status code so STATUS_CODES[statusCode] returns undefined
      const exception = new HttpException('custom error', 599);

      filter.catch(exception, host);

      const { jsonSpy } = getResponseData(host);
      const body = jsonSpy.mock.calls[0][0];
      // STATUS_CODES[599] is undefined, so error falls back to 'Unknown Error'
      expect(body.error).toBe('Unknown Error');
    });

    it('should fall back to "Unknown Error" for non-standard status code with object response and no error key', () => {
      const host = makeHost('/api/test');
      // Object response without error key AND non-standard status code
      const exception = new HttpException({ message: 'oops' }, 599);

      filter.catch(exception, host);

      const { jsonSpy } = getResponseData(host);
      const body = jsonSpy.mock.calls[0][0];
      expect(body.error).toBe('Unknown Error');
    });
  });

  describe('Unknown/unexpected exception handling', () => {
    it('should return 500 for non-HttpException errors', () => {
      const host = makeHost('/api/crash');
      const exception = new Error('Unexpected DB crash');

      filter.catch(exception, host);

      const { statusSpy, jsonSpy } = getResponseData(host);
      expect(statusSpy).toHaveBeenCalledWith(500);
      const body = jsonSpy.mock.calls[0][0];
      expect(body.statusCode).toBe(500);
      expect(body.error).toBe('Internal Server Error');
    });

    it('should expose error message in non-production environments', () => {
      process.env['NODE_ENV'] = 'development';
      const host = makeHost('/api/crash');
      const exception = new Error('Secret DB password');

      filter.catch(exception, host);

      const { jsonSpy } = getResponseData(host);
      const body = jsonSpy.mock.calls[0][0];
      expect(body.message).toBe('Secret DB password');
    });

    it('should NOT expose error details in production', () => {
      process.env['NODE_ENV'] = 'production';
      const host = makeHost('/api/crash');
      const exception = new Error('Secret DB password');

      filter.catch(exception, host);

      const { jsonSpy } = getResponseData(host);
      const body = jsonSpy.mock.calls[0][0];
      expect(body.message).toBe('Internal Server Error');
      expect(body.message).not.toContain('Secret DB password');
    });

    it('should log 5xx unknown exceptions with error level and stack', () => {
      const host = makeHost('/api/crash');
      const exception = new Error('boom');

      filter.catch(exception, host);

      expect(filter['logger'].error).toHaveBeenCalledWith(
        expect.stringContaining('500'),
        exception.stack,
      );
    });

    it('should handle non-Error thrown values (e.g., thrown strings)', () => {
      const host = makeHost('/api/crash');
      const exception = 'something went wrong';

      filter.catch(exception, host);

      const { statusSpy } = getResponseData(host);
      expect(statusSpy).toHaveBeenCalledWith(500);
    });

    it('should log non-Error thrown values as string', () => {
      const host = makeHost('/api/crash');
      const exception = { some: 'object' };

      filter.catch(exception, host);

      expect(filter['logger'].error).toHaveBeenCalledWith(
        expect.stringContaining('500'),
        expect.any(String),
      );
    });
  });

  describe('Response shape', () => {
    it('always includes all required fields: statusCode, message, error, timestamp, path', () => {
      const host = makeHost('/api/endpoint');
      const exception = new NotFoundException('not here');

      filter.catch(exception, host);

      const { jsonSpy } = getResponseData(host);
      const body = jsonSpy.mock.calls[0][0];
      expect(body).toHaveProperty('statusCode');
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('path');
    });
  });
});
