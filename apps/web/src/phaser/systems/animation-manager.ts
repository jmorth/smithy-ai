import { ASSET_KEYS } from '../constants/asset-keys';

/**
 * Animation key constants used by all game objects across the factory floor.
 */
export const ANIM_KEYS = {
  // Worker machine animations
  WORKER_IDLE: 'worker-idle',
  WORKER_WORKING: 'worker-working',
  WORKER_STUCK: 'worker-stuck',
  WORKER_ERROR: 'worker-error',
  WORKER_DONE: 'worker-done',

  // Package crate animations
  PACKAGE_IDLE: 'package-idle',
  PACKAGE_MOVING: 'package-moving',

  // Conveyor belt animations
  BELT_SCROLLING: 'belt-scrolling',
  BELT_STOPPED: 'belt-stopped',

  // Effect animations
  EFFECT_SPARKLE: 'effect-sparkle',
  EFFECT_ERROR_FLASH: 'effect-error-flash',
} as const;

export type AnimKey = (typeof ANIM_KEYS)[keyof typeof ANIM_KEYS];

interface AnimationConfig {
  frameRate: number;
  repeat: number;
}

interface AnimationDef {
  key: AnimKey;
  textureKey: string;
  startFrame: number;
  endFrame: number;
  frameRate: number;
  repeat: number;
}

/** All animation definitions in one declarative table. */
const ANIMATION_DEFS: AnimationDef[] = [
  // Worker machine animations (5 frames: 0=idle, 1=working, 2=stuck, 3=error, 4=done)
  { key: ANIM_KEYS.WORKER_IDLE, textureKey: ASSET_KEYS.WORKER_MACHINE, startFrame: 0, endFrame: 0, frameRate: (1000 / 800) * 4, repeat: -1 },
  { key: ANIM_KEYS.WORKER_WORKING, textureKey: ASSET_KEYS.WORKER_MACHINE, startFrame: 1, endFrame: 1, frameRate: (1000 / 400) * 4, repeat: -1 },
  { key: ANIM_KEYS.WORKER_STUCK, textureKey: ASSET_KEYS.WORKER_MACHINE, startFrame: 2, endFrame: 2, frameRate: (1000 / 600) * 4, repeat: -1 },
  { key: ANIM_KEYS.WORKER_ERROR, textureKey: ASSET_KEYS.WORKER_MACHINE, startFrame: 3, endFrame: 3, frameRate: (1000 / 500) * 4, repeat: -1 },
  { key: ANIM_KEYS.WORKER_DONE, textureKey: ASSET_KEYS.WORKER_MACHINE, startFrame: 4, endFrame: 4, frameRate: (1000 / 800) * 2, repeat: 0 },

  // Package crate animations (1 frame; wobble handled by tweens)
  { key: ANIM_KEYS.PACKAGE_IDLE, textureKey: ASSET_KEYS.PACKAGE_CRATE, startFrame: 0, endFrame: 0, frameRate: 1, repeat: 0 },
  { key: ANIM_KEYS.PACKAGE_MOVING, textureKey: ASSET_KEYS.PACKAGE_CRATE, startFrame: 0, endFrame: 0, frameRate: 8, repeat: -1 },

  // Conveyor belt animations (4 frames)
  { key: ANIM_KEYS.BELT_SCROLLING, textureKey: ASSET_KEYS.CONVEYOR_BELT, startFrame: 0, endFrame: 3, frameRate: 1000 / 200, repeat: -1 },
  { key: ANIM_KEYS.BELT_STOPPED, textureKey: ASSET_KEYS.CONVEYOR_BELT, startFrame: 0, endFrame: 0, frameRate: 1, repeat: 0 },

  // Effect animations (placeholder frames from worker machine)
  { key: ANIM_KEYS.EFFECT_SPARKLE, textureKey: ASSET_KEYS.WORKER_MACHINE, startFrame: 4, endFrame: 4, frameRate: 10, repeat: 0 },
  { key: ANIM_KEYS.EFFECT_ERROR_FLASH, textureKey: ASSET_KEYS.WORKER_MACHINE, startFrame: 3, endFrame: 3, frameRate: 10, repeat: 0 },
];

/** Config lookup built from the definitions table. */
const ANIMATION_CONFIGS: Record<string, AnimationConfig> = {};
for (const def of ANIMATION_DEFS) {
  ANIMATION_CONFIGS[def.key] = { frameRate: def.frameRate, repeat: def.repeat };
}

/**
 * Returns the frame rate and repeat settings for a given animation key.
 * Useful if the art pack system needs to re-register animations with different frame counts.
 */
export function getAnimationConfig(key: string): AnimationConfig | undefined {
  return ANIMATION_CONFIGS[key];
}

/**
 * Centralized animation registration for all sprite sheet animations.
 *
 * Registers animations from sprite sheet frame ranges during scene boot,
 * providing consistent animation keys used by all game objects across the
 * factory floor. Called once during FactoryScene initialization after
 * BootScene has loaded all textures.
 */
export class AnimationManager {
  /**
   * Registers all animations from loaded sprite sheets.
   * Idempotent — calling twice does not create duplicate animations.
   */
  static registerAll(scene: Phaser.Scene): void {
    for (const def of ANIMATION_DEFS) {
      if (!scene.anims.exists(def.key)) {
        scene.anims.create({
          key: def.key,
          frames: scene.anims.generateFrameNumbers(def.textureKey, {
            start: def.startFrame,
            end: def.endFrame,
          }),
          frameRate: def.frameRate,
          repeat: def.repeat,
        });
      }
    }
  }
}
