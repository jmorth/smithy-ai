import { z } from 'zod';

export const envSchema = z.object({
  // Application
  APP_PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // RabbitMQ
  RABBITMQ_URL: z.string().url(),

  // MinIO
  MINIO_ENDPOINT: z.string().url(),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(1),

  // AI Providers (optional — at least one should be present but not enforced)
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Email (optional)
  RESEND_API_KEY: z.string().min(1).optional(),

  // Container concurrency
  CONTAINER_CONCURRENCY_LIMIT: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  // Retention
  RETENTION_DAYS: z
    .string()
    .default('30')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
});

export type EnvSchema = z.infer<typeof envSchema>;
