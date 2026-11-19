import { GROUND_Y, type DecorDef } from '@race/shared';
import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from 'three';
import type { PartBuilder } from '../render/PartBuilder.js';
import { boulders, broadleaf, bush, flowers as flowerPatch, palm, seeded, shade } from './Nature.js';

/**
 * DECORATIONS, in the same chunky studded plastic as everything else. Each is
 * drawn into a builder at a world point, facing a yaw, sized to the cells it
 * covers (2 units a cell; `along` x `across`).
 */

const G = GROUND_Y;

const cyl = (rt: number, rb: number, h: number, n = 10): CylinderGeometry => new CylinderGeometry(rt, rb, h, n);

/** Rotate a local (x, z) by yaw and add the origin. */
const at = (ox: number, oz: number, yaw: number, x: number, z: number): { x: number; z: number } => ({
  x: ox + x * Math.cos(yaw) + z * Math.sin(yaw),
  z: oz - x * Math.sin(yaw) + z * Math.cos(yaw),
});

export const drawDecor = (b: PartBuilder, def: DecorDef, x: number, z: number, yaw: number, seed: number): void => {
  const r = seeded(seed);
  const L = def.size[0] * 2;
  const Wd = def.size[1] * 2;
  const put = (w: number, h: number, d: number, color: number, lx: number, ly: number, lz: number, kind: 'stud' | 'smooth' | 'flat' | 'glow' = 'smooth', extra: { rx?: number; rz?: number } = {}): void => {
    const p = at(x, z, yaw, lx, lz);
    b.box(w, h, d, color, kind, { x: p.x, y: G + ly, z: p.z, ry: yaw, ...extra });
  };
  switch (def.key) {
    // ---- terrain pads (raised a touch: a slab, never coplanar with the ground)
    case 'dirtpad':
    case 'sandpad':
    case 'stonetile':
      put(L - 0.08, 0.12, Wd - 0.08, def.color, 0, 0.06, 0, 'stud');
      if (def.key === 'stonetile') put(L * 0.46, 0.04, Wd * 0.46, shade(def.color, 0.9), -L * 0.22, 0.13, -Wd * 0.22, 'stud');
      break;
    case 'grasspad':
      put(L - 0.08, 0.12, Wd - 0.08, 0x58d838, 0, 0.06, 0, 'stud');
      flowerPatch(b, r, x, G + 0.12, z, 0.6);
      break;
    case 'pond': {
      put(L - 0.1, 0.16, Wd - 0.1, 0x9a948a, 0, 0.08, 0, 'stud');
      put(L - 0.7, 0.04, Wd - 0.7, 0x3fc8ff, 0, 0.18, 0, 'smooth');
      put(0.6, 0.06, 0.6, 0x4fd23e, -0.6, 0.22, 0.4, 'flat');
      break;
    }
    case 'rock':
      boulders(b, r, x, G, z, 0.55);
      break;
    // ---- structure
    case 'woodfence':
      for (const s of [-1, 1]) put(0.22, 1.1, 0.22, 0x8a5428, s * 0.85, 0.55, 0, 'flat');
      put(2, 0.16, 0.12, 0x9a6232, 0, 0.75, 0, 'flat');
      put(2, 0.16, 0.12, 0x9a6232, 0, 0.35, 0, 'flat');
      break;
    case 'metalfence':
      for (const s of [-1, 1]) put(0.12, 1.4, 0.12, 0x8a96aa, s * 0.9, 0.7, 0, 'smooth');
      for (let i = 0; i < 6; i += 1) put(0.06, 1.2, 0.06, 0xa8b4c8, -0.75 + i * 0.3, 0.65, 0, 'smooth');
      put(1.9, 0.08, 0.08, 0xa8b4c8, 0, 1.3, 0, 'smooth');
      break;
    case 'barrier':
      for (let i = 0; i < 4; i += 1) put(0.48, 0.6, 0.55, i % 2 ? 0xffffff : 0xe8352e, -0.72 + i * 0.48, 0.3, 0, 'stud');
      break;
    case 'tirewall':
      for (let i = 0; i < 3; i += 1) for (let j = 0; j < 2; j += 1) {
        const p = at(x, z, yaw, -0.6 + i * 0.6, 0);
        b.add(cyl(0.3, 0.3, 0.26, 10), j % 2 ? 0x2b2f45 : 0x3a3f55, 'flat', { x: p.x, y: G + 0.14 + j * 0.27, z: p.z });
        b.add(cyl(0.31, 0.31, 0.06, 10), (i + j) % 2 ? 0xffffff : 0xe8352e, 'smooth', { x: p.x, y: G + 0.14 + j * 0.27, z: p.z });
      }
      break;
    case 'lightpost': {
      b.add(cyl(0.1, 0.14, 4, 8), 0x3a3f55, 'smooth', { x, y: G + 2, z });
      const p = at(x, z, yaw, 0, 0.4);
      put(0.16, 0.16, 0.9, 0x3a3f55, 0, 3.9, 0.4);
      b.box(0.5, 0.18, 0.4, 0xfff4b0, 'glow', { x: p.x, y: G + 3.75, z: p.z, ry: yaw });
      put(0.5, 0.2, 0.5, 0x2b2f45, 0, 0.1, 0);
      break;
    }
    case 'billboard': {
      for (const s of [-1, 1]) put(0.22, 3.2, 0.22, 0x5a6070, s * 1.4, 1.6, 0);
      put(3.6, 1.8, 0.2, 0xffffff, 0, 3.6, 0, 'smooth');
      put(3.3, 1.5, 0.06, def.color, 0, 3.6, 0.13, 'smooth');
      put(1.6, 0.4, 0.04, 0xffd23f, 0, 3.9, 0.18, 'glow');
      put(2.2, 0.3, 0.04, 0xffffff, 0, 3.3, 0.18, 'glow');
      break;
    }
    case 'grandstand': {
      const w = Wd;
      for (let step = 0; step < 4; step += 1) {
        put(L * 0.24, 0.5 + step * 0.55, w - 0.2, step % 2 ? 0x3a7bea : 0x3fa2ff, -L * 0.36 + step * L * 0.24, (0.5 + step * 0.55) / 2, 0, 'stud');
        for (let seat = 0; seat < 5; seat += 1) {
          const colors = [0xe8352e, 0xffd23f, 0x58d36a, 0xff8a2a, 0xb15cff];
          put(0.42, 0.3, 0.42, colors[(seat + step) % 5]!, -L * 0.36 + step * L * 0.24, 0.5 + step * 0.55 + 0.15, -w / 2 + 0.6 + seat * ((w - 1.2) / 4), 'smooth');
        }
      }
      put(L - 0.2, 0.15, w - 0.2, 0xffffff, 0, 3.4, 0, 'smooth');
      for (const s of [-1, 1]) put(0.15, 3.4, 0.15, 0xdddddd, L * 0.45, 1.7, s * (w / 2 - 0.2));
      break;
    }
    case 'tower': {
      put(1.6, 4, 1.6, 0xf2f4f7, 0, 2, 0, 'stud');
      put(3.2, 1.6, 3.2, 0xbfe6ff, 0, 4.8, 0, 'smooth');
      for (const s of [-1, 1]) for (const t of [-1, 1]) put(0.2, 1.7, 0.2, 0xf2f4f7, s * 1.5, 4.8, t * 1.5);
      put(3.6, 0.4, 3.6, 0xe8352e, 0, 5.8, 0, 'stud');
      put(0.1, 1.4, 0.1, 0x5a6070, 0, 6.7, 0);
      b.box(0.3, 0.3, 0.3, 0xff3a2a, 'glow', { x, y: G + 7.5, z });
      break;
    }
    // ---- greenery
    case 'bush':
      bush(b, r, x, G, z, 0.6, 2);
      break;
    case 'flowers':
      put(1.8, 0.3, 1.8, 0x8a5428, 0, 0.15, 0, 'flat');
      put(1.6, 0.06, 1.6, 0x6a4020, 0, 0.32, 0, 'flat');
      for (let i = 0; i < 9; i += 1) {
        const c = [0xff4fb8, 0xffd23f, 0xff5a4a, 0xffffff, 0xb15cff][i % 5]!;
        const lx = -0.55 + (i % 3) * 0.55;
        const lz = -0.55 + Math.floor(i / 3) * 0.55;
        put(0.08, 0.35, 0.08, 0x3cc234, lx, 0.5, lz, 'flat');
        put(0.26, 0.2, 0.26, c, lx, 0.72, lz, 'flat');
      }
      break;
    case 'oak':
      broadleaf(b, r, x, G, z, 0.55);
      break;
    case 'pine': {
      b.add(cyl(0.22, 0.28, 1.6, 6), 0x7a4e28, 'flat', { x, y: G + 0.8, z });
      for (let i = 0; i < 4; i += 1) {
        const s = 1.4 - i * 0.28;
        b.add(new ConeGeometry(s, 1.4, 6), shade(0x2fa84a, 0.9 + i * 0.06), 'flat', { x, y: G + 1.8 + i * 0.85, z, ry: i * 0.4 });
      }
      break;
    }
    case 'palm':
      palm(b, r, x, G, z, 0.6);
      break;
    case 'blossom': {
      b.add(cyl(0.22, 0.3, 2.6, 6), 0x7a4e38, 'flat', { x, y: G + 1.3, z });
      const pinks = [0xffa8d8, 0xff8ac8, 0xffc2e6];
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        b.add(new BoxGeometry(1.1, 0.9, 1.1), pinks[i % 3]!, 'flat', { x: x + Math.cos(a) * 0.8, y: G + 3 + (i % 2) * 0.4, z: z + Math.sin(a) * 0.8, ry: a });
      }
      b.add(new BoxGeometry(1.4, 1.1, 1.4), 0xffb8de, 'flat', { x, y: G + 3.6, z, ry: 0.4 });
      break;
    }
    // ---- decoration
    case 'cone':
      put(0.7, 0.08, 0.7, 0xff7a1a, 0, 0.04, 0);
      b.add(new ConeGeometry(0.28, 0.8, 8), 0xff7a1a, 'smooth', { x, y: G + 0.48, z });
      b.add(cyl(0.17, 0.21, 0.14, 8), 0xffffff, 'smooth', { x, y: G + 0.5, z });
      break;
    case 'beachball':
      b.add(new SphereGeometry(0.45, 10, 8), 0xffd23f, 'smooth', { x, y: G + 0.45, z });
      for (const [c, a] of [
        [0xe8352e, 0],
        [0x3fa2ff, 2.1],
        [0xffffff, 4.2],
      ] as const)
        b.add(new SphereGeometry(0.46, 10, 8, a, 1.0), c, 'smooth', { x, y: G + 0.45, z });
      break;
    case 'trashcan':
      b.add(cyl(0.38, 0.32, 0.9, 10), 0x4f8a5a, 'smooth', { x, y: G + 0.45, z });
      b.add(cyl(0.42, 0.42, 0.1, 10), 0x3a6a44, 'smooth', { x, y: G + 0.95, z });
      break;
    case 'barrel':
      b.add(cyl(0.42, 0.42, 1.0, 10), 0x9a6232, 'flat', { x, y: G + 0.5, z });
      for (const y of [0.2, 0.8]) b.add(cyl(0.44, 0.44, 0.08, 10), 0x5a6070, 'smooth', { x, y: G + y, z });
      break;
    case 'tires':
      for (let j = 0; j < 3; j += 1) {
        b.add(cyl(0.45, 0.45, 0.3, 10), 0x2b2f45, 'flat', { x, y: G + 0.16 + j * 0.31, z });
        b.add(cyl(0.46, 0.46, 0.06, 10), j % 2 ? 0xffffff : 0xe8352e, 'smooth', { x, y: G + 0.16 + j * 0.31, z });
      }
      break;
    case 'flagred':
    case 'flagblue':
    case 'flaggreen':
      put(0.5, 0.2, 0.5, 0x5a6070, 0, 0.1, 0);
      b.add(cyl(0.05, 0.05, 3, 6), 0xdddddd, 'smooth', { x, y: G + 1.5, z });
      put(1.1, 0.7, 0.05, def.color, 0.55, 2.6, 0, 'smooth');
      break;
    case 'checkered':
      for (const s of [-1, 1]) {
        const p = at(x, z, yaw, s * 0.45, 0);
        b.add(cyl(0.05, 0.05, 3.2, 6), 0x2b2f45, 'smooth', { x: p.x, y: G + 1.6, z: p.z, rz: s * 0.25 });
        for (let a = 0; a < 3; a += 1) for (let c = 0; c < 3; c += 1) put(0.3, 0.3, 0.04, (a + c) % 2 ? 0xffffff : 0x1f2230, s * (0.95 + a * 0.3), 2.8 - c * 0.3, 0, 'smooth');
      }
      break;
    case 'trophy':
      put(1.2, 0.5, 1.2, 0x3a3f55, 0, 0.25, 0, 'stud');
      b.add(cyl(0.18, 0.3, 0.8, 8), 0xffcf3a, 'smooth', { x, y: G + 0.9, z });
      b.add(cyl(0.7, 0.3, 1.1, 10), 0xffcf3a, 'smooth', { x, y: G + 1.85, z });
      for (const s of [-1, 1]) put(0.16, 0.6, 0.5, 0xffcf3a, s * 0.75, 1.9, 0, 'smooth');
      b.add(new SphereGeometry(0.22, 8, 6), 0xfff2b3, 'glow', { x, y: G + 2.55, z });
      break;
    default:
      put(1, 1, 1, def.color, 0, 0.5, 0);
  }
};
