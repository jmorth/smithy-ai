import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes via clsx', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('deduplicates conflicting tailwind classes via twMerge', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('handles undefined and null inputs', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });

  it('handles empty input', () => {
    expect(cn()).toBe('');
  });

  it('handles array inputs via clsx', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('handles object inputs via clsx', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });
});
