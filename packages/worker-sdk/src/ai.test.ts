import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createModel } from './ai.js';
import type { AiProviderConfig } from './ai.js';
import { UnsupportedProviderError, MissingApiKeyError } from './errors.js';

describe('createModel', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('provider resolution', () => {
    it('creates an Anthropic model when provider name is "anthropic"', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const config: AiProviderConfig = {
        name: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
      };

      const model = createModel(config);

      expect(model).toBeDefined();
      expect(model.modelId).toBe('claude-sonnet-4-20250514');
      expect(model.provider).toContain('anthropic');
    });

    it('creates an OpenAI model when provider name is "openai"', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const config: AiProviderConfig = {
        name: 'openai',
        model: 'gpt-4o',
        apiKeyEnv: 'OPENAI_API_KEY',
      };

      const model = createModel(config);

      expect(model).toBeDefined();
      expect(model.modelId).toBe('gpt-4o');
      expect(model.provider).toContain('openai');
    });

    it('creates a Google model when provider name is "google"', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      const config: AiProviderConfig = {
        name: 'google',
        model: 'gemini-2.0-flash',
        apiKeyEnv: 'GOOGLE_API_KEY',
      };

      const model = createModel(config);

      expect(model).toBeDefined();
      expect(model.modelId).toBe('gemini-2.0-flash');
      expect(model.provider).toContain('google');
    });
  });

  describe('API key resolution', () => {
    it('reads the API key from the env var specified by apiKeyEnv', () => {
      process.env.MY_CUSTOM_KEY = 'custom-key-value';
      const config: AiProviderConfig = {
        name: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKeyEnv: 'MY_CUSTOM_KEY',
      };

      // Should not throw — the key exists
      const model = createModel(config);
      expect(model).toBeDefined();
    });

    it('throws MissingApiKeyError when the env var is not set', () => {
      delete process.env.MISSING_KEY;
      const config: AiProviderConfig = {
        name: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKeyEnv: 'MISSING_KEY',
      };

      expect(() => createModel(config)).toThrow(MissingApiKeyError);
    });

    it('throws MissingApiKeyError when the env var is empty string', () => {
      process.env.EMPTY_KEY = '';
      const config: AiProviderConfig = {
        name: 'openai',
        model: 'gpt-4o',
        apiKeyEnv: 'EMPTY_KEY',
      };

      expect(() => createModel(config)).toThrow(MissingApiKeyError);
    });

    it('includes env var name and provider in MissingApiKeyError', () => {
      delete process.env.ANTHROPIC_API_KEY;
      const config: AiProviderConfig = {
        name: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
      };

      try {
        createModel(config);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(MissingApiKeyError);
        const err = e as MissingApiKeyError;
        expect(err.envVar).toBe('ANTHROPIC_API_KEY');
        expect(err.providerName).toBe('anthropic');
      }
    });
  });

  describe('unsupported providers', () => {
    it('throws UnsupportedProviderError for unknown provider names', () => {
      process.env.SOME_KEY = 'test';
      const config: AiProviderConfig = {
        name: 'deepseek',
        model: 'deepseek-chat',
        apiKeyEnv: 'SOME_KEY',
      };

      expect(() => createModel(config)).toThrow(UnsupportedProviderError);
    });

    it('includes the provider name in UnsupportedProviderError', () => {
      process.env.SOME_KEY = 'test';
      const config: AiProviderConfig = {
        name: 'cohere',
        model: 'command-r',
        apiKeyEnv: 'SOME_KEY',
      };

      try {
        createModel(config);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(UnsupportedProviderError);
        const err = e as UnsupportedProviderError;
        expect(err.providerName).toBe('cohere');
      }
    });
  });

  describe('pure function behavior', () => {
    it('returns a new model instance on each call', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const config: AiProviderConfig = {
        name: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
      };

      const model1 = createModel(config);
      const model2 = createModel(config);

      // Both should be valid and equal in shape but distinct objects
      expect(model1.modelId).toBe(model2.modelId);
      expect(model1).not.toBe(model2);
    });

    it('does not mutate the config object', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const config: AiProviderConfig = {
        name: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
      };
      const configCopy = { ...config };

      createModel(config);

      expect(config).toEqual(configCopy);
    });
  });
});
