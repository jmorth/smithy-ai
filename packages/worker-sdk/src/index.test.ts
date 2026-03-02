import { describe, it, expect } from 'vitest';
import * as sdk from './index.js';
import * as baseWorker from './base-worker.js';
import * as context from './context.js';
import * as inputPackage from './input-package.js';
import * as outputBuilder from './output-builder.js';
import * as errors from './errors.js';
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

  it('input-package module is an object', () => {
    expect(typeof inputPackage).toBe('object');
  });

  it('output-builder module is an object', () => {
    expect(typeof outputBuilder).toBe('object');
  });

  it('errors module is an object', () => {
    expect(typeof errors).toBe('object');
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

describe('@smithy/worker-sdk exported classes', () => {
  it('SmithyWorker is exported as a class', () => {
    expect(typeof sdk.SmithyWorker).toBe('function');
  });

  it('WorkerContext is exported as a class', () => {
    expect(typeof sdk.WorkerContext).toBe('function');
  });

  it('InputPackageImpl is exported as a class', () => {
    expect(typeof sdk.InputPackageImpl).toBe('function');
  });

  it('OutputBuilderImpl is exported as a class', () => {
    expect(typeof sdk.OutputBuilderImpl).toBe('function');
  });

  it('QuestionTimeoutError is exported as a class', () => {
    expect(typeof sdk.QuestionTimeoutError).toBe('function');
  });

  it('createModel is exported as a function', () => {
    expect(typeof sdk.createModel).toBe('function');
  });

  it('UnsupportedProviderError is exported as a class', () => {
    expect(typeof sdk.UnsupportedProviderError).toBe('function');
  });

  it('MissingApiKeyError is exported as a class', () => {
    expect(typeof sdk.MissingApiKeyError).toBe('function');
  });

  it('APIClient is exported as a class', () => {
    expect(typeof sdk.APIClient).toBe('function');
  });

  it('run is exported as a function', () => {
    expect(typeof sdk.run).toBe('function');
  });

  it('InvalidWorkerError is exported as a class', () => {
    expect(typeof sdk.InvalidWorkerError).toBe('function');
  });
});
