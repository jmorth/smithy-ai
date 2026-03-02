import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL, poolProvider, drizzleProvider } from './database.provider';

@Global()
@Module({
  providers: [poolProvider, drizzleProvider],
  exports: [poolProvider, drizzleProvider],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
