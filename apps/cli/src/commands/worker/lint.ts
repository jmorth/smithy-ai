import type { Command } from "commander";
import { existsSync, readFileSync, statSync } from "fs";
import { resolve, join } from "path";
import { parse as parseYaml } from "yaml";
import chalk from "chalk";
import { isJsonMode, setJsonMode, printJson, error } from "../../lib/output.js";

export interface LintCheckResult {
  check: string;
  passed: boolean;
  message: string;
}

type CheckFn = (dir: string) => LintCheckResult;

// ---------------------------------------------------------------------------
// Individual check functions
// ---------------------------------------------------------------------------

function checkYamlExists(dir: string): LintCheckResult {
  const yamlPath = join(dir, "worker.yaml");
  const exists = existsSync(yamlPath);
  return {
    check: "worker.yaml exists",
    passed: exists,
    message: exists
      ? "worker.yaml found"
      : "worker.yaml not found in worker directory",
  };
}

function parseWorkerYaml(dir: string): { data: Record<string, unknown> | null; error: string | null } {
  const yamlPath = join(dir, "worker.yaml");
  if (!existsSync(yamlPath)) {
    return { data: null, error: null };
  }
  try {
    const content = readFileSync(yamlPath, "utf-8");
    const data = parseYaml(content);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return { data: null, error: "worker.yaml does not contain a valid YAML object" };
    }
    return { data: data as Record<string, unknown>, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { data: null, error: `Failed to parse worker.yaml: ${msg}` };
  }
}

function checkYamlParseable(dir: string): LintCheckResult {
  const { data, error } = parseWorkerYaml(dir);
  if (error) {
    return { check: "worker.yaml is valid YAML", passed: false, message: error };
  }
  if (!data) {
    return { check: "worker.yaml is valid YAML", passed: false, message: "worker.yaml not found" };
  }
  return { check: "worker.yaml is valid YAML", passed: true, message: "worker.yaml parsed successfully" };
}

function checkYamlName(dir: string): LintCheckResult {
  const { data } = parseWorkerYaml(dir);
  if (!data) {
    return { check: "name field", passed: false, message: "Cannot validate: worker.yaml not parseable" };
  }
  const name = data.name;
  if (typeof name !== "string" || name.trim() === "") {
    return { check: "name field", passed: false, message: "\"name\" must be a non-empty string" };
  }
  return { check: "name field", passed: true, message: `name: "${name}"` };
}

function checkYamlInputTypes(dir: string): LintCheckResult {
  const { data } = parseWorkerYaml(dir);
  if (!data) {
    return { check: "inputTypes field", passed: false, message: "Cannot validate: worker.yaml not parseable" };
  }
  const inputTypes = data.inputTypes;
  if (!Array.isArray(inputTypes) || inputTypes.length === 0) {
    return {
      check: "inputTypes field",
      passed: false,
      message: "\"inputTypes\" must be a non-empty array",
    };
  }
  const allStrings = inputTypes.every((item) => typeof item === "string");
  if (!allStrings) {
    return {
      check: "inputTypes field",
      passed: false,
      message: "\"inputTypes\" must contain only strings",
    };
  }
  return {
    check: "inputTypes field",
    passed: true,
    message: `inputTypes: [${inputTypes.map((t) => `"${t}"`).join(", ")}]`,
  };
}

function checkYamlOutputType(dir: string): LintCheckResult {
  const { data } = parseWorkerYaml(dir);
  if (!data) {
    return { check: "outputType field", passed: false, message: "Cannot validate: worker.yaml not parseable" };
  }
  const outputType = data.outputType;
  if (typeof outputType !== "string" || outputType.trim() === "") {
    return {
      check: "outputType field",
      passed: false,
      message: "\"outputType\" must be a non-empty string",
    };
  }
  return { check: "outputType field", passed: true, message: `outputType: "${outputType}"` };
}

function checkYamlProvider(dir: string): LintCheckResult {
  const { data } = parseWorkerYaml(dir);
  if (!data) {
    return { check: "provider field", passed: false, message: "Cannot validate: worker.yaml not parseable" };
  }
  const provider = data.provider;
  if (typeof provider !== "object" || provider === null || Array.isArray(provider)) {
    return {
      check: "provider field",
      passed: false,
      message: "\"provider\" must be an object with name, model, and apiKeyEnv",
    };
  }
  const p = provider as Record<string, unknown>;
  const missing: string[] = [];
  if (typeof p.name !== "string" || p.name.trim() === "") missing.push("name");
  if (typeof p.model !== "string" || p.model.trim() === "") missing.push("model");
  if (typeof p.apiKeyEnv !== "string" || p.apiKeyEnv.trim() === "") missing.push("apiKeyEnv");
  if (missing.length > 0) {
    return {
      check: "provider field",
      passed: false,
      message: `provider missing required fields: ${missing.join(", ")}`,
    };
  }
  return {
    check: "provider field",
    passed: true,
    message: `provider: ${p.name} / ${p.model}`,
  };
}

function checkWorkerTsExists(dir: string): LintCheckResult {
  const tsPath = join(dir, "worker.ts");
  const exists = existsSync(tsPath);
  return {
    check: "worker.ts exists",
    passed: exists,
    message: exists
      ? "worker.ts found"
      : "worker.ts not found in worker directory",
  };
}

function checkWorkerTsExtendsSmithyWorker(dir: string): LintCheckResult {
  const tsPath = join(dir, "worker.ts");
  if (!existsSync(tsPath)) {
    return {
      check: "worker.ts extends SmithyWorker",
      passed: false,
      message: "Cannot validate: worker.ts not found",
    };
  }
  const content = readFileSync(tsPath, "utf-8");
  const extendsPattern = /class\s+\w+\s+extends\s+SmithyWorker/;
  if (!extendsPattern.test(content)) {
    return {
      check: "worker.ts extends SmithyWorker",
      passed: false,
      message: "No class extending SmithyWorker found in worker.ts",
    };
  }
  return {
    check: "worker.ts extends SmithyWorker",
    passed: true,
    message: "Found class extending SmithyWorker",
  };
}

function checkDockerfileExists(dir: string): LintCheckResult {
  const dockerfilePath = join(dir, "Dockerfile");
  const exists = existsSync(dockerfilePath);
  return {
    check: "Dockerfile exists",
    passed: exists,
    message: exists
      ? "Dockerfile found"
      : "Dockerfile not found in worker directory",
  };
}

const checks: CheckFn[] = [
  checkYamlExists,
  checkYamlParseable,
  checkYamlName,
  checkYamlInputTypes,
  checkYamlOutputType,
  checkYamlProvider,
  checkWorkerTsExists,
  checkWorkerTsExtendsSmithyWorker,
  checkDockerfileExists,
];

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function printResults(results: LintCheckResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const allPassed = passed === total;

  if (isJsonMode()) {
    printJson(results);
    return;
  }

  for (const result of results) {
    const icon = result.passed ? chalk.green("✓") : chalk.red("✗");
    const msg = result.passed
      ? `${icon} ${result.check} — ${result.message}`
      : `${icon} ${result.check} — ${chalk.red(result.message)}`;
    process.stdout.write(msg + "\n");
  }

  process.stdout.write("\n");
  const summary = `${passed}/${total} checks passed`;
  process.stdout.write(
    (allPassed ? chalk.green(summary) : chalk.red(summary)) + "\n",
  );
}

// ---------------------------------------------------------------------------
// Exported functions for testability
// ---------------------------------------------------------------------------

export { checks, printResults, parseWorkerYaml };

export {
  checkYamlExists,
  checkYamlParseable,
  checkYamlName,
  checkYamlInputTypes,
  checkYamlOutputType,
  checkYamlProvider,
  checkWorkerTsExists,
  checkWorkerTsExtendsSmithyWorker,
  checkDockerfileExists,
};

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function run(
  globalOpts: Record<string, unknown>,
  _cmd: Command,
  path?: string,
): Promise<void> {
  if (globalOpts.json) {
    setJsonMode(true);
  }

  const targetDir = resolve(path ?? ".");

  if (!existsSync(targetDir)) {
    error(`Path does not exist: ${targetDir}`);
    process.exitCode = 1;
    return;
  }

  if (!statSync(targetDir).isDirectory()) {
    error(
      `"${targetDir}" is a file, not a directory. The lint command expects a Worker directory.`,
    );
    process.exitCode = 1;
    return;
  }

  const results = checks.map((check) => check(targetDir));
  printResults(results);

  const allPassed = results.every((r) => r.passed);
  process.exitCode = allPassed ? 0 : 1;
}
