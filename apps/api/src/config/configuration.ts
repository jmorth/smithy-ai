import { envSchema } from './env.schema';

export interface AppConfig {
  app: {
    port: number;
    nodeEnv: string;
    corsOrigin: string;
    retentionDays: number;
    retentionDryRun: boolean;
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  rabbitmq: {
    url: string;
  };
  minio: {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
  };
  ai: {
    openaiApiKey?: string;
    anthropicApiKey?: string;
  };
  email: {
    resendApiKey?: string;
    fromAddress: string;
    dashboardUrl: string;
  };
  containers: {
    concurrencyLimit: number;
  };
}

export function configuration(): AppConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  const env = result.data;

  return {
    app: {
      port: env.APP_PORT,
      nodeEnv: env.NODE_ENV,
      corsOrigin: env.CORS_ORIGIN,
      retentionDays: env.RETENTION_DAYS,
      retentionDryRun: env.RETENTION_DRY_RUN,
    },
    database: {
      url: env.DATABASE_URL,
    },
    redis: {
      url: env.REDIS_URL,
    },
    rabbitmq: {
      url: env.RABBITMQ_URL,
    },
    minio: {
      endpoint: env.MINIO_ENDPOINT,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
      bucket: env.MINIO_BUCKET,
    },
    ai: {
      openaiApiKey: env.OPENAI_API_KEY,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
    },
    email: {
      resendApiKey: env.RESEND_API_KEY,
      fromAddress: env.EMAIL_FROM,
      dashboardUrl: env.DASHBOARD_URL,
    },
    containers: {
      concurrencyLimit: env.CONTAINER_CONCURRENCY_LIMIT,
    },
  };
}
