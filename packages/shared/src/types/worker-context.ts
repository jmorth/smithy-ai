import type { Package } from './package.js';

/**
 * Logger interface available to Workers during execution.
 */
export interface WorkerLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Output produced by a Worker's onProcess hook.
 */
export interface PackageOutput {
  data: Record<string, unknown>;
  files?: Array<{
    filename: string;
    content: Buffer | string;
    mimeType: string;
  }>;
  metadata?: Record<string, unknown>;
}

/**
 * Runtime context passed to the Worker's onProcess hook.
 * Provides access to AI providers, file operations, logging, and the input package.
 */
export interface WorkerContext {
  package: Package;
  ai: unknown;
  logger: WorkerLogger;
  files: unknown;
  config: Record<string, unknown>;
}
