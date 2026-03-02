import { describe, it, expect } from 'vitest';

describe('schema/index barrel', () => {
  it('exports an object (may be empty)', async () => {
    const schema = await import('./index');
    expect(schema).toBeDefined();
    expect(typeof schema).toBe('object');
  });
});
