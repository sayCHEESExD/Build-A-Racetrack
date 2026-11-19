import { Color, CanvasTexture, Mesh, MeshStandardMaterial, NearestFilter, SRGBColorSpace, SkinnedMesh, Vector3 } from 'three';
import { PlayerAvatar } from '../player/PlayerAvatar.js';

/**
 * THE SHOPKEEPERS: the Block City avatar (the very rig every player walks
 * in), each wearing a skin of its own made here at runtime - a hi-vis track
 * foreman, a train conductor, a lab-coat professor. Same body, proportions
 * and animation as a player; only the paint is theirs.
 *
 * HOW THE PAINT FITS. The avatar's UVs are its own layout, not a standard
 * skin sheet, and its two meshes (arms; head, body and legs) overlap in
 * texture space. So each skin is BAKED per mesh: every triangle is drawn into
 * its own canvas at its UVs, and every texel takes the colour of the spot it
 * covers on the model - which part (by bone), which face (front, back, side,
 * top) and how high up that part. A face, buttons and boots land where the
 * model has them, whatever the layout.
 *
 * Model space (geometry): X across (+X the left arm), Z up, -Y the front.
 */

export interface Outfit {
  skin: string;
  hair: string;
  /** Head covering over the hair (a helmet, a cap), or ''. */
  hat: string;
  shirt: string;
  /** A vest / coat over the shirt, or ''. */
  over: string;
  /** Stripes or trim on the over-layer. */
  trim: string;
  pants: string;
  shoes: string;
  eyes: string;
  /** A coat reaches down over the thighs (the lab coat). */
  longCoat?: boolean;
}

export const OUTFITS: Readonly<Record<'track' | 'decor' | 'crate' | 'pit', Outfit>> = {
  track: { skin: '#e8b48a', hair: '#5a3a22', hat: '#e8352e', shirt: '#2f6fd6', over: '#ff7a1a', trim: '#e9ff5a', pants: '#3a4f86', shoes: '#4a3020', eyes: '#2a1b10' },
  decor: { skin: '#c98a5e', hair: '#1f1712', hat: '#58d36a', shirt: '#ffd23f', over: '#58d36a', trim: '#ffffff', pants: '#2b4f2a', shoes: '#141414', eyes: '#140c08' },
  crate: { skin: '#f0c9a4', hair: '#2a2a2a', hat: '#1d2b55', shirt: '#b15cff', over: '#1d2b55', trim: '#ffd23f', pants: '#3b2a6b', shoes: '#2a2a2a', eyes: '#1d3a7a' },
  pit: { skin: '#e0a878', hair: '#3a2a1a', hat: '#ffd23f', shirt: '#e8352e', over: '#e8352e', trim: '#ffffff', pants: '#2b2f45', shoes: '#141414', eyes: '#2a1b10' },
};

type Part = 'head' | 'torso' | 'upperArm' | 'foreArm' | 'thigh' | 'shin';
type Face = 'front' | 'back' | 'side' | 'top' | 'bottom';

const PART_OF_BONE: Readonly<Record<string, Part>> = {
  Neck1: 'head',
  Spine1: 'torso',
  Spine2: 'torso',
  Rig1: 'torso',
  ArmL1: 'upperArm',
  ArmR1: 'upperArm',
  ArmL2: 'foreArm',
  ArmR2: 'foreArm',
  LegL1: 'thigh',
  LegR1: 'thigh',
  LegL2: 'shin',
  LegR2: 'shin',
};

/** Where on a part a texel is: across (0 = the part's -X side), up (0 = bottom), and the face. */
interface Spot {
  part: Part;
  face: Face;
  x: number;
  h: number;
}

/** The outfit's colour at a spot. */
const colourAt = (o: Outfit, s: Spot): string => {
  const sleeve = o.over || o.shirt;
  switch (s.part) {
    case 'head': {
      const cover = o.hat || o.hair;
      if (s.face === 'top') return cover;
      if (s.face === 'bottom') return o.skin;
      if (s.face === 'back') return s.h > 0.25 ? o.hair : o.skin;
      if (o.hat && s.h > 0.8) return o.hat;
      if (o.hat && s.h > 0.74) return s.face === 'front' ? o.trim : o.hat;
      if (s.face === 'side') return s.h > (o.hat ? 0.55 : 0.6) ? o.hair : o.skin;
      // The face: a fringe, two eyes (white with the pupil inside), a smile.
      if (!o.hat && s.h > 0.84) return o.hair;
      const eyeRow = s.h > 0.44 && s.h < 0.6;
      const lx = s.x > 0.18 && s.x < 0.38;
      const rx = s.x > 0.62 && s.x < 0.82;
      if (eyeRow && (lx || rx)) return (lx && s.x > 0.27) || (rx && s.x < 0.73) ? o.eyes : '#ffffff';
      if (s.h > 0.62 && s.h < 0.67 && (lx || rx)) return o.hair;
      if (s.h > 0.2 && s.h < 0.27 && s.x > 0.36 && s.x < 0.64) return '#9a4a3c';
      if (s.h > 0.27 && s.h < 0.31 && ((s.x > 0.32 && s.x < 0.38) || (s.x > 0.62 && s.x < 0.68))) return '#9a4a3c';
      return o.skin;
    }
    case 'torso': {
      if (s.h < 0.1) return '#2b2118';
      if (s.h < 0.14 && s.face === 'front' && s.x > 0.44 && s.x < 0.56) return '#ffd23f';
      if (!o.over) return o.shirt;
      if (s.face === 'front') {
        const open = s.x > 0.4 && s.x < 0.6;
        if (open) {
          if (s.h > 0.86 && s.x > 0.45 && s.x < 0.55) return o.skin;
          if (Math.abs(s.h - 0.32) < 0.03 || Math.abs(s.h - 0.56) < 0.03) return o.trim;
          return o.shirt;
        }
        if (s.h > 0.36 && s.h < 0.44) return o.trim;
        if (s.x < 0.4 && s.x > 0.36) return o.trim;
        if (s.x > 0.6 && s.x < 0.64) return o.trim;
        return o.over;
      }
      if (s.face === 'back' && s.h > 0.36 && s.h < 0.44) return o.trim;
      return o.over;
    }
    case 'upperArm':
      if (s.h < 0.12) return o.trim;
      return sleeve;
    case 'foreArm':
      if (s.h < 0.42) return o.skin;
      if (s.h < 0.5) return o.trim;
      return sleeve;
    case 'thigh':
      if (o.longCoat && s.face !== 'bottom' && s.h > 0.35 && !(s.face === 'front' && s.x > 0.4 && s.x < 0.6)) return o.over;
      return o.pants;
    case 'shin':
      if (s.h < 0.3 || s.face === 'bottom') return o.shoes;
      if (s.h < 0.36) return '#e9e9e9';
      return o.pants;
  }
};

const C = new Color();

/** A colour with a little texel-to-texel grain, like a painted Roblox part. */
const grain = (hex: string, x: number, y: number): string => {
  C.set(hex);
  const n = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
  C.multiplyScalar(0.94 + n * 0.1);
  return `#${C.getHexString()}`;
};

const SIZE = 256;

/** Bake one mesh's skin: every triangle, at its UVs, coloured by where it lies on the body. */
const bakeMesh = (mesh: SkinnedMesh, outfit: Outfit): CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = outfit.shirt;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const g = mesh.geometry;
  const pos = g.attributes['position']!;
  const uv = g.attributes['uv']!;
  const si = g.attributes['skinIndex']!;
  const sw = g.attributes['skinWeight']!;
  const bones = mesh.skeleton.bones;
  const count = g.index ? g.index.count : pos.count;
  const vert = (k: number): number => (g.index ? g.index.getX(k) : k);
  const boneOf = (i: number): string => {
    let best = 0;
    let bw = -1;
    for (let k = 0; k < 4; k += 1) {
      const w = sw.getComponent(i, k);
      if (w > bw) {
        bw = w;
        best = si.getComponent(i, k);
      }
    }
    return bones[best]?.name ?? 'Spine1';
  };
  // Each part's extent, from the vertices it owns.
  const extent = new Map<Part, { min: Vector3; max: Vector3 }>();
  for (let i = 0; i < pos.count; i += 1) {
    const part = PART_OF_BONE[boneOf(i)] ?? 'torso';
    const e = extent.get(part) ?? { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
    const p = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    e.min.min(p);
    e.max.max(p);
    extent.set(part, e);
  }
  const A = new Vector3();
  const B = new Vector3();
  const D = new Vector3();
  const N = new Vector3();
  for (let t = 0; t + 2 < count; t += 3) {
    const ia = vert(t);
    const ib = vert(t + 1);
    const ic = vert(t + 2);
    A.set(pos.getX(ia), pos.getY(ia), pos.getZ(ia));
    B.set(pos.getX(ib), pos.getY(ib), pos.getZ(ib));
    D.set(pos.getX(ic), pos.getY(ic), pos.getZ(ic));
    N.subVectors(B, A).cross(new Vector3().subVectors(D, A)).normalize();
    const face: Face = N.z > 0.7 ? 'top' : N.z < -0.7 ? 'bottom' : N.y < -0.7 ? 'front' : N.y > 0.7 ? 'back' : 'side';
    const part = PART_OF_BONE[boneOf(ia)] ?? 'torso';
    const e = extent.get(part)!;
    const sx = Math.max(1e-6, e.max.x - e.min.x);
    const sz = Math.max(1e-6, e.max.z - e.min.z);
    // Texel space (y down, matching the texture's flipY).
    const u = [ia, ib, ic].map((i) => uv.getX(i) * SIZE);
    const v = [ia, ib, ic].map((i) => (1 - uv.getY(i)) * SIZE);
    const x0 = Math.max(0, Math.floor(Math.min(...u)) - 1);
    const x1 = Math.min(SIZE - 1, Math.ceil(Math.max(...u)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(...v)) - 1);
    const y1 = Math.min(SIZE - 1, Math.ceil(Math.max(...v)) + 1);
    const den = (v[1]! - v[2]!) * (u[0]! - u[2]!) + (u[2]! - u[1]!) * (v[0]! - v[2]!);
    if (Math.abs(den) < 1e-9) continue;
    for (let py = y0; py <= y1; py += 1)
      for (let px = x0; px <= x1; px += 1) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        const w0 = ((v[1]! - v[2]!) * (cx - u[2]!) + (u[2]! - u[1]!) * (cy - v[2]!)) / den;
        const w1 = ((v[2]! - v[0]!) * (cx - u[2]!) + (u[0]! - u[2]!) * (cy - v[2]!)) / den;
        const w2 = 1 - w0 - w1;
        // A little past the edges, so seams never show the base colour.
        if (w0 < -0.08 || w1 < -0.08 || w2 < -0.08) continue;
        const x = A.x * w0 + B.x * w1 + D.x * w2;
        const z = A.z * w0 + B.z * w1 + D.z * w2;
        const spot: Spot = { part, face, x: (x - e.min.x) / sx, h: (z - e.min.z) / sz };
        // Seen from the front the model's +X is on the viewer's right: mirror so the face reads the same.
        if (face === 'front') spot.x = 1 - spot.x;
        ctx.fillStyle = grain(colourAt(outfit, spot), px, py);
        ctx.fillRect(px, py, 1, 1);
      }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  return texture;
};

/** A shopkeeper: a Block City avatar wearing its own baked skin, one texture per mesh. */
export const buildShopkeeper = (outfit: Outfit, name: string): PlayerAvatar => {
  const avatar = new PlayerAvatar();
  avatar.character.body.model.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const map = child instanceof SkinnedMesh ? bakeMesh(child, outfit) : null;
    child.material = new MeshStandardMaterial({ map, color: map ? 0xffffff : new Color(outfit.shirt), roughness: 0.8, metalness: 0 });
  });
  avatar.setTag(name, null, -1, '#ffe14a');
  return avatar;
};
