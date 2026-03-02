import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export interface DbConfig {
  /** Maximum number of connections in the pool. Defaults to 10. */
  max?: number;
}

/**
 * Factory that creates a configured Drizzle ORM client.
 * Accepts optional config for testability and NestJS DI.
 */
export function createDb(config: DbConfig = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const client = postgres(url, { max: config.max ?? 10 });
  return drizzle(client, { schema });
}

/**
 * Default singleton database client.
 * Initialized eagerly when DATABASE_URL is present; undefined otherwise.
 * Use createDb() directly when you need an error on missing config.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: ReturnType<typeof createDb> = process.env.DATABASE_URL
  ? createDb()
  : (undefined as any);
