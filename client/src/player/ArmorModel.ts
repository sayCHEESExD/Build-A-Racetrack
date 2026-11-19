import { PLAYER_HEIGHT } from '@race/shared';
import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from 'three';
import { attachToMount } from '../animation/rig/BoneMounts.js';
import type { PlayerRig } from '../animation/rig/PlayerRig.js';
import type { BoneName } from '../animation/rig/boneNames.js';

/** Plate colours per armour look (1 leather, 2 iron, 3 gold, 4 diamond, 5 moonstone): main, light, dark. */
const TIER_COLORS: Readonly<Record<number, [number, number, number]>> = {
  1: [0x9a6236, 0xc4864e, 0x5e3a1c],
  2: [0xd6d6d6, 0xf4f4f4, 0x8e8e8e],
  3: [0xf5d63c, 0xfff6a8, 0xc89a18],
  4: [0x4ee6e0, 0xc4fffa, 0x1e9a96],
  5: [0x8a7ad8, 0xc8bcff, 0x4a3a98],
};

const materials = new Map<number, MeshLambertMaterial>();

/** A 16x16 Minecraft-style armour plate: grainy metal, a dark rim, a lit edge, rivets. */
const plateMaterial = (tier: number): MeshLambertMaterial => {
  const cached = materials.get(tier);
  if (cached) return cached;
  const [main, light, dark] = TIER_COLORS[tier] ?? TIER_COLORS[2]!;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const c = canvas.getContext('2d')!;
  const hex = (n: number, k = 1): string => {
    const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
    const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
    const b = Math.min(255, Math.round((n & 255) * k));
    return `rgb(${r},${g},${b})`;
  };
  let seed = tier * 977;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < 16; y += 1)
    for (let x = 0; x < 16; x += 1) {
      c.fillStyle = hex(main, 0.9 + rand() * 0.2);
      c.fillRect(x, y, 1, 1);
    }
  c.fillStyle = hex(dark);
  c.fillRect(0, 0, 16, 1);
  c.fillRect(0, 15, 16, 1);
  c.fillRect(0, 0, 1, 16);
  c.fillRect(15, 0, 1, 16);
  c.fillStyle = hex(light);
  c.fillRect(1, 1, 14, 1);
  c.fillRect(1, 1, 1, 13);
  if (tier === 1) {
    // Leather: stitching instead of rivets.
    c.fillStyle = hex(dark, 1.1);
    for (let i = 2; i < 14; i += 3) c.fillRect(i, 7, 2, 1);
  } else {
    c.fillStyle = hex(light);
    for (const [x, y] of [
      [3, 3],
      [12, 3],
      [3, 12],
      [12, 12],
    ] as const)
      c.fillRect(x, y, 1, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshLambertMaterial({ map: texture });
  materials.set(tier, material);
  return material;
};

const BOX = new BoxGeometry(1, 1, 1);
const A = new Vector3();
const UP = new Vector3(0, 1, 0);

interface Part {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

/** One armour piece: a box from joint `a` toward joint `b` (rig-root space), worn on `bone`. */
interface PieceSpec {
  bone: BoneName;
  /** Box centre and the segment direction it is laid along (root space, bind pose). */
  centre: Vector3;
  along: Vector3;
  /** Size across, along the segment, and front-to-back. */
  width: number;
  length: number;
  depth: number;
}

/**
 * MINECRAFT ARMOUR ON A BLOXITY BODY: plate shells pinned to the rig's bones,
 * measured on the body itself in the bind pose (so they fit the bundled rig
 * and any Bloxity body), drawn a little larger than the limbs they cover. The
 * helmet leaves the face open, as Minecraft's does. Tier 0 wears nothing.
 *
 *   helmet      Neck1: a cap - top, back, sides and a brow
 *   chestplate  Spine2: the torso, plus pads on both upper arms
 *   leggings    Spine1 belt + both thighs
 *   boots       both shins, lower half
 */
export class ArmorModel {
  private readonly pieces: Object3D[] = [];
  private tier = 0;
  private specs: { spec: PieceSpec; parts: Part[] }[] = [];

  /**
   * Measure the body (root at the origin, bind pose) - call whenever the body
   * changes. A Bloxity body is built of named box parts (torso, head, arms,
   * legs - any catalogue part keeps the name), so the plates are fitted to
   * the real part boxes; a body without them falls back to the joints.
   */
  measure(rig: PlayerRig, root: Object3D, model: Object3D): void {
    root.updateMatrixWorld(true);
    const inverse = new Matrix4().copy(root.matrixWorld).invert();
    this.specs = [];
    // ---- the parts' boxes in root space.
    const parts: Record<string, Box3> = {};
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || !mesh.geometry || o.userData['armor']) return;
      const name = o.name.toLowerCase();
      const key = /arm_?l/.test(name) ? 'armL' : /arm_?r/.test(name) ? 'armR' : /leg_?l/.test(name) ? 'legL' : /leg_?r/.test(name) ? 'legR' : /torso/.test(name) ? 'torso' : /head/.test(name) ? 'head' : '';
      if (!key) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      parts[key] = parts[key] ? parts[key]!.union(box) : box;
    });
    const torso = parts['torso'];
    const head = parts['head'];
    if (torso && head && parts['armL'] && parts['armR'] && parts['legL'] && parts['legR']) {
      this.fromParts(parts as Record<'torso' | 'head' | 'armL' | 'armR' | 'legL' | 'legR', Box3>);
      return;
    }
    this.fromJoints(rig, root);
  }

  /** A plate covering part of a box: the slice from `y0` to `y1` (0 bottom .. 1 top), grown by `grow`. */
  private plate(bone: BoneName, box: Box3, y0: number, y1: number, grow: number, parts?: Part[]): void {
    const size = box.getSize(new Vector3());
    const bottom = box.min.y + size.y * y0;
    const top = box.min.y + size.y * y1;
    const centre = new Vector3((box.min.x + box.max.x) / 2, (bottom + top) / 2, (box.min.z + box.max.z) / 2);
    this.specs.push({
      spec: { bone, centre, along: UP.clone(), width: size.x + grow * 2, length: top - bottom + grow * 2, depth: size.z + grow * 2 },
      parts: parts ?? [{ x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 }],
    });
  }

  private fromParts(p: Record<'torso' | 'head' | 'armL' | 'armR' | 'legL' | 'legR', Box3>): void {
    const unit = p.torso.getSize(new Vector3()).y;
    const g = unit * 0.045;
    // Chestplate: the torso and the upper arms.
    this.plate('Spine2', p.torso, 0.18, 1, g);
    this.plate('ArmL1', p.armL, 0.5, 1, g * 1.4);
    this.plate('ArmR1', p.armR, 0.5, 1, g * 1.4);
    // Leggings: a belt round the bottom of the torso, and the thighs.
    this.plate('Spine1', p.torso, 0, 0.2, g * 1.6);
    this.plate('LegL1', p.legL, 0.42, 1, g);
    this.plate('LegR1', p.legR, 0.42, 1, g);
    // Boots: the lower legs.
    this.plate('LegL2', p.legL, 0, 0.36, g * 1.5);
    this.plate('LegR2', p.legR, 0, 0.36, g * 1.5);
    // Helmet: an open-faced cap - top, back, sides, a brow (the face stays visible).
    const hs = p.head.getSize(new Vector3());
    const t = 0.1;
    const tz = 0.1;
    this.plate('Neck1', p.head, 0.12, 1, unit * 0.06, [
      { x: 0, y: 0.5 - t / 2, z: 0, w: 1, h: t, d: 1 },
      { x: 0, y: 0, z: -0.5 + tz / 2, w: 1, h: 1, d: tz },
      { x: -0.5 + tz / 2, y: 0.05, z: 0, w: tz, h: 0.9, d: 1 },
      { x: 0.5 - tz / 2, y: 0.05, z: 0, w: tz, h: 0.9, d: 1 },
      { x: 0, y: 0.38, z: 0.5 - tz / 2, w: 1, h: 0.24, d: tz },
    ]);
    void hs;
  }

  /** The bundled rig (no named parts): plates sized from the joints. */
  private fromJoints(rig: PlayerRig, root: Object3D): void {
    const inverse = new Matrix4().copy(root.matrixWorld).invert();
    const at = (name: BoneName): Vector3 | null => {
      const bone = rig.getBone(name);
      return bone ? bone.getWorldPosition(A).applyMatrix4(inverse).clone() : null;
    };
    const shoulderL = at('ArmL1');
    const shoulderR = at('ArmR1');
    const hipL = at('LegL1');
    const hipR = at('LegR1');
    const neck = at('Neck1');
    if (!shoulderL || !shoulderR || !hipL || !hipR || !neck) return;
    const w = Math.abs(shoulderL.x - shoulderR.x);
    const limb = w * 0.42;
    const torsoW = w - limb;
    const hipY = hipL.y;
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box3 => new Box3(new Vector3(x0, y0, z0), new Vector3(x1, y1, z1));
    const d = limb * 0.65;
    this.fromParts({
      torso: box(-torsoW / 2, hipY, -d, torsoW / 2, neck.y, d),
      head: box(-limb * 0.65, neck.y, -limb * 0.65, limb * 0.65, PLAYER_HEIGHT, limb * 0.65),
      armL: box(torsoW / 2, neck.y - (neck.y - hipY), -d, torsoW / 2 + limb, neck.y, d),
      armR: box(-torsoW / 2 - limb, neck.y - (neck.y - hipY), -d, -torsoW / 2, neck.y, d),
      legL: box(0, 0, -d, torsoW / 2, hipY, d),
      legR: box(-torsoW / 2, 0, -d, 0, hipY, d),
    });
  }


  /** Wear a tier (0 = none). Rebuilds the shells on the bones. `root` must be at the origin when the body changed. */
  build(rig: PlayerRig, root: Object3D, tier: number): void {
    this.clear();
    this.tier = tier;
    if (tier <= 0 || this.specs.length === 0) return;
    const material = plateMaterial(tier);
    for (const { spec, parts } of this.specs) {
      const bone = rig.getBone(spec.bone);
      if (!bone) continue;
      const piece = new Group();
      for (const p of parts) {
        const mesh = new Mesh(BOX, material);
        mesh.userData['armor'] = true;
        mesh.position.set(p.x * spec.width, p.y * spec.length, p.z * spec.depth);
        mesh.scale.set(p.w * spec.width, p.h * spec.length, p.d * spec.depth);
        piece.add(mesh);
      }
      // Lay the piece along its segment: local +Y = the segment, +Z = the body's front.
      const y = spec.along.clone().normalize();
      const z = new Vector3(0, 0, 1).addScaledVector(y, -y.z).normalize();
      if (z.lengthSq() < 1e-4) z.set(0, 1, 0);
      const x = new Vector3().crossVectors(y, z).normalize();
      const frame = new Matrix4().makeBasis(x, y, z).setPosition(spec.centre);
      attachToMount(piece, { bone, frame }, root);
      this.pieces.push(piece);
    }
  }

  get currentTier(): number {
    return this.tier;
  }

  clear(): void {
    for (const piece of this.pieces) piece.removeFromParent();
    this.pieces.length = 0;
  }
}
