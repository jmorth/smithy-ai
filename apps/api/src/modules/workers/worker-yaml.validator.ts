import { BadRequestException } from '@nestjs/common';
import { parse } from 'yaml';
import { z } from 'zod';

const toolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const workerConfigSchema = z.object({
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

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export function validateWorkerConfig(config: unknown): WorkerConfig {
  const result = workerConfigSchema.safeParse(config);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const field = issue.path.join('.');
      return field ? `${field}: ${issue.message}` : issue.message;
    });
    throw new BadRequestException(messages.join('; '));
  }
  return result.data;
}

export function validateWorkerYaml(yamlString: string): WorkerConfig {
  let parsed: unknown;
  try {
    parsed = parse(yamlString);
  } catch (err) {
    throw new BadRequestException(`Invalid YAML syntax: ${String(err)}`);
  }
  return validateWorkerConfig(parsed);
}
