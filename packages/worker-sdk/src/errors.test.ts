import { describe, it, expect } from 'vitest';
import {
  QuestionTimeoutError,
  UnsupportedProviderError,
  MissingApiKeyError,
} from './errors.js';

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

describe('UnsupportedProviderError', () => {
  it('is an instance of Error', () => {
    const error = new UnsupportedProviderError('deepseek');
    expect(error).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const error = new UnsupportedProviderError('deepseek');
    expect(error.name).toBe('UnsupportedProviderError');
  });

  it('includes the provider name in the message', () => {
    const error = new UnsupportedProviderError('deepseek');
    expect(error.message).toContain('deepseek');
  });

  it('lists supported providers in the message', () => {
    const error = new UnsupportedProviderError('deepseek');
    expect(error.message).toContain('anthropic');
    expect(error.message).toContain('openai');
    expect(error.message).toContain('google');
  });

  it('exposes providerName as a property', () => {
    const error = new UnsupportedProviderError('deepseek');
    expect(error.providerName).toBe('deepseek');
  });
});

describe('MissingApiKeyError', () => {
  it('is an instance of Error', () => {
    const error = new MissingApiKeyError('ANTHROPIC_API_KEY', 'anthropic');
    expect(error).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const error = new MissingApiKeyError('OPENAI_API_KEY', 'openai');
    expect(error.name).toBe('MissingApiKeyError');
  });

  it('includes the env var name and provider in the message', () => {
    const error = new MissingApiKeyError('GOOGLE_API_KEY', 'google');
    expect(error.message).toContain('GOOGLE_API_KEY');
    expect(error.message).toContain('google');
  });

  it('exposes envVar and providerName as properties', () => {
    const error = new MissingApiKeyError('ANTHROPIC_API_KEY', 'anthropic');
    expect(error.envVar).toBe('ANTHROPIC_API_KEY');
    expect(error.providerName).toBe('anthropic');
  });
});
