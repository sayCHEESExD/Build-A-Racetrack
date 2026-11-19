import { ARENA, GROUND_Y, TROPHY, PIT_TILES, PLOTS, PLOT_UNITS_X, PLOT_UNITS_Z, ROAD_HALF_W, ROAD_NORTH, ROAD_SOUTH, SHOPS, TILE, toCanonical, type PlotDef } from '@race/shared';
import { BufferAttribute, BufferGeometry, Color } from 'three';

/**
 * THE PAINTED GROUND (after +1 Monkey Evolution's Terrain): the whole raceway
 * is ONE surface, a grid of 2-unit tiles each painted its own colour the way
 * a Roblox builder paints terrain - bright grass in drifts of tone, the long
 * slate road with its pale shoulders, every plot's checkerboard of build
 * tiles and its concrete pit lane, the spawn plaza's chequered start, the
 * shop yard by the tunnel. Nothing lies on top of it, so nothing flickers;
 * the studs come from the material. Its edges drop as dirt cliffs to the sea.
 */

const CELL = 2;
export const ISLAND = { minX: -104, maxX: 104, minZ: -316, maxZ: 214 } as const;

const C = new Color();

const hash = (x: number, z: number): number => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (x: number, z: number): number => {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const noise = (x: number, z: number): number => 0.6 * smooth(x / 18, z / 18) + 0.4 * smooth(x / 6 + 40, z / 6 + 40);

/** Saturated Roblox grass, in drifts. */
const GRASS = [0x43d12f, 0x4ed838, 0x5ae042, 0x3cc52a, 0x63e64b];
const ROAD = [0x4c5370, 0x485069, 0x515874];

const inPlot = (plot: PlotDef, x: number, z: number): [number, number] | null => {
  const [cx, cz] = toCanonical(plot.frame, x, z);
  if (cx < 0 || cz < 0 || cx >= PLOT_UNITS_X || cz >= PLOT_UNITS_Z) return null;
  return [cx, cz];
};

const paint = (x: number, z: number): number => {
  const n = hash(Math.floor(x / CELL), Math.floor(z / CELL));
  // The main road: slate asphalt, a pale shoulder each side.
  if (z > ROAD_NORTH - 4 && z < ROAD_SOUTH - 30) {
    const ax = Math.abs(x);
    if (ax < ROAD_HALF_W) return C.setHex(ROAD[Math.floor(n * ROAD.length)]!).multiplyScalar(0.97 + n * 0.06).getHex();
    if (ax < ROAD_HALF_W + 2) return C.setHex(0x9aa0b8).multiplyScalar(0.96 + n * 0.06).getHex();
  }
  // The spawn plaza at the south end: a chequered start grid, a paved spine to the trophy, grass round it.
  if (z >= ROAD_SOUTH - 30 && z < ROAD_SOUTH + 16 && Math.abs(x) < 34) {
    const cx = Math.floor(x / 4);
    const cz = Math.floor(z / 4);
    if (z < ROAD_SOUTH - 22 && Math.abs(x) < 9) return (cx + cz) % 2 === 0 ? 0xf4f4f4 : 0x2b2f45;
    const dt = Math.max(Math.abs(x - TROPHY.x), Math.abs(z - TROPHY.z));
    if (dt < TROPHY.r + 3) return C.setHex(dt < TROPHY.r + 1.5 ? 0xffd86a : 0xe8b84a).getHex();
    if (Math.abs(x) < 6 || (Math.abs(z - 190) < 3 && Math.abs(x) < 28) || (Math.abs(z - 204) < 3 && Math.abs(x) < 8)) return C.setHex(n > 0.5 ? 0xe4dfd2 : 0xd8d1c1).getHex();
  }
  // The shop yard by the tunnel.
  if (z > -178 && z < -150) {
    for (const s of SHOPS) if (Math.abs(x - s.x) < 9 && Math.abs(z - s.z) < 9) return C.setHex(n > 0.5 ? 0xe8c98a : 0xdcbc7c).getHex();
  }
  // Plots: a checkerboard of build tiles, the pit lane in concrete.
  for (const plot of PLOTS) {
    const c = inPlot(plot, x, z);
    if (!c) continue;
    const tx = Math.floor(c[0] / TILE);
    const tz = Math.floor(c[1] / TILE);
    if (PIT_TILES.some(([px, pz]) => px === tx && pz === tz)) return C.setHex(0xb8bccc).multiplyScalar(0.97 + n * 0.05).getHex();
    const light = (tx + tz) % 2 === 0;
    return C.setHex(light ? 0x5fe04a : 0x50d13c).multiplyScalar(0.98 + n * 0.04).getHex();
  }
  // The Showcase: a big checkerboard too.
  {
    const c = inPlot(ARENA, x, z);
    if (c) {
      const light = (Math.floor(c[0] / TILE) + Math.floor(c[1] / TILE)) % 2 === 0;
      return light ? 0x6ae6ff : 0x52d4f2;
    }
  }
  const g = noise(x, z);
  const base = GRASS[Math.min(GRASS.length - 1, Math.floor(g * GRASS.length))]!;
  return C.setHex(base).multiplyScalar(0.96 + n * 0.07).getHex();
};

/** The painted ground: flat tiles at ground height, and dirt cliffs down to the sea round the island. */
export const buildTerrain = (): BufferGeometry => {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const y = GROUND_Y;
  const quad = (a: number[], b: number[], c: number[], d: number[], nrm: number[], hexc: number): void => {
    C.setHex(hexc);
    for (const p of [a, b, c, a, c, d]) {
      pos.push(p[0]!, p[1]!, p[2]!);
      nor.push(nrm[0]!, nrm[1]!, nrm[2]!);
      col.push(C.r, C.g, C.b);
    }
  };
  const { minX, maxX, minZ, maxZ } = ISLAND;
  for (let z = minZ; z < maxZ; z += CELL)
    for (let x = minX; x < maxX; x += CELL) {
      const c = paint(x + CELL / 2, z + CELL / 2);
      quad([x, y, z], [x, y, z + CELL], [x + CELL, y, z + CELL], [x + CELL, y, z], [0, 1, 0], c);
    }
  // Cliffs: a grass lip then layered dirt, stepping down to the sea in 2-unit bands.
  const bands = [0x58c43a, 0x9a6a3e, 0x8a5c34, 0xa8784a, 0x7a5030];
  for (let i = 0; i < bands.length; i += 1) {
    const top = y - i * 1.6;
    const bot = top - 1.6;
    const c = bands[i]!;
    for (let x = minX; x < maxX; x += 4) {
      const k = 0.92 + hash(x, i) * 0.12;
      const cc = C.setHex(c).multiplyScalar(k).getHex();
      quad([x, top, minZ], [x + 4, top, minZ], [x + 4, bot, minZ], [x, bot, minZ], [0, 0, -1], cc);
      quad([x + 4, top, maxZ], [x, top, maxZ], [x, bot, maxZ], [x + 4, bot, maxZ], [0, 0, 1], cc);
    }
    for (let z = minZ; z < maxZ; z += 4) {
      const k = 0.92 + hash(i, z) * 0.12;
      const cc = C.setHex(c).multiplyScalar(k).getHex();
      quad([minX, top, z + 4], [minX, top, z], [minX, bot, z], [minX, bot, z + 4], [-1, 0, 0], cc);
      quad([maxX, top, z], [maxX, top, z + 4], [maxX, bot, z + 4], [maxX, bot, z], [1, 0, 0], cc);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
};
