import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type Ref,
} from 'react';
import Phaser from 'phaser';

export interface PhaserGameHandle {
  game: Phaser.Game | null;
}

export interface PhaserGameProps {
  config?: Omit<Phaser.Types.Core.GameConfig, 'parent'>;
  onGameReady?: (game: Phaser.Game) => void;
}

const DEFAULT_CONFIG: Omit<Phaser.Types.Core.GameConfig, 'parent'> = {
  type: Phaser.AUTO,
  width: '100%',
  height: '100%',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: '#1a1a2e',
};

function PhaserGameInner(props: PhaserGameProps, ref: Ref<PhaserGameHandle>) {
  const { config, onGameReady } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useImperativeHandle(ref, () => ({
    get game() {
      return gameRef.current;
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const mergedConfig: Phaser.Types.Core.GameConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      parent: containerRef.current,
    };

    const game = new Phaser.Game(mergedConfig);
    gameRef.current = game;
    onGameReady?.(game);

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [config, onGameReady]);

  return (
    <div
      ref={containerRef}
      data-testid="phaser-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

const PhaserGame = forwardRef<PhaserGameHandle, PhaserGameProps>(
  PhaserGameInner,
);
PhaserGame.displayName = 'PhaserGame';

export default PhaserGame;
