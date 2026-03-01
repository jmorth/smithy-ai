# Task 060: Create Worker AI Provider Wrapper

## Summary
Create the `AiProvider` wrapper that reads Worker YAML configuration to determine the AI provider and model, then instantiates the correct Vercel AI SDK provider with the appropriate API key from environment variables. This abstraction lets Workers use AI without knowing provider-specific setup details.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 057 (SmithyWorker Base Class — AI provider is part of the SDK)
- **Blocks**: 058 (Worker Execution Context — context holds the AI provider instance)

## Architecture Reference
Each Worker's `worker.yaml` specifies its AI configuration: provider name (anthropic, openai, google, etc.), model identifier, and the environment variable name holding the API key. The `AiProvider` wrapper reads this config, resolves the API key from the container's environment, and creates a configured Vercel AI SDK provider instance. The Vercel AI SDK (`ai` package) provides a unified interface across providers, so Workers can call `generateText`, `streamText`, `generateObject`, and use tool calls without provider-specific code.

## Files and Folders
- `/packages/worker-sdk/src/ai.ts` — `AiProvider` factory/class that creates configured Vercel AI SDK instances from YAML config

## Acceptance Criteria
- [ ] Reads provider config from Worker YAML: `{ provider: { name: string, model: string, apiKeyEnv: string } }`
- [ ] Supports providers: `anthropic` (via `@ai-sdk/anthropic`), `openai` (via `@ai-sdk/openai`), `google` (via `@ai-sdk/google`)
- [ ] Reads the API key from the environment variable specified by `apiKeyEnv` (e.g., `ANTHROPIC_API_KEY`)
- [ ] Throws a descriptive error if the specified environment variable is not set
- [ ] Returns a configured model instance usable with Vercel AI SDK functions: `generateText({ model, prompt })`, `streamText({ model, prompt })`, `generateObject({ model, schema, prompt })`
- [ ] Supports tool definitions passed from Worker config or code
- [ ] Throws `UnsupportedProviderError` for unknown provider names
- [ ] The factory is a pure function or static method — no side effects, easily testable

## Implementation Notes
- The Vercel AI SDK uses per-provider packages. The factory pattern maps provider names to their SDK constructors:
  ```typescript
  import { createAnthropic } from '@ai-sdk/anthropic';
  import { createOpenAI } from '@ai-sdk/openai';
  import { createGoogleGenerativeAI } from '@ai-sdk/google';
  ```
- Each provider constructor takes an API key option. The wrapper resolves this from `process.env[config.apiKeyEnv]`.
- The returned value should be a model instance (e.g., `anthropic('claude-sonnet-4-20250514')`) that can be passed directly to `generateText({ model })`.
- All three provider packages (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) should be dependencies of the worker-sdk package, pre-installed in the base Docker image.
- Consider supporting a `temperature`, `maxTokens`, and `systemPrompt` in the YAML config as optional defaults that Workers can override per-call.
- For testing, the Vercel AI SDK provides `@ai-sdk/provider-utils` test helpers and mock providers. Document this for task 063.
