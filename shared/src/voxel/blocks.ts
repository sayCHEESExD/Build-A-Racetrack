/**
 * THE BLOCKS of the walking world. Build A Racetrack's ground is one flat
 * voxel layer the body simulation stands on (the track, the shops and the
 * scenery are drawn by the client; what of them bodies bump into is an extra
 * solid box, see `world/map.ts`). Two bytes of id per cell plus one byte of
 * meta (`shapes.ts`).
 */

export type BlockShape = 'cube' | 'slab' | 'stairs' | 'ramp' | 'model' | 'none';
/** A model's own box, cell-local: [minX, minY, minZ, maxX, maxY, maxZ]. */
export type Box6 = readonly [number, number, number, number, number, number];

export interface BlockDef {
  readonly id: number;
  readonly key: string;
  readonly shape: BlockShape;
  readonly solid: boolean;
  readonly transparent: boolean;
  readonly climb: boolean;
  readonly box: Box6 | null;
}

const defs: BlockDef[] = [];

const block = (key: string, o: Partial<Omit<BlockDef, 'id' | 'key'>> = {}): number => {
  const id = defs.length;
  const shape = o.shape ?? 'cube';
  defs.push({ id, key, shape, solid: o.solid ?? shape !== 'none', transparent: o.transparent ?? shape !== 'cube', climb: o.climb ?? false, box: o.box ?? null });
  return id;
};

export const AIR = block('air', { shape: 'none', solid: false, transparent: true });
/** The invisible wall round the world. */
export const BARRIER = block('barrier', { shape: 'none', solid: true, transparent: true });
/** The ground everyone walks on (grass, paths and plots are painted by the client). */
export const GROUND = block('ground');

export const BLOCKS: readonly BlockDef[] = defs;
export const BLOCK_COUNT = defs.length;
export const blockDef = (id: number): BlockDef => defs[id] ?? defs[0]!;

export const SHAPE_CODE: Readonly<Record<BlockShape, number>> = { cube: 0, slab: 1, stairs: 2, ramp: 3, model: 4, none: 5 };

const N = Math.max(BLOCK_COUNT, 1);
export const IS_SOLID = new Uint8Array(N);
export const IS_TRANSPARENT = new Uint8Array(N);
export const IS_CLIMB = new Uint8Array(N);
export const SHAPE = new Uint8Array(N);
/** No water and no bounce pads in this game; the body simulation still asks. */
export const IS_WATER = new Uint8Array(N);
export const IS_FILLER = new Uint8Array(N);
export const IS_BOUNCE = new Uint8Array(N);
for (const def of defs) {
  IS_SOLID[def.id] = def.solid ? 1 : 0;
  IS_TRANSPARENT[def.id] = def.transparent ? 1 : 0;
  IS_CLIMB[def.id] = def.climb ? 1 : 0;
  SHAPE[def.id] = SHAPE_CODE[def.shape];
}

/** A raycast stops at it (anything but air and barriers). */
export const isTargetable = (id: number): boolean => id !== AIR && id !== BARRIER;
