import type { ChildProcess } from 'node:child_process';

export interface ContainerEnv {
  SMITHY_JOB_ID: string;
  SMITHY_PACKAGE_ID: string;
  SMITHY_API_URL: string;
  SMITHY_API_KEY: string;
  [key: string]: string;
}

export interface ContainerRunOptions {
  imageTag: string;
  containerName: string;
  env: ContainerEnv;
  inputDir: string;
  timeoutSeconds: number;
}

export interface ContainerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface JobExecutionConfig {
  jobId: string;
  packageId: string;
  workerSlug: string;
  workerVersion?: string;
  dockerfilePath: string;
  inputFiles: InputFile[];
  apiUrl: string;
  apiKey: string;
  aiProviderKeys: Record<string, string>;
  timeoutSeconds: number;
}

export interface InputFile {
  filename: string;
  content: Buffer;
}

export interface TrackedContainer {
  process: ChildProcess;
  containerName: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}
