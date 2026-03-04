import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { WorkerState } from '@smithy/shared';
import type { PackageType, PackageStatus } from '@smithy/shared';
import type { FactoryLayout } from '../phaser/systems/layout-generator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkerMachineState {
  position: { tileX: number; tileY: number };
  state: WorkerState;
  workerId: string;
  name: string;
}

export interface PackageCrateState {
  position: { tileX: number; tileY: number };
  type: PackageType;
  status: PackageStatus;
  currentStep: number;
}

export interface FactoryState {
  workerMachines: Map<string, WorkerMachineState>;
  packageCrates: Map<string, PackageCrateState>;
  activeAnimations: Set<string>;
  layoutData: FactoryLayout | null;
  selectedMachine: string | null;
  selectedCrate: string | null;
  targetZoom: number;
  zoomGeneration: number;
  centerTarget: { tileX: number; tileY: number } | null;
  centerGeneration: number;
  resetViewGeneration: number;
}

export interface FactoryActions {
  updateWorkerState: (id: string, state: WorkerState) => void;
  movePackage: (id: string, position: { tileX: number; tileY: number }) => void;
  addPackage: (id: string, crateState: PackageCrateState) => void;
  removePackage: (id: string) => void;
  setLayout: (layout: FactoryLayout) => void;
  selectMachine: (id: string | null) => void;
  selectCrate: (id: string | null) => void;
  addAnimation: (id: string) => void;
  removeAnimation: (id: string) => void;
  zoomTo: (level: number) => void;
  centerOn: (tileX: number, tileY: number) => void;
  resetView: () => void;
}

export type FactoryStore = FactoryState & FactoryActions;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useFactoryStore = create<FactoryStore>()(
  subscribeWithSelector((set, get) => ({
    // State
    workerMachines: new Map<string, WorkerMachineState>(),
    packageCrates: new Map<string, PackageCrateState>(),
    activeAnimations: new Set<string>(),
    layoutData: null,
    selectedMachine: null,
    selectedCrate: null,
    targetZoom: 1,
    zoomGeneration: 0,
    centerTarget: null,
    centerGeneration: 0,
    resetViewGeneration: 0,

    // Actions
    updateWorkerState: (id, state) => {
      const machines = get().workerMachines;
      const existing = machines.get(id);
      if (!existing) return;
      const updated = new Map(machines);
      updated.set(id, { ...existing, state });
      set({ workerMachines: updated });
    },

    movePackage: (id, position) => {
      const crates = get().packageCrates;
      const existing = crates.get(id);
      if (!existing) return;
      const updated = new Map(crates);
      updated.set(id, { ...existing, position });
      set({ packageCrates: updated });
    },

    addPackage: (id, crateState) => {
      const updated = new Map(get().packageCrates);
      updated.set(id, crateState);
      set({ packageCrates: updated });
    },

    removePackage: (id) => {
      const updated = new Map(get().packageCrates);
      updated.delete(id);
      set({ packageCrates: updated });
    },

    setLayout: (layout) => {
      const workerMachines = new Map<string, WorkerMachineState>();
      for (const mp of layout.machinePositions) {
        workerMachines.set(mp.id, {
          position: { tileX: mp.tileX, tileY: mp.tileY },
          state: 'WAITING' as WorkerState,
          workerId: mp.workerVersionId,
          name: mp.id,
        });
      }
      set({
        layoutData: layout,
        workerMachines,
        packageCrates: new Map<string, PackageCrateState>(),
        activeAnimations: new Set<string>(),
        selectedMachine: null,
        selectedCrate: null,
      });
    },

    selectMachine: (id) => set({ selectedMachine: id, selectedCrate: null }),

    selectCrate: (id) => set({ selectedCrate: id, selectedMachine: null }),

    addAnimation: (id) => {
      const updated = new Set(get().activeAnimations);
      updated.add(id);
      set({ activeAnimations: updated });
    },

    removeAnimation: (id) => {
      const updated = new Set(get().activeAnimations);
      updated.delete(id);
      set({ activeAnimations: updated });
    },

    zoomTo: (level) => {
      set((s) => ({ targetZoom: level, zoomGeneration: s.zoomGeneration + 1 }));
    },

    centerOn: (tileX, tileY) => {
      set((s) => ({
        centerTarget: { tileX, tileY },
        centerGeneration: s.centerGeneration + 1,
      }));
    },

    resetView: () => {
      set((s) => ({
        targetZoom: 1,
        resetViewGeneration: s.resetViewGeneration + 1,
      }));
    },
  })),
);

// ---------------------------------------------------------------------------
// Convenience selector hooks
// ---------------------------------------------------------------------------

export const useWorkerMachines = () =>
  useFactoryStore((s) => s.workerMachines);
export const usePackageCrates = () =>
  useFactoryStore((s) => s.packageCrates);
export const useActiveAnimations = () =>
  useFactoryStore((s) => s.activeAnimations);
export const useLayoutData = () => useFactoryStore((s) => s.layoutData);
export const useSelectedMachine = () =>
  useFactoryStore((s) => s.selectedMachine);
export const useSelectedCrate = () =>
  useFactoryStore((s) => s.selectedCrate);
export const useTargetZoom = () => useFactoryStore((s) => s.targetZoom);
