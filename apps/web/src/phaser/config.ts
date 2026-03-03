import Phaser from 'phaser';
import BootScene from './scenes/boot-scene';
import FactoryScene from './scenes/factory-scene';

export function createGameConfig(
  parent: HTMLElement,
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    transparent: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
    physics: undefined,
    audio: {
      disableWebAudio: true,
    },
    banner: false,
    scene: [BootScene, FactoryScene],
  };
}
