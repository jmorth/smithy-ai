import type { Command } from "commander";
import { existsSync, readFileSync, statSync } from "fs";
import { resolve, join } from "path";
import { parse as parseYaml } from "yaml";
import chalk from "chalk";
import {
  isJsonMode,
  setJsonMode,
  printJson,
  error,
  spinner,
} from "../../lib/output.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildOptions {
  verbose?: boolean;
  tag?: string;
  cache?: boolean;
  platform?: string;
}

export interface BuildResult {
  image: string;
  tags: string[];
  size: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// YAML parsing (reused pattern from lint command)
// ---------------------------------------------------------------------------

export function parseWorkerYaml(
  dir: string,
): { data: Record<string, unknown> | null; error: string | null } {
  const yamlPath = join(dir, "worker.yaml");
  if (!existsSync(yamlPath)) {
    return { data: null, error: "worker.yaml not found in worker directory" };
  }
  try {
    const content = readFileSync(yamlPath, "utf-8");
    const data = parseYaml(content);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return {
        data: null,
        error: "worker.yaml does not contain a valid YAML object",
      };
    }
    return { data: data as Record<string, unknown>, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { data: null, error: `Failed to parse worker.yaml: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Name sanitization
// ---------------------------------------------------------------------------

export function sanitizeName(name: string): {
  sanitized: string;
  wasModified: boolean;
} {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return { sanitized, wasModified: sanitized !== name };
}

// ---------------------------------------------------------------------------
// Human-readable file size
// ---------------------------------------------------------------------------

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

// ---------------------------------------------------------------------------
// Docker availability check
// ---------------------------------------------------------------------------

export async function checkDockerAvailable(): Promise<{
  available: boolean;
  error: string | null;
}> {
  try {
    const proc = Bun.spawn(["docker", "info"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return {
        available: false,
        error:
          "Docker daemon is not running. Please start Docker and try again.",
      };
    }
    return { available: true, error: null };
  } catch {
    return {
      available: false,
      error:
        "Docker is not installed or not in PATH. Please install Docker and try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// Docker image size
// ---------------------------------------------------------------------------

export async function getImageSize(
  imageRef: string,
): Promise<{ sizeBytes: number; error: string | null }> {
  try {
    const proc = Bun.spawn(
      ["docker", "image", "inspect", "--format", "{{.Size}}", imageRef],
      { stdout: "pipe", stderr: "pipe" },
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return { sizeBytes: 0, error: "Failed to inspect image size" };
    }
    const output = await new Response(proc.stdout).text();
    const sizeBytes = parseInt(output.trim(), 10);
    if (isNaN(sizeBytes)) {
      return { sizeBytes: 0, error: "Failed to parse image size" };
    }
    return { sizeBytes, error: null };
  } catch {
    return { sizeBytes: 0, error: "Failed to inspect image" };
  }
}

// ---------------------------------------------------------------------------
// Docker build
// ---------------------------------------------------------------------------

export async function dockerBuild(
  dir: string,
  tags: string[],
  opts: BuildOptions,
): Promise<{ success: boolean; output: string }> {
  const args = ["docker", "build"];

  for (const tag of tags) {
    args.push("-t", tag);
  }

  args.push("-f", "Dockerfile");

  if (opts.cache === false) {
    args.push("--no-cache");
  }

  if (opts.platform) {
    args.push("--platform", opts.platform);
  }

  args.push(".");

  if (opts.verbose) {
    const proc = Bun.spawn(args, {
      cwd: dir,
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await proc.exited;
    return { success: exitCode === 0, output: "" };
  }

  const proc = Bun.spawn(args, {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { success: exitCode === 0, output: stdout + stderr };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateWorkerDir(dir: string): string | null {
  if (!existsSync(dir)) {
    return `Path does not exist: ${dir}`;
  }
  if (!statSync(dir).isDirectory()) {
    return `"${dir}" is a file, not a directory. The build command expects a Worker directory.`;
  }
  if (!existsSync(join(dir, "worker.yaml"))) {
    return "worker.yaml not found in worker directory. Run 'smithy worker scaffold' to create one.";
  }
  if (!existsSync(join(dir, "Dockerfile"))) {
    return "Dockerfile not found in worker directory. Run 'smithy worker scaffold' to create one.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function run(
  globalOpts: Record<string, unknown>,
  cmd: Command,
  path?: string,
): Promise<void> {
  if (globalOpts.json) {
    setJsonMode(true);
  }

  const targetDir = resolve(path ?? ".");
  const cmdOpts = cmd.opts() as BuildOptions;

  // Validate worker directory
  const validationError = validateWorkerDir(targetDir);
  if (validationError) {
    error(validationError);
    process.exitCode = 1;
    return;
  }

  // Parse worker.yaml
  const { data: yamlData, error: yamlError } = parseWorkerYaml(targetDir);
  if (yamlError || !yamlData) {
    error(yamlError ?? "Failed to parse worker.yaml");
    process.exitCode = 1;
    return;
  }

  // Extract name
  const rawName = yamlData.name;
  if (typeof rawName !== "string" || rawName.trim() === "") {
    error("worker.yaml must contain a non-empty \"name\" field");
    process.exitCode = 1;
    return;
  }

  const { sanitized: workerName, wasModified } = sanitizeName(rawName);
  if (wasModified && !isJsonMode()) {
    process.stderr.write(
      chalk.yellow(
        `Warning: Worker name "${rawName}" was sanitized to "${workerName}" for Docker tag compatibility\n`,
      ),
    );
  }

  // Extract version
  const rawVersion = yamlData.version;
  const version =
    typeof rawVersion === "string" && rawVersion.trim() !== ""
      ? rawVersion.trim()
      : "0.1.0";

  // Check Docker availability
  const docker = await checkDockerAvailable();
  if (!docker.available) {
    error(docker.error!);
    process.exitCode = 1;
    return;
  }

  // Build tags
  const imageName = `smithy-worker-${workerName}`;
  const tags = [`${imageName}:latest`, `${imageName}:${version}`];
  if (cmdOpts.tag) {
    tags.push(`${imageName}:${cmdOpts.tag}`);
  }

  // Run build
  const s = spinner(`Building ${imageName}...`);
  s.start();

  const buildResult = await dockerBuild(targetDir, tags, cmdOpts);

  if (!buildResult.success) {
    s.fail(`Build failed for ${imageName}`);
    if (buildResult.output && !isJsonMode()) {
      process.stderr.write("\nDocker build output:\n");
      process.stderr.write(buildResult.output);
    }
    process.exitCode = 1;
    return;
  }

  // Get image size
  const { sizeBytes } = await getImageSize(`${imageName}:latest`);
  const sizeStr = formatSize(sizeBytes);

  s.succeed(`Built ${imageName}`);

  // Output results
  if (isJsonMode()) {
    const result: BuildResult = {
      image: imageName,
      tags,
      size: sizeStr,
      sizeBytes,
    };
    printJson(result);
  } else {
    process.stdout.write(`\n`);
    process.stdout.write(`  ${chalk.bold("Image:")}  ${imageName}\n`);
    process.stdout.write(
      `  ${chalk.bold("Tags:")}   ${tags.join(", ")}\n`,
    );
    process.stdout.write(`  ${chalk.bold("Size:")}   ${sizeStr}\n`);
    process.stdout.write(`\n`);
  }

  process.exitCode = 0;
}
