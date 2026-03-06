import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import type { Command } from "commander";
import { spinner, error } from "../../lib/output.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_INPUT_TYPES = ["text", "image", "pdf", "json", "csv"];

const PROVIDER_DEFAULTS: Record<string, { model: string; apiKeyEnv: string }> =
  {
    anthropic: {
      model: "claude-sonnet-4-20250514",
      apiKeyEnv: "ANTHROPIC_API_KEY",
    },
    openai: { model: "gpt-4o", apiKeyEnv: "OPENAI_API_KEY" },
    google: { model: "gemini-2.0-flash", apiKeyEnv: "GOOGLE_AI_API_KEY" },
  };

const PROVIDERS = Object.keys(PROVIDER_DEFAULTS);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScaffoldOptions {
  name: string;
  inputTypes: string[];
  outputType: string;
  providerName: string;
  modelName: string;
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

function loadTemplate(name: string): string {
  const templateDir = resolve(import.meta.dir, "../../templates");
  return readFileSync(join(templateDir, name), "utf-8");
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

export function renderTemplate(
  template: string,
  options: ScaffoldOptions,
): string {
  const apiKeyEnv =
    PROVIDER_DEFAULTS[options.providerName]?.apiKeyEnv ??
    `${options.providerName.toUpperCase()}_API_KEY`;
  const className = `${toPascalCase(options.name)}Worker`;
  const inputTypesYaml = options.inputTypes
    .map((t) => `  - "${t}"`)
    .join("\n");

  return template
    .replaceAll("{{WORKER_NAME}}", options.name)
    .replaceAll("{{CLASS_NAME}}", className)
    .replaceAll("{{INPUT_TYPES}}", inputTypesYaml)
    .replaceAll("{{OUTPUT_TYPE}}", options.outputType)
    .replaceAll("{{PROVIDER_NAME}}", options.providerName)
    .replaceAll("{{MODEL_NAME}}", options.modelName)
    .replaceAll("{{API_KEY_ENV}}", apiKeyEnv);
}

// ---------------------------------------------------------------------------
// Interactive prompts
// ---------------------------------------------------------------------------

export async function promptForOptions(name: string): Promise<ScaffoldOptions> {
  const { input, select, checkbox } = await import("@inquirer/prompts");

  const workerName = await input({
    message: "Worker name:",
    default: name,
  });

  const selectedTypes = await checkbox({
    message: "Input types (space to toggle, enter to confirm):",
    choices: [
      ...DEFAULT_INPUT_TYPES.map((t) => ({ value: t, name: t })),
      { value: "__custom__", name: "Custom..." },
    ],
  });

  let inputTypes = selectedTypes.filter((t) => t !== "__custom__");
  if (selectedTypes.includes("__custom__")) {
    const custom = await input({
      message: "Custom input types (comma-separated):",
    });
    const customTypes = custom
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    inputTypes = [...inputTypes, ...customTypes];
  }
  if (inputTypes.length === 0) {
    inputTypes = ["text"];
  }

  const outputType = await input({
    message: "Output type:",
    default: "text",
  });

  const providerName = await select({
    message: "AI provider:",
    choices: PROVIDERS.map((p) => ({ value: p, name: p })),
  });

  const defaultModel = PROVIDER_DEFAULTS[providerName]?.model ?? "";
  const modelName = await input({
    message: "Model name:",
    default: defaultModel,
  });

  return {
    name: workerName,
    inputTypes,
    outputType,
    providerName,
    modelName,
  };
}

// ---------------------------------------------------------------------------
// Core scaffold logic
// ---------------------------------------------------------------------------

export function generateFiles(
  targetDir: string,
  options: ScaffoldOptions,
): string[] {
  mkdirSync(targetDir, { recursive: true });

  const files: Array<{ name: string; template: string }> = [
    { name: "worker.yaml", template: "worker.yaml.tmpl" },
    { name: "worker.ts", template: "worker.ts.tmpl" },
    { name: "Dockerfile", template: "Dockerfile.tmpl" },
  ];

  const createdFiles: string[] = [];
  for (const file of files) {
    const tmpl = loadTemplate(file.template);
    const content = renderTemplate(tmpl, options);
    writeFileSync(join(targetDir, file.name), content, "utf-8");
    createdFiles.push(join(targetDir, file.name));
  }

  return createdFiles;
}

// ---------------------------------------------------------------------------
// Command entry point
// ---------------------------------------------------------------------------

export async function run(
  _globalOpts: Record<string, unknown>,
  cmd: Command,
  name?: string,
): Promise<void> {
  const interactive = cmd.opts?.().interactive as boolean | undefined;
  const inputTypesRaw = cmd.opts?.().inputTypes as string | undefined;
  const outputType = (cmd.opts?.().outputType as string | undefined) ?? "text";
  const provider = (cmd.opts?.().provider as string | undefined) ?? "anthropic";
  const model = cmd.opts?.().model as string | undefined;

  if (!name) {
    error("Usage: smithy worker scaffold <name>");
    process.exitCode = 1;
    return;
  }

  const targetDir = resolve(process.cwd(), "workers", name);

  if (existsSync(targetDir)) {
    error(`Directory already exists: ${targetDir}`);
    process.exitCode = 1;
    return;
  }

  let options: ScaffoldOptions;

  if (interactive === false) {
    const inputTypes = inputTypesRaw
      ? inputTypesRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : ["text"];
    const modelName =
      model ?? PROVIDER_DEFAULTS[provider]?.model ?? "gpt-4o";

    options = {
      name,
      inputTypes,
      outputType,
      providerName: provider,
      modelName,
    };
  } else {
    options = await promptForOptions(name);
  }

  const spin = spinner("Generating worker files...");
  spin.start();

  try {
    const createdFiles = generateFiles(targetDir, options);
    spin.succeed("Worker scaffolded successfully!");
    console.log("");
    console.log("Created files:");
    for (const file of createdFiles) {
      console.log(`  ${file}`);
    }
  } catch (err) {
    spin.fail("Failed to generate worker files.");
    error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
