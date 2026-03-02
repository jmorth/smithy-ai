export class ContainerBuildError extends Error {
  constructor(
    public readonly tag: string,
    public readonly stderr: string,
    public readonly exitCode: number,
  ) {
    super(`Docker build failed for image "${tag}" (exit code ${exitCode}): ${stderr}`);
    this.name = 'ContainerBuildError';
  }
}
