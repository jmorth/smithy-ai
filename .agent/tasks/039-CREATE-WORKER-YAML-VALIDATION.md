# Task 039: Create Worker YAML Validation

## Summary
Implement YAML parsing and validation for Worker configuration files. The validator parses a YAML string into a typed `WorkerConfig` object and validates required fields: name, input types, output type, and AI provider configuration. This ensures all Worker definitions are well-formed before being stored as versions.

## Phase
Phase 2: Core Backend

## Dependencies
- **Depends on**: 038 (Worker Version Service), 020 (Shared Type Definitions — WorkerConfig type)
- **Blocks**: 041 (Worker REST Controller)

## Architecture Reference
Workers in Smithy are defined by YAML configuration files that describe the AI agent's capabilities, input/output types, provider settings, and optional tools. The YAML validator sits between raw user input and the database — it transforms YAML text into a validated, typed object suitable for JSONB storage. The validator uses Zod for schema validation (consistent with the config module approach in task 023) and `yaml` (npm package) for parsing.

## Files and Folders
- `/apps/api/src/modules/workers/worker-yaml.validator.ts` — YAML parser and Zod-based validator

## Acceptance Criteria
- [ ] Parses a YAML string into a JavaScript object using the `yaml` npm package
- [ ] Validates required fields: `name` (string), `inputTypes` (string array, at least one), `outputType` (string), `provider.name` (string), `provider.model` (string), `provider.apiKeyEnv` (string)
- [ ] Validates optional fields: `tools` (array of tool definitions), `timeout` (positive integer, default 300 seconds), `retries` (non-negative integer, default 0), `systemPrompt` (string)
- [ ] Returns a typed `WorkerConfig` result on success
- [ ] Throws a `BadRequestException` with specific field-level error messages on validation failure
- [ ] Error messages clearly indicate which field is missing or invalid (e.g., "provider.model is required", "inputTypes must be an array of strings")
- [ ] Handles malformed YAML (syntax errors) with a clear error message, not a stack trace
- [ ] Exports a `validateWorkerYaml(yamlString: string): WorkerConfig` function
- [ ] Exports a `validateWorkerConfig(config: unknown): WorkerConfig` function for pre-parsed objects
- [ ] Install `yaml` npm package as a dependency

## Implementation Notes
- Use Zod for the config schema validation (consistent with task 023). Define a `workerConfigSchema` using `z.object()`.
- Example Zod schema:
  ```typescript
  const workerConfigSchema = z.object({
    name: z.string().min(1),
    inputTypes: z.array(z.string()).min(1),
    outputType: z.string().min(1),
    provider: z.object({
      name: z.string().min(1),
      model: z.string().min(1),
      apiKeyEnv: z.string().min(1),
    }),
    tools: z.array(toolSchema).optional().default([]),
    timeout: z.number().int().positive().optional().default(300),
    retries: z.number().int().nonnegative().optional().default(0),
    systemPrompt: z.string().optional(),
  });
  ```
- The `tools` schema depends on how tools are defined in the worker SDK. For now, define a minimal tool schema: `{ name: string, description: string, parameters?: Record<string, unknown> }`.
- Wrap `yaml.parse()` in a try/catch to convert YAML syntax errors into user-friendly messages.
- Consider exporting both the Zod schema and the validation functions — the schema can be reused for generating JSON Schema documentation.
- The `WorkerConfig` TypeScript type should be inferred from the Zod schema: `type WorkerConfig = z.infer<typeof workerConfigSchema>`.
