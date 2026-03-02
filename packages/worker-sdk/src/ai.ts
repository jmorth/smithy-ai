import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { UnsupportedProviderError, MissingApiKeyError } from './errors.js';

/**
 * Configuration for the AI provider, read from a Worker's YAML config.
 */
export interface AiProviderConfig {
  /** Provider name: 'anthropic', 'openai', or 'google'. */
  name: string;
  /** Model identifier, e.g. 'claude-sonnet-4-20250514', 'gpt-4o', 'gemini-2.0-flash'. */
  model: string;
  /** Name of the environment variable holding the API key. */
  apiKeyEnv: string;
}

type ProviderFactory = (apiKey: string, model: string) => LanguageModelV3;

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  anthropic: (apiKey, model) => createAnthropic({ apiKey })(model),
  openai: (apiKey, model) => createOpenAI({ apiKey })(model),
  google: (apiKey, model) => createGoogleGenerativeAI({ apiKey })(model),
};

/**
 * Creates a configured Vercel AI SDK model instance from a Worker's provider config.
 *
 * This is a pure factory function — no side effects beyond reading process.env.
 * The returned model can be passed directly to `generateText({ model })`,
 * `streamText({ model })`, `generateObject({ model, schema })`, etc.
 *
 * @throws {UnsupportedProviderError} If the provider name is not recognized.
 * @throws {MissingApiKeyError} If the required environment variable is not set or empty.
 */
export function createModel(config: AiProviderConfig): LanguageModelV3 {
  const factory = PROVIDER_FACTORIES[config.name];
  if (!factory) {
    throw new UnsupportedProviderError(config.name);
  }

  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    throw new MissingApiKeyError(config.apiKeyEnv, config.name);
  }

  return factory(apiKey, config.model);
}
