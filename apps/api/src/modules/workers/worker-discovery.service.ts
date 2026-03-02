import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { generateSlug } from '../../common/slug.util';
import { validateWorkerYaml } from './worker-yaml.validator';
import type { WorkerConfig } from './worker-yaml.validator';
import { WorkersService } from './workers.service';

@Injectable()
export class WorkerDiscoveryService implements OnModuleInit {
  private readonly logger = new Logger(WorkerDiscoveryService.name);

  constructor(private readonly workersService: WorkersService) {}

  async onModuleInit(): Promise<void> {
    if (process.env['DISABLE_WORKER_DISCOVERY'] === 'true') {
      this.logger.log('Worker discovery disabled via DISABLE_WORKER_DISCOVERY');
      return;
    }

    const workersDir = this.resolveWorkersDir();
    await this.scanWorkersDirectory(workersDir);
  }

  resolveWorkersDir(): string {
    const workersDir = process.env['WORKERS_DIR'] ?? 'workers';
    return resolve(process.cwd(), workersDir);
  }

  async scanWorkersDirectory(dirPath: string): Promise<void> {
    try {
      const dirStat = await stat(dirPath);
      if (!dirStat.isDirectory()) {
        this.logger.warn(`Workers path is not a directory: "${dirPath}"`);
        return;
      }
    } catch {
      this.logger.warn(`Workers directory not found or inaccessible: "${dirPath}"`);
      return;
    }

    let entries: string[];
    try {
      entries = await readdir(dirPath);
    } catch (err) {
      this.logger.warn(`Failed to read workers directory "${dirPath}": ${String(err)}`);
      return;
    }

    let processed = 0;
    for (const entry of entries) {
      const entryPath = join(dirPath, entry);
      try {
        const entryStat = await stat(entryPath);
        if (!entryStat.isDirectory()) continue;

        const didProcess = await this.processWorkerDirectory(entryPath, entry);
        if (didProcess) processed++;
      } catch (err) {
        this.logger.warn(`Failed to process worker directory "${entry}": ${String(err)}`);
      }
    }

    if (processed === 0) {
      this.logger.warn(`No workers discovered in "${dirPath}"`);
    }
  }

  async processWorkerDirectory(dirPath: string, dirName: string): Promise<boolean> {
    const yamlPath = join(dirPath, 'worker.yaml');

    let yamlContent: string;
    try {
      yamlContent = await readFile(yamlPath, 'utf-8');
    } catch {
      return false;
    }

    let config: WorkerConfig;
    try {
      config = validateWorkerYaml(yamlContent);
    } catch (err) {
      this.logger.warn(`Invalid worker.yaml in "${dirName}": ${String(err)}`);
      return false;
    }

    let dockerfile: string | undefined;
    try {
      dockerfile = await readFile(join(dirPath, 'Dockerfile'), 'utf-8');
    } catch {
      // Dockerfile is optional
    }

    const slug = generateSlug(config.name);
    const newConfigHash = this.computeConfigHash(config);

    try {
      let existingWorker = await this.findWorkerBySlug(slug);

      if (!existingWorker) {
        try {
          await this.workersService.createWorker({
            name: config.name,
            description: config.systemPrompt,
          });
        } catch (err) {
          if (err instanceof ConflictException) {
            this.logger.log(
              `Worker "${config.name}" (${slug}) already registered (race condition), skipping`,
            );
            return true;
          }
          throw err;
        }

        const version = await this.workersService.createVersion(slug, {
          yamlConfig: config as unknown as Record<string, unknown>,
          dockerfile,
        });
        this.logger.log(
          `Discovered worker "${config.name}" (${slug}) v${version.version}`,
        );
        return true;
      }

      const latestVersion = existingWorker.versions
        .slice()
        .sort((a, b) => b.version - a.version)[0];

      if (!latestVersion) {
        const version = await this.workersService.createVersion(slug, {
          yamlConfig: config as unknown as Record<string, unknown>,
          dockerfile,
        });
        this.logger.log(
          `Discovered worker "${config.name}" (${slug}) v${version.version}`,
        );
        return true;
      }

      const storedConfigHash = this.computeConfigHash(
        latestVersion.yamlConfig as Record<string, unknown>,
      );

      if (storedConfigHash !== newConfigHash) {
        const version = await this.workersService.createVersion(slug, {
          yamlConfig: config as unknown as Record<string, unknown>,
          dockerfile,
        });
        this.logger.log(
          `Updated worker "${config.name}" (${slug}) v${version.version}`,
        );
      } else {
        this.logger.log(
          `Worker "${config.name}" (${slug}) v${latestVersion.version} unchanged`,
        );
      }

      return true;
    } catch (err) {
      this.logger.warn(
        `Failed to register worker "${dirName}": ${String(err)}`,
      );
      return false;
    }
  }

  private async findWorkerBySlug(slug: string) {
    try {
      return await this.workersService.findBySlug(slug);
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      throw err;
    }
  }

  computeConfigHash(config: Record<string, unknown> | object): string {
    const normalized = this.sortedJsonStringify(config);
    return createHash('sha256').update(normalized).digest('hex');
  }

  sortedJsonStringify(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.sortedJsonStringify(item)).join(',') + ']';
    }
    const record = obj as Record<string, unknown>;
    const sorted = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.sortedJsonStringify(record[key])}`)
      .join(',');
    return '{' + sorted + '}';
  }
}
