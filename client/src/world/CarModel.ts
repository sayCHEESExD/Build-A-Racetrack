import { carDef, type CarDef } from '@race/shared';
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Object3D, SphereGeometry, type BufferGeometry } from 'three';
import { PartBuilder, meshesFor, type PartKind } from '../render/PartBuilder.js';

/**
 * THE CARS, built like Roblox vehicles: chunky boxes, cylinders and wedges of
 * bright studded plastic, every one open-topped so the driver's avatar sits
 * in plain view. Model space: +Z forward, +Y up, the wheels' bottoms at
 * y = 0, centred on the axle line. Each style has its own silhouette; the
 * three colours of its `CarDef` paint it. Geometry is cached per car.
 */

const TIRE = 0x23252f;
const RIM = 0xd8dde8;
const SEAT = 0x2b2f45;
const METAL = 0x9aa3b5;
const GLOW_RED = 0xff3a2a;
const GLOW_WHITE = 0xfff7d0;

export interface CarParts {
  /** The whole car; spin `wheels` for rolling. */
  root: Group;
  wheels: Object3D[];
  /** Where the driver sits (local). */
  seat: { x: number; y: number; z: number };
  /** Half the length (for cameras and effects). */
  length: number;
}

interface Built {
  body: Partial<Record<PartKind, BufferGeometry>>;
  wheel: Partial<Record<PartKind, BufferGeometry>>;
  wheels: { x: number; y: number; z: number; r: number; w: number }[];
  seat: { x: number; y: number; z: number };
  length: number;
}

const cache = new Map<string, Built>();

const box = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, n = 10): CylinderGeometry => new CylinderGeometry(rt, rb, h, n);

/** A wheel (tyre, rim, hub), axle along X, centred at the origin. */
const wheelGeometry = (r: number, w: number, rim: number, chunky: boolean): Partial<Record<PartKind, BufferGeometry>> => {
  const b = new PartBuilder();
  b.add(cyl(r, r, w, chunky ? 10 : 12), TIRE, 'flat', { rz: Math.PI / 2 });
  if (chunky) {
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      b.add(box(w * 1.04, r * 0.22, r * 0.3), 0x2f323e, 'flat', { rx: a, y: Math.cos(a) * r * 0.97, z: Math.sin(a) * r * 0.97 });
    }
  }
  b.add(cyl(r * 0.58, r * 0.58, w + 0.04, 8), rim, 'smooth', { rz: Math.PI / 2 });
  b.add(cyl(r * 0.2, r * 0.2, w + 0.1, 6), 0x5a6070, 'smooth', { rz: Math.PI / 2 });
  return b.geometries();
};

const seatBlock = (b: PartBuilder, x: number, y: number, z: number, color = SEAT): void => {
  b.box(0.7, 0.18, 0.62, color, 'smooth', { x, y, z });
  b.box(0.7, 0.62, 0.16, color, 'smooth', { x, y: y + 0.36, z: z - 0.32, rx: -0.15 });
};

const steering = (b: PartBuilder, z: number, y: number): void => {
  b.add(cyl(0.05, 0.05, 0.5, 6), 0x3a3f50, 'smooth', { x: 0, y: y - 0.1, z: z - 0.05, rx: 0.9 });
  b.add(cyl(0.2, 0.2, 0.06, 12), 0x2b2f45, 'smooth', { x: 0, y: y + 0.12, z: z - 0.22, rx: -0.65 });
};

const lights = (b: PartBuilder, zf: number, zb: number, y: number, half: number): void => {
  for (const s of [-1, 1]) {
    b.box(0.22, 0.14, 0.06, GLOW_WHITE, 'glow', { x: s * half, y, z: zf });
    b.box(0.22, 0.12, 0.06, GLOW_RED, 'glow', { x: s * half, y, z: zb });
  }
};

/** Build a style's body. Returns wheel spots and the seat. */
const buildBody = (def: CarDef): Built => {
  const [c0, c1, c2] = def.colors;
  const b = new PartBuilder();
  let wheels: Built['wheels'] = [];
  let seat = { x: 0, y: 0.55, z: -0.1 };
  let length = 1.3;
  const fourWheels = (fx: number, rz: number, fz: number, rr: number, r: number, w: number, y = r): void => {
    wheels = [
      { x: fx, y, z: fz, r, w },
      { x: -fx, y, z: fz, r, w },
      { x: rz, y: rr, z: -1, r: rr, w: w * 1.15 },
      { x: -rz, y: rr, z: -1, r: rr, w: w * 1.15 },
    ];
  };
  switch (def.style) {
    case 'kart': {
      b.box(1.25, 0.16, 2.3, c0, 'stud', { y: 0.32 });
      b.box(1.1, 0.26, 0.4, c1, 'smooth', { y: 0.36, z: 1.2 });
      b.box(0.8, 0.22, 0.5, c0, 'smooth', { y: 0.5, z: 0.82, rx: -0.25 });
      for (const s of [-1, 1]) b.box(0.24, 0.3, 1.1, c1, 'smooth', { x: s * 0.68, y: 0.44, z: -0.05 });
      b.box(0.9, 0.42, 0.5, 0x5a6070, 'flat', { y: 0.6, z: -0.95 });
      for (const s of [-1, 1]) b.add(cyl(0.07, 0.09, 0.4, 6), METAL, 'smooth', { x: s * 0.28, y: 0.72, z: -1.22, rx: Math.PI / 2 });
      b.box(1.3, 0.08, 0.32, c2, 'smooth', { y: 1.02, z: -1.05 });
      for (const s of [-1, 1]) b.box(0.08, 0.36, 0.12, c2, 'smooth', { x: s * 0.5, y: 0.84, z: -1.05 });
      seatBlock(b, 0, 0.48, -0.2, c2);
      steering(b, 0.55, 0.7);
      fourWheels(0.78, 0.8, 0.95, 0.4, 0.33, 0.32);
      seat = { x: 0, y: 0.52, z: -0.18 };
      lights(b, 1.42, -1.22, 0.45, 0.4);
      break;
    }
    case 'buggy': {
      b.box(1.3, 0.3, 2.2, c0, 'stud', { y: 0.62 });
      b.box(1.2, 0.36, 0.6, c0, 'smooth', { y: 0.72, z: 0.95, rx: -0.3 });
      // Roll cage.
      for (const s of [-1, 1]) {
        b.add(cyl(0.06, 0.06, 1.0, 6), c1, 'smooth', { x: s * 0.55, y: 1.25, z: -0.55 });
        b.add(cyl(0.06, 0.06, 1.1, 6), c1, 'smooth', { x: s * 0.55, y: 1.2, z: 0.25, rx: -0.45 });
        b.add(cyl(0.06, 0.06, 0.95, 6), c1, 'smooth', { x: s * 0.55, y: 1.74, z: -0.15, rx: Math.PI / 2 });
      }
      b.add(cyl(0.06, 0.06, 1.15, 6), c1, 'smooth', { y: 1.74, z: -0.6, rz: Math.PI / 2 });
      b.add(cyl(0.06, 0.06, 1.15, 6), c1, 'smooth', { y: 1.74, z: 0.3, rz: Math.PI / 2 });
      b.box(1.1, 0.12, 0.12, c2, 'glow', { y: 1.84, z: 0.32 });
      b.box(0.9, 0.5, 0.45, 0x5a6070, 'flat', { y: 0.9, z: -1.05 });
      seatBlock(b, 0, 0.78, -0.25, c2);
      steering(b, 0.45, 0.98);
      fourWheels(0.82, 0.85, 0.95, 0.5, 0.46, 0.4);
      seat = { x: 0, y: 0.82, z: -0.22 };
      lights(b, 1.3, -1.25, 0.75, 0.45);
      break;
    }
    case 'formula': {
      b.box(0.62, 0.32, 3.0, c0, 'stud', { y: 0.42, z: 0.1 });
      b.box(0.4, 0.22, 0.8, c0, 'smooth', { y: 0.36, z: 1.7, rx: 0.08 });
      b.box(1.7, 0.08, 0.42, c1, 'smooth', { y: 0.22, z: 2.0 });
      for (const s of [-1, 1]) b.box(0.08, 0.26, 0.5, c2, 'smooth', { x: s * 0.86, y: 0.3, z: 2.0 });
      for (const s of [-1, 1]) b.box(0.38, 0.34, 1.2, c0, 'smooth', { x: s * 0.5, y: 0.46, z: -0.45 });
      b.box(0.62, 0.5, 0.7, c1, 'smooth', { y: 0.78, z: -0.75 });
      b.box(1.5, 0.1, 0.5, c1, 'smooth', { y: 1.12, z: -1.35 });
      for (const s of [-1, 1]) b.box(0.08, 0.6, 0.5, c2, 'smooth', { x: s * 0.72, y: 0.9, z: -1.35 });
      b.box(0.5, 0.06, 0.3, c2, 'smooth', { y: 0.74, z: 0.35, rx: -0.4 });
      seatBlock(b, 0, 0.42, -0.15, SEAT);
      steering(b, 0.4, 0.66);
      fourWheels(0.86, 0.86, 1.25, 0.43, 0.36, 0.38);
      seat = { x: 0, y: 0.46, z: -0.14 };
      length = 1.6;
      lights(b, 2.2, -1.62, 0.4, 0.2);
      break;
    }
    case 'muscle':
    case 'neon':
    case 'gold': {
      b.box(1.55, 0.5, 3.0, c0, 'stud', { y: 0.62 });
      b.box(1.45, 0.25, 1.0, c0, 'smooth', { y: 0.95, z: 1.0, rx: 0.06 });
      b.box(1.45, 0.25, 0.8, c0, 'smooth', { y: 0.95, z: -1.1 });
      b.box(1.3, 0.38, 0.12, 0xbfe6ff, 'smooth', { y: 1.15, z: 0.42, rx: -0.5 });
      for (const s of [-1, 1]) b.box(0.08, 0.5, 2.9, c1, def.style === 'neon' ? 'glow' : 'smooth', { x: s * 0.79, y: 0.62, z: 0 });
      b.box(0.28, 0.06, 3.0, c1, def.style === 'neon' ? 'glow' : 'smooth', { y: 0.9, z: 0 });
      b.box(1.5, 0.1, 0.4, c2, 'smooth', { y: 1.35, z: -1.4 });
      for (const s of [-1, 1]) b.box(0.08, 0.3, 0.2, c2, 'smooth', { x: s * 0.6, y: 1.18, z: -1.4 });
      if (def.style === 'muscle') b.box(0.6, 0.2, 0.6, 0x5a6070, 'flat', { y: 1.15, z: 1.1 });
      if (def.style === 'gold') {
        for (let i = 0; i < 5; i += 1) b.box(0.14, 0.32, 0.14, c0, 'glow', { x: -0.4 + i * 0.2, y: 1.95, z: -0.5 });
        b.box(0.9, 0.16, 0.5, c0, 'smooth', { y: 1.78, z: -0.5 });
        b.box(0.18, 0.18, 0.18, c1, 'glow', { y: 2.0, z: -0.28 });
      }
      seatBlock(b, 0, 0.82, -0.2, SEAT);
      steering(b, 0.35, 1.02);
      fourWheels(0.82, 0.82, 1.0, 0.42, 0.4, 0.36);
      seat = { x: 0, y: 0.86, z: -0.18 };
      length = 1.55;
      lights(b, 1.52, -1.52, 0.72, 0.55);
      break;
    }
    case 'monster':
    case 'truck': {
      const big = def.style === 'monster';
      const lift = big ? 1.05 : 0.6;
      b.box(1.7, 0.55, 2.8, c0, 'stud', { y: lift + 0.4 });
      b.box(1.6, 0.4, 0.8, c0, 'smooth', { y: lift + 0.8, z: 1.0 });
      b.box(1.6, 0.12, 2.8, c1, 'smooth', { y: lift + 0.12, z: 0 });
      b.box(1.5, 0.45, 0.12, 0xbfe6ff, 'smooth', { y: lift + 1.1, z: 0.6, rx: -0.4 });
      if (!big) {
        b.box(1.7, 0.5, 1.2, c1, 'flat', { y: lift + 0.95, z: -0.9 });
        b.box(1.6, 0.1, 1.2, c2, 'smooth', { y: lift + 1.25, z: -0.9 });
      } else {
        b.box(1.4, 0.1, 0.5, c2, 'smooth', { y: lift + 1.6, z: -1.2 });
        for (const s of [-1, 1]) b.box(0.08, 0.5, 0.15, c2, 'smooth', { x: s * 0.6, y: lift + 1.35, z: -1.2 });
        for (const s of [-1, 1]) b.add(cyl(0.08, 0.08, 1.3, 6), METAL, 'smooth', { x: s * 0.55, y: lift - 0.2, z: 0.9, rz: 0.4 * s });
      }
      for (let i = 0; i < 4; i += 1) b.box(0.22, 0.14, 0.06, i % 2 ? GLOW_WHITE : 0xffe14a, 'glow', { x: -0.45 + i * 0.3, y: lift + 1.42, z: 0.55 });
      seatBlock(b, 0, lift + 0.7, -0.3, SEAT);
      steering(b, 0.3, lift + 0.95);
      const r = big ? 0.85 : 0.5;
      fourWheels(1.05, 1.05, 1.0, r, r, big ? 0.62 : 0.42);
      wheels[2]!.z = -1.05;
      wheels[3]!.z = -1.05;
      seat = { x: 0, y: lift + 0.74, z: -0.28 };
      length = 1.5;
      lights(b, 1.42, -1.42, lift + 0.5, 0.6);
      break;
    }
    case 'shark': {
      b.box(1.35, 0.6, 2.9, c0, 'stud', { y: 0.65 });
      b.box(1.25, 0.4, 0.6, c1, 'smooth', { y: 0.45, z: 1.35 });
      b.add(new ConeGeometry(0.42, 1.1, 4), c0, 'flat', { y: 1.35, z: -0.6, sz: 0.3, ry: Math.PI / 4 });
      b.add(new ConeGeometry(0.5, 0.9, 4), c0, 'flat', { y: 1.05, z: -1.65, rx: -1.2, sz: 0.25, ry: Math.PI / 4 });
      for (let i = 0; i < 6; i += 1) b.add(new ConeGeometry(0.07, 0.16, 4), 0xffffff, 'flat', { x: -0.45 + i * 0.18, y: 0.6, z: 1.66, rx: Math.PI });
      b.box(1.0, 0.1, 0.08, c2, 'smooth', { y: 0.72, z: 1.66 });
      for (const s of [-1, 1]) {
        b.box(0.18, 0.18, 0.06, 0xffffff, 'smooth', { x: s * 0.5, y: 1.0, z: 1.1 });
        b.box(0.09, 0.09, 0.07, 0x111111, 'smooth', { x: s * 0.5, y: 1.0, z: 1.12 });
        for (let g = 0; g < 3; g += 1) b.box(0.04, 0.3, 0.06, 0x4f6a80, 'smooth', { x: s * 0.69, y: 0.75, z: 0.4 - g * 0.18 });
      }
      seatBlock(b, 0, 0.9, -0.15, SEAT);
      steering(b, 0.45, 1.1);
      fourWheels(0.8, 0.8, 0.95, 0.38, 0.36, 0.34);
      seat = { x: 0, y: 0.95, z: -0.14 };
      length = 1.5;
      break;
    }
    case 'croc': {
      b.box(1.35, 0.5, 2.6, c0, 'stud', { y: 0.6 });
      b.box(1.0, 0.32, 1.1, c0, 'smooth', { y: 0.58, z: 1.75 });
      b.box(0.95, 0.12, 1.0, c1, 'smooth', { y: 0.38, z: 1.75 });
      for (let i = 0; i < 6; i += 1) for (const s of [-1, 1]) b.add(new ConeGeometry(0.06, 0.14, 4), 0xffffff, 'flat', { x: s * 0.45, y: 0.46, z: 1.3 + i * 0.16, rx: Math.PI });
      for (const s of [-1, 1]) {
        b.box(0.26, 0.26, 0.26, c0, 'smooth', { x: s * 0.32, y: 0.95, z: 1.3 });
        b.box(0.12, 0.14, 0.08, 0xffe14a, 'smooth', { x: s * 0.32, y: 1.0, z: 1.44 });
      }
      for (let i = 0; i < 5; i += 1) b.box(0.22, 0.16, 0.22, c1, 'smooth', { y: 0.92, z: -0.4 - i * 0.28 });
      b.box(0.5, 0.3, 1.0, c0, 'flat', { y: 0.5, z: -1.7, rx: 0.15 });
      seatBlock(b, 0, 0.84, 0.1, SEAT);
      steering(b, 0.65, 1.05);
      fourWheels(0.8, 0.8, 0.95, 0.38, 0.36, 0.34);
      seat = { x: 0, y: 0.88, z: 0.12 };
      length = 1.7;
      break;
    }
    case 'bee': {
      b.box(1.3, 0.62, 2.4, c0, 'stud', { y: 0.68 });
      for (let i = 0; i < 3; i += 1) b.box(1.34, 0.64, 0.24, c1, 'smooth', { y: 0.68, z: -0.6 + i * 0.6 });
      b.add(new ConeGeometry(0.28, 0.6, 6), c1, 'flat', { y: 0.68, z: -1.5, rx: -Math.PI / 2 });
      for (const s of [-1, 1]) {
        b.box(0.08, 0.7, 1.2, 0xdff4ff, 'glow', { x: s * 0.95, y: 1.35, z: -0.3, rz: s * 0.6 });
        b.add(cyl(0.03, 0.03, 0.6, 5), c1, 'smooth', { x: s * 0.25, y: 1.3, z: 1.2, rz: -s * 0.4, rx: 0.4 });
        b.box(0.12, 0.12, 0.12, c1, 'smooth', { x: s * 0.4, y: 1.55, z: 1.32 });
        b.box(0.22, 0.22, 0.06, 0xffffff, 'smooth', { x: s * 0.35, y: 0.95, z: 1.21 });
        b.box(0.11, 0.11, 0.07, 0x111111, 'smooth', { x: s * 0.35, y: 0.95, z: 1.23 });
      }
      seatBlock(b, 0, 0.98, -0.1, SEAT);
      steering(b, 0.5, 1.2);
      fourWheels(0.78, 0.78, 0.85, 0.38, 0.36, 0.32);
      seat = { x: 0, y: 1.02, z: -0.1 };
      length = 1.4;
      break;
    }
    case 'rocket': {
      b.add(cyl(0.55, 0.62, 2.6, 10), c0, 'flat', { y: 0.72, rx: Math.PI / 2 });
      b.add(new ConeGeometry(0.55, 0.9, 10), c1, 'flat', { y: 0.72, z: 1.75, rx: Math.PI / 2 });
      for (const s of [-1, 1]) {
        b.add(cyl(0.22, 0.26, 1.4, 8), c2, 'flat', { x: s * 0.7, y: 0.6, z: -0.6, rx: Math.PI / 2 });
        b.add(cyl(0.18, 0.08, 0.4, 8), 0xffa82a, 'glow', { x: s * 0.7, y: 0.6, z: -1.5, rx: Math.PI / 2 });
        b.box(0.08, 0.6, 0.6, c1, 'smooth', { x: s * 0.5, y: 1.1, z: -1.05, rz: s * 0.3 });
      }
      b.add(cyl(0.3, 0.12, 0.5, 8), 0xff6a2a, 'glow', { y: 0.72, z: -1.5, rx: Math.PI / 2 });
      b.box(0.1, 0.7, 0.6, c1, 'smooth', { y: 1.35, z: -1.0 });
      seatBlock(b, 0, 1.0, -0.15, SEAT);
      steering(b, 0.5, 1.2);
      fourWheels(0.62, 0.62, 0.95, 0.34, 0.3, 0.26);
      seat = { x: 0, y: 1.04, z: -0.15 };
      length = 1.6;
      break;
    }
    case 'ufo': {
      b.add(cyl(1.25, 1.0, 0.35, 16), c0, 'flat', { y: 0.72 });
      b.add(cyl(1.0, 1.25, 0.2, 16), c0, 'flat', { y: 0.45 });
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        b.box(0.16, 0.12, 0.16, i % 2 ? c1 : c2, 'glow', { x: Math.cos(a) * 1.18, y: 0.65, z: Math.sin(a) * 1.18 });
      }
      b.add(new SphereGeometry(0.62, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xbff0ff, 'smooth', { y: 0.9 });
      b.add(cyl(0.4, 0.5, 0.15, 10), c1, 'glow', { y: 0.25 });
      seatBlock(b, 0, 0.92, -0.05, SEAT);
      fourWheels(0.6, 0.6, 0.6, 0.24, 0.22, 0.2);
      wheels[2]!.z = -0.6;
      wheels[3]!.z = -0.6;
      seat = { x: 0, y: 0.96, z: -0.05 };
      length = 1.3;
      break;
    }
    case 'dino': {
      b.box(1.35, 0.55, 2.5, c0, 'stud', { y: 0.65 });
      b.box(0.9, 0.7, 0.9, c0, 'flat', { y: 1.05, z: 1.4 });
      b.box(0.85, 0.25, 0.7, c0, 'flat', { y: 0.72, z: 1.65 });
      for (let i = 0; i < 5; i += 1) b.add(new ConeGeometry(0.06, 0.16, 4), 0xffffff, 'flat', { x: -0.3 + i * 0.15, y: 0.82, z: 1.98, rx: Math.PI });
      for (const s of [-1, 1]) {
        b.box(0.2, 0.2, 0.06, 0xffe14a, 'smooth', { x: s * 0.3, y: 1.2, z: 1.86 });
        b.box(0.09, 0.12, 0.07, 0x111111, 'smooth', { x: s * 0.3, y: 1.2, z: 1.88 });
      }
      for (let i = 0; i < 6; i += 1) b.add(new ConeGeometry(0.14, 0.4, 4), c1, 'flat', { y: 1.05 + (i < 2 ? 0.4 : 0), z: 0.9 - i * 0.45, ry: Math.PI / 4 });
      b.box(0.4, 0.35, 1.2, c0, 'flat', { y: 0.7, z: -1.75, rx: 0.2 });
      seatBlock(b, 0, 0.9, -0.15, SEAT);
      steering(b, 0.45, 1.1);
      fourWheels(0.8, 0.8, 0.9, 0.38, 0.36, 0.34);
      seat = { x: 0, y: 0.94, z: -0.15 };
      length = 1.6;
      break;
    }
  }
  const tw = wheels[0];
  return { body: b.geometries(), wheel: wheelGeometry(tw?.r ?? 0.35, tw?.w ?? 0.3, RIM, def.style === 'monster' || def.style === 'buggy'), wheels, seat, length };
};

/** A fresh model of a car (shares its geometry with every other instance). */
export const buildCar = (key: string): CarParts => {
  const def = carDef(key);
  let built = cache.get(def.key);
  if (!built) {
    built = buildBody(def);
    cache.set(def.key, built);
  }
  const root = new Group();
  root.name = `car-${def.key}`;
  root.add(meshesFor(built.body, `car-${def.key}-body`));
  const wheels: Object3D[] = [];
  const base = built.wheels[0]!;
  for (const w of built.wheels) {
    const holder = new Group();
    holder.position.set(w.x, w.y, w.z);
    const mesh = meshesFor(built.wheel, `car-${def.key}-wheel`);
    const k = w.r / base.r;
    mesh.scale.set(w.w / base.w, k, k);
    holder.add(mesh);
    root.add(holder);
    wheels.push(mesh);
  }
  return { root, wheels, seat: built.seat, length: built.length };
};
