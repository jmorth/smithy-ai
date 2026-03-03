import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class MockScene {
      constructor(public config: unknown) {}
    },
  },
  __esModule: true,
}));

import BootScene from '../boot-scene';

describe('BootScene', () => {
  it('is a class', () => {
    expect(typeof BootScene).toBe('function');
  });

  it('can be instantiated', () => {
    const scene = new BootScene();
    expect(scene).toBeInstanceOf(BootScene);
  });

  it('sets the scene key to BootScene', () => {
    const scene = new BootScene();
    expect((scene as unknown as { config: { key: string } }).config).toEqual({
      key: 'BootScene',
    });
  });
});
