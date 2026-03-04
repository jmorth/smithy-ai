// ---------------------------------------------------------------------------
// Factory Layout Generator
// ---------------------------------------------------------------------------
// Pure functions that transform workflow topology (Assembly Lines, Worker Pools)
// into spatial positions for rendering on the isometric factory floor.
// No Phaser dependency — only computes positions.
// ---------------------------------------------------------------------------

// ── Input types ─────────────────────────────────────────────────────────────

export interface LayoutAssemblyLine {
  id: string;
  name: string;
  steps: LayoutStep[];
}

export interface LayoutStep {
  id: string;
  workerVersionId: string;
}

export interface LayoutWorkerPool {
  id: string;
  name: string;
  members: LayoutPoolMember[];
}

export interface LayoutPoolMember {
  id: string;
  workerVersionId: string;
}

export interface LayoutInput {
  assemblyLines: LayoutAssemblyLine[];
  workerPools: LayoutWorkerPool[];
}

// ── Output types ────────────────────────────────────────────────────────────

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MachinePosition {
  id: string;
  roomId: string;
  workerVersionId: string;
  tileX: number;
  tileY: number;
}

export interface ConveyorPath {
  roomId: string;
  fromMachineId: string;
  toMachineId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface FactoryLayout {
  rooms: Room[];
  machinePositions: MachinePosition[];
  conveyorPaths: ConveyorPath[];
  floorBounds: { width: number; height: number };
}

// ── Layout configuration constants ──────────────────────────────────────────

export const LAYOUT_CONFIG = {
  /** Horizontal spacing between machines (in tiles). */
  MACHINE_SPACING: 3,
  /** Padding inside a room on each side (in tiles). */
  ROOM_PADDING: 2,
  /** Default room height (in tiles). */
  ROOM_HEIGHT: 5,
  /** Vertical gap between rooms (in tiles). */
  ROOM_GAP: 2,
  /** Columns used when arranging Worker Pool machines in a grid. */
  POOL_COLUMNS: 3,
  /** Spacing between machines inside a Worker Pool cluster (in tiles). */
  POOL_MACHINE_SPACING: 3,
  /** Padding inside a pool room on each side (in tiles). */
  POOL_PADDING: 2,
  /** Gap between the assembly-line area and the worker-pool area (in tiles). */
  POOL_AREA_GAP: 3,
} as const;

// ── Layout generation ───────────────────────────────────────────────────────

function buildAssemblyLineRoom(
  line: LayoutAssemblyLine,
  originY: number,
): { room: Room; machines: MachinePosition[]; conveyors: ConveyorPath[] } {
  const { MACHINE_SPACING, ROOM_PADDING, ROOM_HEIGHT } = LAYOUT_CONFIG;
  const stepCount = line.steps.length;
  const width =
    stepCount > 0
      ? stepCount * MACHINE_SPACING + ROOM_PADDING * 2
      : ROOM_PADDING * 2;

  const room: Room = {
    id: line.id,
    name: line.name,
    x: 0,
    y: originY,
    width,
    height: ROOM_HEIGHT,
  };

  const machines: MachinePosition[] = [];
  const conveyors: ConveyorPath[] = [];

  const machineY = originY + Math.floor(ROOM_HEIGHT / 2);

  for (let i = 0; i < stepCount; i++) {
    const step = line.steps[i]!;
    const machineX = ROOM_PADDING + i * MACHINE_SPACING;
    machines.push({
      id: step.id,
      roomId: line.id,
      workerVersionId: step.workerVersionId,
      tileX: machineX,
      tileY: machineY,
    });
  }

  for (let i = 0; i < machines.length - 1; i++) {
    const from = machines[i]!;
    const to = machines[i + 1]!;
    conveyors.push({
      roomId: line.id,
      fromMachineId: from.id,
      toMachineId: to.id,
      startX: from.tileX,
      startY: from.tileY,
      endX: to.tileX,
      endY: to.tileY,
    });
  }

  return { room, machines, conveyors };
}

function buildWorkerPoolRoom(
  pool: LayoutWorkerPool,
  originX: number,
  originY: number,
): { room: Room; machines: MachinePosition[] } {
  const { POOL_COLUMNS, POOL_MACHINE_SPACING, POOL_PADDING } = LAYOUT_CONFIG;
  const memberCount = pool.members.length;
  const cols = Math.min(memberCount, POOL_COLUMNS);
  const rows = memberCount > 0 ? Math.ceil(memberCount / POOL_COLUMNS) : 0;
  const width =
    cols > 0 ? cols * POOL_MACHINE_SPACING + POOL_PADDING * 2 : POOL_PADDING * 2;
  const height =
    rows > 0
      ? rows * POOL_MACHINE_SPACING + POOL_PADDING * 2
      : POOL_PADDING * 2;

  const room: Room = {
    id: pool.id,
    name: pool.name,
    x: originX,
    y: originY,
    width,
    height,
  };

  const machines: MachinePosition[] = [];
  for (let i = 0; i < memberCount; i++) {
    const member = pool.members[i]!;
    const col = i % POOL_COLUMNS;
    const row = Math.floor(i / POOL_COLUMNS);
    machines.push({
      id: member.id,
      roomId: pool.id,
      workerVersionId: member.workerVersionId,
      tileX: originX + POOL_PADDING + col * POOL_MACHINE_SPACING,
      tileY: originY + POOL_PADDING + row * POOL_MACHINE_SPACING,
    });
  }

  return { room, machines };
}

/**
 * Generates a deterministic factory layout from workflow configuration.
 *
 * Assembly Lines are arranged in horizontal rows stacked vertically.
 * Worker Pools are clustered in a separate area below Assembly Line rooms.
 */
export function generateFactoryLayout(input: LayoutInput): FactoryLayout {
  const rooms: Room[] = [];
  const machinePositions: MachinePosition[] = [];
  const conveyorPaths: ConveyorPath[] = [];

  let currentY = 0;
  let maxWidth = 0;

  // Layout assembly lines top-to-bottom
  for (const line of input.assemblyLines) {
    const { room, machines, conveyors } = buildAssemblyLineRoom(
      line,
      currentY,
    );
    rooms.push(room);
    machinePositions.push(...machines);
    conveyorPaths.push(...conveyors);
    currentY += room.height + LAYOUT_CONFIG.ROOM_GAP;
    maxWidth = Math.max(maxWidth, room.width);
  }

  // Worker pools placed below assembly lines
  if (input.workerPools.length > 0) {
    const poolOriginY =
      input.assemblyLines.length > 0
        ? currentY - LAYOUT_CONFIG.ROOM_GAP + LAYOUT_CONFIG.POOL_AREA_GAP
        : 0;

    let poolX = 0;
    let poolMaxBottom = poolOriginY;

    for (const pool of input.workerPools) {
      const { room, machines } = buildWorkerPoolRoom(pool, poolX, poolOriginY);
      rooms.push(room);
      machinePositions.push(...machines);
      poolX += room.width + LAYOUT_CONFIG.ROOM_GAP;
      poolMaxBottom = Math.max(poolMaxBottom, poolOriginY + room.height);
      maxWidth = Math.max(maxWidth, poolX - LAYOUT_CONFIG.ROOM_GAP);
    }

    currentY = poolMaxBottom;
  } else if (input.assemblyLines.length > 0) {
    // Remove trailing gap when there are no pools
    currentY -= LAYOUT_CONFIG.ROOM_GAP;
  }

  return {
    rooms,
    machinePositions,
    conveyorPaths,
    floorBounds: { width: maxWidth, height: currentY },
  };
}
