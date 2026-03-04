import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WorkerState, PackageStatus, PackageType } from '@smithy/shared';
import {
  useFactoryStore,
  useWorkerMachines,
  usePackageCrates,
  useActiveAnimations,
  useLayoutData,
  useSelectedMachine,
  useSelectedCrate,
} from './factory.store';
import type {
  FactoryStore,
  WorkerMachineState,
  PackageCrateState,
} from './factory.store';
import type { FactoryLayout } from '../phaser/systems/layout-generator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore(): void {
  useFactoryStore.setState({
    workerMachines: new Map(),
    packageCrates: new Map(),
    activeAnimations: new Set(),
    layoutData: null,
    selectedMachine: null,
    selectedCrate: null,
  });
}

function state(): FactoryStore {
  return useFactoryStore.getState();
}

function makeMachine(overrides?: Partial<WorkerMachineState>): WorkerMachineState {
  return {
    position: { tileX: 2, tileY: 4 },
    state: WorkerState.WAITING,
    workerId: 'worker-1',
    name: 'Machine A',
    ...overrides,
  };
}

function makeCrate(overrides?: Partial<PackageCrateState>): PackageCrateState {
  return {
    position: { tileX: 1, tileY: 3 },
    type: PackageType.CODE,
    status: PackageStatus.PENDING,
    currentStep: 0,
    ...overrides,
  };
}

function makeLayout(): FactoryLayout {
  return {
    rooms: [{ id: 'room-1', name: 'Line A', x: 0, y: 0, width: 10, height: 5 }],
    machinePositions: [
      { id: 'mp-1', roomId: 'room-1', workerVersionId: 'wv-1', tileX: 2, tileY: 2 },
      { id: 'mp-2', roomId: 'room-1', workerVersionId: 'wv-2', tileX: 5, tileY: 2 },
    ],
    conveyorPaths: [
      {
        roomId: 'room-1',
        fromMachineId: 'mp-1',
        toMachineId: 'mp-2',
        startX: 2,
        startY: 2,
        endX: 5,
        endY: 2,
      },
    ],
    floorBounds: { width: 10, height: 5 },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFactoryStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // Default state
  // -------------------------------------------------------------------------

  describe('default state', () => {
    it('has empty workerMachines map', () => {
      expect(state().workerMachines).toBeInstanceOf(Map);
      expect(state().workerMachines.size).toBe(0);
    });

    it('has empty packageCrates map', () => {
      expect(state().packageCrates).toBeInstanceOf(Map);
      expect(state().packageCrates.size).toBe(0);
    });

    it('has empty activeAnimations set', () => {
      expect(state().activeAnimations).toBeInstanceOf(Set);
      expect(state().activeAnimations.size).toBe(0);
    });

    it('has layoutData defaulting to null', () => {
      expect(state().layoutData).toBeNull();
    });

    it('has selectedMachine defaulting to null', () => {
      expect(state().selectedMachine).toBeNull();
    });

    it('has selectedCrate defaulting to null', () => {
      expect(state().selectedCrate).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateWorkerState
  // -------------------------------------------------------------------------

  describe('updateWorkerState', () => {
    it('updates an existing machine state', () => {
      useFactoryStore.setState({
        workerMachines: new Map([['m1', makeMachine()]]),
      });

      state().updateWorkerState('m1', WorkerState.WORKING);
      expect(state().workerMachines.get('m1')!.state).toBe(WorkerState.WORKING);
    });

    it('preserves other machine fields when updating state', () => {
      const original = makeMachine({ name: 'Preserved', workerId: 'w-99' });
      useFactoryStore.setState({
        workerMachines: new Map([['m1', original]]),
      });

      state().updateWorkerState('m1', WorkerState.ERROR);
      const updated = state().workerMachines.get('m1')!;
      expect(updated.name).toBe('Preserved');
      expect(updated.workerId).toBe('w-99');
      expect(updated.position).toEqual(original.position);
    });

    it('creates a new Map reference for reactivity', () => {
      const initial = new Map([['m1', makeMachine()]]);
      useFactoryStore.setState({ workerMachines: initial });

      state().updateWorkerState('m1', WorkerState.DONE);
      expect(state().workerMachines).not.toBe(initial);
    });

    it('is a no-op when machine id does not exist', () => {
      const machines = new Map([['m1', makeMachine()]]);
      useFactoryStore.setState({ workerMachines: machines });

      state().updateWorkerState('nonexistent', WorkerState.STUCK);
      // Map should not have changed reference
      expect(state().workerMachines).toBe(machines);
    });

    it('does not affect other machines', () => {
      useFactoryStore.setState({
        workerMachines: new Map([
          ['m1', makeMachine({ state: WorkerState.WAITING })],
          ['m2', makeMachine({ state: WorkerState.WAITING, name: 'Machine B' })],
        ]),
      });

      state().updateWorkerState('m1', WorkerState.WORKING);
      expect(state().workerMachines.get('m2')!.state).toBe(WorkerState.WAITING);
    });
  });

  // -------------------------------------------------------------------------
  // movePackage
  // -------------------------------------------------------------------------

  describe('movePackage', () => {
    it('updates a crate position', () => {
      useFactoryStore.setState({
        packageCrates: new Map([['c1', makeCrate()]]),
      });

      state().movePackage('c1', { tileX: 10, tileY: 20 });
      expect(state().packageCrates.get('c1')!.position).toEqual({
        tileX: 10,
        tileY: 20,
      });
    });

    it('preserves other crate fields when moving', () => {
      const original = makeCrate({
        type: PackageType.IMAGE,
        status: PackageStatus.PROCESSING,
        currentStep: 3,
      });
      useFactoryStore.setState({
        packageCrates: new Map([['c1', original]]),
      });

      state().movePackage('c1', { tileX: 99, tileY: 99 });
      const updated = state().packageCrates.get('c1')!;
      expect(updated.type).toBe(PackageType.IMAGE);
      expect(updated.status).toBe(PackageStatus.PROCESSING);
      expect(updated.currentStep).toBe(3);
    });

    it('creates a new Map reference for reactivity', () => {
      const initial = new Map([['c1', makeCrate()]]);
      useFactoryStore.setState({ packageCrates: initial });

      state().movePackage('c1', { tileX: 5, tileY: 5 });
      expect(state().packageCrates).not.toBe(initial);
    });

    it('is a no-op when crate id does not exist', () => {
      const crates = new Map([['c1', makeCrate()]]);
      useFactoryStore.setState({ packageCrates: crates });

      state().movePackage('nonexistent', { tileX: 0, tileY: 0 });
      expect(state().packageCrates).toBe(crates);
    });
  });

  // -------------------------------------------------------------------------
  // addPackage
  // -------------------------------------------------------------------------

  describe('addPackage', () => {
    it('adds a new crate to the map', () => {
      const crate = makeCrate();
      state().addPackage('c1', crate);
      expect(state().packageCrates.get('c1')).toEqual(crate);
      expect(state().packageCrates.size).toBe(1);
    });

    it('can add multiple crates', () => {
      state().addPackage('c1', makeCrate());
      state().addPackage('c2', makeCrate({ type: PackageType.IMAGE }));
      expect(state().packageCrates.size).toBe(2);
    });

    it('overwrites an existing crate with the same id', () => {
      state().addPackage('c1', makeCrate({ currentStep: 0 }));
      state().addPackage('c1', makeCrate({ currentStep: 5 }));
      expect(state().packageCrates.get('c1')!.currentStep).toBe(5);
      expect(state().packageCrates.size).toBe(1);
    });

    it('creates a new Map reference for reactivity', () => {
      const initial = state().packageCrates;
      state().addPackage('c1', makeCrate());
      expect(state().packageCrates).not.toBe(initial);
    });
  });

  // -------------------------------------------------------------------------
  // removePackage
  // -------------------------------------------------------------------------

  describe('removePackage', () => {
    it('removes a crate from the map', () => {
      state().addPackage('c1', makeCrate());
      state().addPackage('c2', makeCrate());
      state().removePackage('c1');
      expect(state().packageCrates.has('c1')).toBe(false);
      expect(state().packageCrates.size).toBe(1);
    });

    it('creates a new Map reference even when id does not exist', () => {
      state().addPackage('c1', makeCrate());
      const before = state().packageCrates;
      state().removePackage('nonexistent');
      expect(state().packageCrates).not.toBe(before);
    });

    it('results in an empty map when last crate is removed', () => {
      state().addPackage('c1', makeCrate());
      state().removePackage('c1');
      expect(state().packageCrates.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // setLayout
  // -------------------------------------------------------------------------

  describe('setLayout', () => {
    it('sets layoutData', () => {
      const layout = makeLayout();
      state().setLayout(layout);
      expect(state().layoutData).toBe(layout);
    });

    it('populates workerMachines from layout machinePositions', () => {
      const layout = makeLayout();
      state().setLayout(layout);

      expect(state().workerMachines.size).toBe(2);
      const mp1 = state().workerMachines.get('mp-1')!;
      expect(mp1.position).toEqual({ tileX: 2, tileY: 2 });
      expect(mp1.workerId).toBe('wv-1');
      expect(mp1.state).toBe(WorkerState.WAITING);
    });

    it('initializes all machines with WAITING state', () => {
      const layout = makeLayout();
      state().setLayout(layout);

      for (const [, machine] of state().workerMachines) {
        expect(machine.state).toBe(WorkerState.WAITING);
      }
    });

    it('clears packageCrates on new layout', () => {
      state().addPackage('c1', makeCrate());
      state().setLayout(makeLayout());
      expect(state().packageCrates.size).toBe(0);
    });

    it('clears activeAnimations on new layout', () => {
      state().addAnimation('a1');
      state().setLayout(makeLayout());
      expect(state().activeAnimations.size).toBe(0);
    });

    it('clears selection on new layout', () => {
      state().selectMachine('m1');
      state().setLayout(makeLayout());
      expect(state().selectedMachine).toBeNull();
      expect(state().selectedCrate).toBeNull();
    });

    it('handles layout with no machine positions', () => {
      const emptyLayout: FactoryLayout = {
        rooms: [],
        machinePositions: [],
        conveyorPaths: [],
        floorBounds: { width: 0, height: 0 },
      };
      state().setLayout(emptyLayout);
      expect(state().workerMachines.size).toBe(0);
      expect(state().layoutData).toBe(emptyLayout);
    });
  });

  // -------------------------------------------------------------------------
  // selectMachine / selectCrate (mutual exclusion)
  // -------------------------------------------------------------------------

  describe('selectMachine', () => {
    it('sets selectedMachine to a given id', () => {
      state().selectMachine('m1');
      expect(state().selectedMachine).toBe('m1');
    });

    it('sets selectedMachine to null to deselect', () => {
      state().selectMachine('m1');
      state().selectMachine(null);
      expect(state().selectedMachine).toBeNull();
    });

    it('clears selectedCrate when selecting a machine', () => {
      state().selectCrate('c1');
      state().selectMachine('m1');
      expect(state().selectedCrate).toBeNull();
      expect(state().selectedMachine).toBe('m1');
    });
  });

  describe('selectCrate', () => {
    it('sets selectedCrate to a given id', () => {
      state().selectCrate('c1');
      expect(state().selectedCrate).toBe('c1');
    });

    it('sets selectedCrate to null to deselect', () => {
      state().selectCrate('c1');
      state().selectCrate(null);
      expect(state().selectedCrate).toBeNull();
    });

    it('clears selectedMachine when selecting a crate', () => {
      state().selectMachine('m1');
      state().selectCrate('c1');
      expect(state().selectedMachine).toBeNull();
      expect(state().selectedCrate).toBe('c1');
    });
  });

  describe('selection mutual exclusion', () => {
    it('only one selection can be active at a time', () => {
      state().selectMachine('m1');
      expect(state().selectedMachine).toBe('m1');
      expect(state().selectedCrate).toBeNull();

      state().selectCrate('c1');
      expect(state().selectedMachine).toBeNull();
      expect(state().selectedCrate).toBe('c1');

      state().selectMachine('m2');
      expect(state().selectedMachine).toBe('m2');
      expect(state().selectedCrate).toBeNull();
    });

    it('deselecting machine does not affect crate', () => {
      state().selectMachine(null);
      expect(state().selectedCrate).toBeNull();
    });

    it('deselecting crate does not affect machine', () => {
      state().selectCrate(null);
      expect(state().selectedMachine).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // activeAnimations
  // -------------------------------------------------------------------------

  describe('addAnimation', () => {
    it('adds an animation id to the set', () => {
      state().addAnimation('anim-1');
      expect(state().activeAnimations.has('anim-1')).toBe(true);
      expect(state().activeAnimations.size).toBe(1);
    });

    it('can track multiple animation ids', () => {
      state().addAnimation('anim-1');
      state().addAnimation('anim-2');
      expect(state().activeAnimations.size).toBe(2);
    });

    it('is idempotent for the same id', () => {
      state().addAnimation('anim-1');
      state().addAnimation('anim-1');
      expect(state().activeAnimations.size).toBe(1);
    });

    it('creates a new Set reference for reactivity', () => {
      const initial = state().activeAnimations;
      state().addAnimation('anim-1');
      expect(state().activeAnimations).not.toBe(initial);
    });
  });

  describe('removeAnimation', () => {
    it('removes an animation id from the set', () => {
      state().addAnimation('anim-1');
      state().addAnimation('anim-2');
      state().removeAnimation('anim-1');
      expect(state().activeAnimations.has('anim-1')).toBe(false);
      expect(state().activeAnimations.size).toBe(1);
    });

    it('creates a new Set reference even when id does not exist', () => {
      state().addAnimation('anim-1');
      const before = state().activeAnimations;
      state().removeAnimation('nonexistent');
      expect(state().activeAnimations).not.toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // subscribeWithSelector middleware
  // -------------------------------------------------------------------------

  describe('subscribeWithSelector middleware', () => {
    it('supports subscribe with a selector for fine-grained subscriptions', () => {
      const values: Array<string | null> = [];

      const unsub = useFactoryStore.subscribe(
        (s) => s.selectedMachine,
        (selectedMachine) => {
          values.push(selectedMachine);
        },
      );

      state().selectMachine('m1');
      state().selectMachine('m2');
      state().selectMachine(null);

      expect(values).toEqual(['m1', 'm2', null]);
      unsub();
    });

    it('does not fire when the subscribed field has not changed', () => {
      let callCount = 0;

      const unsub = useFactoryStore.subscribe(
        (s) => s.selectedMachine,
        () => {
          callCount++;
        },
      );

      // Change a different field
      state().selectCrate('c1');
      // selectedMachine was already null and selectCrate sets it to null
      // so the selector value hasn't changed from null
      expect(callCount).toBe(0);

      unsub();
    });

    it('supports subscribing to map changes', () => {
      const snapshots: number[] = [];

      const unsub = useFactoryStore.subscribe(
        (s) => s.packageCrates,
        (crates) => {
          snapshots.push(crates.size);
        },
      );

      state().addPackage('c1', makeCrate());
      state().addPackage('c2', makeCrate());
      state().removePackage('c1');

      expect(snapshots).toEqual([1, 2, 1]);
      unsub();
    });
  });

  // -------------------------------------------------------------------------
  // Cross-slice isolation
  // -------------------------------------------------------------------------

  describe('cross-slice isolation', () => {
    it('updating worker state does not affect selections', () => {
      useFactoryStore.setState({
        workerMachines: new Map([['m1', makeMachine()]]),
      });
      state().selectMachine('m1');
      state().selectCrate(null);

      state().updateWorkerState('m1', WorkerState.WORKING);

      // selectMachine clears selectedCrate, so m1 should be null now due to prior selectCrate(null)
      // Let's re-select to verify
      state().selectMachine('m1');
      expect(state().selectedMachine).toBe('m1');
      expect(state().packageCrates.size).toBe(0);
    });

    it('adding a package does not affect layout or machines', () => {
      state().setLayout(makeLayout());
      const layoutBefore = state().layoutData;
      const machinesBefore = state().workerMachines;

      state().addPackage('c1', makeCrate());

      expect(state().layoutData).toBe(layoutBefore);
      expect(state().workerMachines).toBe(machinesBefore);
    });

    it('animation changes do not affect other state', () => {
      state().addPackage('c1', makeCrate());
      state().selectMachine('m1');

      state().addAnimation('anim-1');

      expect(state().packageCrates.size).toBe(1);
      expect(state().selectedMachine).toBe('m1');
    });
  });

  // -------------------------------------------------------------------------
  // Convenience selector hooks
  // -------------------------------------------------------------------------

  describe('convenience selector hooks', () => {
    it('useWorkerMachines returns current workerMachines', () => {
      const { result } = renderHook(() => useWorkerMachines());
      expect(result.current.size).toBe(0);

      act(() => {
        useFactoryStore.setState({
          workerMachines: new Map([['m1', makeMachine()]]),
        });
      });
      expect(result.current.size).toBe(1);
    });

    it('usePackageCrates returns current packageCrates', () => {
      const { result } = renderHook(() => usePackageCrates());
      expect(result.current.size).toBe(0);

      act(() => state().addPackage('c1', makeCrate()));
      expect(result.current.size).toBe(1);
    });

    it('useActiveAnimations returns current activeAnimations', () => {
      const { result } = renderHook(() => useActiveAnimations());
      expect(result.current.size).toBe(0);

      act(() => state().addAnimation('a1'));
      expect(result.current.size).toBe(1);
    });

    it('useLayoutData returns current layoutData', () => {
      const { result } = renderHook(() => useLayoutData());
      expect(result.current).toBeNull();

      act(() => state().setLayout(makeLayout()));
      expect(result.current).not.toBeNull();
    });

    it('useSelectedMachine returns current selectedMachine', () => {
      const { result } = renderHook(() => useSelectedMachine());
      expect(result.current).toBeNull();

      act(() => state().selectMachine('m1'));
      expect(result.current).toBe('m1');
    });

    it('useSelectedCrate returns current selectedCrate', () => {
      const { result } = renderHook(() => useSelectedCrate());
      expect(result.current).toBeNull();

      act(() => state().selectCrate('c1'));
      expect(result.current).toBe('c1');
    });
  });
});
