import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database.module';
import { DRIZZLE } from './database.constants';
import { PG_POOL } from './database.provider';

const mockPoolQuery = vi.fn().mockResolvedValue({ rows: [] });
const mockPoolEnd = vi.fn().mockResolvedValue(undefined);

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: mockPoolQuery,
    end: mockPoolEnd,
  })),
}));

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => ({ _tag: 'DrizzleClient' })),
}));

vi.mock('./schema', () => ({ someTable: {} }));

describe('DatabaseModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ database: { url: 'postgresql://user:pass@localhost:5432/test' } })],
        }),
        DatabaseModule,
      ],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('is defined', () => {
    expect(module).toBeDefined();
  });

  it('provides the DRIZZLE token', () => {
    const db = module.get(DRIZZLE);
    expect(db).toBeDefined();
    expect(db).toHaveProperty('_tag', 'DrizzleClient');
  });

  it('exports the PG_POOL token', () => {
    const pool = module.get(PG_POOL);
    expect(pool).toBeDefined();
    expect(pool).toHaveProperty('query');
  });

  it('verifies connection on initialization (SELECT 1 called)', () => {
    expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1');
  });

  it('drains the pool on module destroy', async () => {
    const dbModule = module.get(DatabaseModule);
    await dbModule.onModuleDestroy();
    expect(mockPoolEnd).toHaveBeenCalledTimes(1);
  });
});
