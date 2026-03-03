import { useCallback, useMemo, useRef } from 'react';
import Phaser from 'phaser';
import PhaserGame, { type PhaserGameHandle } from '@/phaser/game';
import { createGameConfig } from '@/phaser/config';

export default function FactoryPage() {
  const gameRef = useRef<PhaserGameHandle>(null);

  const handleGameReady = useCallback((game: Phaser.Game) => {
    void game;
  }, []);

  const config = useMemo(() => {
    const placeholder = document.createElement('div');
    const { parent: _, ...configWithoutParent } = createGameConfig(placeholder);
    return configWithoutParent;
  }, []);

  return (
    <div className="relative w-screen h-screen">
      <PhaserGame ref={gameRef} config={config} onGameReady={handleGameReady} />
      <div className="absolute inset-0 pointer-events-none">
        {/* React overlay panels render here */}
      </div>
    </div>
  );
}
