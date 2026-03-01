# Task 112: Create Art Pack Loading System

## Summary
Create the art pack loading system that reads sprite sheet paths from a JSON configuration, supporting both default (AI-generated placeholder) and user-supplied custom art packs. The system loads textures at boot time, falls back to defaults on failure, and supports runtime art pack switching without requiring a full scene reload.

## Phase
Phase 6: Phaser Factory

## Dependencies
- **Depends on**: 107 (Boot Scene — integrates with asset loading pipeline)
- **Blocks**: None (enhances the boot scene and all visual objects, but is not a hard blocker)

## Architecture Reference
Art packs are JSON manifests that map logical asset keys (e.g., `'worker-machine'`, `'package-crate'`) to sprite sheet file paths, frame dimensions, and frame counts. The default art pack uses the programmatically generated placeholder textures from the BootScene. Custom art packs point to user-supplied PNG sprite sheets hosted at configurable URLs. The art pack loader integrates with Phaser's loader and texture manager to swap textures at runtime.

## Files and Folders
- `/apps/web/src/phaser/systems/art-pack-loader.ts` — ArtPackLoader class and art pack manifest types

## Acceptance Criteria
- [ ] Art pack manifest type defined: `ArtPackManifest` with entries mapping asset keys to sprite sheet config (path, frameWidth, frameHeight, frameCount)
- [ ] Default art pack manifest hardcoded with placeholder asset references (matching BootScene generated textures)
- [ ] `loadArtPack(scene: Phaser.Scene, manifest: ArtPackManifest): Promise<void>` loads all sprites from the manifest
- [ ] Falls back to default placeholder texture if a custom asset fails to load (per-asset fallback, not all-or-nothing)
- [ ] Art pack is switchable at runtime: `switchArtPack(scene: Phaser.Scene, manifest: ArtPackManifest)` replaces textures without reloading the scene
- [ ] Custom art packs loaded from configurable URL/path (relative or absolute URLs)
- [ ] Manifest validation — warns on missing required keys, ignores unknown keys
- [ ] Loading errors are caught per-asset and logged with the asset key that failed
- [ ] Exported types for art pack manifest structure
- [ ] `pnpm --filter web typecheck` passes without errors

## Implementation Notes
- The manifest JSON structure:
  ```json
  {
    "name": "default",
    "version": "1.0.0",
    "assets": {
      "worker-machine": { "path": "/art/worker-machine.png", "frameWidth": 64, "frameHeight": 64, "frameCount": 10 },
      "package-crate": { "path": "/art/package-crate.png", "frameWidth": 32, "frameHeight": 32, "frameCount": 6 }
    }
  }
  ```
- For runtime switching, use `scene.textures.remove(key)` to remove the old texture, then `scene.load.spritesheet(key, newPath, frameConfig)` and `scene.load.start()` to load the new one. Listen for the `'filecomplete'` event per asset.
- Existing sprites referencing the old texture will need to be refreshed — either call `sprite.setTexture(key)` again or emit a bridge event that triggers all sprites to re-bind their textures.
- The default art pack should work without any external files — it maps to the programmatically generated textures from BootScene (task 107).
- Consider storing the active art pack name in the factory Zustand store so the UI can display which pack is active and offer a switcher.
- Future enhancement: art pack discovery via an API endpoint that lists available packs.
