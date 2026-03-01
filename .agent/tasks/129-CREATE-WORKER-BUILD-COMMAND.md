# Task 129: Create Worker Build Command

## Summary
Create the `smithy worker build <path>` command that builds a Docker image for a Worker directory, tags it with the `smithy-worker-{name}:{version}` naming convention, and reports the resulting image size.

## Phase
Phase 7: CLI

## Dependencies
- **Depends on**: 122 (CLI Entry Point — provides command routing), 125 (Output Helpers — provides spinner and status output)
- **Blocks**: None

## Architecture Reference
The build command wraps `docker build` with Smithy-specific tagging conventions. It reads the Worker's name and optional version from `worker.yaml`, builds the Docker image using the Worker's Dockerfile, and applies two tags: `smithy-worker-{name}:latest` and `smithy-worker-{name}:{version}`. This is a local-only operation.

## Files and Folders
- `/apps/cli/src/commands/dev/build.ts` — Command handler for `smithy worker build`

## Acceptance Criteria
- [ ] Accepts a path argument pointing to a Worker directory (defaults to current directory)
- [ ] Reads Worker name from `worker.yaml` `name` field
- [ ] Reads version from `worker.yaml` `version` field (defaults to `0.1.0` if not present)
- [ ] Runs `docker build` with the Worker's Dockerfile
- [ ] Tags the image as `smithy-worker-{name}:latest` and `smithy-worker-{name}:{version}`
- [ ] Shows build progress via spinner (or streams Docker build output if `--verbose` flag is set)
- [ ] Reports image name, tags, and image size on success
- [ ] Exit code 0 on successful build, 1 on build failure
- [ ] Validates that `Dockerfile` and `worker.yaml` exist before attempting build
- [ ] Supports `--tag <custom-tag>` flag to add additional custom tags
- [ ] Supports `--no-cache` flag passed through to `docker build`

## Implementation Notes
- Use `Bun.spawn` to invoke `docker build -t <tag1> -t <tag2> -f Dockerfile .` from the Worker directory.
- To get the image size after build, run `docker image inspect --format '{{.Size}}' <image>` and format it as human-readable (e.g., "245 MB").
- In default mode (no `--verbose`), capture Docker build output and display a spinner. On failure, dump the captured output so the developer can diagnose the issue. With `--verbose`, stream Docker output directly to the terminal.
- The Worker name should be sanitized for use in Docker tags: lowercase, alphanumeric and hyphens only. Warn if the name in `worker.yaml` needs sanitization.
- Check for Docker availability before attempting to build — if `docker` is not in PATH or the Docker daemon is not running, print a helpful error message.
- Consider supporting `--platform <platform>` flag for cross-platform builds (e.g., `linux/amd64` on ARM Macs), passed through to `docker build --platform`.
