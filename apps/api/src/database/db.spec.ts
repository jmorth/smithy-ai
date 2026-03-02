import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock postgres so no real DB connection is needed
vi.mock('postgres', () => {
  const mockClient = vi.fn() as any;
  mockClient.end = vi.fn();
  const postgres = vi.fn(() => mockClient);
  return { default: postgres };
});

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn((_client, _opts) => ({ _type: 'drizzle-instance' })),
}));

describe('createDb', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV, DATABASE_URL: 'postgres://user:pass@localhost:5432/test' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    vi.resetModules();
  });

  it('returns a drizzle instance when DATABASE_URL is set', async () => {
    const { createDb } = await import('./db');
    const result = createDb();
    expect(result).toBeDefined();
    expect(result).toHaveProperty('_type', 'drizzle-instance');
  });

  it('throws when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;
    const { createDb } = await import('./db');
    expect(() => createDb()).toThrow('DATABASE_URL');
  });

  it('accepts custom max pool size', async () => {
    const { createDb } = await import('./db');
    const postgresModule = await import('postgres');
    createDb({ max: 5 });
    expect(postgresModule.default).toHaveBeenCalledWith(
      'postgres://user:pass@localhost:5432/test',
      expect.objectContaining({ max: 5 }),
    );
  });
});

describe('db default export', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV, DATABASE_URL: 'postgres://user:pass@localhost:5432/test' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    vi.resetModules();
  });

  it('is defined (singleton created on module load)', async () => {
    const mod = await import('./db');
    expect(mod.db).toBeDefined();
  });
});
