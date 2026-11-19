import { SHAPE_CODES, baseTier, decorByCode, itemOfShape, shapeByCode, type DecorDef, type ShapeKey } from '../config/racetrack.js';
import { GROUND_Y } from '../constants/world.js';
import type { Vec3 } from '../types/math.js';

/**
 * THE TRACK: road pieces on a plot's tile grid, how they join, and the 3D
 * path a car drives along them. Shared, so the server's checks, the client's
 * meshes, the ghost and the car physics all use the same geometry.
 *
 * COORDINATES. Every plot has its own CANONICAL tile grid, PLOT_W x PLOT_L
 * tiles of 4 x 4 units, x = 0 along the main road, z along the road. A plot's
 * frame (`PlotFrame`) turns canonical units into the world (the west plots
 * are the east ones turned half round), so a saved track fits any plot.
 * Directions: 0 +X, 1 +Z, 2 -X, 3 -Z; a piece's `r` is the heading it is
 * entered in, and its "right" is r + 1.
 *
 * LEVELS. Road height is counted in levels of LEVEL_H units. A piece claims,
 * per tile it covers, a span of levels (its deck plus room for a car); two
 * pieces may share a tile only one above the other.
 *
 * SNAPPING. Pieces only ever go onto the GLOWING END of the track (the join
 * after its last piece), so a track is always one connected road from its
 * Start Gate; deleting a piece takes back everything after it too.
 */

export const TILE = 4;
/** Canonical tiles across (away from the road) and along the road. */
export const PLOT_W = 14;
export const PLOT_L = 22;
export const PLOT_UNITS_X = TILE * PLOT_W;
export const PLOT_UNITS_Z = TILE * PLOT_L;
export const LEVEL_H = 1.5;
/** Road surface height at level 0. */
export const TRACK_Y0 = GROUND_Y + 0.35;
/** Half the drivable road width. */
export const ROAD_HALF = 1.75;
/** Decoration cells: 2 x 2 units. */
export const CELL = 2;

/** One placed piece, in its plot's canonical frame. */
export interface Piece {
  k: ShapeKey;
  /** Entry tile. */
  x: number;
  z: number;
  /** Entry level. */
  y: number;
  /** Heading it is entered in (0..3). */
  r: number;
}

/** One placed decoration: code, canonical cell, facing. */
export interface Decor {
  d: number;
  x: number;
  z: number;
  r: number;
}

export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Per-sample flags of a path. */
export const F_GAP = 1;
export const F_WALL = 2;
export const F_LOCK = 4;
export const F_BOOST = 8;
export const F_KICK = 16;
export const F_FINISH = 32;
export const F_BUMPY = 64;
/** Crests here throw the car into the air (the Bump Track); elsewhere it stays on the road. */
export const F_LAUNCH = 128;

interface LocalSample {
  x: number;
  y: number;
  z: number;
  ux: number;
  uy: number;
  uz: number;
  roll: number;
  flags: number;
}

interface Shape {
  tiles: readonly (readonly [number, number])[];
  next: readonly [number, number];
  turn: number;
  dy: number;
  claim: readonly [number, number];
  length: number;
  path(u: number, out: LocalSample): void;
}

const flat = (out: LocalSample, x: number, y: number, z: number, roll = 0, flags = 0): void => {
  out.x = x;
  out.y = y;
  out.z = z;
  out.ux = 0;
  out.uy = 1;
  out.uz = 0;
  out.roll = roll;
  out.flags = flags;
};

/** A ramp's height: eased at both ends so ramps chain smoothly. */
const rampY = (u: number, h: number): number => h * (0.5 * u + 0.5 * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI)));

const straight = (len: number, flags = 0): Shape['path'] => (u, o) => flat(o, len * u, 0, 0, 0, flags);
const bumpy: Shape['path'] = (u, o) => flat(o, TILE * u, 0.09 * Math.abs(Math.sin(5 * Math.PI * u)), 0, 0, F_BUMPY);
const turn = (radius: number, side: 1 | -1, bank: number, rise = 0): Shape['path'] => (u, o) => {
  const t = (u * Math.PI) / 2;
  flat(o, radius * Math.sin(t), rise ? rampY(u, rise) : 0, side * (radius - radius * Math.cos(t)), side * bank * Math.sin(Math.PI * u), F_WALL);
};
const ramp = (levels: number, len = TILE): Shape['path'] => (u, o) => flat(o, len * u, rampY(u, levels * LEVEL_H), 0);

const UTURN_R = 2;
const UTURN_LEN = 2 + Math.PI * UTURN_R + 2;
const uturn = (side: 1 | -1): Shape['path'] => (u, o) => {
  const d = u * UTURN_LEN;
  if (d <= 2) return flat(o, d, 0, 0, 0, F_WALL);
  if (d <= 2 + Math.PI * UTURN_R) {
    const t = (d - 2) / UTURN_R;
    return flat(o, 2 + UTURN_R * Math.sin(t), 0, side * (UTURN_R - UTURN_R * Math.cos(t)), side * 0.2 * Math.sin(t), F_WALL);
  }
  const back = d - 2 - Math.PI * UTURN_R;
  return flat(o, 2 - back, 0, side * 2 * UTURN_R, 0, F_WALL);
};

const swerve = (side: 1 | -1): Shape['path'] => (u, o) => flat(o, 2 * TILE * u, 0, side * TILE * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI)));

const BUMP_H = 0.85;
const bump: Shape['path'] = (u, o) => flat(o, TILE * u, BUMP_H * Math.sin(Math.PI * u) ** 2, 0, 0, F_LAUNCH);

/** Ramp Jump: kicker (first tile), a gap (second), the landing (third). */
const KICK_H = 0.85;
const LAND_H = 1.0;
const jump: Shape['path'] = (u, o) => {
  const x = 3 * TILE * u;
  if (x <= TILE) {
    const t = x / TILE;
    return flat(o, x, KICK_H * t * t, 0, 0, F_KICK);
  }
  if (x < 2 * TILE) {
    // The gap: the line drawn between kicker and landing (no road there).
    const t = (x - TILE) / TILE;
    return flat(o, x, KICK_H + (LAND_H - KICK_H) * t, 0, 0, F_GAP);
  }
  const t = (x - 2 * TILE) / TILE;
  return flat(o, x, LAND_H * (1 - t) * (1 - t), 0);
};

const LOOP_R = 2.8;
const LOOP_SIDE = 4;
const loop: Shape['path'] = (u, o) => {
  const t = 2 * Math.PI * u;
  o.x = 2 * TILE * u + LOOP_R * Math.sin(t);
  o.y = LOOP_R * (1 - Math.cos(t));
  // Up-going and down-going halves pass either side of each other (no self-intersection).
  o.z = LOOP_SIDE * Math.sin(t) * (0.5 - 0.5 * Math.cos(t));
  o.ux = -Math.sin(t);
  o.uy = Math.cos(t);
  o.uz = 0;
  o.roll = 0;
  o.flags = F_LOCK | F_WALL;
};

const SCREW_R = 1.8;
const corkscrew: Shape['path'] = (u, o) => {
  const phi = 2 * Math.PI * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI));
  o.x = 2 * TILE * u;
  o.y = SCREW_R * (1 - Math.cos(phi));
  o.z = -SCREW_R * Math.sin(phi);
  o.ux = 0;
  o.uy = Math.cos(phi);
  o.uz = Math.sin(phi);
  o.roll = 0;
  o.flags = F_LOCK | F_WALL;
};

const SHAPES: Readonly<Record<ShapeKey, Shape>> = {
  start: { tiles: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dy: 0, claim: [0, 3], length: 8, path: straight(8) },
  straight: { tiles: [[0, 0]], next: [1, 0], turn: 0, dy: 0, claim: [0, 1], length: 4, path: straight(4) },
  finish: { tiles: [[0, 0]], next: [1, 0], turn: 0, dy: 0, claim: [0, 3], length: 4, path: straight(4, F_FINISH) },
  rainbow: { tiles: [[0, 0]], next: [1, 0], turn: 0, dy: 0, claim: [0, 1], length: 4, path: straight(4) },
  golden: { tiles: [[0, 0]], next: [1, 0], turn: 0, dy: 0, claim: [0, 1], length: 4, path: straight(4) },
  boost: { tiles: [[0, 0]], next: [1, 0], turn: 0, dy: 0, claim: [0, 1], length: 4, path: straight(4, F_BOOST) },
  bumpy: { tiles: [[0, 0]], next: [1, 0], turn: 0, dy: 0, claim: [0, 1], length: 4, path: bumpy },
  turn_r: { tiles: [[0, 0]], next: [0, 1], turn: 1, dy: 0, claim: [0, 1], length: Math.PI, path: turn(2, 1, 0.18) },
  turn_l: { tiles: [[0, 0]], next: [0, -1], turn: -1, dy: 0, claim: [0, 1], length: Math.PI, path: turn(2, -1, 0.18) },
  uturn_r: { tiles: [[0, 0], [0, 1]], next: [-1, 1], turn: 2, dy: 0, claim: [0, 1], length: UTURN_LEN, path: uturn(1) },
  uturn_l: { tiles: [[0, 0], [0, -1]], next: [-1, -1], turn: 2, dy: 0, claim: [0, 1], length: UTURN_LEN, path: uturn(-1) },
  climb: { tiles: [[0, 0]], next: [1, 0], turn: 0, dy: 1, claim: [0, 2], length: 4.3, path: ramp(1) },
  drop: { tiles: [[0, 0]], next: [1, 0], turn: 0, dy: -1, claim: [-1, 1], length: 4.3, path: ramp(-1) },
  cliff: { tiles: [[0, 0]], next: [1, 0], turn: 0, dy: -2, claim: [-2, 1], length: 5, path: ramp(-2) },
  bump: { tiles: [[0, 0]], next: [1, 0], turn: 0, dy: 0, claim: [0, 2], length: 4.4, path: bump },
  swerve_r: { tiles: [[0, 0], [1, 0], [0, 1], [1, 1]], next: [2, 1], turn: 0, dy: 0, claim: [0, 1], length: 9.1, path: swerve(1) },
  swerve_l: { tiles: [[0, 0], [1, 0], [0, -1], [1, -1]], next: [2, -1], turn: 0, dy: 0, claim: [0, 1], length: 9.1, path: swerve(-1) },
  upturn_r: { tiles: [[0, 0]], next: [0, 1], turn: 1, dy: 1, claim: [0, 2], length: 3.6, path: turn(2, 1, 0.18, LEVEL_H) },
  upturn_l: { tiles: [[0, 0]], next: [0, -1], turn: -1, dy: 1, claim: [0, 2], length: 3.6, path: turn(2, -1, 0.18, LEVEL_H) },
  wide_r: { tiles: [[0, 0], [1, 0], [0, 1], [1, 1]], next: [1, 2], turn: 1, dy: 0, claim: [0, 1], length: 3 * Math.PI, path: turn(6, 1, 0.35) },
  wide_l: { tiles: [[0, 0], [1, 0], [0, -1], [1, -1]], next: [1, -2], turn: -1, dy: 0, claim: [0, 1], length: 3 * Math.PI, path: turn(6, -1, 0.35) },
  jump: { tiles: [[0, 0], [1, 0], [2, 0]], next: [3, 0], turn: 0, dy: 0, claim: [0, 3], length: 12.3, path: jump },
  loop: { tiles: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dy: 0, claim: [0, 5], length: 8 + 2 * Math.PI * LOOP_R, path: loop },
  mega: { tiles: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dy: 3, claim: [0, 4], length: 9.4, path: ramp(3, 2 * TILE) },
  corkscrew: { tiles: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dy: 0, claim: [0, 3], length: 11, path: corkscrew },
};

export const shapeOf = (k: ShapeKey): Shape => SHAPES[k];
export const SHAPE_KEYS = Object.keys(SHAPES) as ShapeKey[];

/**
 * Every Start Gate is here, in every plot's canonical frame: in the middle of
 * the road side, tiles (1, 10) and (1, 11), heading +Z - along the road, just
 * inside the plot's entrance arch (which faces the road). Tile (1, 9) behind
 * it stays free so a circuit can come back into it.
 */
export const START: Piece = { k: 'start', x: 1, z: PLOT_L / 2 - 1, y: 0, r: 1 };
/** The pit lane between the gate and the road: Spawn Car pad under the arch, the Pit Stop beside it (no track there). */
export const PIT_TILES: readonly (readonly [number, number])[] = [
  [0, PLOT_L / 2 - 1],
  [0, PLOT_L / 2],
  [0, PLOT_L / 2 + 1],
];

/** The rows a base tier has open, [first, end): they grow outward either side of the gate. */
export const openRows = (tier: number): [number, number] => {
  const rows = Math.min(PLOT_L, baseTier(tier).rows);
  const lo = Math.floor((PLOT_L - rows) / 2);
  return [lo, lo + rows];
};

// ---------------------------------------------------------------- tiles and joins

const rot = (f: number, s: number, r: number): [number, number] => {
  const a = DIRS[r & 3]!;
  const b = DIRS[(r + 1) & 3]!;
  return [f * a[0] + s * b[0], f * a[1] + s * b[1]];
};

export const pieceTiles = (p: Piece): [number, number][] =>
  SHAPES[p.k].tiles.map(([f, s]) => {
    const [dx, dz] = rot(f, s, p.r);
    return [p.x + dx, p.z + dz];
  });

/** Where the next piece must start to join this one. */
export const pieceNext = (p: Piece): Piece => {
  const sh = SHAPES[p.k];
  const [dx, dz] = rot(sh.next[0], sh.next[1], p.r);
  return { k: 'straight', x: p.x + dx, z: p.z + dz, y: p.y + sh.dy, r: (p.r + sh.turn + 4) & 3 };
};

export const pieceClaim = (p: Piece): [number, number] => {
  const c = SHAPES[p.k].claim;
  return [p.y + c[0], p.y + c[1]];
};

const joins = (next: Piece, p: Piece): boolean => next.x === p.x && next.z === p.z && next.y === p.y && next.r === p.r;

export interface Chain {
  /** Indexes into the piece list, from the Start Gate on. */
  order: number[];
  /** The last piece leads back into the Start Gate: a circuit. */
  closed: boolean;
  connected: boolean[];
  /** Where the next piece joins (null: closed). */
  end: Piece | null;
}

export const traceChain = (pieces: readonly Piece[]): Chain => {
  const connected = pieces.map(() => false);
  const order: number[] = [];
  const start = pieces.findIndex((p) => p.k === 'start');
  if (start < 0) return { order, closed: false, connected, end: null };
  const byTile = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    const key = `${p.x},${p.z}`;
    const list = byTile.get(key);
    if (list) list.push(i);
    else byTile.set(key, [i]);
  });
  let at = start;
  let closed = false;
  for (let guard = 0; guard <= pieces.length; guard += 1) {
    order.push(at);
    connected[at] = true;
    const next = pieceNext(pieces[at]!);
    if (order.length > 1 && joins(next, pieces[start]!)) {
      closed = true;
      break;
    }
    const found = (byTile.get(`${next.x},${next.z}`) ?? []).find((i) => !connected[i] && joins(next, pieces[i]!));
    if (found === undefined) break;
    at = found;
  }
  const last = pieces[order[order.length - 1]!]!;
  return { order, closed, connected, end: closed ? null : pieceNext(last) };
};

// ---------------------------------------------------------------- decorations

/** The cells (2-unit, canonical) a decoration covers. */
export const decorCells = (d: Decor, def: DecorDef | undefined = decorByCode(d.d)): [number, number][] => {
  if (!def) return [];
  const [along, across] = def.size;
  const out: [number, number][] = [];
  for (let f = 0; f < along; f += 1) {
    for (let s = 0; s < across; s += 1) {
      const [dx, dz] = rot(f, s, d.r);
      out.push([d.x + dx, d.z + dz]);
    }
  }
  return out;
};

/** The tile a decoration cell lies in. */
const cellTile = (cx: number, cz: number): [number, number] => [Math.floor((cx * CELL) / TILE), Math.floor((cz * CELL) / TILE)];

/** Is a tile reserved (the pit, the gate's approach)? */
const reservedTile = (x: number, z: number): boolean => PIT_TILES.some(([px, pz]) => px === x && pz === z);

// ---------------------------------------------------------------- rules

export type PlaceRefusal = 'unknown' | 'end' | 'outside' | 'height' | 'overlap' | 'pit' | 'decor' | 'limit' | 'closed';

export const refusalText: Readonly<Record<PlaceRefusal, string>> = {
  unknown: 'That piece does not exist',
  end: 'Pieces snap onto the glowing end of your track',
  outside: 'That would stick out of your plot - upgrade your Base to expand it',
  height: 'Too high! Upgrade your Base to build higher',
  overlap: 'Your track is already there',
  pit: 'Keep the pit lane clear',
  decor: 'A decoration is in the way',
  limit: 'Track length limit reached - upgrade your Base',
  closed: 'Your track is a full circuit already!',
};

/** May this piece go onto this layout as its next piece? null = yes. */
export const checkPlace = (pieces: readonly Piece[], decor: readonly Decor[], p: Piece, tier: number): PlaceRefusal | null => {
  if (!SHAPES[p.k] || p.k === 'start' || ![p.x, p.z, p.y, p.r].every(Number.isInteger) || p.r < 0 || p.r > 3) return 'unknown';
  const t = baseTier(tier);
  const [rowLo, rowHi] = openRows(tier);
  const chain = traceChain(pieces);
  if (!chain.end) return 'closed';
  const e = chain.end;
  if (e.x !== p.x || e.z !== p.z || e.y !== p.y || e.r !== p.r) return 'end';
  if (pieces.length - 1 >= t.length) return 'limit';
  const tiles = pieceTiles(p);
  for (const [x, z] of tiles) if (x < 0 || z < rowLo || x >= PLOT_W || z >= rowHi) return 'outside';
  const sh = SHAPES[p.k];
  const [lo, hi] = pieceClaim(p);
  if (p.y < 0 || p.y + sh.dy < 0 || lo < 0) return 'height';
  if (p.y > t.height || p.y + sh.dy > t.height) return 'height';
  for (const [x, z] of tiles) if (reservedTile(x, z) && lo <= 2) return 'pit';
  for (const other of pieces) {
    const [olo, ohi] = pieceClaim(other);
    if (olo > hi || ohi < lo) continue;
    const theirs = pieceTiles(other);
    for (const [x, z] of tiles) {
      if (!theirs.some(([ox, oz]) => ox === x && oz === z)) continue;
      // Closing the circuit: the last piece may lead into the Start Gate's entry tile only through its join.
      return 'overlap';
    }
  }
  for (const d of decor) {
    const def = decorByCode(d.d);
    if (!def || lo >= (def.flat ? 1 : 4)) continue;
    for (const [cx, cz] of decorCells(d, def)) {
      const [tx, tz] = cellTile(cx, cz);
      if (tiles.some(([x, z]) => x === tx && z === tz)) return 'decor';
    }
  }
  return null;
};

export type DecorRefusal = 'unknown' | 'outside' | 'track' | 'overlap' | 'pit' | 'limit';

export const decorRefusalText: Readonly<Record<DecorRefusal, string>> = {
  unknown: 'That decoration does not exist',
  outside: 'That would stick out of your plot',
  track: 'Your track is in the way',
  overlap: 'Something is already there',
  pit: 'Keep the pit lane clear',
  limit: 'Your plot is full of decorations',
};

export const DECOR_MAX_ON_PLOT = 120;

export const checkDecor = (pieces: readonly Piece[], decor: readonly Decor[], d: Decor, tier: number): DecorRefusal | null => {
  const def = decorByCode(d.d);
  if (!def || ![d.x, d.z, d.r].every(Number.isInteger) || d.r < 0 || d.r > 3) return 'unknown';
  if (decor.length >= DECOR_MAX_ON_PLOT) return 'limit';
  const [rowLo, rowHi] = openRows(tier);
  const cells = decorCells(d, def);
  for (const [cx, cz] of cells) {
    if (cx < 0 || cz < rowLo * 2 || cx >= PLOT_W * 2 || cz >= rowHi * 2) return 'outside';
    const [tx, tz] = cellTile(cx, cz);
    if (reservedTile(tx, tz)) return 'pit';
    for (const p of pieces) {
      const [lo] = pieceClaim(p);
      if (lo >= (def.flat ? 1 : 4)) continue;
      if (pieceTiles(p).some(([x, z]) => x === tx && z === tz)) return 'track';
    }
  }
  for (const o of decor) {
    const theirs = decorCells(o);
    if (cells.some(([x, z]) => theirs.some(([ox, oz]) => ox === x && oz === z))) return 'overlap';
  }
  return null;
};

/** The decoration covering a cell, or -1. */
export const decorAtCell = (decor: readonly Decor[], cx: number, cz: number): number => decor.findIndex((d) => decorCells(d).some(([x, z]) => x === cx && z === cz));

/** The piece covering a tile nearest a level, or -1. Never the Start Gate. */
export const pieceAtTile = (pieces: readonly Piece[], x: number, z: number, level: number): number => {
  let best = -1;
  let bestGap = Infinity;
  pieces.forEach((p, i) => {
    if (p.k === 'start') return;
    if (!pieceTiles(p).some(([tx, tz]) => tx === x && tz === z)) return;
    const [lo, hi] = pieceClaim(p);
    const gap = level < lo ? lo - level : level > hi ? level - hi : 0;
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  return best;
};

// ---------------------------------------------------------------- packing

/** [code, x, z, y, r] per piece. */
export const packPieces = (pieces: readonly Piece[]): number[] => {
  const out: number[] = [];
  for (const p of pieces) out.push(SHAPE_CODES[p.k], p.x, p.z, p.y, p.r);
  return out;
};

export const unpackPieces = (raw: unknown): Piece[] => {
  if (!Array.isArray(raw)) return [];
  const out: Piece[] = [];
  for (let i = 0; i + 4 < raw.length; i += 5) {
    const k = shapeByCode(Number(raw[i]));
    const [x, z, y, r] = [raw[i + 1], raw[i + 2], raw[i + 3], raw[i + 4]].map(Number) as [number, number, number, number];
    if (!k || ![x, z, y, r].every(Number.isInteger)) continue;
    out.push({ k, x, z, y, r: r & 3 });
  }
  return out;
};

/** [code, x, z, r] per decoration. */
export const packDecor = (decor: readonly Decor[]): number[] => {
  const out: number[] = [];
  for (const d of decor) out.push(d.d, d.x, d.z, d.r);
  return out;
};

export const unpackDecor = (raw: unknown): Decor[] => {
  if (!Array.isArray(raw)) return [];
  const out: Decor[] = [];
  for (let i = 0; i + 3 < raw.length; i += 4) {
    const [d, x, z, r] = [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]].map(Number) as [number, number, number, number];
    if (!decorByCode(d) || ![x, z, r].every(Number.isInteger)) continue;
    out.push({ d, x, z, r: r & 3 });
  }
  return out;
};

/**
 * Tracks saved before the Start Gate moved from the plot's corner (tiles
 * (2, 1)-(2, 2), heading +Z) to beside the entrance arch: shifted so they
 * leave the new gate the same way (decorations with them). A track that
 * already joins the gate is returned as it is; what no longer fits the open
 * rows is handed back by the server's `sanitiseTrack`.
 */
export const adoptLayout = (pieces: readonly Piece[], decor: readonly Decor[] = []): { pieces: Piece[]; decor: Decor[] } => {
  const rest = pieces.filter((p) => p.k !== 'start');
  const same = { pieces: [...rest], decor: [...decor] };
  if (rest.length === 0 || traceChain(withStart(rest)).order.length > 1) return same;
  const dx = START.x - 2;
  const dz = START.z - 1;
  const moved = rest.map((p) => ({ ...p, x: p.x + dx, z: p.z + dz }));
  if (traceChain(withStart(moved)).order.length === 1) return same;
  return { pieces: moved, decor: decor.map((d) => ({ ...d, x: d.x + 2 * dx, z: d.z + 2 * dz })) };
};

/** A plot's track as saved / sent: the Start Gate first, always. */
export const withStart = (pieces: readonly Piece[]): Piece[] => [{ ...START }, ...pieces.filter((p) => p.k !== 'start')];

/**
 * Keep only what is one connected road from the gate, in order (saves from
 * elsewhere, hand edits): the rest goes back to the inventory via `dropped`.
 */
export const connectedOnly = (pieces: readonly Piece[]): { kept: Piece[]; dropped: Piece[] } => {
  const all = withStart(pieces);
  const chain = traceChain(all);
  const kept = chain.order.map((i) => all[i]!);
  const dropped = all.filter((_, i) => !chain.connected[i]);
  return { kept, dropped };
};

/** The item key a piece returns to the inventory as. */
export const itemKeyOf = (k: ShapeKey): string | null => itemOfShape(k)?.key ?? null;

// ---------------------------------------------------------------- frames

export interface PlotFrame {
  minX: number;
  minZ: number;
  /** 0: canonical = world axes. 2: turned half round (west plots). */
  rot: 0 | 2;
}

export const toWorld = (f: PlotFrame, cx: number, cz: number): [number, number] =>
  f.rot === 0 ? [f.minX + cx, f.minZ + cz] : [f.minX + PLOT_UNITS_X - cx, f.minZ + PLOT_UNITS_Z - cz];

export const toCanonical = (f: PlotFrame, wx: number, wz: number): [number, number] =>
  f.rot === 0 ? [wx - f.minX, wz - f.minZ] : [f.minX + PLOT_UNITS_X - wx, f.minZ + PLOT_UNITS_Z - wz];

/** World yaw of a canonical heading (0..3) on a plot (yaw: atan2(dx, dz)). */
export const headingYaw = (f: PlotFrame, r: number): number => {
  const [dx, dz] = DIRS[r & 3]!;
  const s = f.rot === 0 ? 1 : -1;
  return Math.atan2(dx * s, dz * s);
};

export const tileCenter = (f: PlotFrame, tx: number, tz: number, level = 0): Vec3 => {
  const [x, z] = toWorld(f, tx * TILE + TILE / 2, tz * TILE + TILE / 2);
  return { x, y: TRACK_Y0 + level * LEVEL_H, z };
};

export const cellCenter = (f: PlotFrame, cx: number, cz: number): Vec3 => {
  const [x, z] = toWorld(f, cx * CELL + CELL / 2, cz * CELL + CELL / 2);
  return { x, y: GROUND_Y, z };
};

const LS: LocalSample = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, roll: 0, flags: 0 };

/** One point of a piece's path in the world. Returns the roll; `flags` gets the sample flags. */
export const piecePoint = (f: PlotFrame, p: Piece, u: number, pos: Vec3, up: Vec3, flags?: { v: number }): number => {
  SHAPES[p.k].path(u, LS);
  const a = DIRS[p.r]!;
  const b = DIRS[(p.r + 1) & 3]!;
  const ex = p.x * TILE + TILE / 2 - (a[0] * TILE) / 2;
  const ez = p.z * TILE + TILE / 2 - (a[1] * TILE) / 2;
  const cx = ex + LS.x * a[0] + LS.z * b[0];
  const cz = ez + LS.x * a[1] + LS.z * b[1];
  const [wx, wz] = toWorld(f, cx, cz);
  pos.x = wx;
  pos.y = TRACK_Y0 + p.y * LEVEL_H + LS.y;
  pos.z = wz;
  const sign = f.rot === 0 ? 1 : -1;
  up.x = sign * (LS.ux * a[0] + LS.uz * b[0]);
  up.y = LS.uy;
  up.z = sign * (LS.ux * a[1] + LS.uz * b[1]);
  if (flags) flags.v = LS.flags;
  return LS.roll;
};

export const samplesOf = (k: ShapeKey): number => Math.max(8, Math.ceil(SHAPES[k].length / 0.35));

/**
 * A SAMPLED PATH through some pieces: positions, tangents, ups (banked,
 * square to the tangent), rights, distance along, flags, and which piece each
 * sample is on. The car drives along it; the road meshes are built from it.
 */
export class TrackPath {
  readonly pos: Float32Array;
  readonly up: Float32Array;
  readonly tan: Float32Array;
  readonly right: Float32Array;
  readonly s: Float32Array;
  readonly flags: Uint8Array;
  readonly piece: Int16Array;
  readonly count: number;
  readonly length: number;
  private grid: Map<number, number[]> | null = null;

  constructor(f: PlotFrame, pieces: readonly Piece[], order: readonly number[]) {
    let n = 1;
    for (const i of order) n += samplesOf(pieces[i]!.k);
    this.pos = new Float32Array(n * 3);
    this.up = new Float32Array(n * 3);
    this.tan = new Float32Array(n * 3);
    this.right = new Float32Array(n * 3);
    this.s = new Float32Array(n);
    this.flags = new Uint8Array(n);
    this.piece = new Int16Array(n);
    const rolls = new Float32Array(n);
    const pos: Vec3 = { x: 0, y: 0, z: 0 };
    const up: Vec3 = { x: 0, y: 1, z: 0 };
    const fl = { v: 0 };
    let k = 0;
    const push = (index: number, u: number): void => {
      rolls[k] = piecePoint(f, pieces[index]!, u, pos, up, fl);
      this.pos[k * 3] = pos.x;
      this.pos[k * 3 + 1] = pos.y;
      this.pos[k * 3 + 2] = pos.z;
      this.up[k * 3] = up.x;
      this.up[k * 3 + 1] = up.y;
      this.up[k * 3 + 2] = up.z;
      this.flags[k] = fl.v;
      this.piece[k] = index;
      k += 1;
    };
    for (const i of order) {
      const m = samplesOf(pieces[i]!.k);
      for (let j = 0; j < m; j += 1) push(i, j / m);
    }
    if (order.length > 0) push(order[order.length - 1]!, 1);
    this.count = k;
    let total = 0;
    for (let i = 0; i < k; i += 1) {
      if (i > 0) total += Math.hypot(this.pos[i * 3]! - this.pos[i * 3 - 3]!, this.pos[i * 3 + 1]! - this.pos[i * 3 - 2]!, this.pos[i * 3 + 2]! - this.pos[i * 3 - 1]!);
      this.s[i] = total;
      const a = Math.max(0, i - 1);
      const b = Math.min(k - 1, i + 1);
      let tx = this.pos[b * 3]! - this.pos[a * 3]!;
      let ty = this.pos[b * 3 + 1]! - this.pos[a * 3 + 1]!;
      let tz = this.pos[b * 3 + 2]! - this.pos[a * 3 + 2]!;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      this.tan[i * 3] = tx;
      this.tan[i * 3 + 1] = ty;
      this.tan[i * 3 + 2] = tz;
      let ux = this.up[i * 3]!;
      let uy = this.up[i * 3 + 1]!;
      let uz = this.up[i * 3 + 2]!;
      const d = ux * tx + uy * ty + uz * tz;
      ux -= d * tx;
      uy -= d * ty;
      uz -= d * tz;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul;
      uy /= ul;
      uz /= ul;
      // right = tangent x up
      let rx = ty * uz - tz * uy;
      let ry = tz * ux - tx * uz;
      let rz = tx * uy - ty * ux;
      const roll = rolls[i]!;
      if (roll !== 0) {
        const c = Math.cos(roll);
        const sn = Math.sin(roll);
        const nux = ux * c + rx * sn;
        const nuy = uy * c + ry * sn;
        const nuz = uz * c + rz * sn;
        ux = nux;
        uy = nuy;
        uz = nuz;
        rx = ty * uz - tz * uy;
        ry = tz * ux - tx * uz;
        rz = tx * uy - ty * ux;
      }
      this.up[i * 3] = ux;
      this.up[i * 3 + 1] = uy;
      this.up[i * 3 + 2] = uz;
      this.right[i * 3] = rx;
      this.right[i * 3 + 1] = ry;
      this.right[i * 3 + 2] = rz;
    }
    this.length = total;
  }

  indexAt(s: number): number {
    let lo = 0;
    let hi = this.count - 1;
    if (s <= 0) return 0;
    if (s >= this.length) return Math.max(0, hi - 1);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.s[mid]! <= s) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Position, tangent, up and right at distance s (interpolated). Returns the piece index there. */
  at(s: number, pos: Vec3, tan?: Vec3, up?: Vec3, right?: Vec3): number {
    if (this.count === 0) return -1;
    const i = this.indexAt(s);
    const j = Math.min(this.count - 1, i + 1);
    const span = this.s[j]! - this.s[i]!;
    const t = span > 0 ? Math.max(0, Math.min(1, (s - this.s[i]!) / span)) : 0;
    const lerp = (arr: Float32Array, c: number): number => arr[i * 3 + c]! + (arr[j * 3 + c]! - arr[i * 3 + c]!) * t;
    pos.x = lerp(this.pos, 0);
    pos.y = lerp(this.pos, 1);
    pos.z = lerp(this.pos, 2);
    if (tan) {
      tan.x = lerp(this.tan, 0);
      tan.y = lerp(this.tan, 1);
      tan.z = lerp(this.tan, 2);
    }
    if (up) {
      up.x = lerp(this.up, 0);
      up.y = lerp(this.up, 1);
      up.z = lerp(this.up, 2);
    }
    if (right) {
      right.x = lerp(this.right, 0);
      right.y = lerp(this.right, 1);
      right.z = lerp(this.right, 2);
    }
    return this.piece[t < 0.5 ? i : j]!;
  }

  /** Flags at distance s. */
  flagsAt(s: number): number {
    return this.flags[this.indexAt(s)]!;
  }

  /** Samples near a world point (within ~2 units horizontally), for landings. */
  near(x: number, z: number): readonly number[] {
    if (!this.grid) {
      this.grid = new Map();
      for (let i = 0; i < this.count; i += 1) {
        const key = cellKey(Math.floor(this.pos[i * 3]! / 2), Math.floor(this.pos[i * 3 + 2]! / 2));
        const list = this.grid.get(key);
        if (list) list.push(i);
        else this.grid.set(key, [i]);
      }
    }
    const gx = Math.floor(x / 2);
    const gz = Math.floor(z / 2);
    const out: number[] = [];
    for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const list = this.grid.get(cellKey(gx + dx, gz + dz));
      if (list) for (const i of list) out.push(i);
    }
    return out;
  }

  /** Distance along the path where piece `index` starts (first sample on it), -1 if absent. */
  pieceStart(index: number): number {
    for (let i = 0; i < this.count; i += 1) if (this.piece[i] === index) return this.s[i]!;
    return -1;
  }
}

const cellKey = (x: number, z: number): number => (x + 4096) * 8192 + (z + 4096);

// ---------------------------------------------------------------- driving physics constants

export const DRIVE = {
  /** Gravity for cars (arcade-strong so jumps feel snappy). */
  gravity: 30,
  /** Rolling drag, per second (fraction of speed). */
  drag: 0.35,
  /** Braking deceleration. */
  brake: 34,
  /** Most reverse speed. */
  reverse: 6,
  /** Through loops and corkscrews the car never drops below this. */
  lockSpeed: 15,
  /** A Ramp Jump's kicker settles the car to this speed range. */
  kickMin: 15.5,
  kickMax: 16.5,
  /** Boost pads push this hard, up to boostTop x the car's top speed. */
  boost: 60,
  boostTop: 1.45,
  /** Lateral grip (units / s^2 per handling) before the car slides outward on a turn. */
  grip: 55,
  /** Side-steer speed (units / s) at full lock, per handling. */
  steer: 6.5,
  /** Hitting the ground faster than this (down) is a crash; landing on road faster than this hurts. */
  hardLanding: 16,
} as const;

export const isLockedShape = (k: ShapeKey): boolean => k === 'loop' || k === 'corkscrew';
