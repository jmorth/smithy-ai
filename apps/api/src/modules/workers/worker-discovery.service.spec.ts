import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { WorkerDiscoveryService } from './worker-discovery.service';

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

import * as fsPromises from 'node:fs/promises';

const mockStat = vi.mocked(fsPromises.stat);
const mockReaddir = vi.mocked(fsPromises.readdir);
const mockReadFile = vi.mocked(fsPromises.readFile);

const VALID_YAML = `
name: My Worker
inputTypes:
  - text
outputType: text
provider:
  name: anthropic
  model: claude-3-5-sonnet-latest
  apiKeyEnv: ANTHROPIC_API_KEY
`.trim();

const VALID_CONFIG = {
  name: 'My Worker',
  inputTypes: ['text'],
  outputType: 'text',
  provider: {
    name: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  tools: [],
  timeout: 300,
  retries: 0,
};

function makeWorker(overrides: Record<string, unknown> = {}) {
  return {
    id: 'worker-uuid-1',
    name: 'My Worker',
    slug: 'my-worker',
    description: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-uuid-1',
    workerId: 'worker-uuid-1',
    version: 1,
    yamlConfig: VALID_CONFIG,
    dockerfileHash: null,
    status: 'ACTIVE',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeWorkersService(overrides: Record<string, unknown> = {}) {
  return {
    createWorker: vi.fn(),
    createVersion: vi.fn(),
    findBySlug: vi.fn(),
    findAll: vi.fn(),
    updateWorker: vi.fn(),
    deprecateVersion: vi.fn(),
    ...overrides,
  };
}

function makeDirectoryStat() {
  return { isDirectory: vi.fn().mockReturnValue(true) } as unknown as Awaited<
    ReturnType<typeof fsPromises.stat>
  >;
}

function makeFileStat() {
  return { isDirectory: vi.fn().mockReturnValue(false) } as unknown as Awaited<
    ReturnType<typeof fsPromises.stat>
  >;
}

function buildService(workersServiceOverrides: Record<string, unknown> = {}) {
  const mockWorkersService = makeWorkersService(workersServiceOverrides) as any;
  const service = new WorkerDiscoveryService(mockWorkersService);
  return { service, mockWorkersService };
}

describe('WorkerDiscoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['DISABLE_WORKER_DISCOVERY'];
    delete process.env['WORKERS_DIR'];
  });

  afterEach(() => {
    delete process.env['DISABLE_WORKER_DISCOVERY'];
    delete process.env['WORKERS_DIR'];
  });

  describe('onModuleInit', () => {
    it('skips scanning when DISABLE_WORKER_DISCOVERY is true', async () => {
      process.env['DISABLE_WORKER_DISCOVERY'] = 'true';
      const { service } = buildService();
      const scanSpy = vi.spyOn(service, 'scanWorkersDirectory');
      await service.onModuleInit();
      expect(scanSpy).not.toHaveBeenCalled();
    });

    it('scans workers directory when DISABLE_WORKER_DISCOVERY is not set', async () => {
      const { service } = buildService();
      const scanSpy = vi
        .spyOn(service, 'scanWorkersDirectory')
        .mockResolvedValue(undefined);
      await service.onModuleInit();
      expect(scanSpy).toHaveBeenCalledOnce();
    });

    it('scans when DISABLE_WORKER_DISCOVERY is false string', async () => {
      process.env['DISABLE_WORKER_DISCOVERY'] = 'false';
      const { service } = buildService();
      const scanSpy = vi
        .spyOn(service, 'scanWorkersDirectory')
        .mockResolvedValue(undefined);
      await service.onModuleInit();
      expect(scanSpy).toHaveBeenCalledOnce();
    });
  });

  describe('resolveWorkersDir', () => {
    it('returns workers dir relative to cwd by default', () => {
      const { service } = buildService();
      const result = service.resolveWorkersDir();
      expect(result).toContain('workers');
      expect(result).toMatch(/^\//); // absolute path
    });

    it('uses WORKERS_DIR env var when set', () => {
      process.env['WORKERS_DIR'] = '/custom/workers/path';
      const { service } = buildService();
      const result = service.resolveWorkersDir();
      expect(result).toBe('/custom/workers/path');
    });

    it('resolves relative WORKERS_DIR against cwd', () => {
      process.env['WORKERS_DIR'] = 'my-workers';
      const { service } = buildService();
      const result = service.resolveWorkersDir();
      expect(result).toContain('my-workers');
      expect(result).toMatch(/^\//);
    });
  });

  describe('scanWorkersDirectory', () => {
    it('logs warning and returns when directory does not exist', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT: no such file or directory'));
      const { service } = buildService();
      await expect(service.scanWorkersDirectory('/nonexistent')).resolves.toBeUndefined();
    });

    it('logs warning and returns when path is not a directory', async () => {
      mockStat.mockResolvedValue(makeFileStat());
      const { service } = buildService();
      await expect(service.scanWorkersDirectory('/some/file')).resolves.toBeUndefined();
    });

    it('logs warning when no workers are discovered', async () => {
      mockStat.mockResolvedValue(makeDirectoryStat());
      mockReaddir.mockResolvedValue([] as any);
      const { service } = buildService();
      await expect(service.scanWorkersDirectory('/workers')).resolves.toBeUndefined();
    });

    it('skips non-directory entries', async () => {
      mockStat
        .mockResolvedValueOnce(makeDirectoryStat()) // for the dir itself
        .mockResolvedValueOnce(makeFileStat()); // for the entry
      mockReaddir.mockResolvedValue(['some-file.txt'] as any);
      const { service } = buildService();
      const processSpy = vi
        .spyOn(service, 'processWorkerDirectory')
        .mockResolvedValue(true);
      await service.scanWorkersDirectory('/workers');
      expect(processSpy).not.toHaveBeenCalled();
    });

    it('processes subdirectories', async () => {
      mockStat
        .mockResolvedValueOnce(makeDirectoryStat()) // root dir check
        .mockResolvedValueOnce(makeDirectoryStat()); // entry check
      mockReaddir.mockResolvedValue(['my-worker'] as any);
      const { service } = buildService();
      const processSpy = vi
        .spyOn(service, 'processWorkerDirectory')
        .mockResolvedValue(true);
      await service.scanWorkersDirectory('/workers');
      expect(processSpy).toHaveBeenCalledOnce();
    });

    it('processes multiple worker subdirectories', async () => {
      mockStat
        .mockResolvedValueOnce(makeDirectoryStat()) // root dir
        .mockResolvedValueOnce(makeDirectoryStat()) // entry 1
        .mockResolvedValueOnce(makeDirectoryStat()); // entry 2
      mockReaddir.mockResolvedValue(['worker-a', 'worker-b'] as any);
      const { service } = buildService();
      const processSpy = vi
        .spyOn(service, 'processWorkerDirectory')
        .mockResolvedValue(true);
      await service.scanWorkersDirectory('/workers');
      expect(processSpy).toHaveBeenCalledTimes(2);
    });

    it('continues processing when one directory fails', async () => {
      mockStat
        .mockResolvedValueOnce(makeDirectoryStat()) // root dir
        .mockResolvedValueOnce(makeDirectoryStat()) // entry 1
        .mockResolvedValueOnce(makeDirectoryStat()); // entry 2
      mockReaddir.mockResolvedValue(['worker-a', 'worker-b'] as any);
      const { service } = buildService();
      const processSpy = vi
        .spyOn(service, 'processWorkerDirectory')
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockResolvedValueOnce(true);
      await expect(service.scanWorkersDirectory('/workers')).resolves.toBeUndefined();
      expect(processSpy).toHaveBeenCalledTimes(2);
    });

    it('logs warning when no directories processed (files only)', async () => {
      mockStat
        .mockResolvedValueOnce(makeDirectoryStat())
        .mockResolvedValueOnce(makeFileStat());
      mockReaddir.mockResolvedValue(['readme.txt'] as any);
      const { service } = buildService();
      await service.scanWorkersDirectory('/workers');
      // Should not throw, should log warning
    });

    it('passes correct path to processWorkerDirectory', async () => {
      mockStat
        .mockResolvedValueOnce(makeDirectoryStat())
        .mockResolvedValueOnce(makeDirectoryStat());
      mockReaddir.mockResolvedValue(['my-worker'] as any);
      const { service } = buildService();
      const processSpy = vi
        .spyOn(service, 'processWorkerDirectory')
        .mockResolvedValue(true);
      await service.scanWorkersDirectory('/workers');
      expect(processSpy).toHaveBeenCalledWith('/workers/my-worker', 'my-worker');
    });

    it('handles readdir failure gracefully', async () => {
      mockStat.mockResolvedValue(makeDirectoryStat());
      mockReaddir.mockRejectedValue(new Error('Permission denied'));
      const { service } = buildService();
      await expect(service.scanWorkersDirectory('/workers')).resolves.toBeUndefined();
    });
  });

  describe('processWorkerDirectory', () => {
    it('returns false when worker.yaml does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const { service } = buildService();
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(false);
    });

    it('returns false and logs warning for invalid YAML', async () => {
      mockReadFile.mockResolvedValueOnce('{ invalid: yaml:' as any);
      const { service } = buildService();
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(false);
    });

    it('returns false and logs warning for invalid worker config', async () => {
      mockReadFile.mockResolvedValueOnce('name: test\n' as any); // missing required fields
      const { service } = buildService();
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(false);
    });

    it('creates new worker and version when slug does not exist', async () => {
      mockReadFile.mockResolvedValueOnce(VALID_YAML as any); // worker.yaml
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT')); // no Dockerfile
      const worker = makeWorker();
      const version = makeVersion();
      const { service, mockWorkersService } = buildService({
        findBySlug: vi.fn().mockRejectedValue(new NotFoundException('not found')),
        createWorker: vi.fn().mockResolvedValue(worker),
        createVersion: vi.fn().mockResolvedValue(version),
      });
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(true);
      expect(mockWorkersService.createWorker).toHaveBeenCalledOnce();
      expect(mockWorkersService.createVersion).toHaveBeenCalledOnce();
    });

    it('passes worker name and systemPrompt as description when creating new worker', async () => {
      const yaml = VALID_YAML + '\nsystemPrompt: You are a helpful assistant.';
      mockReadFile.mockResolvedValueOnce(yaml as any);
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const worker = makeWorker();
      const version = makeVersion();
      const { service, mockWorkersService } = buildService({
        findBySlug: vi.fn().mockRejectedValue(new NotFoundException('not found')),
        createWorker: vi.fn().mockResolvedValue(worker),
        createVersion: vi.fn().mockResolvedValue(version),
      });
      await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(mockWorkersService.createWorker).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Worker', description: 'You are a helpful assistant.' }),
      );
    });

    it('passes yamlConfig to createVersion', async () => {
      mockReadFile.mockResolvedValueOnce(VALID_YAML as any);
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const worker = makeWorker();
      const version = makeVersion();
      const { service, mockWorkersService } = buildService({
        findBySlug: vi.fn().mockRejectedValue(new NotFoundException('not found')),
        createWorker: vi.fn().mockResolvedValue(worker),
        createVersion: vi.fn().mockResolvedValue(version),
      });
      await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      const [, dto] = mockWorkersService.createVersion.mock.calls[0] as [string, any];
      expect(dto.yamlConfig).toMatchObject({ name: 'My Worker' });
    });

    it('reads Dockerfile when present and passes to createVersion', async () => {
      const dockerfileContent = 'FROM node:20\nCOPY . .';
      mockReadFile
        .mockResolvedValueOnce(VALID_YAML as any) // worker.yaml
        .mockResolvedValueOnce(dockerfileContent as any); // Dockerfile
      const worker = makeWorker();
      const version = makeVersion({ dockerfileHash: dockerfileContent });
      const { service, mockWorkersService } = buildService({
        findBySlug: vi.fn().mockRejectedValue(new NotFoundException('not found')),
        createWorker: vi.fn().mockResolvedValue(worker),
        createVersion: vi.fn().mockResolvedValue(version),
      });
      await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      const [, dto] = mockWorkersService.createVersion.mock.calls[0] as [string, any];
      expect(dto.dockerfile).toBe(dockerfileContent);
    });

    it('does not fail when Dockerfile is absent', async () => {
      mockReadFile.mockResolvedValueOnce(VALID_YAML as any);
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT')); // no Dockerfile
      const worker = makeWorker();
      const version = makeVersion();
      const { service, mockWorkersService } = buildService({
        findBySlug: vi.fn().mockRejectedValue(new NotFoundException('not found')),
        createWorker: vi.fn().mockResolvedValue(worker),
        createVersion: vi.fn().mockResolvedValue(version),
      });
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(true);
      const [, dto] = mockWorkersService.createVersion.mock.calls[0] as [string, any];
      expect(dto.dockerfile).toBeUndefined();
    });

    it('does not create a new version when config hash is unchanged', async () => {
      const { service, mockWorkersService } = buildService();
      const existingVersion = makeVersion({ yamlConfig: VALID_CONFIG });
      const workerWithVersions = { ...makeWorker(), versions: [existingVersion] };
      mockWorkersService.findBySlug.mockResolvedValue(workerWithVersions);
      mockReadFile.mockResolvedValueOnce(VALID_YAML as any);
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(true);
      expect(mockWorkersService.createVersion).not.toHaveBeenCalled();
    });

    it('creates a new version when config hash has changed', async () => {
      const differentConfig = { ...VALID_CONFIG, timeout: 600 };
      const existingVersion = makeVersion({ yamlConfig: differentConfig });
      const workerWithVersions = { ...makeWorker(), versions: [existingVersion] };
      const newVersion = makeVersion({ version: 2 });
      const { service, mockWorkersService } = buildService({
        findBySlug: vi.fn().mockResolvedValue(workerWithVersions),
        createVersion: vi.fn().mockResolvedValue(newVersion),
      });
      mockReadFile.mockResolvedValueOnce(VALID_YAML as any);
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(true);
      expect(mockWorkersService.createVersion).toHaveBeenCalledOnce();
    });

    it('uses the latest version for hash comparison (highest version number)', async () => {
      const v1 = makeVersion({ version: 1, yamlConfig: { ...VALID_CONFIG, timeout: 600 } });
      const v2 = makeVersion({ version: 2, yamlConfig: VALID_CONFIG }); // latest, matches
      const workerWithVersions = { ...makeWorker(), versions: [v1, v2] };
      const { service, mockWorkersService } = buildService({
        findBySlug: vi.fn().mockResolvedValue(workerWithVersions),
      });
      mockReadFile.mockResolvedValueOnce(VALID_YAML as any);
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(true);
      expect(mockWorkersService.createVersion).not.toHaveBeenCalled();
    });

    it('creates version for existing worker with no versions', async () => {
      const workerWithNoVersions = { ...makeWorker(), versions: [] };
      const newVersion = makeVersion({ version: 1 });
      const { service, mockWorkersService } = buildService({
        findBySlug: vi.fn().mockResolvedValue(workerWithNoVersions),
        createVersion: vi.fn().mockResolvedValue(newVersion),
      });
      mockReadFile.mockResolvedValueOnce(VALID_YAML as any);
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(true);
      expect(mockWorkersService.createVersion).toHaveBeenCalledOnce();
    });

    it('handles race condition: ConflictException from createWorker is treated as no-op', async () => {
      mockReadFile.mockResolvedValueOnce(VALID_YAML as any);
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const { service, mockWorkersService } = buildService({
        findBySlug: vi.fn().mockRejectedValue(new NotFoundException('not found')),
        createWorker: vi.fn().mockRejectedValue(new ConflictException('slug conflict')),
      });
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(true);
      expect(mockWorkersService.createVersion).not.toHaveBeenCalled();
    });

    it('returns false when createWorker throws a non-ConflictException error', async () => {
      mockReadFile.mockResolvedValueOnce(VALID_YAML as any);
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const { service } = buildService({
        findBySlug: vi.fn().mockRejectedValue(new NotFoundException('not found')),
        createWorker: vi.fn().mockRejectedValue(new Error('Database timeout')),
      });
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(false);
    });

    it('returns false and logs warning on unexpected errors', async () => {
      mockReadFile.mockResolvedValueOnce(VALID_YAML as any);
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const { service, mockWorkersService } = buildService({
        findBySlug: vi.fn().mockRejectedValue(new Error('Database connection error')),
      });
      const result = await service.processWorkerDirectory('/workers/my-worker', 'my-worker');
      expect(result).toBe(false);
    });

    it('derives slug from worker name in YAML', async () => {
      const yaml = `
name: My Awesome Worker
inputTypes:
  - text
outputType: text
provider:
  name: anthropic
  model: claude-3-5-sonnet-latest
  apiKeyEnv: ANTHROPIC_API_KEY
`.trim();
      mockReadFile.mockResolvedValueOnce(yaml as any);
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
      const worker = makeWorker({ slug: 'my-awesome-worker' });
      const version = makeVersion();
      const { service, mockWorkersService } = buildService({
        findBySlug: vi.fn().mockRejectedValue(new NotFoundException('not found')),
        createWorker: vi.fn().mockResolvedValue(worker),
        createVersion: vi.fn().mockResolvedValue(version),
      });
      await service.processWorkerDirectory('/workers/my-awesome-worker', 'my-awesome-worker');
      expect(mockWorkersService.findBySlug).toHaveBeenCalledWith('my-awesome-worker');
    });
  });

  describe('computeConfigHash', () => {
    it('returns a hex string', () => {
      const { service } = buildService();
      const hash = service.computeConfigHash({ name: 'test' });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns the same hash for the same config', () => {
      const { service } = buildService();
      const config = { name: 'test', value: 42 };
      expect(service.computeConfigHash(config)).toBe(service.computeConfigHash(config));
    });

    it('returns different hashes for different configs', () => {
      const { service } = buildService();
      expect(service.computeConfigHash({ name: 'a' })).not.toBe(
        service.computeConfigHash({ name: 'b' }),
      );
    });

    it('produces the same hash regardless of key order', () => {
      const { service } = buildService();
      const config1 = { name: 'test', value: 42 };
      const config2 = { value: 42, name: 'test' };
      expect(service.computeConfigHash(config1)).toBe(service.computeConfigHash(config2));
    });

    it('handles nested objects deterministically', () => {
      const { service } = buildService();
      const config1 = { a: { z: 1, a: 2 }, b: 3 };
      const config2 = { b: 3, a: { a: 2, z: 1 } };
      expect(service.computeConfigHash(config1)).toBe(service.computeConfigHash(config2));
    });

    it('handles arrays correctly', () => {
      const { service } = buildService();
      const config1 = { items: ['a', 'b', 'c'] };
      const config2 = { items: ['a', 'b', 'c'] };
      expect(service.computeConfigHash(config1)).toBe(service.computeConfigHash(config2));
    });

    it('treats different array orders as different', () => {
      const { service } = buildService();
      const config1 = { items: ['a', 'b'] };
      const config2 = { items: ['b', 'a'] };
      expect(service.computeConfigHash(config1)).not.toBe(service.computeConfigHash(config2));
    });
  });

  describe('sortedJsonStringify', () => {
    it('serializes primitives correctly', () => {
      const { service } = buildService();
      expect(service.sortedJsonStringify(42)).toBe('42');
      expect(service.sortedJsonStringify('hello')).toBe('"hello"');
      expect(service.sortedJsonStringify(true)).toBe('true');
      expect(service.sortedJsonStringify(null)).toBe('null');
    });

    it('serializes objects with sorted keys', () => {
      const { service } = buildService();
      const result = service.sortedJsonStringify({ z: 1, a: 2, m: 3 });
      expect(result).toBe('{"a":2,"m":3,"z":1}');
    });

    it('serializes arrays preserving order', () => {
      const { service } = buildService();
      const result = service.sortedJsonStringify([3, 1, 2]);
      expect(result).toBe('[3,1,2]');
    });

    it('serializes nested objects', () => {
      const { service } = buildService();
      const result = service.sortedJsonStringify({ b: { y: 1, x: 2 }, a: 'val' });
      expect(result).toBe('{"a":"val","b":{"x":2,"y":1}}');
    });

    it('handles empty object', () => {
      const { service } = buildService();
      expect(service.sortedJsonStringify({})).toBe('{}');
    });

    it('handles empty array', () => {
      const { service } = buildService();
      expect(service.sortedJsonStringify([])).toBe('[]');
    });

    it('handles undefined by producing consistent output', () => {
      const { service } = buildService();
      expect(service.sortedJsonStringify(undefined)).toBe(undefined as unknown as string);
    });
  });

  describe('WorkersModule integration (service wiring)', () => {
    it('service can be instantiated with a WorkersService', () => {
      const { service } = buildService();
      expect(service).toBeInstanceOf(WorkerDiscoveryService);
    });
  });
});
