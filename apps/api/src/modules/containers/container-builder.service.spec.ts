import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { ContainerBuildError } from './container-build.error';

// --- Mock spawn ---
const mockSpawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: mockSpawn }));

import { ContainerBuilderService } from './container-builder.service';

interface MockProc extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

function createMockProcess(): MockProc {
  const proc = new EventEmitter() as MockProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

function buildService() {
  return new ContainerBuilderService();
}

describe('ContainerBuilderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getImageTag', () => {
    it('returns tag with slug and version', () => {
      const service = buildService();
      expect(service.getImageTag('summarizer', '1.0.0')).toBe(
        'smithy-worker-summarizer:1.0.0',
      );
    });

    it('returns tag with "latest" when version is undefined', () => {
      const service = buildService();
      expect(service.getImageTag('summarizer')).toBe(
        'smithy-worker-summarizer:latest',
      );
    });

    it('handles slugs with hyphens', () => {
      const service = buildService();
      expect(service.getImageTag('code-reviewer', '2.1.0')).toBe(
        'smithy-worker-code-reviewer:2.1.0',
      );
    });
  });

  describe('imageExists', () => {
    it('returns true when docker image inspect exits with code 0', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const service = buildService();
      const promise = service.imageExists('smithy-worker-summarizer:1.0.0');

      proc.emit('close', 0);
      const result = await promise;

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'docker',
        ['image', 'inspect', 'smithy-worker-summarizer:1.0.0'],
        { stdio: ['ignore', 'ignore', 'ignore'] },
      );
    });

    it('returns false when docker image inspect exits with non-zero code', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const service = buildService();
      const promise = service.imageExists('smithy-worker-summarizer:1.0.0');

      proc.emit('close', 1);
      const result = await promise;

      expect(result).toBe(false);
    });

    it('returns false when spawn emits an error', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const service = buildService();
      const promise = service.imageExists('smithy-worker-summarizer:1.0.0');

      proc.emit('error', new Error('ENOENT'));
      const result = await promise;

      expect(result).toBe(false);
    });
  });

  describe('buildWorkerImage', () => {
    it('runs docker build with correct arguments', async () => {
      // First call is imageExists (returns non-zero = not found)
      const inspectProc = createMockProcess();
      // Second call is the actual build
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/workers/summarizer/Dockerfile',
      );

      // imageExists resolves false
      inspectProc.emit('close', 1);

      // Allow microtask to schedule the build spawn
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      // Build succeeds
      buildProc.emit('close', 0);

      const result = await promise;

      expect(result).toBe('smithy-worker-summarizer:1.0.0');
      expect(mockSpawn).toHaveBeenCalledWith(
        'docker',
        [
          'build',
          '-f',
          '/tmp/workers/summarizer/Dockerfile',
          '-t',
          'smithy-worker-summarizer:1.0.0',
          '--label',
          'smithy.worker.slug=summarizer',
          '/tmp/workers/summarizer',
        ],
        expect.objectContaining({
          env: expect.objectContaining({ DOCKER_BUILDKIT: '1' }),
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    });

    it('enables DOCKER_BUILDKIT=1 via environment variable', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });
      buildProc.emit('close', 0);
      await promise;

      const buildCall = mockSpawn.mock.calls[1];
      expect(buildCall[2].env.DOCKER_BUILDKIT).toBe('1');
    });

    it('skips build when image already exists (cache hit)', async () => {
      const inspectProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 0); // image exists
      const result = await promise;

      expect(result).toBe('smithy-worker-summarizer:1.0.0');
      expect(mockSpawn).toHaveBeenCalledTimes(1); // Only imageExists, no build
    });

    it('bypasses cache check when forceBuild is true', async () => {
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
        { forceBuild: true },
      );

      buildProc.emit('close', 0);
      const result = await promise;

      expect(result).toBe('smithy-worker-summarizer:1.0.0');
      // Only 1 call (the build), no imageExists call
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['build']),
        expect.any(Object),
      );
    });

    it('throws ContainerBuildError on non-zero exit code', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      buildProc.stderr.emit('data', Buffer.from('no such file\n'));
      buildProc.emit('close', 1);

      await expect(promise).rejects.toThrow(ContainerBuildError);
    });

    it('includes stderr output in ContainerBuildError', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      buildProc.stderr.emit('data', Buffer.from('step 3/5 failed\n'));
      buildProc.emit('close', 2);

      try {
        await promise;
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ContainerBuildError);
        const buildErr = err as ContainerBuildError;
        expect(buildErr.stderr).toBe('step 3/5 failed');
        expect(buildErr.exitCode).toBe(2);
        expect(buildErr.tag).toBe('smithy-worker-summarizer:1.0.0');
      }
    });

    it('includes exit code in ContainerBuildError', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      buildProc.stderr.emit('data', Buffer.from('error'));
      buildProc.emit('close', 127);

      try {
        await promise;
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect((err as ContainerBuildError).exitCode).toBe(127);
      }
    });

    it('streams stdout to logger in real-time', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const logSpy = vi.spyOn((service as any).logger, 'log');

      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      buildProc.stdout.emit('data', Buffer.from('Step 1/5 : FROM node:18\n'));
      buildProc.stdout.emit('data', Buffer.from('Step 2/5 : COPY . .\n'));
      buildProc.emit('close', 0);

      await promise;

      expect(logSpy).toHaveBeenCalledWith(
        '[docker build] Step 1/5 : FROM node:18',
      );
      expect(logSpy).toHaveBeenCalledWith(
        '[docker build] Step 2/5 : COPY . .',
      );
    });

    it('streams stderr to logger in real-time', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const warnSpy = vi.spyOn((service as any).logger, 'warn');

      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      buildProc.stderr.emit('data', Buffer.from('WARNING: deprecated\n'));
      buildProc.emit('close', 0);

      await promise;

      expect(warnSpy).toHaveBeenCalledWith(
        '[docker build] WARNING: deprecated',
      );
    });

    it('uses "latest" tag when version is undefined', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        undefined,
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      buildProc.emit('close', 0);
      const result = await promise;

      expect(result).toBe('smithy-worker-summarizer:latest');
      const buildCall = mockSpawn.mock.calls[1];
      expect(buildCall[1]).toContain('smithy-worker-summarizer:latest');
    });

    it('uses directory of Dockerfile as build context', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/opt/workers/summarizer/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      buildProc.emit('close', 0);
      await promise;

      const buildCall = mockSpawn.mock.calls[1];
      // Last argument to docker build is the context directory
      const dockerArgs = buildCall[1] as string[];
      expect(dockerArgs[dockerArgs.length - 1]).toBe(
        '/opt/workers/summarizer',
      );
    });

    it('adds smithy.worker.slug label to built images', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'code-reviewer',
        '2.0.0',
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      buildProc.emit('close', 0);
      await promise;

      const buildCall = mockSpawn.mock.calls[1];
      const dockerArgs = buildCall[1] as string[];
      const labelIdx = dockerArgs.indexOf('--label');
      expect(labelIdx).toBeGreaterThan(-1);
      expect(dockerArgs[labelIdx + 1]).toBe(
        'smithy.worker.slug=code-reviewer',
      );
    });

    it('throws ContainerBuildError when spawn emits error event', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      buildProc.emit('error', new Error('spawn docker ENOENT'));

      try {
        await promise;
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ContainerBuildError);
        const buildErr = err as ContainerBuildError;
        expect(buildErr.stderr).toBe('spawn docker ENOENT');
        expect(buildErr.exitCode).toBe(1);
      }
    });

    it('defaults exit code to 1 when code is null', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      buildProc.stderr.emit('data', Buffer.from('killed'));
      buildProc.emit('close', null);

      try {
        await promise;
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect((err as ContainerBuildError).exitCode).toBe(1);
      }
    });

    it('accumulates multiple stderr chunks', async () => {
      const inspectProc = createMockProcess();
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(inspectProc).mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
      );

      inspectProc.emit('close', 1);
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      buildProc.stderr.emit('data', Buffer.from('error line 1\n'));
      buildProc.stderr.emit('data', Buffer.from('error line 2\n'));
      buildProc.emit('close', 1);

      try {
        await promise;
        expect.unreachable('Should have thrown');
      } catch (err) {
        const buildErr = err as ContainerBuildError;
        expect(buildErr.stderr).toContain('error line 1');
        expect(buildErr.stderr).toContain('error line 2');
      }
    });

    it('passes spawn arguments as array (not string) to avoid shell injection', async () => {
      const buildProc = createMockProcess();
      mockSpawn.mockReturnValueOnce(buildProc);

      const service = buildService();
      const promise = service.buildWorkerImage(
        'summarizer',
        '1.0.0',
        '/tmp/Dockerfile',
        { forceBuild: true },
      );

      buildProc.emit('close', 0);
      await promise;

      const call = mockSpawn.mock.calls[0];
      expect(call[0]).toBe('docker');
      expect(Array.isArray(call[1])).toBe(true);
      // No shell option should be set
      expect(call[2].shell).toBeUndefined();
    });
  });
});

describe('ContainerBuildError', () => {
  it('is an instance of Error', () => {
    const err = new ContainerBuildError('tag:1.0.0', 'build failed', 1);
    expect(err).toBeInstanceOf(Error);
  });

  it('has name ContainerBuildError', () => {
    const err = new ContainerBuildError('tag:1.0.0', 'build failed', 1);
    expect(err.name).toBe('ContainerBuildError');
  });

  it('includes tag in the message', () => {
    const err = new ContainerBuildError('smithy-worker-test:1.0.0', 'oops', 1);
    expect(err.message).toContain('smithy-worker-test:1.0.0');
  });

  it('includes stderr in the message', () => {
    const err = new ContainerBuildError('tag:1', 'no space left on device', 1);
    expect(err.message).toContain('no space left on device');
  });

  it('includes exit code in the message', () => {
    const err = new ContainerBuildError('tag:1', 'fail', 127);
    expect(err.message).toContain('127');
  });

  it('exposes tag, stderr, and exitCode as properties', () => {
    const err = new ContainerBuildError('my-tag', 'my-stderr', 42);
    expect(err.tag).toBe('my-tag');
    expect(err.stderr).toBe('my-stderr');
    expect(err.exitCode).toBe(42);
  });
});
