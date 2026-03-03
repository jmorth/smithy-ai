import { useCallback, useRef } from 'react';
import Phaser from 'phaser';
import PhaserGame, { type PhaserGameHandle } from '@/phaser/game';

export default function FactoryPage() {
  const gameRef = useRef<PhaserGameHandle>(null);

  const handleGameReady = useCallback((game: Phaser.Game) => {
    void game;
  }, []);

  return (
    <div className="relative w-screen h-screen">
      <PhaserGame ref={gameRef} onGameReady={handleGameReady} />
      <div className="absolute inset-0 pointer-events-none">
        {/* React overlay panels render here */}
      </div>
    </div>
  );
}
