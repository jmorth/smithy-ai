import { describe, it, expect } from 'vitest';
import * as shared from './index.js';
import * as types from './types/index.js';
import * as events from './events/index.js';
import * as constants from './constants/index.js';

describe('@smithy/shared barrel export', () => {
  it('exports an object (even if empty)', () => {
    expect(typeof shared).toBe('object');
  });

  it('does not export undefined values', () => {
    for (const [key, value] of Object.entries(shared)) {
      expect(value, `export '${key}' should not be undefined`).not.toBeUndefined();
    }
  });
});

describe('@smithy/shared subdirectory barrels', () => {
  it('types barrel is an object', () => {
    expect(typeof types).toBe('object');
  });

  it('events barrel is an object', () => {
    expect(typeof events).toBe('object');
  });

  it('constants barrel is an object', () => {
    expect(typeof constants).toBe('object');
  });
});
