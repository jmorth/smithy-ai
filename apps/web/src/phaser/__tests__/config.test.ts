import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    AUTO: 0,
    Scale: {
      RESIZE: 3,
      CENTER_BOTH: 1,
    },
    Scene: class MockScene {
      constructor(_config: unknown) {}
    },
  },
  __esModule: true,
}));

vi.mock('../scenes/boot-scene', () => {
  class BootScene {
    static key = 'BootScene';
  }
  return { default: BootScene };
});

vi.mock('../scenes/factory-scene', () => {
  class FactoryScene {
    static key = 'FactoryScene';
  }
  return { default: FactoryScene };
});

import Phaser from 'phaser';
import { createGameConfig } from '../config';
import BootScene from '../scenes/boot-scene';
import FactoryScene from '../scenes/factory-scene';

describe('createGameConfig', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
  });

  it('is exported as a function', () => {
    expect(typeof createGameConfig).toBe('function');
  });

  it('returns a config object', () => {
    const config = createGameConfig(parent);
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  it('uses Phaser.AUTO for renderer type', () => {
    const config = createGameConfig(parent);
    expect(config.type).toBe(Phaser.AUTO);
  });

  it('sets transparent to true for React overlay compositing', () => {
    const config = createGameConfig(parent);
    expect(config.transparent).toBe(true);
  });

  it('uses Phaser.Scale.RESIZE for responsive scaling', () => {
    const config = createGameConfig(parent);
    expect(config.scale?.mode).toBe(Phaser.Scale.RESIZE);
  });

  it('centers the game using CENTER_BOTH', () => {
    const config = createGameConfig(parent);
    expect(config.scale?.autoCenter).toBe(Phaser.Scale.CENTER_BOTH);
  });

  it('accepts a parent DOM element and sets it in config', () => {
    const config = createGameConfig(parent);
    expect(config.parent).toBe(parent);
  });

  it('registers scenes in order: [BootScene, FactoryScene]', () => {
    const config = createGameConfig(parent);
    expect(config.scene).toEqual([BootScene, FactoryScene]);
  });

  it('registers BootScene as the first scene', () => {
    const config = createGameConfig(parent);
    const scenes = config.scene as unknown[];
    expect(scenes[0]).toBe(BootScene);
  });

  it('registers FactoryScene as the second scene', () => {
    const config = createGameConfig(parent);
    const scenes = config.scene as unknown[];
    expect(scenes[1]).toBe(FactoryScene);
  });

  it('disables physics by omitting configuration', () => {
    const config = createGameConfig(parent);
    expect(config.physics).toBeUndefined();
  });

  it('enables antialiasing', () => {
    const config = createGameConfig(parent);
    expect(config.render?.antialias).toBe(true);
  });

  it('disables pixelArt for smooth scaling', () => {
    const config = createGameConfig(parent);
    expect(config.render?.pixelArt).toBe(false);
  });

  it('disables web audio', () => {
    const config = createGameConfig(parent);
    expect(config.audio?.disableWebAudio).toBe(true);
  });

  it('suppresses the Phaser banner', () => {
    const config = createGameConfig(parent);
    expect(config.banner).toBe(false);
  });

  it('uses a different parent element each call', () => {
    const parent1 = document.createElement('div');
    const parent2 = document.createElement('div');
    const config1 = createGameConfig(parent1);
    const config2 = createGameConfig(parent2);
    expect(config1.parent).toBe(parent1);
    expect(config2.parent).toBe(parent2);
    expect(config1.parent).not.toBe(config2.parent);
  });

  it('returns a fresh config object each call (no shared references)', () => {
    const config1 = createGameConfig(parent);
    const config2 = createGameConfig(parent);
    expect(config1).not.toBe(config2);
    expect(config1).toEqual(config2);
  });
});
