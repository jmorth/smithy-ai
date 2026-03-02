import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { DRIZZLE } from './database.constants';

export type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

export const PG_POOL = Symbol('PG_POOL');

export const poolProvider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Pool => {
    return new Pool({
      connectionString: config.get<string>('database.url'),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  },
};

export const drizzleProvider = {
  provide: DRIZZLE,
  inject: [PG_POOL],
  useFactory: async (pool: Pool): Promise<DrizzleClient> => {
    await pool.query('SELECT 1');
    return drizzle(pool, { schema }) as DrizzleClient;
  },
};
