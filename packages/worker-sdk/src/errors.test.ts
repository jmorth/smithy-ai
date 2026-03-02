import { describe, it, expect } from 'vitest';
import { QuestionTimeoutError } from './errors.js';

describe('QuestionTimeoutError', () => {
  it('is an instance of Error', () => {
    const error = new QuestionTimeoutError('q-1', 5000);
    expect(error).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const error = new QuestionTimeoutError('q-1', 5000);
    expect(error.name).toBe('QuestionTimeoutError');
  });

  it('includes questionId and timeout in the message', () => {
    const error = new QuestionTimeoutError('q-42', 10000);
    expect(error.message).toContain('q-42');
    expect(error.message).toContain('10000ms');
  });

  it('exposes questionId and timeoutMs as properties', () => {
    const error = new QuestionTimeoutError('q-99', 30000);
    expect(error.questionId).toBe('q-99');
    expect(error.timeoutMs).toBe(30000);
  });
});
