import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// --- Mock child_process.spawn ---
const mockSpawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: mockSpawn }));

// --- Mock fs/promises ---
const mockMkdtemp = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockRm = vi.hoisted(() => vi.fn());
vi.mock('node:fs/promises', () => ({
  mkdtemp: mockMkdtemp,
  writeFile: mockWriteFile,
  rm: mockRm,
}));

import {
  ContainerManagerService,
  CONTAINER_EVENTS,
} from './container-manager.service';
import { ContainerBuilderService } from './container-builder.service';
import type { JobExecutionConfig } from './container.types';
import type { ChildProcess } from 'node:child_process';

interface MockProc extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid?: number;
  kill: ReturnType<typeof vi.fn>;
}

function createMockProcess(): MockProc {
  const proc = new EventEmitter() as MockProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 12345;
  proc.kill = vi.fn();
  return proc;
}

function createMockConfigService() {
  return {
    get: vi.fn((key: string) => {
      const map: Record<string, string | undefined> = {
        'ai.openaiApiKey': 'test-openai-key',
        'ai.anthropicApiKey': 'test-anthropic-key',
      };
      return map[key];
    }),
  };
}

function createMockBuilderService() {
  return {
    buildWorkerImage: vi.fn().mockResolvedValue('smithy-worker-summarizer:1.0.0'),
    getImageTag: vi.fn().mockReturnValue('smithy-worker-summarizer:1.0.0'),
    imageExists: vi.fn().mockResolvedValue(true),
  };
}

function buildService(overrides?: {
  configService?: ReturnType<typeof createMockConfigService>;
  builderService?: ReturnType<typeof createMockBuilderService>;
}) {
  const configService = overrides?.configService ?? createMockConfigService();
  const builderService = overrides?.builderService ?? createMockBuilderService();
  return new ContainerManagerService(
    configService as any,
    builderService as any,
  );
}

function defaultJobConfig(overrides?: Partial<JobExecutionConfig>): JobExecutionConfig {
  return {
    jobId: 'job-001',
    packageId: 'pkg-001',
    workerSlug: 'summarizer',
    workerVersion: '1.0.0',
    dockerfilePath: '/tmp/workers/summarizer/Dockerfile',
    inputFiles: [
      { filename: 'input.txt', content: Buffer.from('hello world') },
    ],
    apiUrl: 'http://localhost:3000',
    apiKey: 'ephemeral-key-123',
    aiProviderKeys: { ANTHROPIC_API_KEY: 'sk-ant-test' },
    timeoutSeconds: 300,
    ...overrides,
  };
}

describe('ContainerManagerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockMkdtemp.mockResolvedValue('/tmp/smithy-job-job-001-abc123');
    mockWriteFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('runJob', () => {
    it('orchestrates the full container lifecycle', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.stdout.emit('data', Buffer.from('processing...\n'));
      dockerRunProc.emit('close', 0);

      const result = await promise;

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('processing...');
      expect(result.timedOut).toBe(false);
    });

    it('builds image via ContainerBuilderService before running', async () => {
      const builderService = createMockBuilderService();
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService({ builderService });
      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      expect(builderService.buildWorkerImage).toHaveBeenCalledWith(
        'summarizer',
        '1.0.0',
        '/tmp/workers/summarizer/Dockerfile',
      );
    });

    it('creates temp directory and writes input files', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(
        defaultJobConfig({
          inputFiles: [
            { filename: 'doc.txt', content: Buffer.from('content1') },
            { filename: 'data.json', content: Buffer.from('{"a":1}') },
          ],
        }),
      );

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      expect(mockMkdtemp).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/tmp/smithy-job-job-001-abc123/doc.txt',
        Buffer.from('content1'),
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/tmp/smithy-job-job-001-abc123/data.json',
        Buffer.from('{"a":1}'),
      );
    });

    it('passes environment variables to docker run', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(
        defaultJobConfig({
          aiProviderKeys: {
            ANTHROPIC_API_KEY: 'sk-ant-test',
            OPENAI_API_KEY: 'sk-openai-test',
          },
        }),
      );

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).toContain('-e');

      // Verify all env vars are present
      const envPairs = args.filter((_: string, i: number) => i > 0 && args[i - 1] === '-e');
      expect(envPairs).toContainEqual('SMITHY_JOB_ID=job-001');
      expect(envPairs).toContainEqual('SMITHY_PACKAGE_ID=pkg-001');
      expect(envPairs).toContainEqual('SMITHY_API_URL=http://localhost:3000');
      expect(envPairs).toContainEqual('SMITHY_API_KEY=ephemeral-key-123');
      expect(envPairs).toContainEqual('ANTHROPIC_API_KEY=sk-ant-test');
      expect(envPairs).toContainEqual('OPENAI_API_KEY=sk-openai-test');
    });

    it('mounts input directory read-only at /input', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      const args = mockSpawn.mock.calls[0][1] as string[];
      const volumeIdx = args.indexOf('--volume');
      expect(volumeIdx).toBeGreaterThan(-1);
      expect(args[volumeIdx + 1]).toBe(
        '/tmp/smithy-job-job-001-abc123:/input:ro',
      );
    });

    it('uses --rm flag to auto-remove container', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).toContain('--rm');
    });

    it('names container smithy-job-{jobId}', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(
        defaultJobConfig({ jobId: 'test-job-42' }),
      );

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      const args = mockSpawn.mock.calls[0][1] as string[];
      const nameIdx = args.indexOf('--name');
      expect(nameIdx).toBeGreaterThan(-1);
      expect(args[nameIdx + 1]).toBe('smithy-job-test-job-42');
    });

    it('streams stdout in real-time via events', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const stdoutChunks: string[] = [];
      service.on(CONTAINER_EVENTS.STDOUT_DATA, (payload) => {
        stdoutChunks.push(payload.data);
      });

      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.stdout.emit('data', Buffer.from('line 1\n'));
      dockerRunProc.stdout.emit('data', Buffer.from('line 2\n'));
      dockerRunProc.emit('close', 0);

      await promise;

      expect(stdoutChunks).toEqual(['line 1\n', 'line 2\n']);
    });

    it('streams stderr in real-time via events', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const stderrChunks: string[] = [];
      service.on(CONTAINER_EVENTS.STDERR_DATA, (payload) => {
        stderrChunks.push(payload.data);
      });

      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.stderr.emit('data', Buffer.from('warning\n'));
      dockerRunProc.emit('close', 0);

      await promise;

      expect(stderrChunks).toEqual(['warning\n']);
    });

    it('emits job.completed event on exit code 0', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const completedEvents: unknown[] = [];
      service.on(CONTAINER_EVENTS.JOB_COMPLETED, (payload) => {
        completedEvents.push(payload);
      });

      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0]).toEqual({
        jobId: 'job-001',
        packageId: 'pkg-001',
        exitCode: 0,
      });
    });

    it('emits job.error event on non-zero exit code', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const errorEvents: unknown[] = [];
      service.on(CONTAINER_EVENTS.JOB_ERROR, (payload) => {
        errorEvents.push(payload);
      });

      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.stderr.emit('data', Buffer.from('fatal error\n'));
      dockerRunProc.emit('close', 1);

      await promise;

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toMatchObject({
        jobId: 'job-001',
        packageId: 'pkg-001',
        exitCode: 1,
        stderr: 'fatal error',
      });
    });

    it('includes last N lines of stderr in error event', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const errorEvents: any[] = [];
      service.on(CONTAINER_EVENTS.JOB_ERROR, (payload) => {
        errorEvents.push(payload);
      });

      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      // Emit many lines of stderr
      const lines = Array.from({ length: 60 }, (_, i) => `error line ${i + 1}`);
      dockerRunProc.stderr.emit('data', Buffer.from(lines.join('\n') + '\n'));
      dockerRunProc.emit('close', 1);

      await promise;

      const stderrOutput = errorEvents[0].stderr;
      expect(stderrOutput).toContain('error line 60');
      expect(stderrOutput).toContain('error line 11');
    });

    it('cleans up temp directory on success', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      expect(mockRm).toHaveBeenCalledWith(
        '/tmp/smithy-job-job-001-abc123',
        { recursive: true, force: true },
      );
    });

    it('logs warning when temp directory cleanup fails', async () => {
      mockRm.mockRejectedValueOnce(new Error('EACCES: permission denied'));
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const warnSpy = vi.spyOn((service as any).logger, 'warn');

      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clean up temp dir'),
      );
    });

    it('cleans up temp directory on failure', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 1);
      await promise;

      expect(mockRm).toHaveBeenCalledWith(
        '/tmp/smithy-job-job-001-abc123',
        { recursive: true, force: true },
      );
    });

    it('cleans up temp directory when spawn emits error', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('error', new Error('ENOENT'));

      await expect(promise).rejects.toThrow('ENOENT');
      expect(mockRm).toHaveBeenCalledWith(
        '/tmp/smithy-job-job-001-abc123',
        { recursive: true, force: true },
      );
    });

    it('tracks running containers in map', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      expect(service.isJobRunning('job-001')).toBe(true);
      expect(service.getRunningJobIds()).toContain('job-001');

      dockerRunProc.emit('close', 0);
      await promise;

      expect(service.isJobRunning('job-001')).toBe(false);
      expect(service.getRunningJobIds()).not.toContain('job-001');
    });

    it('defaults exit code to 1 when code is null', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', null);

      const result = await promise;
      expect(result.exitCode).toBe(1);
    });

    it('uses spawn with array args (no shell injection)', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      const call = mockSpawn.mock.calls[0];
      expect(call[0]).toBe('docker');
      expect(Array.isArray(call[1])).toBe(true);
      expect(call[2]?.shell).toBeUndefined();
    });

    it('specifies image tag as last docker run argument', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args[args.length - 1]).toBe('smithy-worker-summarizer:1.0.0');
    });
  });

  describe('timeout', () => {
    it('kills container when timeout is exceeded', async () => {
      const dockerRunProc = createMockProcess();
      const stopProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(dockerRunProc).mockReturnValueOnce(stopProc);

      const service = buildService();
      const promise = service.runJob(
        defaultJobConfig({ timeoutSeconds: 10 }),
      );

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      // Advance past timeout
      vi.advanceTimersByTime(10_000);

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      // Verify docker stop was called
      const stopCall = mockSpawn.mock.calls[1];
      expect(stopCall[0]).toBe('docker');
      expect(stopCall[1]).toContain('stop');
      expect(stopCall[1]).toContain('smithy-job-job-001');

      // Let stop and run complete
      stopProc.emit('close', 0);
      dockerRunProc.emit('close', 137);

      const result = await promise;
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(137);
    });

    it('logs error when cancelJob fails during timeout', async () => {
      const dockerRunProc = createMockProcess();
      // Make spawn throw on the second call (docker stop)
      mockSpawn
        .mockReturnValueOnce(dockerRunProc)
        .mockImplementationOnce(() => {
          throw new Error('spawn failed');
        });

      const service = buildService();
      const errorSpy = vi.spyOn((service as any).logger, 'error');

      const promise = service.runJob(
        defaultJobConfig({ timeoutSeconds: 5 }),
      );

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      // Advance past timeout - cancelJob will throw because spawn throws
      vi.advanceTimersByTime(5_000);

      // Allow the error handler's microtask to complete
      await vi.waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to cancel timed-out job'),
        );
      });

      dockerRunProc.emit('close', 137);
      await promise;
    });

    it('does not trigger timeout when container finishes in time', async () => {
      const dockerRunProc = createMockProcess();
      mockSpawn.mockReturnValue(dockerRunProc);

      const service = buildService();
      const promise = service.runJob(
        defaultJobConfig({ timeoutSeconds: 300 }),
      );

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      dockerRunProc.emit('close', 0);
      await promise;

      // Advance well past timeout - should not trigger another spawn
      vi.advanceTimersByTime(400_000);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelJob', () => {
    it('sends docker stop to running container', async () => {
      const dockerRunProc = createMockProcess();
      const stopProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(dockerRunProc).mockReturnValueOnce(stopProc);

      const service = buildService();
      const runPromise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      const cancelPromise = service.cancelJob('job-001');

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      expect(mockSpawn).toHaveBeenLastCalledWith('docker', [
        'stop',
        '--time',
        '10',
        'smithy-job-job-001',
      ]);

      stopProc.emit('close', 0);
      const cancelled = await cancelPromise;
      expect(cancelled).toBe(true);

      dockerRunProc.emit('close', 137);
      await runPromise;
    });

    it('returns false when no running container found', async () => {
      const service = buildService();
      const result = await service.cancelJob('nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when docker stop fails', async () => {
      const dockerRunProc = createMockProcess();
      const stopProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(dockerRunProc).mockReturnValueOnce(stopProc);

      const service = buildService();
      const runPromise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      const cancelPromise = service.cancelJob('job-001');

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      stopProc.emit('close', 1);
      const cancelled = await cancelPromise;
      expect(cancelled).toBe(false);

      dockerRunProc.emit('close', 137);
      await runPromise;
    });

    it('returns false when docker stop emits error', async () => {
      const dockerRunProc = createMockProcess();
      const stopProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(dockerRunProc).mockReturnValueOnce(stopProc);

      const service = buildService();
      const runPromise = service.runJob(defaultJobConfig());

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
      });

      const cancelPromise = service.cancelJob('job-001');

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      stopProc.emit('error', new Error('spawn error'));
      const cancelled = await cancelPromise;
      expect(cancelled).toBe(false);

      dockerRunProc.emit('close', 137);
      await runPromise;
    });
  });

  describe('getRunningJobIds', () => {
    it('returns empty array when no jobs are running', () => {
      const service = buildService();
      expect(service.getRunningJobIds()).toEqual([]);
    });
  });

  describe('isJobRunning', () => {
    it('returns false for unknown job', () => {
      const service = buildService();
      expect(service.isJobRunning('unknown')).toBe(false);
    });
  });

  describe('CONTAINER_EVENTS', () => {
    it('exports correct event name constants', () => {
      expect(CONTAINER_EVENTS.JOB_COMPLETED).toBe('job.completed');
      expect(CONTAINER_EVENTS.JOB_ERROR).toBe('job.error');
      expect(CONTAINER_EVENTS.STDOUT_DATA).toBe('container.stdout');
      expect(CONTAINER_EVENTS.STDERR_DATA).toBe('container.stderr');
    });
  });

  describe('injectable', () => {
    it('is a class that can be instantiated via DI', () => {
      const service = buildService();
      expect(service).toBeInstanceOf(ContainerManagerService);
      expect(service).toBeInstanceOf(EventEmitter);
    });
  });
});
