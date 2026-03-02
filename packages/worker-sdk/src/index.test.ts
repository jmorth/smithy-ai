import { describe, it, expect } from 'vitest';
import * as sdk from './index.js';
import * as baseWorker from './base-worker.js';
import * as context from './context.js';
import * as ai from './ai.js';
import * as apiClient from './api-client.js';
import * as runner from './runner.js';

describe('@smithy/worker-sdk barrel export', () => {
  it('exports an object (even if empty)', () => {
    expect(typeof sdk).toBe('object');
  });

  it('does not export undefined values', () => {
    for (const [key, value] of Object.entries(sdk)) {
      expect(value, `export '${key}' should not be undefined`).not.toBeUndefined();
    }
  });
});

describe('@smithy/worker-sdk submodule barrels', () => {
  it('base-worker module is an object', () => {
    expect(typeof baseWorker).toBe('object');
  });

  it('context module is an object', () => {
    expect(typeof context).toBe('object');
  });

  it('ai module is an object', () => {
    expect(typeof ai).toBe('object');
  });

  it('api-client module is an object', () => {
    expect(typeof apiClient).toBe('object');
  });

  it('runner module is an object', () => {
    expect(typeof runner).toBe('object');
  });
});

describe('@smithy/worker-sdk placeholder classes', () => {
  it('BaseWorker is exported as a class', () => {
    expect(typeof sdk.BaseWorker).toBe('function');
  });

  it('WorkerContext is exported as a class', () => {
    expect(typeof sdk.WorkerContext).toBe('function');
  });

  it('AI is exported as a class', () => {
    expect(typeof sdk.AI).toBe('function');
  });

  it('APIClient is exported as a class', () => {
    expect(typeof sdk.APIClient).toBe('function');
  });

  it('Runner is exported as a class', () => {
    expect(typeof sdk.Runner).toBe('function');
  });
});
