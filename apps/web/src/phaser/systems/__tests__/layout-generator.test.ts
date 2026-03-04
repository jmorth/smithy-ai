import { describe, it, expect } from 'vitest';

import {
  LAYOUT_CONFIG,
  generateFactoryLayout,
  type LayoutInput,
  type LayoutAssemblyLine,
  type LayoutWorkerPool,
  type FactoryLayout,
  type Room,
  type MachinePosition,
  type ConveyorPath,
} from '../layout-generator';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeLine(
  id: string,
  stepCount: number,
  name = `Line ${id}`,
): LayoutAssemblyLine {
  return {
    id,
    name,
    steps: Array.from({ length: stepCount }, (_, i) => ({
      id: `${id}-step-${i}`,
      workerVersionId: `wv-${id}-${i}`,
    })),
  };
}

function makePool(
  id: string,
  memberCount: number,
  name = `Pool ${id}`,
): LayoutWorkerPool {
  return {
    id,
    name,
    members: Array.from({ length: memberCount }, (_, i) => ({
      id: `${id}-member-${i}`,
      workerVersionId: `wv-${id}-${i}`,
    })),
  };
}

function generate(
  assemblyLines: LayoutAssemblyLine[] = [],
  workerPools: LayoutWorkerPool[] = [],
): FactoryLayout {
  return generateFactoryLayout({ assemblyLines, workerPools });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('layout-generator', () => {
  // ── LAYOUT_CONFIG constants ─────────────────────────────────────────────

  describe('LAYOUT_CONFIG', () => {
    it('exports expected spacing constants', () => {
      expect(LAYOUT_CONFIG.MACHINE_SPACING).toBe(3);
      expect(LAYOUT_CONFIG.ROOM_PADDING).toBe(2);
      expect(LAYOUT_CONFIG.ROOM_HEIGHT).toBe(5);
      expect(LAYOUT_CONFIG.ROOM_GAP).toBe(2);
      expect(LAYOUT_CONFIG.POOL_COLUMNS).toBe(3);
      expect(LAYOUT_CONFIG.POOL_MACHINE_SPACING).toBe(3);
      expect(LAYOUT_CONFIG.POOL_PADDING).toBe(2);
      expect(LAYOUT_CONFIG.POOL_AREA_GAP).toBe(3);
    });
  });

  // ── Empty input ─────────────────────────────────────────────────────────

  describe('empty input', () => {
    it('returns empty layout when no assembly lines or worker pools', () => {
      const layout = generate();
      expect(layout.rooms).toEqual([]);
      expect(layout.machinePositions).toEqual([]);
      expect(layout.conveyorPaths).toEqual([]);
      expect(layout.floorBounds).toEqual({ width: 0, height: 0 });
    });
  });

  // ── Assembly Line rooms ─────────────────────────────────────────────────

  describe('assembly line rooms', () => {
    it('creates a room for a single assembly line with 3 steps', () => {
      const layout = generate([makeLine('al-1', 3)]);
      expect(layout.rooms).toHaveLength(1);

      const room = layout.rooms[0];
      // width = steps * MACHINE_SPACING + ROOM_PADDING * 2 = 3*3 + 2*2 = 13
      expect(room).toEqual<Room>({
        id: 'al-1',
        name: 'Line al-1',
        x: 0,
        y: 0,
        width: 13,
        height: LAYOUT_CONFIG.ROOM_HEIGHT,
      });
    });

    it('creates an empty room for assembly line with zero steps', () => {
      const layout = generate([makeLine('al-empty', 0)]);
      expect(layout.rooms).toHaveLength(1);
      const room = layout.rooms[0]!;
      // width = 0 * MACHINE_SPACING + ROOM_PADDING * 2 = 4
      expect(room.width).toBe(LAYOUT_CONFIG.ROOM_PADDING * 2);
      expect(room.height).toBe(LAYOUT_CONFIG.ROOM_HEIGHT);
    });

    it('stacks multiple assembly line rooms vertically with gap', () => {
      const layout = generate([makeLine('al-1', 2), makeLine('al-2', 1)]);
      expect(layout.rooms).toHaveLength(2);
      expect(layout.rooms[0]!.y).toBe(0);
      expect(layout.rooms[1]!.y).toBe(
        LAYOUT_CONFIG.ROOM_HEIGHT + LAYOUT_CONFIG.ROOM_GAP,
      );
    });

    it('stacks three assembly lines correctly', () => {
      const layout = generate([
        makeLine('a', 1),
        makeLine('b', 1),
        makeLine('c', 1),
      ]);
      const gap = LAYOUT_CONFIG.ROOM_HEIGHT + LAYOUT_CONFIG.ROOM_GAP;
      expect(layout.rooms[0]!.y).toBe(0);
      expect(layout.rooms[1]!.y).toBe(gap);
      expect(layout.rooms[2]!.y).toBe(gap * 2);
    });

    it('all assembly line rooms start at x=0', () => {
      const layout = generate([makeLine('a', 5), makeLine('b', 2)]);
      for (const room of layout.rooms) {
        expect(room.x).toBe(0);
      }
    });
  });

  // ── Machine positions within assembly lines ─────────────────────────────

  describe('machine positions in assembly lines', () => {
    it('places machines evenly along the horizontal axis', () => {
      const layout = generate([makeLine('al-1', 3)]);
      expect(layout.machinePositions).toHaveLength(3);

      const expectedY = Math.floor(LAYOUT_CONFIG.ROOM_HEIGHT / 2);
      for (let i = 0; i < 3; i++) {
        expect(layout.machinePositions[i]).toEqual<MachinePosition>({
          id: `al-1-step-${i}`,
          roomId: 'al-1',
          workerVersionId: `wv-al-1-${i}`,
          tileX: LAYOUT_CONFIG.ROOM_PADDING + i * LAYOUT_CONFIG.MACHINE_SPACING,
          tileY: expectedY,
        });
      }
    });

    it('single-step line produces one machine', () => {
      const layout = generate([makeLine('al-1', 1)]);
      expect(layout.machinePositions).toHaveLength(1);
      expect(layout.machinePositions[0]!.tileX).toBe(LAYOUT_CONFIG.ROOM_PADDING);
    });

    it('empty assembly line produces no machines', () => {
      const layout = generate([makeLine('al-1', 0)]);
      expect(layout.machinePositions).toHaveLength(0);
    });

    it('machines in second room have correct Y offset', () => {
      const layout = generate([makeLine('al-1', 1), makeLine('al-2', 1)]);
      const secondRoomY = LAYOUT_CONFIG.ROOM_HEIGHT + LAYOUT_CONFIG.ROOM_GAP;
      const expectedY = secondRoomY + Math.floor(LAYOUT_CONFIG.ROOM_HEIGHT / 2);
      expect(layout.machinePositions[1]!.tileY).toBe(expectedY);
    });
  });

  // ── Conveyor belt paths ─────────────────────────────────────────────────

  describe('conveyor belt paths', () => {
    it('connects adjacent machines within the same room', () => {
      const layout = generate([makeLine('al-1', 3)]);
      expect(layout.conveyorPaths).toHaveLength(2);

      const machineY = Math.floor(LAYOUT_CONFIG.ROOM_HEIGHT / 2);
      expect(layout.conveyorPaths[0]).toEqual<ConveyorPath>({
        roomId: 'al-1',
        fromMachineId: 'al-1-step-0',
        toMachineId: 'al-1-step-1',
        startX: LAYOUT_CONFIG.ROOM_PADDING,
        startY: machineY,
        endX: LAYOUT_CONFIG.ROOM_PADDING + LAYOUT_CONFIG.MACHINE_SPACING,
        endY: machineY,
      });
    });

    it('produces no conveyors for single-step line', () => {
      const layout = generate([makeLine('al-1', 1)]);
      expect(layout.conveyorPaths).toHaveLength(0);
    });

    it('produces no conveyors for empty line', () => {
      const layout = generate([makeLine('al-1', 0)]);
      expect(layout.conveyorPaths).toHaveLength(0);
    });

    it('produces n-1 conveyors for n steps', () => {
      const layout = generate([makeLine('al-1', 5)]);
      expect(layout.conveyorPaths).toHaveLength(4);
    });

    it('conveyors are horizontal (same Y for start and end)', () => {
      const layout = generate([makeLine('al-1', 4)]);
      for (const path of layout.conveyorPaths) {
        expect(path.startY).toBe(path.endY);
      }
    });
  });

  // ── Worker Pool rooms ───────────────────────────────────────────────────

  describe('worker pool rooms', () => {
    it('creates a room for a single worker pool', () => {
      const layout = generate([], [makePool('wp-1', 2)]);
      expect(layout.rooms).toHaveLength(1);

      const room = layout.rooms[0];
      // 2 members → 2 cols, 1 row
      // width = min(2,3) * POOL_MACHINE_SPACING + POOL_PADDING * 2 = 2*3 + 4 = 10
      // height = 1 * POOL_MACHINE_SPACING + POOL_PADDING * 2 = 3 + 4 = 7
      expect(room).toEqual<Room>({
        id: 'wp-1',
        name: 'Pool wp-1',
        x: 0,
        y: 0,
        width: 10,
        height: 7,
      });
    });

    it('arranges worker pool machines in grid pattern', () => {
      const layout = generate([], [makePool('wp-1', 5)]);
      expect(layout.machinePositions).toHaveLength(5);

      // 5 members → 3 cols, 2 rows
      const { POOL_PADDING, POOL_MACHINE_SPACING } = LAYOUT_CONFIG;
      // Row 0: indices 0, 1, 2
      expect(layout.machinePositions[0]!.tileX).toBe(POOL_PADDING);
      expect(layout.machinePositions[0]!.tileY).toBe(POOL_PADDING);
      expect(layout.machinePositions[1]!.tileX).toBe(
        POOL_PADDING + POOL_MACHINE_SPACING,
      );
      expect(layout.machinePositions[2]!.tileX).toBe(
        POOL_PADDING + 2 * POOL_MACHINE_SPACING,
      );
      // Row 1: indices 3, 4
      expect(layout.machinePositions[3]!.tileX).toBe(POOL_PADDING);
      expect(layout.machinePositions[3]!.tileY).toBe(
        POOL_PADDING + POOL_MACHINE_SPACING,
      );
    });

    it('places pools below assembly lines with POOL_AREA_GAP', () => {
      const layout = generate([makeLine('al-1', 2)], [makePool('wp-1', 1)]);
      const alRoom = layout.rooms[0]!;
      const poolRoom = layout.rooms[1]!;
      // Pool Y = alRoom.height + POOL_AREA_GAP (not ROOM_GAP)
      expect(poolRoom.y).toBe(alRoom.height + LAYOUT_CONFIG.POOL_AREA_GAP);
    });

    it('arranges multiple pools side by side horizontally', () => {
      const layout = generate(
        [],
        [makePool('wp-1', 2), makePool('wp-2', 3)],
      );
      expect(layout.rooms).toHaveLength(2);
      expect(layout.rooms[0]!.x).toBe(0);
      expect(layout.rooms[1]!.x).toBe(
        layout.rooms[0]!.width + LAYOUT_CONFIG.ROOM_GAP,
      );
    });

    it('empty worker pool produces empty room with padding dimensions', () => {
      const layout = generate([], [makePool('wp-1', 0)]);
      const room = layout.rooms[0]!;
      expect(room.width).toBe(LAYOUT_CONFIG.POOL_PADDING * 2);
      expect(room.height).toBe(LAYOUT_CONFIG.POOL_PADDING * 2);
      expect(layout.machinePositions).toHaveLength(0);
    });

    it('worker pools never produce conveyor paths', () => {
      const layout = generate([], [makePool('wp-1', 5)]);
      expect(layout.conveyorPaths).toHaveLength(0);
    });
  });

  // ── No overlapping rooms ────────────────────────────────────────────────

  describe('no overlapping rooms', () => {
    function roomsOverlap(a: Room, b: Room): boolean {
      return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      );
    }

    it('assembly line rooms do not overlap', () => {
      const layout = generate([
        makeLine('a', 5),
        makeLine('b', 3),
        makeLine('c', 7),
      ]);
      for (let i = 0; i < layout.rooms.length; i++) {
        for (let j = i + 1; j < layout.rooms.length; j++) {
          expect(roomsOverlap(layout.rooms[i]!, layout.rooms[j]!)).toBe(false);
        }
      }
    });

    it('pool rooms do not overlap', () => {
      const layout = generate(
        [],
        [makePool('a', 4), makePool('b', 6), makePool('c', 2)],
      );
      for (let i = 0; i < layout.rooms.length; i++) {
        for (let j = i + 1; j < layout.rooms.length; j++) {
          expect(roomsOverlap(layout.rooms[i]!, layout.rooms[j]!)).toBe(false);
        }
      }
    });

    it('assembly line rooms and pool rooms do not overlap', () => {
      const layout = generate(
        [makeLine('al-1', 3), makeLine('al-2', 2)],
        [makePool('wp-1', 4), makePool('wp-2', 2)],
      );
      for (let i = 0; i < layout.rooms.length; i++) {
        for (let j = i + 1; j < layout.rooms.length; j++) {
          expect(roomsOverlap(layout.rooms[i]!, layout.rooms[j]!)).toBe(false);
        }
      }
    });
  });

  // ── Floor bounds ────────────────────────────────────────────────────────

  describe('floorBounds', () => {
    it('returns total width and height for single assembly line', () => {
      const layout = generate([makeLine('al-1', 3)]);
      expect(layout.floorBounds.width).toBe(layout.rooms[0]!.width);
      expect(layout.floorBounds.height).toBe(layout.rooms[0]!.height);
    });

    it('width is the max room width among assembly lines', () => {
      const layout = generate([makeLine('a', 2), makeLine('b', 5)]);
      const maxWidth = Math.max(
        ...layout.rooms.map((r) => r.width),
      );
      expect(layout.floorBounds.width).toBe(maxWidth);
    });

    it('height includes all stacked rooms plus gaps', () => {
      const layout = generate([makeLine('a', 1), makeLine('b', 1)]);
      // height = 2 * ROOM_HEIGHT + 1 * ROOM_GAP (no trailing gap)
      expect(layout.floorBounds.height).toBe(
        2 * LAYOUT_CONFIG.ROOM_HEIGHT + LAYOUT_CONFIG.ROOM_GAP,
      );
    });

    it('includes pool area in bounds', () => {
      const layout = generate(
        [makeLine('al-1', 2)],
        [makePool('wp-1', 4)],
      );
      // Pool room extends below assembly line area
      const poolRoom = layout.rooms.find((r) => r.id === 'wp-1')!;
      expect(layout.floorBounds.height).toBe(poolRoom.y + poolRoom.height);
    });

    it('handles pools-only layout', () => {
      const layout = generate([], [makePool('wp-1', 3)]);
      const room = layout.rooms[0]!;
      expect(layout.floorBounds.width).toBe(room.width);
      expect(layout.floorBounds.height).toBe(room.height);
    });

    it('handles multiple side-by-side pools width correctly', () => {
      const layout = generate(
        [],
        [makePool('a', 3), makePool('b', 3)],
      );
      const totalPoolWidth =
        layout.rooms[0]!.width +
        LAYOUT_CONFIG.ROOM_GAP +
        layout.rooms[1]!.width;
      expect(layout.floorBounds.width).toBe(totalPoolWidth);
    });
  });

  // ── Determinism ─────────────────────────────────────────────────────────

  describe('determinism', () => {
    it('same input always produces the same output', () => {
      const input: LayoutInput = {
        assemblyLines: [makeLine('al-1', 3), makeLine('al-2', 2)],
        workerPools: [makePool('wp-1', 4)],
      };
      const a = generateFactoryLayout(input);
      const b = generateFactoryLayout(input);
      expect(a).toEqual(b);
    });

    it('produces fresh objects on each call (no shared references)', () => {
      const input: LayoutInput = {
        assemblyLines: [makeLine('al-1', 2)],
        workerPools: [],
      };
      const a = generateFactoryLayout(input);
      const b = generateFactoryLayout(input);
      expect(a).not.toBe(b);
      expect(a.rooms).not.toBe(b.rooms);
      expect(a.machinePositions).not.toBe(b.machinePositions);
      expect(a.conveyorPaths).not.toBe(b.conveyorPaths);
      expect(a.floorBounds).not.toBe(b.floorBounds);
    });
  });

  // ── Type exports verification ───────────────────────────────────────────

  describe('type exports', () => {
    it('FactoryLayout has expected shape', () => {
      const layout = generate([makeLine('al-1', 1)]);
      expect(layout).toHaveProperty('rooms');
      expect(layout).toHaveProperty('machinePositions');
      expect(layout).toHaveProperty('conveyorPaths');
      expect(layout).toHaveProperty('floorBounds');
      expect(layout.floorBounds).toHaveProperty('width');
      expect(layout.floorBounds).toHaveProperty('height');
    });

    it('Room has expected shape', () => {
      const layout = generate([makeLine('al-1', 1)]);
      const room = layout.rooms[0];
      expect(room).toHaveProperty('id');
      expect(room).toHaveProperty('name');
      expect(room).toHaveProperty('x');
      expect(room).toHaveProperty('y');
      expect(room).toHaveProperty('width');
      expect(room).toHaveProperty('height');
    });

    it('MachinePosition has expected shape', () => {
      const layout = generate([makeLine('al-1', 1)]);
      const machine = layout.machinePositions[0];
      expect(machine).toHaveProperty('id');
      expect(machine).toHaveProperty('roomId');
      expect(machine).toHaveProperty('workerVersionId');
      expect(machine).toHaveProperty('tileX');
      expect(machine).toHaveProperty('tileY');
    });

    it('ConveyorPath has expected shape', () => {
      const layout = generate([makeLine('al-1', 2)]);
      const conveyor = layout.conveyorPaths[0];
      expect(conveyor).toHaveProperty('roomId');
      expect(conveyor).toHaveProperty('fromMachineId');
      expect(conveyor).toHaveProperty('toMachineId');
      expect(conveyor).toHaveProperty('startX');
      expect(conveyor).toHaveProperty('startY');
      expect(conveyor).toHaveProperty('endX');
      expect(conveyor).toHaveProperty('endY');
    });
  });

  // ── Combined scenario ───────────────────────────────────────────────────

  describe('combined scenario', () => {
    it('handles a realistic factory with multiple lines and pools', () => {
      const layout = generate(
        [makeLine('al-1', 4), makeLine('al-2', 2), makeLine('al-3', 6)],
        [makePool('wp-1', 5), makePool('wp-2', 3)],
      );

      // 3 AL rooms + 2 pool rooms = 5 total
      expect(layout.rooms).toHaveLength(5);

      // Machines: 4 + 2 + 6 (AL) + 5 + 3 (Pool) = 20
      expect(layout.machinePositions).toHaveLength(20);

      // Conveyors: (4-1) + (2-1) + (6-1) = 3 + 1 + 5 = 9
      expect(layout.conveyorPaths).toHaveLength(9);

      // Floor bounds should encompass everything
      expect(layout.floorBounds.width).toBeGreaterThan(0);
      expect(layout.floorBounds.height).toBeGreaterThan(0);
    });
  });
});
