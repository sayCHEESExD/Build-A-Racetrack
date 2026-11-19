import { GROUND_Y, type ShopSpot } from '@race/shared';
import { ConeGeometry, CylinderGeometry, SphereGeometry, type Group } from 'three';
import type { PartBuilder, PartKind, Transform } from '../render/PartBuilder.js';
import { flowers, seeded, shade } from './Nature.js';
import { signBoard } from './signs.js';

/**
 * THE THREE SHOPS by the tunnel, each built around what it sells, in the
 * same studded plastic as everything else. Every one keeps the same working
 * footprint (the world's solids in `SCENERY_SOLIDS`): a counter across the
 * front at z + 1.5, the shopkeeper behind it at z - 0.6, a back wall at
 * z - 3 and the building behind that; customers stand in front (z + 3).
 *
 *   TRACK WORKS  - a track-builder's depot: corrugated workshop, hazard-striped
 *                  counter, road pieces on show, a red-and-white loop on the
 *                  roof, a little crane lowering a road piece, cones and tyres.
 *   DECORS       - a garden boutique: lavender cottage with a peaked roof,
 *                  scalloped awning, flower boxes, topiary, string lights,
 *                  balloons and a giant flower on the roof.
 *   CRATES       - a loot vault: riveted steel, a big round vault door,
 *                  rarity-coloured crates stacked high, a glowing mystery
 *                  crate on the roof with spotlights on it.
 */

const G = GROUND_Y;
const HAZARD_Y = 0xffd23f;
const HAZARD_K = 0x22242e;
const KERB_RED = 0xe8352e;
const WHITE = 0xf4f4f4;

const cyl = (rt: number, rb: number, h: number, n = 10): CylinderGeometry => new CylinderGeometry(rt, rb, h, n);
const ball = (r: number, n = 8): SphereGeometry => new SphereGeometry(r, n, Math.max(4, Math.round(n * 0.7)));

/** Local placement helper: offsets from the shop's spot, y above the ground. */
const at =
  (s: ShopSpot) =>
  (dx: number, y: number, dz: number, more: Transform = {}): Transform => ({ ...more, x: s.x + dx, y: G + y, z: s.z + dz });

/** A row of alternating blocks along x (hazard stripes, kerbs, scallops). */
const stripes = (b: PartBuilder, s: ShopSpot, x0: number, x1: number, y: number, z: number, h: number, d: number, n: number, a: number, c: number, kind: PartKind = 'smooth'): void => {
  const P = at(s);
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i += 1) b.box(w, h, d, i % 2 ? c : a, kind, P(x0 + (i + 0.5) * w, y, z));
};

const cone = (b: PartBuilder, x: number, z: number, s = 1): void => {
  b.box(0.7 * s, 0.1 * s, 0.7 * s, 0x2b2f45, 'flat', { x, y: G + 0.05 * s, z });
  b.add(new ConeGeometry(0.28 * s, 0.85 * s, 10), 0xff7a1a, 'smooth', { x, y: G + 0.5 * s, z });
  b.add(cyl(0.17 * s, 0.21 * s, 0.14 * s, 10), WHITE, 'smooth', { x, y: G + 0.48 * s, z });
};

const tyres = (b: PartBuilder, x: number, z: number, n: number, ring = KERB_RED): void => {
  for (let j = 0; j < n; j += 1) {
    b.add(cyl(0.5, 0.5, 0.36, 12), 0x2b2f45, 'flat', { x, y: G + 0.19 + j * 0.37, z });
    b.add(cyl(0.51, 0.51, 0.08, 12), j % 2 ? WHITE : ring, 'smooth', { x, y: G + 0.19 + j * 0.37, z });
  }
};

/** A little road piece: deck, yellow centre line, red and white kerbs (track samples, the crane's load). */
const roadPiece = (b: PartBuilder, x: number, y: number, z: number, len: number, ry: number, w = 1.2): void => {
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  b.box(w, 0.16, len, 0x3c4260, 'stud', { x, y, z, ry });
  b.box(0.08, 0.04, len * 0.8, HAZARD_Y, 'smooth', { x, y: y + 0.1, z, ry });
  const k = Math.max(2, Math.round(len / 0.4));
  for (const side of [-1, 1]) {
    for (let i = 0; i < k; i += 1) {
      const t = -len / 2 + (i + 0.5) * (len / k);
      const ox = side * (w / 2 - 0.06);
      b.box(0.14, 0.08, len / k, i % 2 ? WHITE : KERB_RED, 'smooth', { x: x + ox * c + t * sn, y: y + 0.11, z: z - ox * sn + t * c, ry });
    }
  }
};

// ---------------------------------------------------------------- TRACK WORKS

const trackShop = (b: PartBuilder, s: ShopSpot): void => {
  const P = at(s);
  const W = 6.5;
  const WALL = 0x3c4a6e;
  const RIB = 0x4f5f88;
  const GREEN = s.colors[0];
  // Concrete apron and the workshop body behind the back wall.
  b.box(W * 2 + 2, 0.24, 14, 0xb8bccc, 'stud', P(0, 0.12, -3.2));
  b.box(W * 2, 7.2, 7, WALL, 'stud', P(0, 3.6, -6.5));
  // Corrugated ribs down the walls (back, both sides).
  for (let i = 0; i <= 12; i += 1) b.box(0.18, 7.2, 0.2, RIB, 'smooth', P(-W + 0.3 + i * ((W * 2 - 0.6) / 12), 3.6, -2.95));
  for (const sx of [-1, 1]) {
    b.box(0.5, 6.2, 4.05, WALL, 'stud', P(sx * (W - 0.27), 3.1, -0.925));
    for (let i = 0; i < 5; i += 1) b.box(0.12, 6.2, 0.18, RIB, 'smooth', P(sx * (W + 0.02), 3.1, -2.8 + i * 1.0));
  }
  // A roll-up garage door on the back wall, half open, the workshop lit inside.
  b.box(5.2, 2.2, 0.12, 0xfff0b0, 'glow', P(-2.6, 1.15, -2.82));
  for (let i = 0; i < 6; i += 1) b.box(5.4, 0.36, 0.16, i % 2 ? 0xa8b0c8 : 0x8a94b0, 'smooth', P(-2.6, 2.5 + i * 0.36, -2.78));
  b.box(5.8, 0.3, 0.3, HAZARD_K, 'flat', P(-2.6, 4.75, -2.78));
  // A tool wall beside it: pegboard with a wrench, a hammer and a coil of hose.
  b.box(3.6, 2.6, 0.12, 0xd8b07a, 'stud', P(3.2, 2.4, -2.82));
  b.box(0.25, 1.3, 0.1, 0xa8b4c8, 'smooth', P(2.3, 2.6, -2.72, { rz: 0.3 }));
  b.box(0.2, 1.1, 0.1, 0x8a5428, 'smooth', P(3.2, 2.4, -2.72, { rz: -0.2 }));
  b.box(0.6, 0.35, 0.12, 0x5a6070, 'smooth', P(3.25, 2.95, -2.7, { rz: -0.2 }));
  b.add(new CylinderGeometry(0.55, 0.55, 0.16, 14, 1, true), 0x58d36a, 'smooth', P(4.2, 2.3, -2.7, { rx: Math.PI / 2 }));
  // Roof: a flat slab with a hazard-striped front edge, green trim.
  b.box(W * 2 + 0.8, 0.4, 9.2, 0x2b3350, 'stud', P(0, 7.4, -5.5));
  b.box(W * 2 + 0.8, 0.5, 4.8, 0x2b3350, 'stud', P(0, 6.45, -0.6));
  stripes(b, s, -W - 0.4, W + 0.4, 6.45, 1.86, 0.5, 0.14, 14, HAZARD_Y, HAZARD_K);
  b.box(W * 2 + 1, 0.2, 0.3, GREEN, 'smooth', P(0, 6.8, 1.85));
  // Posts at the front corners (green, studded) and the counter with a hazard band and a road-paint top.
  // Corner posts a touch wider than the walls' line, so no face of theirs shares a plane with a wall's.
  for (const sx of [-1, 1]) b.box(0.9, 6.2, 0.8, GREEN, 'stud', P(sx * (W - 0.4), 3.1, 1.5));
  b.box(W * 2 - 1.6, 1.0, 1.2, 0x5a6070, 'stud', P(0, 0.5, 1.5));
  stripes(b, s, -W + 0.8, W - 0.8, 0.62, 2.12, 0.32, 0.06, 16, HAZARD_Y, HAZARD_K);
  b.box(W * 2 - 1.2, 0.2, 1.5, 0x3c4260, 'stud', P(0, 1.1, 1.5));
  b.box(W * 2 - 1.4, 0.04, 0.08, WHITE, 'smooth', P(0, 1.22, 1.5));
  // Road pieces on show on the counter: a straight, a ramp and a curve.
  roadPiece(b, s.x - 3.6, G + 1.32, s.z + 1.5, 1.4, Math.PI / 2 + 0.15, 0.9);
  b.box(0.9, 0.14, 1.4, 0x3c4260, 'stud', P(0, 1.45, 1.5, { ry: Math.PI / 2, rx: -0.25 }));
  b.box(0.1, 0.05, 1.1, HAZARD_Y, 'smooth', P(0, 1.55, 1.5, { ry: Math.PI / 2, rx: -0.25 }));
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 4) * (Math.PI / 2);
    b.box(0.9, 0.16, 0.36, i % 2 ? 0x3c4260 : 0x48507a, 'stud', P(3.0 + Math.sin(a) * 0.9, 1.3, 1.9 - Math.cos(a) * 0.9 + 0.2, { ry: a }));
  }
  // THE LOOP on the roof: red and white kerb blocks round a ring, a little car riding it.
  const R = 2.3;
  const LY = 9.2;
  const N = 20;
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    b.box(0.95, 0.36, 1.2, i % 2 ? WHITE : KERB_RED, 'stud', P(-2.4 + Math.sin(a) * R, LY + R + 0.2 - Math.cos(a) * R, -5.5, { rz: -a }));
  }
  // Up on a stand so it shows over the sign: two legs and a deck.
  for (const dx of [-0.9, 0.9]) b.box(0.4, LY - 7.6, 0.4, 0x5a6070, 'smooth', P(-2.4 + dx, (LY + 7.6) / 2, -5.5));
  b.box(2.6, 0.3, 1.5, 0x5a6070, 'stud', P(-2.4, LY, -5.5));
  b.box(0.7, 0.36, 0.5, 0x3fa2ff, 'stud', P(-2.4 + Math.sin(2.2) * (R - 0.45), LY + R + 0.2 - Math.cos(2.2) * (R - 0.45), -5.5, { rz: -2.2 }));
  // A ramp up to the roof edge beside it.
  b.box(1.4, 0.24, 3.6, 0x3c4260, 'stud', P(3.2, 8.4, -5.0, { rx: 0.42 }));
  stripes(b, s, 2.5, 3.9, 9.25, -6.55, 0.18, 0.4, 4, KERB_RED, WHITE);
  // The crane: a yellow lattice mast at the side, its jib out front, a road piece hanging on cables.
  const cx = W + 1.6;
  b.box(1.4, 0.4, 1.4, 0x5a6070, 'stud', P(cx, 0.2, -1.5));
  for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]] as const) b.box(0.16, 10, 0.16, HAZARD_Y, 'smooth', P(cx + dx, 5.2, -1.5 + dz));
  for (let y = 1; y < 10; y += 1.2) {
    b.box(0.95, 0.1, 0.1, HAZARD_Y, 'smooth', P(cx, y, -1.1, { rz: y % 2.4 < 1.2 ? 0.7 : -0.7 }));
    b.box(0.1, 0.1, 0.95, HAZARD_Y, 'smooth', P(cx + 0.4, y, -1.5, { rx: y % 2.4 < 1.2 ? 0.7 : -0.7 }));
  }
  b.box(0.6, 0.5, 6.4, HAZARD_Y, 'stud', P(cx, 10.4, 0.6));
  b.box(1.0, 0.8, 1.2, 0x5a6070, 'stud', P(cx, 10.2, -2.4));
  b.box(0.7, 0.6, 0.9, 0x8ad8ff, 'glow', P(cx, 9.6, -1.5));
  for (const dz of [2.4, 3.4]) b.box(0.05, 3.2, 0.05, 0x2b2f45, 'flat', P(cx, 8.6, dz));
  b.box(0.5, 0.3, 1.4, HAZARD_K, 'flat', P(cx, 7.0, 2.9));
  roadPiece(b, s.x + cx, G + 6.7, s.z + 2.9, 2.2, 0.15, 1.3);
  // Cones, tyre stacks, a striped barrier on the apron.
  cone(b, s.x - W - 0.4, s.z + 3.4);
  cone(b, s.x - W + 0.6, s.z + 4.0, 0.8);
  cone(b, s.x + W - 0.6, s.z + 3.6, 0.9);
  tyres(b, s.x - W - 1.2, s.z - 1.5, 3);
  tyres(b, s.x - W - 1.2, s.z - 0.4, 2, 0x58d36a);
  for (const sx of [-0.9, 0.9]) b.box(0.12, 1.0, 0.5, WHITE, 'smooth', P(-W - 1.2 + sx, 0.5, 2.0, { rx: 0.25 }));
  stripes(b, s, -W - 2.2, -W - 0.2, 0.95, 2.0, 0.3, 0.12, 6, KERB_RED, WHITE);
  // Floodlights on the roof's front corners.
  for (const sx of [-1, 1]) {
    b.box(0.2, 1.4, 0.2, 0x2b2f45, 'flat', P(sx * (W - 0.2), 7.4, 1.4));
    b.box(0.7, 0.45, 0.4, 0x2b2f45, 'smooth', P(sx * (W - 0.2), 8.1, 1.5, { rx: 0.5 }));
    b.box(0.55, 0.32, 0.06, 0xfff4b0, 'glow', P(sx * (W - 0.2), 8.0, 1.72, { rx: 0.5 }));
  }
};

// ---------------------------------------------------------------- DECORS

const decorShop = (b: PartBuilder, s: ShopSpot): void => {
  const P = at(s);
  const r = seeded(424242);
  const W = 5.8;
  const WALL = 0xd8c8ff;
  const TRIM = WHITE;
  const ROOF = 0xff8ab8;
  const [YEL, LAV] = s.colors;
  // Garden path and a cottage body behind the back wall.
  b.box(W * 2 + 1, 0.22, 13, 0xe4dfd2, 'stud', P(0, 0.11, -3.2));
  b.box(W * 2, 5.8, 6.4, WALL, 'stud', P(0, 2.9, -6.2));
  for (const sx of [-1, 1]) b.box(0.45, 5.2, 4.1, WALL, 'stud', P(sx * (W - 0.245), 2.6, -0.9));
  // White corner boards and a skirting.
  for (const sx of [-1, 1]) for (const dz of [1.5, -9.3]) b.box(0.5, 5.8, 0.5, TRIM, 'smooth', P(sx * (W - 0.1), 2.9, dz));
  b.box(W * 2 + 0.3, 0.5, 0.3, TRIM, 'smooth', P(0, 0.25, -2.95));
  // Back wall inside: shelves of little wares (pots, lamps, gnomes).
  for (const y of [1.4, 2.6, 3.8]) {
    b.box(W * 2 - 1.6, 0.14, 0.6, 0xc8955a, 'smooth', P(0, y, -2.6));
    for (let i = 0; i < 6; i += 1) {
      const x = -W + 1.6 + i * ((W * 2 - 3.2) / 5);
      const c = [0xff7a1a, 0x58d36a, 0x3fa2ff, 0xff5a8a, YEL, 0xb15cff][(i + Math.round(y)) % 6]!;
      if ((i + Math.round(y)) % 3 === 0) b.add(cyl(0.18, 0.13, 0.32, 8), c, 'smooth', P(x, y + 0.23, -2.6));
      else if ((i + Math.round(y)) % 3 === 1) b.add(ball(0.2), c, 'smooth', P(x, y + 0.27, -2.6));
      else b.add(new ConeGeometry(0.16, 0.42, 8), c, 'smooth', P(x, y + 0.28, -2.6));
    }
  }
  // Round windows on the sides with flower boxes under them.
  for (const sx of [-1, 1]) {
    b.add(cyl(0.7, 0.7, 0.12, 14), TRIM, 'smooth', P(sx * (W + 0.02), 3.2, -5.6, { rz: Math.PI / 2 }));
    b.add(cyl(0.55, 0.55, 0.14, 14), 0x8ad8ff, 'glow', P(sx * (W + 0.04), 3.2, -5.6, { rz: Math.PI / 2 }));
    b.box(0.6, 0.4, 1.8, 0x8a5428, 'stud', P(sx * (W + 0.3), 2.2, -5.6));
    flowers(b, r, s.x + sx * (W + 0.3), G + 2.4, s.z - 5.6, 0.5);
  }
  // A peaked roof: two pink slopes, a white ridge and a chimney.
  const slope = 0.5;
  for (const sx of [-1, 1]) b.box(W + 0.9, 0.36, 11.4, ROOF, 'stud', P(sx * (W / 2 + 0.15), 5.8 + Math.tan(slope) * (W / 2) - 0.15, -3.9, { rz: -sx * slope }));
  b.box(0.5, 0.5, 11.6, TRIM, 'smooth', P(0, 5.8 + Math.tan(slope) * W + 0.05, -3.9));
  b.box(0.9, 1.6, 0.9, 0xc85a5a, 'stud', P(2.6, 7.6, -7.2));
  b.box(1.1, 0.25, 1.1, 0x8a3a3a, 'smooth', P(2.6, 8.45, -7.2));
  // A gable over the front, its painted triangle filled in.
  for (let i = 0; i < 5; i += 1) {
    b.box((5 - i) * 2.2 - 0.4, 0.55, 0.3, WALL, 'stud', P(0, 5.95 + i * 0.55, 1.4));
    if (i === 0) b.box(W * 2 - 0.2, 0.18, 0.34, TRIM, 'smooth', P(0, 5.75, 1.45));
  }
  b.add(cyl(0.55, 0.55, 0.12, 14), TRIM, 'smooth', P(0, 7.95, 1.6, { rx: Math.PI / 2 }));
  b.add(cyl(0.42, 0.42, 0.14, 14), YEL, 'glow', P(0, 7.95, 1.62, { rx: Math.PI / 2 }));
  // Scalloped awning: yellow and white bands, round drops along the edge.
  for (let i = 0; i < 10; i += 1) {
    const x = -W + 0.6 + (i + 0.5) * ((W * 2 - 1.2) / 10);
    const c = i % 2 ? TRIM : YEL;
    b.box((W * 2 - 1.2) / 10, 0.2, 2.4, c, 'smooth', P(x, 5.1, 2.0, { rx: 0.35 }));
    b.add(cyl(0.53, 0.53, 0.2, 10), c, 'smooth', P(x, 4.65, 3.1, { rx: Math.PI / 2 }));
  }
  // Posts (white, a green vine curling up each) and the counter: a planter box full of flowers.
  for (const sx of [-1, 1]) {
    b.box(0.7, 5, 0.6, TRIM, 'smooth', P(sx * (W - 0.3), 2.5, 1.5));
    for (let i = 0; i < 6; i += 1) b.add(ball(0.22, 6), 0x4ed838, 'leaf', P(sx * (W - 0.3) + Math.sin(i * 1.9) * 0.34, 0.6 + i * 0.75, 1.5 + Math.cos(i * 1.9) * 0.34));
  }
  b.box(W * 2 - 1.2, 1.0, 1.2, 0x8a5428, 'stud', P(0, 0.5, 1.5));
  b.box(W * 2 - 0.9, 0.18, 1.45, 0xc8955a, 'smooth', P(0, 1.08, 1.5));
  for (let i = 0; i < 5; i += 1) flowers(b, r, s.x - W + 1.4 + i * ((W * 2 - 2.8) / 4), G + 0.9, s.z + 2.25, 0.55);
  // On the counter: a potted palm, a lamp, a gnome.
  b.add(cyl(0.3, 0.22, 0.45, 10), 0xff7a1a, 'smooth', P(-3.3, 1.4, 1.5));
  b.add(ball(0.45, 8), 0x4ed838, 'leaf', P(-3.3, 2.0, 1.5));
  b.add(cyl(0.05, 0.08, 0.9, 6), 0x2b2f45, 'smooth', P(0.4, 1.62, 1.5));
  b.add(new ConeGeometry(0.34, 0.4, 10, 1, true), LAV, 'smooth', P(0.4, 2.15, 1.5));
  b.add(ball(0.14), 0xfff4b0, 'glow', P(0.4, 2.0, 1.5));
  b.add(cyl(0.22, 0.26, 0.4, 8), 0x3fa2ff, 'smooth', P(3.2, 1.38, 1.5));
  b.add(ball(0.2), 0xf0c9a4, 'smooth', P(3.2, 1.72, 1.5));
  b.add(ball(0.12), WHITE, 'smooth', P(3.2, 1.58, 1.66));
  b.add(new ConeGeometry(0.22, 0.5, 8), KERB_RED, 'smooth', P(3.2, 2.08, 1.5));
  // Topiary balls in pots either side of the front.
  for (const sx of [-1, 1]) {
    b.add(cyl(0.55, 0.42, 0.8, 12), 0xc85a5a, 'stud', P(sx * (W + 1.1), 0.4, 2.6));
    b.add(cyl(0.06, 0.06, 1.0, 6), 0x6a4020, 'smooth', P(sx * (W + 1.1), 1.2, 2.6));
    b.add(ball(0.75, 10), 0x3cc52a, 'leaf', P(sx * (W + 1.1), 2.1, 2.6));
    b.add(ball(0.45, 8), 0x4ed838, 'leaf', P(sx * (W + 1.1), 3.0, 2.6));
  }
  // String lights from post to post, sagging, every bulb its own colour.
  const bulbs = [0xff5a8a, YEL, 0x58d36a, 0x3fa2ff, 0xb15cff];
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14;
    b.add(ball(0.11, 6), bulbs[i % bulbs.length]!, 'glow', P(-W + 0.3 + t * (W * 2 - 0.6), 4.15 - Math.sin(t * Math.PI) * 0.55, 3.25));
  }
  // Balloons tied to the right post.
  const balloon = [0xff5a8a, 0x3fa2ff, YEL, 0xb15cff];
  balloon.forEach((c, i) => {
    const a = -0.5 + i * 0.35;
    b.add(cyl(0.015, 0.015, 2.4, 4), WHITE, 'smooth', P(W + 0.0 + Math.sin(a) * 0.6, 6.0, 1.5 + Math.cos(a) * 0.2, { rz: -a * 0.5 }));
    b.add(ball(0.42, 10), c, 'smooth', P(W + Math.sin(a) * 1.2, 7.3 + (i % 2) * 0.4, 1.5 + Math.cos(a) * 0.3, { sy: 1.2 }));
  });
  // A giant flower on the ridge: stem, leaves, petals round a yellow heart.
  b.add(cyl(0.14, 0.18, 2.4, 8), 0x3cc52a, 'smooth', P(-1.6, 9.2, -3.0));
  b.box(0.9, 0.12, 0.4, 0x4ed838, 'leaf', P(-1.2, 8.8, -3.0, { rz: 0.5 }));
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    b.add(ball(0.42, 8), i % 2 ? 0xff8ad8 : 0xff5a8a, 'smooth', P(-1.6 + Math.cos(a) * 0.62, 10.6 + Math.sin(a) * 0.62, -2.95));
  }
  b.add(ball(0.38, 10), YEL, 'glow', P(-1.6, 10.6, -2.8));
};

// ---------------------------------------------------------------- CRATES

/** A crate: planked faces, a darker frame on its edges, a glowing band for the rarer ones. */
const crate = (b: PartBuilder, x: number, y: number, z: number, size: number, color: number, ry = 0, glow = 0): void => {
  // No two faces share a plane (that is what flickered): the planked body is set IN from the frame, the
  // frame's posts and rails are one colour where they overlap, and the glow band stands well proud.
  const e = size * 0.12;
  const inset = Math.max(0.04, size * 0.05);
  const dark = shade(color, 0.6);
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  const put = (lx: number, ly: number, lz: number, w: number, h: number, d: number, col: number, kind: PartKind): void => {
    b.box(w, h, d, col, kind, { x: x + lx * c + lz * sn, y: y + ly, z: z - lx * sn + lz * c, ry });
  };
  put(0, size / 2, 0, size - inset * 2, size - inset * 2, size - inset * 2, color, 'stud');
  const o = (size - e) / 2;
  // Corner posts, full height.
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) put(ox * o, size / 2, oz * o, e, size, e, dark, 'smooth');
  // Top and bottom rails round the four edges (between the posts).
  for (const ly of [e / 2, size - e / 2]) {
    for (const side of [-1, 1]) {
      put(0, ly, side * o, size - e * 2, e, e, dark, 'smooth');
      put(side * o, ly, 0, e, e, size - e * 2, dark, 'smooth');
    }
  }
  if (glow) put(0, size / 2, 0, size + 0.1, e * 0.8, size + 0.1, glow, 'glow');
};

const crateShop = (b: PartBuilder, s: ShopSpot, group: Group): void => {
  const P = at(s);
  const W = 5.8;
  const STEEL = 0x2a3a6e;
  const PLATE = 0x34478a;
  const GOLD = 0xffd23f;
  const PURPLE = 0xb15cff;
  // Steel floor, the vault's body behind the back wall.
  b.box(W * 2 + 1, 0.24, 13, 0x5a6070, 'stud', P(0, 0.12, -3.2));
  for (let i = -2; i <= 2; i += 1) b.box(0.06, 0.04, 12.6, 0x4a5060, 'smooth', P(i * 2.3, 0.26, -3.2));
  b.box(W * 2, 6.6, 6.6, STEEL, 'stud', P(0, 3.3, -6.3));
  for (const sx of [-1, 1]) {
    b.box(0.5, 6.0, 4.05, STEEL, 'stud', P(sx * (W - 0.27), 3.0, -0.925));
    // Riveted plates down the sides.
    for (let j = 0; j < 3; j += 1) {
      b.box(0.08, 1.7, 4.2, PLATE, 'smooth', P(sx * (W + 0.02), 1.1 + j * 1.9, -0.8));
      for (const dz of [-1.9, 1.9]) b.box(0.1, 0.14, 0.14, 0xa8b4c8, 'smooth', P(sx * (W + 0.06), 1.1 + j * 1.9 + 0.65, -0.8 + dz));
    }
  }
  // THE VAULT DOOR on the back wall behind the keeper: gold rim, spokes, a handle wheel.
  b.add(cyl(2.3, 2.3, 0.3, 24), 0x8a94b0, 'smooth', P(0, 3.0, -2.85, { rx: Math.PI / 2 }));
  b.add(cyl(2.0, 2.0, 0.36, 24), 0xa8b4c8, 'stud', P(0, 3.0, -2.8, { rx: Math.PI / 2 }));
  b.add(new CylinderGeometry(2.32, 2.32, 0.34, 24, 1, true), GOLD, 'smooth', P(0, 3.0, -2.84, { rx: Math.PI / 2 }));
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    b.box(0.2, 0.2, 0.2, GOLD, 'smooth', P(Math.cos(a) * 1.7, 3.0 + Math.sin(a) * 1.7, -2.58));
  }
  b.add(cyl(0.38, 0.38, 0.3, 12), GOLD, 'smooth', P(0, 3.0, -2.5, { rx: Math.PI / 2 }));
  for (let i = 0; i < 3; i += 1) b.box(1.9, 0.14, 0.14, GOLD, 'smooth', P(0, 3.0, -2.42, { rz: (i * Math.PI) / 3 }));
  // Roof: steel slab, gold trim, a glowing purple strip under the front edge.
  b.box(W * 2 + 0.8, 0.5, 11.2, 0x1d2b55, 'stud', P(0, 6.4, -3.9));
  b.box(W * 2 + 1, 0.22, 0.3, GOLD, 'smooth', P(0, 6.75, 1.85));
  b.box(W * 2 + 0.6, 0.12, 0.2, PURPLE, 'glow', P(0, 6.05, 1.8));
  // Posts: steel girders with gold caps; the counter: a steel chest with a gold lid lip.
  for (const sx of [-1, 1]) {
    b.box(0.9, 6.0, 0.8, 0x1d2b55, 'stud', P(sx * (W - 0.4), 3.0, 1.5));
    b.box(1.05, 0.25, 0.95, GOLD, 'smooth', P(sx * (W - 0.4), 6.0, 1.5));
  }
  b.box(W * 2 - 1.6, 1.0, 1.2, STEEL, 'stud', P(0, 0.5, 1.5));
  b.box(W * 2 - 1.3, 0.18, 1.45, GOLD, 'smooth', P(0, 1.08, 1.5));
  for (let i = 0; i < 6; i += 1) b.box(0.14, 0.14, 0.06, 0xa8b4c8, 'smooth', P(-W + 1.5 + i * ((W * 2 - 3) / 5), 0.7, 2.13));
  // On the counter: a small crate of each rarity and a pile of coins.
  crate(b, s.x - 3.4, G + 1.17, s.z + 1.5, 0.8, 0x3fa2ff, 0.3, 0x8ad8ff);
  crate(b, s.x + 3.4, G + 1.17, s.z + 1.5, 0.8, PURPLE, -0.3, 0xff8aff);
  for (let i = 0; i < 7; i += 1) b.add(cyl(0.2, 0.2, 0.07, 10), GOLD, 'smooth', P(1.6 + (i % 3) * 0.12, 1.21 + i * 0.07, 1.4 + (i % 2) * 0.1));
  b.add(cyl(0.2, 0.2, 0.07, 10), GOLD, 'smooth', P(2.1, 1.21, 1.75));
  // Crate stacks either side of the front, rarer toward the top.
  const stack = (sx: number): void => {
    const x = s.x + sx * (W + 1.3);
    crate(b, x, G, s.z + 0.6, 1.6, 0x8a94b0, sx * 0.1);
    crate(b, x - sx * 0.1, G, s.z + 2.4, 1.4, 0x3fa2ff, -sx * 0.2, 0x8ad8ff);
    crate(b, x + sx * 0.1, G + 1.6, s.z + 0.7, 1.3, PURPLE, sx * 0.3, 0xff8aff);
    crate(b, x, G + 2.9, s.z + 0.8, 1.0, GOLD, -sx * 0.25, 0xfff4b0);
  };
  stack(-1);
  stack(1);
  // THE MYSTERY CRATE on the roof: big, gold-framed, a glowing "?" on its faces, tilted a touch.
  const mx = s.x;
  const mz = s.z - 4.2;
  // Up on a gold-trimmed plinth so it shows over the sign.
  const MY = 8.2;
  b.box(3.0, MY - 6.65, 3.0, 0x1d2b55, 'stud', P(0, (MY + 6.65) / 2, -4.2, { ry: 0.25 }));
  b.box(3.3, 0.2, 3.3, GOLD, 'smooth', P(0, MY - 0.1, -4.2, { ry: 0.25 }));
  crate(b, mx, G + MY, mz, 3.4, PURPLE, 0.25, GOLD);
  for (let i = 0; i < 2; i += 1) {
    const q = signBoard('?', '', '#5a1fa8', '#ffe14a', 1.8, 1.8, 0xffd23f);
    const a = 0.25 + i * Math.PI;
    q.position.set(mx + Math.sin(a) * 1.75, G + MY + 1.7, mz + Math.cos(a) * 1.75);
    q.rotation.y = a;
    group.add(q);
  }
  b.add(new ConeGeometry(0.5, 1.2, 4), GOLD, 'glow', P(0, MY + 4.1, -4.2, { ry: Math.PI / 4 }));
  // Spotlights on poles either side aiming up at it, with their beams.
  for (const sx of [-1, 1]) {
    const x = sx * (W - 0.6);
    b.box(0.22, 1.6, 0.22, 0x2b2f45, 'flat', P(x, 7.45, -0.6));
    b.add(cyl(0.32, 0.22, 0.6, 10), 0x2b2f45, 'smooth', P(x, 8.4, -0.75, { rx: 0.9, rz: -sx * 0.4 }));
    b.add(cyl(0.27, 0.27, 0.06, 10), 0xfff4b0, 'glow', P(x - sx * 0.12, 8.63, -1.0, { rx: 0.9, rz: -sx * 0.4 }));
  }
  // Coins spilling from a chest at the left.
  b.box(1.4, 0.8, 0.9, 0x8a5428, 'stud', P(-W - 1.3, 0.4, -1.6));
  b.box(1.5, 0.2, 1.0, GOLD, 'smooth', P(-W - 1.3, 0.85, -1.6));
  for (let i = 0; i < 9; i += 1) b.add(cyl(0.2, 0.2, 0.07, 10), GOLD, 'smooth', P(-W - 1.9 + (i % 4) * 0.4, 0.05 + (i % 3) * 0.07, -0.9 + Math.floor(i / 4) * 0.35, { rx: (i % 2) * 0.3 }));
};

/** Build one shop's building into the static batch (signs go straight onto the group). */
export const buildShop = (b: PartBuilder, group: Group, shop: ShopSpot): void => {
  if (shop.kind === 'track') trackShop(b, shop);
  else if (shop.kind === 'decor') decorShop(b, shop);
  else crateShop(b, shop, group);
  // The shop's name board over the front.
  const look = {
    track: { sub: 'Track Works', bg: '#2f8f3a', fg: '#ffe14a', frame: 0xffd23f },
    decor: { sub: 'Make it yours!', bg: '#ff6aa8', fg: '#ffffff', frame: 0xffffff },
    crate: { sub: 'Unbox a ride!', bg: '#3b1f7a', fg: '#ffe14a', frame: 0xffd23f },
  }[shop.kind];
  const sign = signBoard(shop.sign.toUpperCase(), look.sub, look.bg, look.fg, 6.2, 1.9, look.frame);
  if (shop.kind === 'decor') sign.position.set(shop.x, G + 6.3, shop.z + 1.85);
  else sign.position.set(shop.x, G + 7.85, shop.z + 1.95);
  group.add(sign);
};
