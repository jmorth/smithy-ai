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
  }, []);

  useEffect(() => {
    return () => {
      bridgeRef.current?.destroy();
      bridgeRef.current = null;
    };
  }, []);

  const config = useMemo(() => {
    const placeholder = document.createElement('div');
    const { parent: _, ...configWithoutParent } = createGameConfig(placeholder);
    return configWithoutParent;
  }, []);

  return (
    <div className="relative w-screen h-screen">
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
