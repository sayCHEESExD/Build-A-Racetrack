import { F_GAP, F_WALL, GROUND_Y, ROAD_HALF, TrackPath, type Piece, type PlotFrame } from '@race/shared';
import { Color } from 'three';
import { MeshBuilder, X, Y, Z, shadeHex } from '../render/MeshBuilder.js';

/**
 * ROAD GEOMETRY, built from the shared `TrackPath` so what is drawn is exactly
 * what the car drives: a chunky studded deck with its kerbs, edge lines and
 * centre dashes painted in as strips of the SAME surface (nothing coplanar,
 * nothing flickers), the piece's own look (rumble strips, boost chevrons,
 * rainbow, gold, a chequered finish, a hazard-striped kicker), barrier walls
 * on the turns and loops, and lavender support pillars down to the grass under
 * anything raised. One vertex-coloured buffer per plot.
 */

/** Half the deck's full width (the kerbs sit outside the drivable half). */
export const DECK_HALF = ROAD_HALF + 0.3;
const DECK_THICK = 0.4;
const ASPHALT = 0x3c4260;
const ASPHALT_DARK = 0x353a55;
const KERB_RED = 0xe8352e;
const KERB_WHITE = 0xf4f4f4;
const LINE_YELLOW = 0xffd23f;
const PILLAR = 0xb9a8ec;
const C = new Color();

/** The lateral strips of the deck: [from, to] across, and what paints them. */
type Paint = (s: number, d: number) => number;

const kerb: Paint = (s) => (Math.floor(s / 0.9) % 2 === 0 ? KERB_RED : KERB_WHITE);
const yellow: Paint = () => LINE_YELLOW;
const dash: Paint = (s) => (Math.floor(s / 1.1) % 2 === 0 ? 0xe9ecf5 : ASPHALT);

/** The surface paint of a piece's middle, by its shape. */
const surface = (k: Piece['k']): Paint => {
  switch (k) {
    case 'bumpy':
      return (s) => (Math.floor(s / 0.5) % 2 === 0 ? 0xe8352e : 0xf4f4f4);
    case 'boost':
      return (s, d) => ((((s - Math.abs(d) * 0.7) % 1.4) + 1.4) % 1.4 < 0.55 ? 0xc6ff4a : 0x2fbf3a);
    case 'rainbow':
      return (s, d) => C.setHSL((((s * 0.06 + d * 0.04) % 1) + 1) % 1, 0.9, 0.58).getHex();
    case 'golden':
      return (s, d) => ((Math.floor(s / 1) + Math.floor((d + 4) / 1)) % 2 === 0 ? 0xffcf3a : 0xffe27a);
    case 'finish':
      return (s, d) => ((Math.floor(s / 0.6) + Math.floor((d + 4) / 0.6)) % 2 === 0 ? 0x1f2230 : 0xf4f4f4);
    case 'loop':
    case 'corkscrew':
      return (s) => (Math.floor(s / 2) % 2 === 0 ? 0x6a3ad8 : 0x5a2fc0);
    case 'mega':
      return () => 0x3a4a7a;
    default:
      return () => ASPHALT;
  }
};

const v = (path: TrackPath, i: number, off: number, lift: number): number[] => [
  path.pos[i * 3]! + path.right[i * 3]! * off + path.up[i * 3]! * lift,
  path.pos[i * 3 + 1]! + path.right[i * 3 + 1]! * off + path.up[i * 3 + 1]! * lift,
  path.pos[i * 3 + 2]! + path.right[i * 3 + 2]! * off + path.up[i * 3 + 2]! * lift,
];

/** Draw one piece. `tint` multiplies every colour (loose / ghost looks). */
export const drawPiece = (b: MeshBuilder, frame: PlotFrame, piece: Piece, tint = 1): void => {
  const path = new TrackPath(frame, [piece], [0]);
  const n = path.count;
  const k = piece.k;
  const mid = surface(k);
  const t = (c: number): number => (tint === 1 ? c : shadeHex(c, tint));
  const W = DECK_HALF;
  const strips: [number, number, Paint][] = [
    [-W, -ROAD_HALF, kerb],
    [-ROAD_HALF, -ROAD_HALF + 0.16, yellow],
    [-ROAD_HALF + 0.16, -0.08, mid],
    [-0.08, 0.08, k === 'straight' || k === 'start' || k === 'climb' || k === 'drop' || k === 'cliff' || k === 'mega' ? dash : mid],
    [0.08, ROAD_HALF - 0.16, mid],
    [ROAD_HALF - 0.16, ROAD_HALF, yellow],
    [ROAD_HALF, W, kerb],
  ];
  // Patterned surfaces need finer columns across.
  const fine = k === 'boost' || k === 'rainbow' || k === 'golden' || k === 'finish';
  const cols: [number, number, Paint][] = [];
  for (const [a, c, p] of strips) {
    const parts = fine && p === mid ? 6 : 1;
    for (let j = 0; j < parts; j += 1) cols.push([a + ((c - a) * j) / parts, a + ((c - a) * (j + 1)) / parts, p]);
  }
  const kick = k === 'jump';
  // Loops and corkscrews are seen from every side: bright purple underneath instead of the dark slab.
  const twisty = k === 'loop' || k === 'corkscrew';
  const sideColor = t(twisty ? 0x8a5ae8 : shadeHex(ASPHALT_DARK, 0.9));
  const underColor = t(twisty ? 0xa77cff : 0x2a2e40);
  for (let i = 0; i < n - 1; i += 1) {
    if ((path.flags[i]! & F_GAP) !== 0 || (path.flags[i + 1]! & F_GAP) !== 0) continue;
    const s = (path.s[i]! + path.s[i + 1]!) / 2;
    const hazard = kick && path.s[i]! < 4.2;
    // Top surface, strip by strip.
    for (const [a, c, p] of cols) {
      let color = p(s, (a + c) / 2);
      if (hazard && p !== kerb) color = Math.floor((s + Math.abs((a + c) / 2)) / 0.6) % 2 === 0 ? 0xffd23f : 0x1f2230;
      b.quad(v(path, i, a, 0), v(path, i, c, 0), v(path, i + 1, c, 0), v(path, i + 1, a, 0), t(color));
    }
    // Sides and the underside of the slab.
    b.quad(v(path, i, W, 0), v(path, i, W, -DECK_THICK), v(path, i + 1, W, -DECK_THICK), v(path, i + 1, W, 0), sideColor);
    b.quad(v(path, i + 1, -W, 0), v(path, i + 1, -W, -DECK_THICK), v(path, i, -W, -DECK_THICK), v(path, i, -W, 0), sideColor);
    b.quad(v(path, i, -W, -DECK_THICK), v(path, i + 1, -W, -DECK_THICK), v(path, i + 1, W, -DECK_THICK), v(path, i, W, -DECK_THICK), underColor);
  }
  // End caps (where the deck stops: a gap, the very end).
  const cap = (i: number, back: boolean): void => {
    const a = v(path, i, -W, 0);
    const c = v(path, i, W, 0);
    const d = v(path, i, W, -DECK_THICK);
    const e = v(path, i, -W, -DECK_THICK);
    if (back) b.quad(c, a, e, d, t(0x2a2e40));
    else b.quad(a, c, d, e, t(0x2a2e40));
  };
  for (let i = 1; i < n; i += 1) {
    const g0 = (path.flags[i - 1]! & F_GAP) !== 0;
    const g1 = (path.flags[i]! & F_GAP) !== 0;
    if (!g0 && g1) cap(i - 1, false);
    if (g0 && !g1) cap(i, true);
  }
  // Barrier walls: turns and loops (red and white blocks along both edges).
  for (let i = 0; i < n - 1; i += 1) {
    if ((path.flags[i]! & F_WALL) === 0) continue;
    const s = path.s[i]!;
    const color = t(Math.floor(s / 1) % 2 === 0 ? KERB_RED : KERB_WHITE);
    for (const side of [-1, 1]) {
      const o0 = side * (W - 0.02);
      const o1 = side * (W - 0.3);
      const h = 0.6;
      const p0 = v(path, i, o0, 0);
      const p1 = v(path, i + 1, o0, 0);
      const q0 = v(path, i, o1, 0);
      const q1 = v(path, i + 1, o1, 0);
      const p0h = v(path, i, o0, h);
      const p1h = v(path, i + 1, o0, h);
      const q0h = v(path, i, o1, h);
      const q1h = v(path, i + 1, o1, h);
      if (side > 0) {
        b.quad(q0, q1, q1h, q0h, color);
        b.quad(p1, p0, p0h, p1h, shadeHex(color, 0.85));
      } else {
        b.quad(q1, q0, q0h, q1h, color);
        b.quad(p0, p1, p1h, p0h, shadeHex(color, 0.85));
      }
      b.quad(q0h, q1h, p1h, p0h, shadeHex(color, 1.05));
    }
  }
  // Supports: chunky lavender pillars from the slab down to the grass, under anything raised.
  const locked = k === 'loop' || k === 'corkscrew';
  let next = 0.8;
  for (let i = 0; i < n; i += 1) {
    if (path.s[i]! < next) continue;
    next = path.s[i]! + 3;
    if ((path.flags[i]! & F_GAP) !== 0) continue;
    const upY = path.up[i * 3 + 1]!;
    if (upY < 0.75) continue;
    const top = path.pos[i * 3 + 1]! - DECK_THICK;
    const h = top - GROUND_Y;
    if (h < 0.5) continue;
    if (locked && path.pos[i * 3 + 1]! - GROUND_Y > 2.2) continue;
    for (const side of [-1, 1]) {
      const px = path.pos[i * 3]! + path.right[i * 3]! * side * (W - 0.55);
      const pz = path.pos[i * 3 + 2]! + path.right[i * 3 + 2]! * side * (W - 0.55);
      b.box(px, GROUND_Y + h / 2, pz, X, Y, Z, 0.32, h / 2, 0.32, t(PILLAR));
      if (h > 2.2) b.box(px, GROUND_Y + h * 0.55, pz, X, Y, Z, 0.36, 0.22, 0.36, t(KERB_RED));
      b.box(px, GROUND_Y + 0.15, pz, X, Y, Z, 0.45, 0.15, 0.45, t(0xe6e2f5));
    }
  }
  if (k === 'start') startGate(b, path, t, 0);
  if (k === 'finish') finishArch(b, path, t);
};

/**
 * The Start Gate's own marks (the big arch is the plot's road-facing entrance,
 * built with the raceway): a raised chequered start line across the deck and
 * a short post with a chequered flag either side.
 */
const startGate = (b: MeshBuilder, path: TrackPath, t: (c: number) => number, _s: number): void => {
  const i = Math.floor(path.count * 0.55);
  const p = [path.pos[i * 3]!, path.pos[i * 3 + 1]!, path.pos[i * 3 + 2]!];
  const r = [path.right[i * 3]!, 0, path.right[i * 3 + 2]!];
  const f = [path.tan[i * 3]!, 0, path.tan[i * 3 + 2]!];
  const G = GROUND_Y;
  const cells = 8;
  const cw = (DECK_HALF * 2 - 0.3) / cells;
  for (let a = 0; a < cells; a += 1) {
    for (let c = 0; c < 2; c += 1) {
      const ox = -DECK_HALF + 0.15 + (a + 0.5) * cw;
      const of = (c - 0.5) * cw;
      b.box(p[0]! + r[0]! * ox + f[0]! * of, p[1]! + 0.03, p[2]! + r[2]! * ox + f[2]! * of, r, Y, f, cw / 2, 0.03, cw / 2, t((a + c) % 2 ? 0xffffff : 0x1f2230));
    }
  }
  for (const side of [-1, 1]) {
    const x = p[0]! + r[0]! * side * (DECK_HALF + 0.35);
    const z = p[2]! + r[2]! * side * (DECK_HALF + 0.35);
    b.box(x, G + 0.2, z, r, Y, f, 0.35, 0.2, 0.35, t(0x9a88d8));
    b.box(x, G + 1.5, z, r, Y, f, 0.07, 1.3, 0.07, t(0x2b2f45));
    for (let a = 0; a < 3; a += 1) {
      for (let c = 0; c < 2; c += 1) {
        const col = (a + c) % 2 === 0 ? 0x1f2230 : 0xffffff;
        b.box(x - f[0]! * (0.22 + a * 0.36), G + 2.55 - c * 0.36, z - f[2]! * (0.22 + a * 0.36), r, Y, f, 0.04, 0.18, 0.18, t(col));
      }
    }
  }
};

/** A Finish Line's chequered banner on two posts. */
const finishArch = (b: MeshBuilder, path: TrackPath, t: (c: number) => number): void => {
  const i = Math.floor(path.count * 0.5);
  const p = [path.pos[i * 3]!, path.pos[i * 3 + 1]!, path.pos[i * 3 + 2]!];
  const r = [path.right[i * 3]!, 0, path.right[i * 3 + 2]!];
  const f = [path.tan[i * 3]!, 0, path.tan[i * 3 + 2]!];
  const W = DECK_HALF + 0.35;
  const base = p[1]!;
  for (const side of [-1, 1]) {
    const x = p[0]! + r[0]! * side * W;
    const z = p[2]! + r[2]! * side * W;
    b.box(x, base + 2, z, r, Y, f, 0.18, 2, 0.18, t(0xf4f4f4));
  }
  for (let a = -6; a < 6; a += 1) {
    for (let c = 0; c < 2; c += 1) {
      const col = (a + c) % 2 === 0 ? 0x1f2230 : 0xffffff;
      b.box(p[0]! + r[0]! * (a + 0.5) * 0.38, base + 3.85 - c * 0.38, p[2]! + r[2]! * (a + 0.5) * 0.38, r, Y, f, 0.19, 0.19, 0.06, t(col));
    }
  }
};

/** A whole plot's track (connected pieces at full colour, any loose ones dimmed). */
export const drawTrack = (frame: PlotFrame, pieces: readonly Piece[], connected: readonly boolean[]): MeshBuilder => {
  const b = new MeshBuilder();
  pieces.forEach((p, i) => drawPiece(b, frame, p, connected[i] === false ? 0.55 : 1));
  return b;
};
