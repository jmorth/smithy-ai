import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { ContainerBuildError } from './container-build.error';

export interface BuildWorkerImageOptions {
  forceBuild?: boolean;
}

@Injectable()
export class ContainerBuilderService {
  private readonly logger = new Logger(ContainerBuilderService.name);

  getImageTag(slug: string, version?: string): string {
    return `smithy-worker-${slug}:${version ?? 'latest'}`;
  }

  async imageExists(tag: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const proc = spawn('docker', ['image', 'inspect', tag], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });

      proc.on('close', (code) => {
        resolve(code === 0);
      });

      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  async buildWorkerImage(
    slug: string,
    version: string | undefined,
    dockerfilePath: string,
    options: BuildWorkerImageOptions = {},
  ): Promise<string> {
    const tag = this.getImageTag(slug, version);

    if (!options.forceBuild) {
      const exists = await this.imageExists(tag);
      if (exists) {
        this.logger.log(`Image already exists, skipping build: ${tag}`);
        return tag;
      }
    }

    this.logger.log(`Building Docker image: ${tag}`);

    const context = dirname(dockerfilePath);

    const args = [
      'build',
      '-f',
      dockerfilePath,
      '-t',
      tag,
      '--label',
      `smithy.worker.slug=${slug}`,
      context,
    ];

    return new Promise<string>((resolve, reject) => {
      const proc = spawn('docker', args, {
        env: { ...process.env, DOCKER_BUILDKIT: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().trimEnd().split('\n');
        for (const line of lines) {
          this.logger.log(`[docker build] ${line}`);
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        const lines = chunk.trimEnd().split('\n');
        for (const line of lines) {
          this.logger.warn(`[docker build] ${line}`);
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`Image built successfully: ${tag}`);
          resolve(tag);
        } else {
          reject(new ContainerBuildError(tag, stderr.trim(), code ?? 1));
        }
      });

      proc.on('error', (err) => {
        reject(
          new ContainerBuildError(
            tag,
            err.message,
            1,
          ),
        );
      });
    });
  }
}
