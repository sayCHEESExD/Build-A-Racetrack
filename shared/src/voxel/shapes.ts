import { BARRIER, blockDef, BLOCKS, SHAPE, SHAPE_CODE } from './blocks.js';
import type { Box6 } from './blocks.js';

/**
 * PARTIAL BLOCKS: the boxes stairs, ramps and modelled items are made of, in
 * cell-local units (0..1). ONE definition used by the body simulation
 * (collision), the raycast (what the cursor hits), the server (placement,
 * monster pathing) and the client, so they never disagree.
 *
 * META (one byte per cell):
 *   bits 0-1  facing: 0 +Z, 1 +X, 2 -Z, 3 -X - the way the builder faced, or
 *             the Rotate button's turn (stairs and ramps rise toward it)
 *   bit 2     FLIP: upside down (the Turn button)
 *   bits 3-7  palette colour (0 = the material's own)
 *
 * A FILLER (the cells above a tall item) keeps its offset to the item's base
 * in bits 0-1 and the item's facing in bits 2-3.
 */
export type Box = readonly [number, number, number, number, number, number];

export const META_FLIP = 4;
export const facingOf = (meta: number): number => meta & 3;
export const colorOf = (meta: number): number => (meta >> 3) & 31;
export const isFlipped = (meta: number): boolean => (meta & META_FLIP) !== 0;
export const makeMeta = (facing: number, flip: boolean, color: number): number => (facing & 3) | (flip ? META_FLIP : 0) | ((color & 31) << 3);
export const withColor = (meta: number, color: number): number => (meta & 7) | ((color & 31) << 3);
export const fillerMeta = (offset: number, facing: number): number => (offset & 3) | ((facing & 3) << 2);
export const fillerOffset = (meta: number): number => meta & 3;

const S = SHAPE_CODE;
const FULL: Box = [0, 0, 0, 1, 1, 1];
const BOTTOM: Box = [0, 0, 0, 1, 0.5, 1];
const DIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];
export const dirVector = (d: number): readonly [number, number] => DIRS[d & 3]!;

/** The facing (0..3) a yaw looks along (yaw 0 looks down +Z). */
export const facingFromYaw = (yaw: number): number => {
  const sx = Math.sin(yaw);
  const sz = Math.cos(yaw);
  if (Math.abs(sz) >= Math.abs(sx)) return sz >= 0 ? 0 : 2;
  return sx >= 0 ? 1 : 3;
};

/** Turn a box authored facing +Z to `facing` about the cell's middle. */
export const rotateBox = (b: Box6 | Box, facing: number): Box => {
  switch (facing & 3) {
    case 0:
      return [b[0], b[1], b[2], b[3], b[4], b[5]];
    case 1:
      // +Z -> +X: (x, z) -> (z, 1 - x)
      return [b[2], b[1], 1 - b[3], b[5], b[4], 1 - b[0]];
    case 2:
      return [1 - b[3], b[1], 1 - b[5], 1 - b[0], b[4], 1 - b[2]];
    default:
      return [1 - b[5], b[1], b[0], 1 - b[2], b[4], b[3]];
  }
};

const flipY = (b: Box): Box => [b[0], 1 - b[4], b[2], b[3], 1 - b[1], b[5]];

/** The rising half of a stair, then the steps of a ramp (four quarter-steps, so bodies walk up them). */
const STAIR: readonly Box[] = [BOTTOM, [0, 0.5, 0.5, 1, 1, 1]];
const RAMP: readonly Box[] = [
  [0, 0, 0, 1, 0.25, 1],
  [0, 0.25, 0.25, 1, 0.5, 1],
  [0, 0.5, 0.5, 1, 0.75, 1],
  [0, 0.75, 0.75, 1, 1, 1],
];
const shaped = (boxes: readonly Box[], meta: number): Box[] => boxes.map((b) => {
  const r = rotateBox(b, facingOf(meta));
  return meta & META_FLIP ? flipY(r) : r;
});
const STAIR_CACHE: Box[][] = [];
const RAMP_CACHE: Box[][] = [];
for (let m = 0; m < 8; m += 1) {
  STAIR_CACHE.push(shaped(STAIR, m));
  RAMP_CACHE.push(shaped(RAMP, m));
}

const MODEL_BOX = BLOCKS.map((d) => d.box);

/** What a cell's neighbour lookup needs (fillers look down to their item). */
export type CellReader = (x: number, y: number, z: number) => number;

/**
 * THE BOXES OF A CELL. `collision` asks for what bodies hit; otherwise what
 * the cursor selects.
 */
export const cellBoxes = (id: number, meta: number, x: number, y: number, z: number, get: CellReader, collision: boolean): readonly Box[] => {
  const shape = SHAPE[id]!;
  switch (shape) {
    case S.cube:
      return [FULL];
    case S.slab:
      return [BOTTOM];
    case S.stairs:
      return STAIR_CACHE[meta & 7]!;
    case S.ramp:
      return RAMP_CACHE[meta & 7]!;
    case S.model: {
      const box = MODEL_BOX[id];
      if (!box) return [FULL];
      if (collision && !blockDef(id).solid) return [];
      const r = rotateBox(box, facingOf(meta));
      // Tall items: the base cell is full height.
      return [r];
    }
    case S.none: {
      // The world's invisible wall: a full box for bodies, nothing for the cursor.
      if (id === BARRIER) return collision ? [FULL] : [];
      // A filler: the column of the item below it.
      const offset = fillerOffset(meta);
      if (offset === 0) return [];
      const base = get(x, y - offset, z);
      const box = MODEL_BOX[base];
      if (!box) return [];
      if (collision && !blockDef(id).solid) return [];
      const r = rotateBox(box, (meta >> 2) & 3);
      return [[r[0], 0, r[2], r[3], 1, r[5]]];
    }
    default:
      return [];
  }
};

/** Ray against one box: the entry distance and the face normal, or null. */
export const rayBox = (
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b0x: number,
  b0y: number,
  b0z: number,
  b1x: number,
  b1y: number,
  b1z: number,
): { t: number; nx: number; ny: number; nz: number } | null => {
  let tmin = -Infinity;
  let tmax = Infinity;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const axes: [number, number, number, number, number][] = [
    [ox, dx, b0x, b1x, 0],
    [oy, dy, b0y, b1y, 1],
    [oz, dz, b0z, b1z, 2],
  ];
  for (const [o, d, lo, hi, axis] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t0 = (lo - o) / d;
    let t1 = (hi - o) / d;
    let sign = -1;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
      sign = 1;
    }
    if (t0 > tmin) {
      tmin = t0;
      nx = axis === 0 ? sign : 0;
      ny = axis === 1 ? sign : 0;
      nz = axis === 2 ? sign : 0;
    }
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), nx, ny, nz };
};
