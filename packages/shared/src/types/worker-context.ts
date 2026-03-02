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
  type: string;
  files: Array<{
    filename: string;
    content: Buffer | string;
    mimeType: string;
  }>;
  metadata: Record<string, unknown>;
}

/**
 * File access methods for reading the input Package files
 * from the /input mount point inside the Worker container.
 */
export interface InputPackage {
  getFile(name: string): Buffer;
  getFileAsString(name: string): string;
  listFiles(): string[];
  getMetadata(): Record<string, unknown>;
}

/**
 * Builder pattern for constructing output Packages.
 */
export interface OutputBuilder {
  addFile(name: string, content: Buffer | string, mimeType?: string): OutputBuilder;
  setMetadata(key: string, value: unknown): OutputBuilder;
  setType(packageType: string): OutputBuilder;
  build(): PackageOutput;
}

/**
 * Options for the askQuestion method.
 */
export interface QuestionOptions {
  choices?: string[];
  timeout?: number;
}

/**
 * Runtime context passed to the Worker's onProcess hook.
 * Provides access to AI providers, file operations, logging, and the input package.
 */
export interface WorkerContext {
  readonly jobId: string;
  readonly packageId: string;
  readonly ai: unknown;
  readonly inputPackage: InputPackage;
  readonly outputBuilder: OutputBuilder;
  readonly logger: WorkerLogger;
  askQuestion(question: string, options?: QuestionOptions): Promise<string>;
}
