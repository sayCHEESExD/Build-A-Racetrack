import { GROUND_Y, WALKWAYS, WALKWAY_HALF_W, WALKWAY_SPEED } from '@race/shared';
import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshLambertMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { PartBuilder } from '../render/PartBuilder.js';
import { signBoard } from './signs.js';

/**
 * THE MOVING WALKWAYS down the middle of the main road (`WALKWAYS` in the
 * shared map; the carrying itself is in `stepBody`): escalator treads that
 * really flow - grooved metal steps with yellow chevrons pointing the way -
 * between yellow edge strips, a comb plate at each end, glowing bollards
 * along the outside and a sign where each one starts.
 */

const G = GROUND_Y;
/** One texture tile covers this much belt (a chevron each). */
const TILE_LEN = 2.7;
const TREAD_H = 0.07;

const treadTexture = (): CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#5a6178';
  c.fillRect(0, 0, 128, 128);
  // Grooves along the travel, a step seam across it every quarter tile.
  c.fillStyle = '#6e7690';
  for (let x = 4; x < 128; x += 8) c.fillRect(x, 0, 3, 128);
  c.fillStyle = '#3a4054';
  for (let y = 0; y < 128; y += 32) c.fillRect(0, y, 128, 4);
  // The chevron, pointing up the canvas: v = 1 on the face (flipY), the way the tread flows.
  c.strokeStyle = '#ffe14a';
  c.lineWidth = 14;
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(30, 84);
  c.lineTo(64, 46);
  c.lineTo(98, 84);
  c.stroke();
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
};

export class Walkways {
  readonly group = new Group();
  private readonly textures: { tex: CanvasTexture; dir: number }[] = [];

  constructor(b: PartBuilder) {
    for (const w of WALKWAYS) this.lane(b, w);
  }

  private lane(b: PartBuilder, w: (typeof WALKWAYS)[number]): void {
    const len = w.z1 - w.z0;
    const zc = (w.z0 + w.z1) / 2;
    const half = WALKWAY_HALF_W;
    // The bed under the treads, and the yellow edge strips standing just above them.
    b.box(half * 2 + 0.4, 0.04, len + 0.6, 0x3a3f55, 'smooth', { x: w.x, y: G + 0.02, z: zc });
    for (const s of [-1, 1]) b.box(0.2, 0.1, len, 0xffd23f, 'smooth', { x: w.x + s * (half + 0.1), y: G + 0.05, z: zc });
    // Comb plates at both ends: hazard-striped, a little higher than the treads.
    for (const end of [w.z0, w.z1]) {
      for (let i = 0; i < 6; i += 1) {
        b.box((half * 2 + 0.4) / 6, 0.1, 0.9, i % 2 ? 0x22242e : 0xffd23f, 'smooth', { x: w.x - half - 0.2 + (i + 0.5) * ((half * 2 + 0.4) / 6), y: G + 0.05, z: end + (end === w.z0 ? 0.45 : -0.45) });
      }
    }
    // Glowing bollards along the outside every 16 units.
    const outer = w.x + Math.sign(w.x) * (half + 0.45);
    for (let z = w.z0 + 8; z < w.z1 - 4; z += 16) {
      b.add(new CylinderGeometry(0.14, 0.18, 0.7, 8), 0x2b2f45, 'smooth', { x: outer, y: G + 0.35, z });
      b.add(new CylinderGeometry(0.15, 0.15, 0.14, 8), w.dir < 0 ? 0x7dff6a : 0x3fc8ff, 'glow', { x: outer, y: G + 0.62, z });
    }
    // The treads: one long box whose top flows (the texture scrolls in update()).
    const tex = treadTexture();
    tex.repeat.set(1, len / TILE_LEN);
    const tread = new Mesh(new BoxGeometry(half * 2, TREAD_H, len), new MeshLambertMaterial({ map: tex }));
    tread.position.set(w.x, G + TREAD_H / 2, zc);
    // The box's top runs +v toward -z (north): turned half round, the chevrons and the scroll point south.
    if (w.dir > 0) tread.rotation.y = Math.PI;
    tread.receiveShadow = true;
    this.group.add(tread);
    this.textures.push({ tex, dir: w.dir });
    // A sign over where each one starts, saying where it goes.
    const startZ = w.dir < 0 ? w.z1 : w.z0;
    const sign = signBoard(w.dir < 0 ? 'SHOPS' : 'SPAWN', w.dir < 0 ? 'Walkway: Tracks, Decors, Crates' : 'Walkway: back to spawn', w.dir < 0 ? '#2f8f3a' : '#2f6fd6', '#ffe14a', 3.6, 1.1, 0xffd23f);
    sign.position.set(w.x, G + 3.1, startZ - w.dir * 0.2);
    sign.rotation.y = w.dir < 0 ? 0 : Math.PI;
    this.group.add(sign);
    for (const s of [-1, 1]) b.box(0.18, 3.1, 0.18, 0x2b2f45, 'flat', { x: w.x + s * 1.75, y: G + 1.55, z: startZ - w.dir * 0.35 });
  }

  update(delta: number): void {
    // Texture tiles per second: belt speed over the tile length. The canvas is flipped onto the
    // face (its top is v = 1), so the chevrons point +v; LOWERING the offset moves them +v - the
    // way they point, and the way the belt carries you (stepBody).
    for (const t of this.textures) t.tex.offset.y = (((t.tex.offset.y - (WALKWAY_SPEED / TILE_LEN) * delta) % 1) + 1) % 1;
  }
}
