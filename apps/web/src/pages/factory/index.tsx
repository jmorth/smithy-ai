import { useCallback, useEffect, useMemo, useRef } from 'react';
import Phaser from 'phaser';
import PhaserGame, { type PhaserGameHandle } from '@/phaser/game';
import { createGameConfig } from '@/phaser/config';
import { PhaserBridge } from '@/phaser/bridge';
import { useAppStore } from '@/stores/app.store';
import { useFactoryStore } from '@/stores/factory.store';
import { WorkerDetailPanel } from './components/worker-detail-panel';
import { PackageDetailPanel } from './components/package-detail-panel';
import { InteractivePanel } from './components/interactive-panel';
import { FactoryToolbar } from './components/factory-toolbar';

export default function FactoryPage() {
  const gameRef = useRef<PhaserGameHandle>(null);
  const bridgeRef = useRef<PhaserBridge | null>(null);

  const handleGameReady = useCallback((game: Phaser.Game) => {
    const store = useAppStore;
    const factoryStore = useFactoryStore;
    bridgeRef.current = new PhaserBridge(game, store, factoryStore);

    // Expose for E2E testing (see task 140)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.__phaserGame__ = game;
    w.__factoryStore__ = factoryStore;
  }, []);

  useEffect(() => {
    return () => {
      bridgeRef.current?.destroy();
      bridgeRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      delete w.__phaserGame__;
      delete w.__factoryStore__;
    };
  }, []);

  const config = useMemo(() => {
    const placeholder = document.createElement('div');
    const { parent: _, ...configWithoutParent } = createGameConfig(placeholder);
    return configWithoutParent;
  }, []);

  return (
    <div className="relative -m-4 h-[calc(100%+2rem)] w-[calc(100%+2rem)]">
      <PhaserGame ref={gameRef} config={config} onGameReady={handleGameReady} />
      <div className="absolute inset-0 pointer-events-none z-10">
        <WorkerDetailPanel />
        <PackageDetailPanel />
        <InteractivePanel />
        <FactoryToolbar />
      </div>
    </div>
  );
}
