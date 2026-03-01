# Task 052: Create Container Builder Service

## Summary
Create `ContainerBuilderService` that builds Docker images for Workers from their Dockerfiles, with layer caching and a deterministic tagging convention of `smithy-worker-{slug}:{version}`. This service is the build-time counterpart to the runtime `ContainerManagerService` (task 053) and ensures images are ready before job execution begins.

## Phase
Phase 3: Worker Runtime

## Dependencies
- **Depends on**: 038 (Worker Service — provides Worker metadata including slug, version, Dockerfile path), 029 (Storage Service — retrieves Dockerfile content from storage)
- **Blocks**: 053 (Container Manager Service — needs built images to run containers)

## Architecture Reference
The container build pipeline lives in the `containers` module at `apps/api/src/modules/containers/`. Workers define their own Dockerfiles that extend the base Worker SDK image (task 062). The builder service shells out to `docker build` via Node.js `child_process.spawn` to keep dependencies minimal and leverage the CLI's full feature set (BuildKit, cache mounts, etc.). Images are tagged with a deterministic `smithy-worker-{slug}:{version}` convention so the container manager can reference them by tag without a registry lookup.

## Files and Folders
- `/apps/api/src/modules/containers/container-builder.service.ts` — Service class with `buildWorkerImage()`, `imageExists()`, and `getImageTag()` methods

## Acceptance Criteria
- [ ] `buildWorkerImage(slug, version, dockerfilePath)` runs `docker build` via `child_process.spawn` (avoids shell injection risks)
- [ ] Images are tagged as `smithy-worker-{slug}:{version}` (e.g., `smithy-worker-summarizer:1.0.0`)
- [ ] `imageExists(tag)` checks the local Docker image store via `docker image inspect` and returns a boolean
- [ ] Build failures (non-zero exit code) throw a descriptive `ContainerBuildError` including the build stderr output
- [ ] Docker BuildKit is enabled via `DOCKER_BUILDKIT=1` environment variable on the child process
- [ ] Build output (stdout/stderr) is streamed to the application logger in real-time, not buffered until completion
- [ ] `buildWorkerImage` skips the build and returns early if `imageExists` returns true for the target tag (cache hit)
- [ ] A `forceBuild` option bypasses the cache check for rebuilds
- [ ] The service is injectable via NestJS DI (`@Injectable()`)

## Implementation Notes
- Use `child_process.spawn` for the build process to get real-time streaming output. Pass arguments as an array to avoid shell interpretation of special characters.
- Use `spawn` with `{ env: { ...process.env, DOCKER_BUILDKIT: '1' } }` to enable BuildKit.
- The Dockerfile path comes from the Worker's storage location (task 029). The build context should be the directory containing the Dockerfile.
- Consider adding a `--label` to built images (e.g., `smithy.worker.slug={slug}`) for easier cleanup/inventory.
- Do not attempt to push images to a registry — this is local-only for the MVP. Registry support is a future enhancement.
- The version comes from the Worker entity's version field. If no version is set, default to `latest`.
