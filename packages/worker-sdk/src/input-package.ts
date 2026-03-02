import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InputPackage as IInputPackage } from '@smithy/shared';

/**
 * Provides file access methods for reading the input Package
 * from the /input mount point inside the Worker container.
 *
 * Uses synchronous fs reads — Workers process one Package at a time,
 * so synchronous reads are acceptable and avoid unnecessary complexity.
 */
export class InputPackageImpl implements IInputPackage {
  constructor(
    private readonly inputDir: string,
    private readonly metadata: Record<string, unknown>,
  ) {}

  getFile(name: string): Buffer {
    const filePath = path.join(this.inputDir, name);
    return fs.readFileSync(filePath);
  }

  getFileAsString(name: string): string {
    const filePath = path.join(this.inputDir, name);
    return fs.readFileSync(filePath, 'utf-8');
  }

  listFiles(): string[] {
    if (!fs.existsSync(this.inputDir)) {
      return [];
    }
    return fs.readdirSync(this.inputDir).filter((entry) => {
      const fullPath = path.join(this.inputDir, entry);
      return fs.statSync(fullPath).isFile();
    });
  }

  getMetadata(): Record<string, unknown> {
    return { ...this.metadata };
  }
}
