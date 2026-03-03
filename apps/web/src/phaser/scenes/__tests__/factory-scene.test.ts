import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class MockScene {
      constructor(public config: unknown) {}
    },
  },
  __esModule: true,
}));

import FactoryScene from '../factory-scene';

describe('FactoryScene', () => {
  it('is a class', () => {
    expect(typeof FactoryScene).toBe('function');
  });

  it('can be instantiated', () => {
    const scene = new FactoryScene();
    expect(scene).toBeInstanceOf(FactoryScene);
  });

  it('sets the scene key to FactoryScene', () => {
    const scene = new FactoryScene();
    expect((scene as unknown as { config: { key: string } }).config).toEqual({
      key: 'FactoryScene',
    });
  });
});
