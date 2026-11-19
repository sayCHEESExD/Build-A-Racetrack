import { AIR, BARRIER, IS_SOLID, SHAPE, isTargetable } from './blocks.js';
import { cellBoxes, rayBox, type Box } from './shapes.js';

export interface RayHit {
  /** The block hit. */
  x: number;
  y: number;
  z: number;
  id: number;
  meta: number;
  /** The face's outward normal (where a placed block would go: x+nx...). */
  nx: number;
  ny: number;
  nz: number;
  /** Distance along the ray to the hit point. */
  distance: number;
  /** The hit point, in the world. */
  px: number;
  py: number;
  pz: number;
}

export interface WorldBounds {
  readonly minX: number;
  readonly minZ: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
}

/** A solid box that is not a block (a placed sofa, a closed door), in world units. */
export interface ExtraSolid {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export const CHUNK = 16;
const CHUNK_CELLS = CHUNK * CHUNK * CHUNK;

class Chunk {
  readonly ids = new Uint16Array(CHUNK_CELLS);
  readonly meta = new Uint8Array(CHUNK_CELLS);
  /** Non-air cells (an emptied chunk is dropped). */
  count = 0;
}

/**
 * THE VOXEL VOLUME, stored in 16^3 chunks allocated on first write (a flat
 * world is mostly sky): two bytes of block id and one of meta per cell.
 *
 * Shared by the server (authority), the client (rendering + prediction) and
 * the tests. Integer coordinates; x and z may be negative (offset by `minX`
 * / `minZ`), y runs 0..sizeY-1. Outside the volume sideways is a BARRIER
 * wall; above and below is air.
 *
 * It also holds the EXTRA SOLIDS - furniture that bodies bump into - so the
 * body simulation asks one object what is in the way.
 */
/** A moving walkway: a ground rectangle that carries whoever stands on it at (vx, vz) units a second. */
export interface Conveyor {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly vx: number;
  readonly vz: number;
}

export class VoxelWorld {
  readonly minX: number;
  readonly minZ: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly maxX: number;
  readonly maxZ: number;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  private readonly chunks: (Chunk | null)[];
  /** Bumped on every change; renderers and caches compare it. */
  version = 0;
  /** Called after a cell changes (client: re-mesh the chunk). */
  onChange: ((x: number, y: number, z: number, id: number, previous: number) => void) | null = null;
  private readonly extras = new Map<number, ExtraSolid>();
  /** Extra solids by the 4x4 column they touch. */
  private readonly extraCells = new Map<number, Set<number>>();
  readonly reader = (x: number, y: number, z: number): number => this.get(x, y, z);
  /** Moving walkways: a body standing on one is carried along (`stepBody`). */
  conveyors: readonly Conveyor[] = [];

  /** The belt under a point, if any. */
  conveyorAt(x: number, z: number): Conveyor | null {
    for (const c of this.conveyors) if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return c;
    return null;
  }

  constructor(bounds: WorldBounds) {
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.sizeX = bounds.sizeX;
    this.sizeY = bounds.sizeY;
    this.sizeZ = bounds.sizeZ;
    this.maxX = this.minX + this.sizeX;
    this.maxZ = this.minZ + this.sizeZ;
    this.cx = Math.ceil(this.sizeX / CHUNK);
    this.cy = Math.ceil(this.sizeY / CHUNK);
    this.cz = Math.ceil(this.sizeZ / CHUNK);
    this.chunks = new Array<Chunk | null>(this.cx * this.cy * this.cz).fill(null);
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= this.minX && x < this.maxX && z >= this.minZ && z < this.maxZ && y >= 0 && y < this.sizeY;
  }

  /** The global cell index (what messages and saves carry), or -1 outside. Integer inputs. */
  index(x: number, y: number, z: number): number {
    if (x < this.minX || x >= this.maxX || z < this.minZ || z >= this.maxZ || y < 0 || y >= this.sizeY) return -1;
    return x - this.minX + this.sizeX * (z - this.minZ + this.sizeZ * y);
  }

  /** The cell a global index names. */
  coords(index: number): [number, number, number] {
    const x = index % this.sizeX;
    const rest = (index - x) / this.sizeX;
    const z = rest % this.sizeZ;
    const y = (rest - z) / this.sizeZ;
    return [x + this.minX, y, z + this.minZ];
  }

  get cellCount(): number {
    return this.sizeX * this.sizeY * this.sizeZ;
  }

  private chunkIndex(lx: number, y: number, lz: number): number {
    return (lx >> 4) + this.cx * ((lz >> 4) + this.cz * (y >> 4));
  }

  /** A chunk by chunk coordinates (null: all air). */
  chunkAt(cx: number, cy: number, cz: number): { ids: Uint16Array; meta: Uint8Array } | null {
    if (cx < 0 || cy < 0 || cz < 0 || cx >= this.cx || cy >= this.cy || cz >= this.cz) return null;
    return this.chunks[cx + this.cx * (cz + this.cz * cy)] ?? null;
  }

  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= this.sizeY) return AIR;
    const lx = x - this.minX;
    const lz = z - this.minZ;
    if (lx < 0 || lz < 0 || lx >= this.sizeX || lz >= this.sizeZ) return BARRIER;
    const c = this.chunks[this.chunkIndex(lx, y, lz)];
    if (!c) return AIR;
    return c.ids[(lx & 15) + 16 * ((lz & 15) + 16 * (y & 15))]!;
  }

  getMeta(x: number, y: number, z: number): number {
    if (y < 0 || y >= this.sizeY) return 0;
    const lx = x - this.minX;
    const lz = z - this.minZ;
    if (lx < 0 || lz < 0 || lx >= this.sizeX || lz >= this.sizeZ) return 0;
    const c = this.chunks[this.chunkIndex(lx, y, lz)];
    if (!c) return 0;
    return c.meta[(lx & 15) + 16 * ((lz & 15) + 16 * (y & 15))]!;
  }

  /** The block at a world point (floored). */
  at(x: number, y: number, z: number): number {
    return this.get(Math.floor(x), Math.floor(y), Math.floor(z));
  }

  /** Write a block (and its meta). Returns false outside. Notifies `onChange`. */
  set(x: number, y: number, z: number, id: number, meta = 0): boolean {
    if (!this.inside(x, y, z)) return false;
    const previous = this.get(x, y, z);
    const before = this.getMeta(x, y, z);
    if (previous === id && before === meta) return true;
    this.write(x, y, z, id, meta);
    this.version += 1;
    this.onChange?.(x, y, z, id, previous);
    return true;
  }

  /** Generation and bulk loads: write without notifying. */
  fill(x: number, y: number, z: number, id: number, meta = 0): void {
    if (this.inside(x, y, z)) this.write(x, y, z, id, meta);
  }

  private write(x: number, y: number, z: number, id: number, meta: number): void {
    const lx = x - this.minX;
    const lz = z - this.minZ;
    const ci = this.chunkIndex(lx, y, lz);
    let c = this.chunks[ci];
    if (!c) {
      if (id === AIR) return;
      c = new Chunk();
      this.chunks[ci] = c;
    }
    const i = (lx & 15) + 16 * ((lz & 15) + 16 * (y & 15));
    const old = c.ids[i]!;
    if (old === AIR && id !== AIR) c.count += 1;
    else if (old !== AIR && id === AIR) c.count -= 1;
    c.ids[i] = id;
    c.meta[i] = id === AIR ? 0 : meta;
    if (c.count <= 0) this.chunks[ci] = null;
  }

  solid(x: number, y: number, z: number): boolean {
    return IS_SOLID[this.get(x, y, z)] === 1;
  }

  /** Copy every cell of another world of the same size. */
  copyFrom(other: VoxelWorld): void {
    for (let i = 0; i < this.chunks.length; i += 1) {
      const src = other.chunks[i];
      if (!src) {
        this.chunks[i] = null;
        continue;
      }
      const c = new Chunk();
      c.ids.set(src.ids);
      c.meta.set(src.meta);
      c.count = src.count;
      this.chunks[i] = c;
    }
    this.version += 1;
  }

  /** Every non-air cell's global index, id and meta (saves, snapshots). */
  *cells(): Generator<[number, number, number]> {
    for (let cy = 0; cy < this.cy; cy += 1)
      for (let cz = 0; cz < this.cz; cz += 1)
        for (let cx = 0; cx < this.cx; cx += 1) {
          const c = this.chunks[cx + this.cx * (cz + this.cz * cy)];
          if (!c) continue;
          for (let i = 0; i < CHUNK_CELLS; i += 1) {
            const id = c.ids[i]!;
            if (id === AIR) continue;
            const lx = (i & 15) + cx * 16;
            const lz = ((i >> 4) & 15) + cz * 16;
            const y = (i >> 8) + cy * 16;
            yield [lx + this.sizeX * (lz + this.sizeZ * y), id, c.meta[i]!];
          }
        }
  }

  /** The boxes of one cell, in world units, for bodies (collision) or the cursor. */
  boxesAt(x: number, y: number, z: number, collision: boolean): readonly Box[] {
    const id = this.get(x, y, z);
    if (id === AIR) return [];
    return cellBoxes(id, this.getMeta(x, y, z), x, y, z, this.reader, collision);
  }

  // ---------------------------------------------------------------- extra solids (furniture)

  private extraKey(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  setExtra(id: number, box: ExtraSolid | null): void {
    const old = this.extras.get(id);
    if (old) {
      for (let cx = Math.floor(old.minX / 4); cx <= Math.floor(old.maxX / 4); cx += 1)
        for (let cz = Math.floor(old.minZ / 4); cz <= Math.floor(old.maxZ / 4); cz += 1) this.extraCells.get(this.extraKey(cx, cz))?.delete(id);
      this.extras.delete(id);
    }
    if (!box) return;
    this.extras.set(id, box);
    for (let cx = Math.floor(box.minX / 4); cx <= Math.floor(box.maxX / 4); cx += 1)
      for (let cz = Math.floor(box.minZ / 4); cz <= Math.floor(box.maxZ / 4); cz += 1) {
        const k = this.extraKey(cx, cz);
        let set = this.extraCells.get(k);
        if (!set) {
          set = new Set();
          this.extraCells.set(k, set);
        }
        set.add(id);
      }
  }

  clearExtras(): void {
    this.extras.clear();
    this.extraCells.clear();
  }

  /** Extra solids overlapping a box's columns (callers test the overlap). */
  extrasNear(minX: number, minZ: number, maxX: number, maxZ: number, out: ExtraSolid[]): ExtraSolid[] {
    out.length = 0;
    if (this.extras.size === 0) return out;
    const seen = new Set<number>();
    for (let cx = Math.floor(minX / 4); cx <= Math.floor(maxX / 4); cx += 1)
      for (let cz = Math.floor(minZ / 4); cz <= Math.floor(maxZ / 4); cz += 1) {
        const set = this.extraCells.get(this.extraKey(cx, cz));
        if (!set) continue;
        for (const id of set) {
          if (seen.has(id)) continue;
          seen.add(id);
          const b = this.extras.get(id);
          if (b) out.push(b);
        }
      }
    return out;
  }

  // ---------------------------------------------------------------- rays

  /**
   * THE BLOCK UNDER THE CURSOR: an Amanatides-Woo walk through the grid,
   * testing the real boxes of partial blocks (a slab is hit only where it is).
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDistance: number): RayHit | null {
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-9) return null;
    dx /= length;
    dy /= length;
    dz /= length;
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / dx);
    const tDeltaY = Math.abs(1 / dy);
    const tDeltaZ = Math.abs(1 / dz);
    let tMaxX = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX;
    let tMaxY = dy === 0 ? Infinity : (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY;
    let tMaxZ = dz === 0 ? Infinity : (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;
    for (let guard = 0; guard < 1024 && t <= maxDistance; guard += 1) {
      const id = this.get(x, y, z);
      if (isTargetable(id)) {
        if (SHAPE[id] === 0) {
          if (t <= maxDistance) return { x, y, z, id, meta: this.getMeta(x, y, z), nx, ny, nz, distance: t, px: ox + dx * t, py: oy + dy * t, pz: oz + dz * t };
        } else {
          const meta = this.getMeta(x, y, z);
          let best: { t: number; nx: number; ny: number; nz: number } | null = null;
          for (const b of cellBoxes(id, meta, x, y, z, this.reader, false)) {
            const h = rayBox(ox, oy, oz, dx, dy, dz, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
            if (h && (!best || h.t < best.t)) best = h;
          }
          if (best && best.t <= maxDistance) return { x, y, z, id, meta, nx: best.nx, ny: best.ny, nz: best.nz, distance: best.t, px: ox + dx * best.t, py: oy + dy * best.t, pz: oz + dz * best.t };
        }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
    return null;
  }

  /** The top of the highest solid in a column at or below `fromY` (-Infinity if none). */
  groundBelow(x: number, z: number, fromY: number): number {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    for (let y = Math.min(this.sizeY - 1, Math.floor(fromY)); y >= 0; y -= 1) {
      const id = this.get(cx, y, cz);
      if (!IS_SOLID[id]) continue;
      let top = y;
      for (const b of this.boxesAt(cx, y, cz, true)) top = Math.max(top, y + b[4]);
      return top;
    }
    return -Infinity;
  }
}
