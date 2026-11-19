import { GROUND_Y, WORLD_BOUNDS } from '../constants/world.js';
import { CELL, PLOT_UNITS_X, PLOT_UNITS_Z, PLOT_W, TILE, toCanonical, toWorld, type PlotFrame } from '../track/track.js';
import { GROUND } from '../voxel/blocks.js';
import { VoxelWorld, type ExtraSolid } from '../voxel/VoxelWorld.js';

/**
 * THE RACEWAY (laid out like the reference): one long two-lane road runs
 * north-south down the middle, from the spawn plaza in the south (with the
 * three leaderboards) to a dark tunnel through a cliff in the north. Three
 * plots line each side of the road, every one opening onto it with its pit
 * lane. By the tunnel the shops: the TRACKS stall to the left of it, DECORS
 * and CRATES to its right. Through the tunnel lies the SHOWCASE: a track
 * ground where any published racetrack can be driven.
 *
 * Only the ground is voxels; what of the scenery bodies bump into is
 * `SCENERY_SOLIDS`.
 */

export const PLOT_COUNT = 6;
/** Half the main road's width. */
export const ROAD_HALF_W = 7;
/** Plots start this far from the road's middle (a verge and a kerb between). */
const PLOT_INNER = 12;
const ROWS = [-100, 0, 100] as const;
/** The road runs between these z (spawn plaza south, tunnel north). */
export const ROAD_SOUTH = 196;
export const ROAD_NORTH = -184;

export interface PlotDef {
  index: number;
  /** World middle. */
  cx: number;
  cz: number;
  /** +1 east of the road, -1 west. */
  side: 1 | -1;
  frame: PlotFrame;
  /** Its own colour (flags, the nameplate). */
  color: number;
}

const PLOT_COLORS = [0xff5a5a, 0x3fa2ff, 0xffc42a, 0x58d36a, 0xb15cff, 0xff8a2a] as const;

export const PLOTS: readonly PlotDef[] = Array.from({ length: PLOT_COUNT }, (_, index) => {
  const side: 1 | -1 = index < 3 ? 1 : -1;
  const cx = side * (PLOT_INNER + PLOT_UNITS_X / 2);
  const cz = ROWS[index % 3]!;
  const frame: PlotFrame = { minX: cx - PLOT_UNITS_X / 2, minZ: cz - PLOT_UNITS_Z / 2, rot: side > 0 ? 0 : 2 };
  return { index, cx, cz, side, frame, color: PLOT_COLORS[index]! };
});

/** THE SHOWCASE: the track ground through the tunnel where published tracks are driven. */
export const ARENA_INDEX = 6;
export const ARENA: PlotDef = {
  index: ARENA_INDEX,
  cx: 0,
  cz: -262,
  side: 1,
  frame: { minX: -PLOT_UNITS_X / 2, minZ: -262 - PLOT_UNITS_Z / 2, rot: 0 },
  color: 0xff4fd8,
};

/** A plot by index, the arena included. */
export const plotDef = (index: number): PlotDef | undefined => (index === ARENA_INDEX ? ARENA : PLOTS[index]);

export const plotAt = (x: number, z: number): number => {
  for (const p of PLOTS) if (Math.abs(x - p.cx) <= PLOT_UNITS_X / 2 && Math.abs(z - p.cz) <= PLOT_UNITS_Z / 2) return p.index;
  return -1;
};

/** A world point in a plot's canonical tiles (may be outside the plot). */
export const tileOf = (plot: PlotDef, x: number, z: number): [number, number] => {
  const [cx, cz] = toCanonical(plot.frame, x, z);
  return [Math.floor(cx / TILE), Math.floor(cz / TILE)];
};

export const cellOf = (plot: PlotDef, x: number, z: number): [number, number] => {
  const [cx, cz] = toCanonical(plot.frame, x, z);
  return [Math.floor(cx / CELL), Math.floor(cz / CELL)];
};

/** The plot's yaw facing into it from the road (+canonical x). */
export const intoPlotYaw = (plot: PlotDef): number => (plot.frame.rot === 0 ? Math.PI / 2 : -Math.PI / 2);

/**
 * THE ENTRANCE ARCH: in the middle of every plot's road side, its face to the
 * road (canonical z of its middle). The Start Gate runs along the road just
 * inside it, the Spawn Car pad between its towers.
 */
export const GATE_Z_C = PLOT_UNITS_Z / 2;

/** Where the owner arrives: under the arch, by the Spawn Car pad, facing into the plot. */
export const plotEntry = (plot: PlotDef): { x: number; y: number; z: number; yaw: number } => {
  const [x, z] = toWorld(plot.frame, 2, GATE_Z_C - 3.6);
  return { x, y: GROUND_Y, z, yaw: intoPlotYaw(plot) };
};

/** The Spawn Car pad (under the arch) and the Pit Stop (just past it), in the pit lane beside the Start Gate (canonical units). */
export const SPAWN_PAD_C = [2, GATE_Z_C] as const;
export const PIT_PAD_C = [2, GATE_Z_C + 6.6] as const;
export const spawnPad = (plot: PlotDef): { x: number; z: number } => {
  const [x, z] = toWorld(plot.frame, SPAWN_PAD_C[0], SPAWN_PAD_C[1]);
  return { x, z };
};
export const pitPad = (plot: PlotDef): { x: number; z: number } => {
  const [x, z] = toWorld(plot.frame, PIT_PAD_C[0], PIT_PAD_C[1]);
  return { x, z };
};

/** Half the road-side opening under the entrance arch (no fence, no kerb). */
export const GATE_OPENING = 4;

/** The Length and Likes boards on the verge either side of the arch (canonical units). */
export const LENGTH_BOARD_C = [-2.6, GATE_Z_C - GATE_OPENING - 3] as const;
export const LIKES_BOARD_C = [-2.6, GATE_Z_C + GATE_OPENING + 3] as const;

/** Where the plot's road-side nameplate stands: on the verge beside the gate's opening, facing the road. */
export const plotSign = (plot: PlotDef): { x: number; z: number; yaw: number } => ({
  x: plot.cx - plot.side * (PLOT_UNITS_X / 2 + 1.4),
  z: plot.cz + (plot.frame.rot === 0 ? 1 : -1) * 22,
  yaw: plot.side > 0 ? -Math.PI / 2 : Math.PI / 2,
});

/** The far edge of what a plot has unlocked, as a world z (for the Expand sign): canonical rows. */
export const PLOT_TILES_X = PLOT_W;

// ---------------------------------------------------------------- shops

export type ShopKind = 'track' | 'decor' | 'crate';

export interface ShopSpot {
  kind: ShopKind;
  name: string;
  /** The sign over the stall. */
  sign: string;
  /** Where the shopkeeper stands, and the way they face (toward customers). */
  x: number;
  z: number;
  yaw: number;
  reach: number;
  /** Stall colours: awning stripes and posts. */
  colors: readonly [number, number, number];
}

/** By the tunnel: Tracks to the left of it, Decors and Crates to the right (seen walking north). */
export const SHOPS: readonly ShopSpot[] = [
  { kind: 'track', name: 'Track Shop', sign: 'TRACKS', x: -28, z: -164, yaw: 0, reach: 8, colors: [0x58d36a, 0xf2f2f2, 0x8a2a2a] },
  { kind: 'decor', name: 'Decorations', sign: 'Decors', x: 24, z: -164, yaw: 0, reach: 8, colors: [0xffc42a, 0xc8a8ff, 0x8a2a2a] },
  { kind: 'crate', name: 'Crates', sign: 'Crates', x: 40, z: -164, yaw: 0, reach: 8, colors: [0xffc42a, 0xc8a8ff, 0x8a2a2a] },
];
export const shopSpot = (kind: ShopKind): ShopSpot => SHOPS.find((s) => s.kind === kind)!;
/** Half a stall's width (its counter). */
export const STALL_HALF = 5.5;
/** Half each shop building's width (the client builds to these; bodies bump into them). */
export const SHOP_HALF: Readonly<Record<ShopKind, number>> = { track: 6.5, decor: 5.8, crate: 5.8 };

/** The tunnel mouth (into the Showcase) at the road's north end. */
export const TUNNEL = { x: 0, z: -186, halfW: 8, h: 9 } as const;
/** Inside the tunnel: walking in takes you to the Showcase gallery. */
export const TUNNEL_PORTAL = { x: 0, z: -190, r: 5 } as const;
/** Leaderboards at the spawn end, facing north up the road. */
export const LEADERBOARDS: readonly { key: 'money' | 'playtime' | 'air'; title: string; x: number; z: number; yaw: number; color: number }[] = [
  { key: 'playtime', title: 'PLAY TIME', x: -27, z: 190, yaw: Math.PI / 2, color: 0x8a3ad8 },
  { key: 'air', title: 'BEST AIR', x: 0, z: 207, yaw: Math.PI, color: 0x3fc8ff },
  { key: 'money', title: 'MONEY', x: 27, z: 190, yaw: -Math.PI / 2, color: 0xffc42a },
];
/** The golden trophy statue in the middle of the spawn plaza. */
export const TROPHY = { x: 0, z: 196, r: 3.2 } as const;
/** Grandstands either side of the road by the title arch. */
export const GRANDSTANDS: readonly { x: number; z: number; side: 1 | -1 }[] = [
  { x: 20, z: 156, side: 1 },
  { x: -20, z: 156, side: -1 },
];

const box = (x0: number, z0: number, x1: number, z1: number, h: number, y0 = GROUND_Y): ExtraSolid => ({
  minX: Math.min(x0, x1),
  minY: y0,
  minZ: Math.min(z0, z1),
  maxX: Math.max(x0, x1),
  maxY: GROUND_Y + h,
  maxZ: Math.max(z0, z1),
});

/** The cliff wall the tunnel cuts through (north edge of the raceway), z between. */
export const CLIFF_Z0 = -200;
export const CLIFF_Z1 = -186;

/** Bodies bump into these (scenery the client draws). */
export const SCENERY_SOLIDS: readonly ExtraSolid[] = [
  // The cliff, either side of the tunnel.
  box(-110, CLIFF_Z0, -TUNNEL.halfW, CLIFF_Z1, 14),
  box(TUNNEL.halfW, CLIFF_Z0, 110, CLIFF_Z1, 14),
  // The shops: the building behind the back wall, its side walls, the counter; the crane and the crate stacks.
  ...SHOPS.flatMap((s) => {
    const h = SHOP_HALF[s.kind];
    const out = [
      box(s.x - h, s.z - 10, s.x + h, s.z - 2.4, 9),
      box(s.x - h, s.z - 3, s.x - h + 0.5, s.z + 1.9, 6),
      box(s.x + h - 0.5, s.z - 3, s.x + h, s.z + 1.9, 6),
      box(s.x - STALL_HALF, s.z + 0.9, s.x + STALL_HALF, s.z + 2.1, 1.2),
    ];
    if (s.kind === 'track') out.push(box(s.x + h + 0.9, s.z - 2.2, s.x + h + 2.3, s.z - 0.8, 10));
    if (s.kind === 'crate') for (const side of [-1, 1]) out.push(box(s.x + side * (h + 0.4), s.z - 0.3, s.x + side * (h + 2.2), s.z + 3.2, 3.9));
    return out;
  }),
  // Leaderboard posts, the trophy's plinth, the grandstands.
  ...LEADERBOARDS.map((b) => (Math.abs(Math.sin(b.yaw)) > 0.5 ? box(b.x - 0.6, b.z - 6, b.x + 0.6, b.z + 6, 2) : box(b.x - 6, b.z - 0.6, b.x + 6, b.z + 0.6, 2))),
  box(TROPHY.x - TROPHY.r, TROPHY.z - TROPHY.r, TROPHY.x + TROPHY.r, TROPHY.z + TROPHY.r, 1.4),
  ...GRANDSTANDS.map((g) => box(g.x - 4.5, g.z - 9, g.x + 4.5, g.z + 9, 5)),
  // The Showcase's walls (closed in, except the way back through the tunnel).
  box(-40, -312, 40, -308, 6),
  box(-40, -312, -36, -200, 6),
  box(36, -312, 40, -200, 6),
];

/** Where a visitor to the Showcase arrives, and where leaving it puts you (the tunnel mouth, facing south). */
export const ARENA_ENTRY = { x: -5, y: GROUND_Y, z: -212, yaw: Math.PI } as const;
export const TUNNEL_EXIT = { x: 0, y: GROUND_Y, z: -176, yaw: Math.PI } as const;

export const buildMap = (): VoxelWorld => {
  const world = new VoxelWorld(WORLD_BOUNDS);
  const { minX, minZ, sizeX, sizeZ } = WORLD_BOUNDS;
  for (let z = minZ; z < minZ + sizeZ; z += 1) for (let x = minX; x < minX + sizeX; x += 1) world.fill(x, 0, z, GROUND);
  for (let i = 0; i < SCENERY_SOLIDS.length; i += 1) world.setExtra(-1 - i, SCENERY_SOLIDS[i]!);
  return world;
};

let base: VoxelWorld | null = null;
export const mapBase = (): VoxelWorld => {
  if (!base) base = buildMap();
  return base;
};
