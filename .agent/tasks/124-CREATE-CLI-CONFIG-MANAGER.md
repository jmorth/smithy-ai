# Task 124: Create CLI Config Manager

## Summary
Create a ConfigManager module for reading and writing CLI configuration stored at `~/.smithy/config.json`. This handles creating the config directory and file if they don't exist, provides typed get/set operations, and supplies sensible defaults for all configuration keys.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 122 (CLI Entry Point — establishes the CLI runtime)
- **Blocks**: 123 (API Client — reads API URL from config), 133 (Config Commands — exposes config via CLI)

## Architecture Reference
The ConfigManager lives at `apps/cli/src/lib/config.ts` and manages a JSON configuration file at `~/.smithy/config.json`. It is a stateless utility module — each call reads from or writes to disk. The config file is the user's persistent settings for the CLI, storing values like the API URL and default preferences.

## Files and Folders
- `/apps/cli/src/lib/config.ts` — ConfigManager with get, set, list, and initialization functions

## Acceptance Criteria
- [ ] `get(key)` reads a value from `~/.smithy/config.json` and returns it (or the default if the key is not set)
- [ ] `set(key, value)` writes a value to `~/.smithy/config.json`, preserving other keys
- [ ] `list()` returns the full config object (merged with defaults)
- [ ] Creates `~/.smithy/` directory if it does not exist (using `mkdir -p` equivalent)
- [ ] Creates `config.json` with default values if the file does not exist
- [ ] Default values: `apiUrl = "http://localhost:3000/api"`, `defaultPackageType = ""`, `defaultAssemblyLine = ""`
- [ ] Valid config keys: `apiUrl`, `defaultPackageType`, `defaultAssemblyLine`
- [ ] File format: JSON with 2-space indentation for human readability
- [ ] Handles corrupted config files gracefully (logs a warning and resets to defaults)
- [ ] Uses `os.homedir()` / `Bun.env.HOME` to resolve the home directory

## Implementation Notes
- Use `Bun.file()` and `Bun.write()` for file I/O — they are the idiomatic Bun APIs and handle encoding automatically.
- Define a `CliConfig` interface with all known keys and their types. Use this for type-safe access.
- The `get` function should accept a key of type `keyof CliConfig` and return the corresponding value type.
- Consider exposing a `getConfigPath()` function for testing and for the `config` command to display the file location.
- Do NOT watch the file for changes — the CLI is short-lived, so re-reading on each call is sufficient and simpler.
- Use `fs.mkdir(dir, { recursive: true })` (or Bun equivalent) to create the directory — this is safe if the directory already exists.
- If the config file contains invalid JSON, log a warning to stderr and return defaults rather than crashing. This prevents a corrupted file from bricking the CLI.
