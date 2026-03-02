import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPoolQuery = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
const mockPoolEnd = vi.fn().mockResolvedValue(undefined);
const MockPool = vi.fn().mockImplementation(() => ({
  query: mockPoolQuery,
  end: mockPoolEnd,
}));

vi.mock('pg', () => ({ Pool: MockPool }));

const mockDrizzleInstance = { _tag: 'DrizzleClient' };
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => mockDrizzleInstance),
}));

vi.mock('./schema', () => ({ someTable: {} }));

describe('poolProvider', () => {
  let mockConfigService: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigService = {
      get: vi.fn().mockReturnValue('postgresql://user:pass@localhost:5432/test'),
    };
  });

  it('has PG_POOL as provide token (symbol)', async () => {
    const { poolProvider, PG_POOL } = await import('./database.provider');
    expect(poolProvider.provide).toBe(PG_POOL);
    expect(typeof poolProvider.provide).toBe('symbol');
  });

  it('injects ConfigService', async () => {
    const { poolProvider } = await import('./database.provider');
    const { ConfigService } = await import('@nestjs/config');
    expect(poolProvider.inject).toContain(ConfigService);
  });

  it('creates pg.Pool with database URL from ConfigService', async () => {
    const { poolProvider } = await import('./database.provider');
    const { Pool } = await import('pg');
    poolProvider.useFactory(mockConfigService as any);
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: 'postgresql://user:pass@localhost:5432/test',
      }),
    );
    expect(mockConfigService.get).toHaveBeenCalledWith('database.url');
  });

  it('creates Pool with default max=20', async () => {
    const { poolProvider } = await import('./database.provider');
    const { Pool } = await import('pg');
    poolProvider.useFactory(mockConfigService as any);
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ max: 20 }));
  });

  it('creates Pool with default idleTimeoutMillis=30000', async () => {
    const { poolProvider } = await import('./database.provider');
    const { Pool } = await import('pg');
    poolProvider.useFactory(mockConfigService as any);
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ idleTimeoutMillis: 30000 }));
  });

  it('creates Pool with default connectionTimeoutMillis=5000', async () => {
    const { poolProvider } = await import('./database.provider');
    const { Pool } = await import('pg');
    poolProvider.useFactory(mockConfigService as any);
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeoutMillis: 5000 }),
    );
  });
});

describe('drizzleProvider', () => {
  let mockPool: { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: mockPoolQuery, end: mockPoolEnd };
  });

  it('has DRIZZLE as provide token', async () => {
    const { drizzleProvider } = await import('./database.provider');
    const { DRIZZLE } = await import('./database.constants');
    expect(drizzleProvider.provide).toBe(DRIZZLE);
  });

  it('injects PG_POOL', async () => {
    const { drizzleProvider, PG_POOL } = await import('./database.provider');
    expect(drizzleProvider.inject).toContain(PG_POOL);
  });

  it('runs SELECT 1 to verify connection', async () => {
    const { drizzleProvider } = await import('./database.provider');
    await drizzleProvider.useFactory(mockPool as any);
    expect(mockPoolQuery).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns drizzle instance', async () => {
    const { drizzleProvider } = await import('./database.provider');
    const result = await drizzleProvider.useFactory(mockPool as any);
    expect(result).toBe(mockDrizzleInstance);
  });

  it('passes pool and schema to drizzle()', async () => {
    const { drizzleProvider } = await import('./database.provider');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    await drizzleProvider.useFactory(mockPool as any);
    expect(drizzle).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ schema: expect.any(Object) }),
    );
  });
});
