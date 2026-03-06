#!/usr/bin/env bun

import { Command } from "commander";
import { readFileSync } from "fs";
import { resolve } from "path";

function getVersion(): string {
  const pkgPath = resolve(import.meta.dir, "../package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkg.version;
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("smithy")
    .description(
      "Smithy CLI — the developer tool for managing AI workers and workflows.",
    )
    .version(getVersion(), "--version, -v", "Show version information")
    .option("--json", "Output results in JSON format")
    .showHelpAfterError(true);

  // worker command group
  const worker = program
    .command("worker")
    .description("Worker development commands");

  worker
    .command("scaffold")
    .description("Scaffold a new worker project")
    .argument("<name>", "Name of the worker to scaffold")
    .option("--no-interactive", "Skip interactive prompts (use flags instead)")
    .option("--input-types <types>", "Comma-separated input types")
    .option("--output-type <type>", "Output type", "text")
    .option(
      "--provider <provider>",
      "AI provider (anthropic, openai, google)",
      "anthropic",
    )
    .option("--model <model>", "Model name (provider-specific default if omitted)")
    .action(async (name, opts, cmd) => {
      const { run } = await import("./commands/worker/scaffold.js");
      await run(cmd.parent!.parent!.opts(), cmd, name);
    });

  worker
    .command("test")
    .description("Run worker tests")
    .action(async (opts, cmd) => {
      const { run } = await import("./commands/worker/test.js");
      await run(cmd.parent!.parent!.opts(), cmd);
    });

  worker
    .command("lint")
    .description("Validate a worker directory for correctness")
    .argument("[path]", "Path to the worker directory", ".")
    .action(async (path, opts, cmd) => {
      const { run } = await import("./commands/worker/lint.js");
      await run(cmd.parent!.parent!.opts(), cmd, path);
    });

  worker
    .command("build")
    .description("Build a Docker image for a worker directory")
    .argument("[path]", "Path to the worker directory", ".")
    .option("--verbose", "Stream Docker build output to terminal")
    .option("--tag <tag>", "Add an additional custom tag")
    .option("--no-cache", "Build without Docker cache")
    .option("--platform <platform>", "Target platform (e.g., linux/amd64)")
    .action(async (path, opts, cmd) => {
      const { run } = await import("./commands/worker/build.js");
      await run(cmd.parent!.parent!.opts(), cmd, path);
    });

  // config command group
  const config = program
    .command("config")
    .description("Manage CLI configuration");

  config
    .command("get")
    .description("Get a configuration value")
    .argument("[key]", "Configuration key to retrieve")
    .action(async (key, opts, cmd) => {
      const { run } = await import("./commands/config/get.js");
      await run(cmd.parent!.parent!.opts(), cmd, key);
    });

  config
    .command("set")
    .description("Set a configuration value")
    .argument("[key]", "Configuration key")
    .argument("[value]", "Configuration value")
    .action(async (key, value, opts, cmd) => {
      const { run } = await import("./commands/config/set.js");
      await run(cmd.parent!.parent!.opts(), cmd, key, value);
    });

  config
    .command("list")
    .description("List all configuration values")
    .action(async (opts, cmd) => {
      const { run } = await import("./commands/config/list.js");
      await run(cmd.parent!.parent!.opts(), cmd);
    });

  // top-level commands
  program
    .command("submit")
    .description("Submit a package to an assembly line or worker pool")
    .argument("<type>", "Package type (e.g., review, summarize)")
    .option("--line <slug>", "Submit to an assembly line")
    .option("--pool <slug>", "Submit to a worker pool")
    .option("--file <path>", "Attach a file (repeatable)", (v: string, prev: string[]) => prev.concat(v), [] as string[])
    .option("--metadata <key=value>", "Add metadata (repeatable)", (v: string, prev: string[]) => prev.concat(v), [] as string[])
    .option("--dry-run", "Show what would be submitted without making API calls")
    .action(async (type, opts, cmd) => {
      const { run } = await import("./commands/submit.js");
      await run(cmd.parent!.opts(), cmd, type);
    });

  program
    .command("status")
    .description("Show current platform status")
    .option("--line <slug>", "Show detail for a specific assembly line")
    .option("--pool <slug>", "Show detail for a specific worker pool")
    .option("--watch", "Re-fetch and re-render on an interval")
    .option("--interval <seconds>", "Watch interval in seconds (default 5)", "5")
    .action(async (opts, cmd) => {
      const { run } = await import("./commands/status.js");
      await run(cmd.parent!.opts(), cmd);
    });

  program
    .command("logs")
    .description("Fetch and display job execution logs")
    .argument("<job-id>", "Job ID to fetch logs for")
    .option("--follow", "Stream logs in real-time via SSE after displaying existing logs")
    .option("--level <level>", "Minimum log level to display (info, warn, error)", "info")
    .option("--tail <n>", "Show only the last N log entries")
    .action(async (jobId, opts, cmd) => {
      const { run } = await import("./commands/logs.js");
      await run(cmd.parent!.opts(), cmd, jobId);
    });

  program
    .command("packages")
    .description("List and view packages on the platform")
    .option("--type <type>", "Filter packages by type")
    .option("--status <status>", "Filter packages by status")
    .option("--page <n>", "Page number (default: 1)", "1")
    .option("--limit <n>", "Results per page (default: 20)", "20")
    .action(async (opts, cmd) => {
      const { run } = await import("./commands/packages.js");
      await run(cmd.parent!.opts(), cmd);
    });

  return program;
}

if (import.meta.main) {
  const program = createProgram();
  program.parseAsync(process.argv).catch(() => {
    process.exit(1);
  });
}
