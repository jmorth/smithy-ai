import Phaser from 'phaser';
import { ASSET_KEYS } from '../constants/asset-keys';

const PROGRESS_BAR = {
  BG_COLOR: 0x222222,
  FILL_COLOR: 0x4488ff,
  WIDTH: 320,
  HEIGHT: 24,
  BORDER_RADIUS: 4,
} as const;

export default class BootScene extends Phaser.Scene {
  private progressBar: Phaser.GameObjects.Graphics | null = null;
  private progressBg: Phaser.GameObjects.Graphics | null = null;
  private loadingText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.createProgressBar();
    this.registerLoadEvents();
    this.loadAssets();
  }

  create(): void {
    this.destroyProgressBar();
    this.generateMissingPlaceholders();
    this.scene.start('FactoryScene');
  }

  private createProgressBar(): void {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;

    this.progressBg = this.add.graphics();
    this.progressBg.fillStyle(PROGRESS_BAR.BG_COLOR, 1);
    this.progressBg.fillRoundedRect(
      centerX - PROGRESS_BAR.WIDTH / 2,
      centerY - PROGRESS_BAR.HEIGHT / 2,
      PROGRESS_BAR.WIDTH,
      PROGRESS_BAR.HEIGHT,
      PROGRESS_BAR.BORDER_RADIUS,
    );

    this.progressBar = this.add.graphics();

    this.loadingText = this.add
      .text(centerX, centerY - PROGRESS_BAR.HEIGHT - 8, 'Loading…', {
        fontSize: '14px',
        color: '#cccccc',
      })
      .setOrigin(0.5);
  }

  private registerLoadEvents(): void {
    this.load.on('progress', (value: number) => {
      this.updateProgressBar(value);
    });

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(
        `[BootScene] Failed to load asset: ${file.key} (${file.url})`,
      );
    });
  }

  private updateProgressBar(progress: number): void {
    if (!this.progressBar) return;

    const { width, height } = this.scale;
    const centerX = width / 2;
    const centerY = height / 2;
    const fillWidth = PROGRESS_BAR.WIDTH * progress;

    this.progressBar.clear();
    this.progressBar.fillStyle(PROGRESS_BAR.FILL_COLOR, 1);
    this.progressBar.fillRoundedRect(
      centerX - PROGRESS_BAR.WIDTH / 2,
      centerY - PROGRESS_BAR.HEIGHT / 2,
      fillWidth,
      PROGRESS_BAR.HEIGHT,
      PROGRESS_BAR.BORDER_RADIUS,
    );
  }

  private destroyProgressBar(): void {
    this.progressBg?.destroy();
    this.progressBar?.destroy();
    this.loadingText?.destroy();
    this.progressBg = null;
    this.progressBar = null;
    this.loadingText = null;
  }

  private loadAssets(): void {
    // Placeholder: actual asset files would be loaded here, e.g.:
    // this.load.spritesheet(ASSET_KEYS.WORKER_MACHINE, 'assets/worker-machine.png', {
    //   frameWidth: 64, frameHeight: 64,
    // });
    //
    // For now, all textures are generated programmatically in create().
  }

  /**
   * Generates placeholder textures for any asset key that doesn't already
   * exist in the texture manager. This allows the scene to work without
   * external sprite sheet files.
   */
  generateMissingPlaceholders(): void {
    if (!this.textures.exists(ASSET_KEYS.FLOOR_TILE)) {
      this.generateFloorTile();
    }
    if (!this.textures.exists(ASSET_KEYS.WALL_SEGMENT)) {
      this.generateWallSegment();
    }
    if (!this.textures.exists(ASSET_KEYS.CONVEYOR_BELT)) {
      this.generateConveyorBelt();
    }
    if (!this.textures.exists(ASSET_KEYS.WORKER_MACHINE)) {
      this.generateWorkerMachine();
    }
    if (!this.textures.exists(ASSET_KEYS.PACKAGE_CRATE)) {
      this.generatePackageCrate();
    }
  }

  private generateFloorTile(): void {
    const gfx = this.make.graphics({ x: 0, y: 0 }, false);
    gfx.fillStyle(0x888888, 1);
    gfx.beginPath();
    gfx.moveTo(32, 0);
    gfx.lineTo(64, 16);
    gfx.lineTo(32, 32);
    gfx.lineTo(0, 16);
    gfx.closePath();
    gfx.fillPath();
    gfx.generateTexture(ASSET_KEYS.FLOOR_TILE, 64, 32);
    gfx.destroy();
  }

  private generateWallSegment(): void {
    const gfx = this.make.graphics({ x: 0, y: 0 }, false);
    gfx.fillStyle(0x444444, 1);
    gfx.fillRect(0, 0, 64, 48);
    gfx.generateTexture(ASSET_KEYS.WALL_SEGMENT, 64, 48);
    gfx.destroy();
  }

  private generateConveyorBelt(): void {
    const frameWidth = 64;
    const frameHeight = 32;
    const frames = 4;
    const totalWidth = frameWidth * frames;

    const gfx = this.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < frames; i++) {
      const offsetX = i * frameWidth;
      gfx.fillStyle(0x666666, 1);
      gfx.fillRect(offsetX, 0, frameWidth, frameHeight);
      // Draw chevrons to indicate direction / frame
      gfx.fillStyle(0x999999, 1);
      const chevronOffset = (i * (frameWidth / frames)) % frameWidth;
      gfx.fillRect(offsetX + chevronOffset, 8, 16, 4);
      gfx.fillRect(offsetX + chevronOffset, 20, 16, 4);
    }
    gfx.generateTexture(ASSET_KEYS.CONVEYOR_BELT, totalWidth, frameHeight);
    gfx.destroy();

    // Split into spritesheet frames
    const texture = this.textures.get(ASSET_KEYS.CONVEYOR_BELT);
    texture.add(0, 0, 0, 0, frameWidth, frameHeight);
    texture.add(1, 0, frameWidth, 0, frameWidth, frameHeight);
    texture.add(2, 0, frameWidth * 2, 0, frameWidth, frameHeight);
    texture.add(3, 0, frameWidth * 3, 0, frameWidth, frameHeight);
  }

  private generateWorkerMachine(): void {
    const frameSize = 64;
    const frames = 5;
    const totalWidth = frameSize * frames;

    // Colors for states: idle, working, stuck, error, done
    const colors = [0x4488ff, 0x44ff88, 0xffaa44, 0xff4444, 0x8844ff];

    const gfx = this.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < frames; i++) {
      const color = colors[i]!;
      const offsetX = i * frameSize;
      gfx.fillStyle(color, 1);
      gfx.fillRect(offsetX + 8, 8, 48, 48);
    }
    gfx.generateTexture(ASSET_KEYS.WORKER_MACHINE, totalWidth, frameSize);
    gfx.destroy();

    const texture = this.textures.get(ASSET_KEYS.WORKER_MACHINE);
    for (let i = 0; i < frames; i++) {
      texture.add(i, 0, i * frameSize, 0, frameSize, frameSize);
    }
  }

  private generatePackageCrate(): void {
    const gfx = this.make.graphics({ x: 0, y: 0 }, false);
    gfx.fillStyle(0xcc8844, 1);
    gfx.fillRect(0, 0, 32, 32);
    gfx.generateTexture(ASSET_KEYS.PACKAGE_CRATE, 32, 32);
    gfx.destroy();
  }
}
