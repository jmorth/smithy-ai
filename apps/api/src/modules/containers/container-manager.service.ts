import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigService } from '@nestjs/config';
import { ContainerBuilderService } from './container-builder.service';
import type {
  ContainerEnv,
  ContainerResult,
  ContainerRunOptions,
  JobExecutionConfig,
  TrackedContainer,
} from './container.types';

export const CONTAINER_EVENTS = {
  JOB_COMPLETED: 'job.completed',
  JOB_ERROR: 'job.error',
  STDOUT_DATA: 'container.stdout',
  STDERR_DATA: 'container.stderr',
} as const;

export interface JobCompletedPayload {
  jobId: string;
  packageId: string;
  exitCode: number;
}

export interface JobErrorPayload {
  jobId: string;
  packageId: string;
  exitCode: number;
  stderr: string;
}

export interface ContainerOutputPayload {
  jobId: string;
  stream: 'stdout' | 'stderr';
  data: string;
}

@Injectable()
export class ContainerManagerService extends EventEmitter {
  private readonly logger = new Logger(ContainerManagerService.name);
  private readonly runningContainers = new Map<string, TrackedContainer>();

  constructor(
    private readonly configService: ConfigService,
    private readonly containerBuilder: ContainerBuilderService,
  ) {
    super();
  }

  async runJob(config: JobExecutionConfig): Promise<ContainerResult> {
    const {
      jobId,
      packageId,
      workerSlug,
      workerVersion,
      dockerfilePath,
      inputFiles,
      apiUrl,
      apiKey,
      aiProviderKeys,
      timeoutSeconds,
    } = config;

    const containerName = `smithy-job-${jobId}`;
    const imageTag = await this.containerBuilder.buildWorkerImage(
      workerSlug,
      workerVersion,
      dockerfilePath,
    );

    let inputDir: string | undefined;

    try {
      inputDir = await mkdtemp(join(tmpdir(), `smithy-job-${jobId}-`));

      await Promise.all(
        inputFiles.map((file) =>
          writeFile(join(inputDir!, file.filename), file.content),
        ),
      );

      const env: ContainerEnv = {
        SMITHY_JOB_ID: jobId,
        SMITHY_PACKAGE_ID: packageId,
        SMITHY_API_URL: apiUrl,
        SMITHY_API_KEY: apiKey,
        ...aiProviderKeys,
      };

      const result = await this.runContainer({
        imageTag,
        containerName,
        env,
        inputDir,
        timeoutSeconds,
      });

      if (result.exitCode === 0) {
        this.emit(CONTAINER_EVENTS.JOB_COMPLETED, {
          jobId,
          packageId,
          exitCode: 0,
        } satisfies JobCompletedPayload);
      } else {
        const stderrLines = result.stderr.trim().split('\n');
        const lastLines = stderrLines.slice(-50).join('\n');
        this.emit(CONTAINER_EVENTS.JOB_ERROR, {
          jobId,
          packageId,
          exitCode: result.exitCode,
          stderr: lastLines,
        } satisfies JobErrorPayload);
      }

      return result;
    } finally {
      if (inputDir) {
        await rm(inputDir, { recursive: true, force: true }).catch(
          (err: unknown) => {
            this.logger.warn(
              `Failed to clean up temp dir ${inputDir}: ${String(err)}`,
            );
          },
        );
      }
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const tracked = this.runningContainers.get(jobId);
    if (!tracked) {
      this.logger.warn(`No running container found for job ${jobId}`);
      return false;
    }

    this.logger.log(`Cancelling job ${jobId} (container: ${tracked.containerName})`);

    return new Promise<boolean>((resolve) => {
      const stopProc = spawn('docker', ['stop', '--time', '10', tracked.containerName]);

      stopProc.on('close', (code) => {
        resolve(code === 0);
      });

      stopProc.on('error', () => {
        resolve(false);
      });
    });
  }

  getRunningJobIds(): string[] {
    return Array.from(this.runningContainers.keys());
  }

  isJobRunning(jobId: string): boolean {
    return this.runningContainers.has(jobId);
  }

  private runContainer(options: ContainerRunOptions): Promise<ContainerResult> {
    const { imageTag, containerName, env, inputDir, timeoutSeconds } = options;

    const envArgs = Object.entries(env).flatMap(([key, value]) => [
      '-e',
      `${key}=${value}`,
    ]);

    const args = [
      'run',
      '--rm',
      '--name',
      containerName,
      '--volume',
      `${inputDir}:/input:ro`,
      ...envArgs,
      imageTag,
    ];

    return new Promise<ContainerResult>((resolve, reject) => {
      const proc = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const jobId = env.SMITHY_JOB_ID;

      this.runningContainers.set(jobId, {
        process: proc,
        containerName,
      });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        this.logger.warn(
          `Container ${containerName} exceeded timeout of ${timeoutSeconds}s, killing`,
        );
        this.cancelJob(jobId).catch((err: unknown) => {
          this.logger.error(`Failed to cancel timed-out job ${jobId}: ${String(err)}`);
        });
      }, timeoutSeconds * 1000);

      const tracked = this.runningContainers.get(jobId)!;
      tracked.timeoutHandle = timeoutHandle;

      proc.stdout!.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        this.emit(CONTAINER_EVENTS.STDOUT_DATA, {
          jobId,
          stream: 'stdout',
          data: chunk,
        } satisfies ContainerOutputPayload);
      });

      proc.stderr!.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        this.emit(CONTAINER_EVENTS.STDERR_DATA, {
          jobId,
          stream: 'stderr',
          data: chunk,
        } satisfies ContainerOutputPayload);
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);
        this.runningContainers.delete(jobId);

        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          timedOut,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutHandle);
        this.runningContainers.delete(jobId);

        reject(err);
      });
    });
  }
}
