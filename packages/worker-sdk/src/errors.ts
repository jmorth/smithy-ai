/**
 * Thrown when an interactive question times out waiting for an answer.
 */
export class QuestionTimeoutError extends Error {
  constructor(
    public readonly questionId: string,
    public readonly timeoutMs: number,
  ) {
    super(
      `Question "${questionId}" timed out after ${timeoutMs}ms waiting for an answer`,
    );
    this.name = 'QuestionTimeoutError';
  }
}

const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'google'] as const;

/**
 * Thrown when a worker YAML specifies an unknown AI provider name.
 */
export class UnsupportedProviderError extends Error {
  constructor(public readonly providerName: string) {
    super(
      `Unsupported AI provider "${providerName}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
    );
    this.name = 'UnsupportedProviderError';
  }
}

/**
 * Thrown when the environment variable for the AI provider's API key is not set.
 */
export class MissingApiKeyError extends Error {
  constructor(
    public readonly envVar: string,
    public readonly providerName: string,
  ) {
    super(
      `Environment variable "${envVar}" is not set. Required for provider "${providerName}"`,
    );
    this.name = 'MissingApiKeyError';
  }
}
