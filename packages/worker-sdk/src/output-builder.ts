import type {
  OutputBuilder as IOutputBuilder,
  PackageOutput,
} from '@smithy/shared';

/**
 * Builder pattern for constructing output Packages.
 * Accumulates files and metadata in memory. The build() method
 * returns a PackageOutput that the runner sends to the API.
 */
export class OutputBuilderImpl implements IOutputBuilder {
  private files: PackageOutput['files'] = [];
  private metadata: Record<string, unknown> = {};
  private type: string | undefined;

  addFile(
    name: string,
    content: Buffer | string,
    mimeType = 'application/octet-stream',
  ): this {
    this.files.push({ filename: name, content, mimeType });
    return this;
  }

  setMetadata(key: string, value: unknown): this {
    this.metadata[key] = value;
    return this;
  }

  setType(packageType: string): this {
    this.type = packageType;
    return this;
  }

  build(): PackageOutput {
    if (!this.type) {
      throw new Error(
        'Output type must be set before building. Call setType() first.',
      );
    }
    return {
      type: this.type,
      files: [...this.files],
      metadata: { ...this.metadata },
    };
  }
}
