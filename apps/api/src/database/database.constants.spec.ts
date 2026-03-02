import { describe, it, expect } from 'vitest';
import { DRIZZLE } from './database.constants';

describe('database.constants', () => {
  it('exports DRIZZLE as a Symbol', () => {
    expect(typeof DRIZZLE).toBe('symbol');
  });

  it('DRIZZLE symbol description is "DRIZZLE"', () => {
    expect(DRIZZLE.toString()).toBe('Symbol(DRIZZLE)');
  });
});
