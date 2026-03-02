import { describe, it, expect } from 'vitest';
import { generateSlug } from './slug.util';

describe('generateSlug', () => {
  it('lowercases the name', () => {
    expect(generateSlug('Hello')).toBe('hello');
  });
  it('replaces spaces with hyphens', () => {
    expect(generateSlug('hello world')).toBe('hello-world');
  });
  it('replaces runs of non-alphanumeric chars with a single hyphen', () => {
    expect(generateSlug('hello  world')).toBe('hello-world');
  });
  it('strips leading hyphens', () => {
    expect(generateSlug('-hello')).toBe('hello');
  });
  it('strips trailing hyphens', () => {
    expect(generateSlug('hello-')).toBe('hello');
  });
  it('handles underscores like non-alphanumeric chars', () => {
    expect(generateSlug('hello_world')).toBe('hello-world');
  });
  it('returns empty string for empty input', () => {
    expect(generateSlug('')).toBe('');
  });
  it('handles mixed case and special chars', () => {
    expect(generateSlug('My  Worker-V2!')).toBe('my-worker-v2');
  });
});
