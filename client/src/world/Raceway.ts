import {
  ARENA,
  GRANDSTANDS,
  TROPHY,
  CLIFF_Z0,
  CLIFF_Z1,
  GATE_OPENING,
  GATE_Z_C,
  LENGTH_BOARD_C,
  LIKES_BOARD_C,
  GROUND_Y,
  LEADERBOARDS,
  PLOTS,
  PLOT_UNITS_X,
  PLOT_UNITS_Z,
  ROAD_HALF_W,
  ROAD_NORTH,
  ROAD_SOUTH,
  SHOPS,
  TUNNEL,
  fmtMoney,
  pitPad,
  plotSign,
  spawnPad,
  toWorld,
  type PlotDef,
  type ShopKind,
} from '@race/shared';
import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, PlaneGeometry, type Scene } from 'three';
import type { PlayerAvatar } from '../player/PlayerAvatar.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { studPlastic } from '../render/Studs.js';
import { boulders, broadleaf, bush, flowers, palm, seeded, shade, type Rand } from './Nature.js';
import { buildShopkeeper, OUTFITS } from './Shopkeeper.js';
import { buildShop } from './Shops.js';
import { ISLAND, buildTerrain } from './Terrain.js';
import { FONT, LivePanel, fitText, hex, signBoard, strokeText } from './signs.js';

const G = GROUND_Y;
const KERB_RED = 0xe8352e;
const KERB_WHITE = 0xf4f4f4;
const FENCE = 0x8a5428;
const FENCE_DARK = 0x6e4220;
const ROCK = [0x6a5aa8, 0x5f50a0, 0x7566b4, 0x5a4a92] as const;
const PILLAR = 0xb9a8ec;

const groundMaterial = studPlastic({ vertexColors: true }, 1);

const cyl = (rt: number, rb: number, h: number, n = 10): CylinderGeometry => new CylinderGeometry(rt, rb, h, n);

/** A world point a plot's canonical (cx, cz) units maps to. */
const pw = (plot: PlotDef, cx: number, cz: number): { x: number; z: number } => {
  const [x, z] = toWorld(plot.frame, cx, cz);
  return { x, z };
};

interface PlotSigns {
  name: LivePanel;
  length: LivePanel;
  likes: LivePanel;
}

/**
 * THE RACEWAY, built once in bright studded plastic (the +1 Monkey Evolution
 * look): the painted ground, the long road with its markings and kerbs, six
 * fenced plots with their pit lanes, nameplates and signs, the TRACKS /
 * Decors / Crates stalls by the purple cliff and its tunnel, the Showcase
 * beyond, the leaderboards and title arch at spawn, chunky trees, rocks,
 * flowers and the sea all round. Static geometry merges into a few meshes.
 */
export class Raceway {
  readonly group = new Group();
  readonly keepers: { kind: ShopKind; avatar: PlayerAvatar }[] = [];
  private readonly signs: PlotSigns[] = [];
  private readonly boards = new Map<string, LivePanel>();
  private time = 0;

  constructor(scene: Scene) {
    scene.add(this.group);
    const r = seeded(20261119);
    const b = new PartBuilder();

    // ---- ground and sea
    const terrain = new Mesh(buildTerrain(), groundMaterial);
    terrain.receiveShadow = true;
    this.group.add(terrain);
    const sea = new Mesh(new PlaneGeometry(1600, 1600), new MeshLambertMaterial({ color: 0x3fb8ff }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, G - 7.2, -50);
    this.group.add(sea);

    this.road(b);
    for (const plot of PLOTS) this.plot(b, plot);
    for (const shop of SHOPS) this.stall(b, shop.kind);
    this.cliff(b, r);
    this.arena(b, r);
    this.spawnPlaza(b);
    this.scenery(b, r);

    this.group.add(b.build('raceway'));
  }

  // ---------------------------------------------------------------- the road

  private road(b: PartBuilder): void {
    const z0 = ROAD_NORTH;
    const z1 = ROAD_SOUTH - 30;
    // Centre dashes and edge lines (thin raised strips, never coplanar with the ground).
    for (let z = z0 + 2; z < z1 - 2; z += 7) b.box(0.32, 0.06, 3.2, 0xf4f4f4, 'smooth', { x: 0, y: G + 0.03, z: z + 1.6 });
    for (const s of [-1, 1]) b.box(0.28, 0.06, z1 - z0, 0xffd23f, 'smooth', { x: s * (ROAD_HALF_W - 0.5), y: G + 0.03, z: (z0 + z1) / 2 });
    // Kerbs along the verge in front of every plot (the road side), red and white.
    for (const plot of PLOTS) {
      const x = plot.cx - plot.side * (PLOT_UNITS_X / 2 + 1.2);
      const zA = plot.cz - PLOT_UNITS_Z / 2;
      const sign = plotSign(plot);
      for (let z = zA; z < zA + PLOT_UNITS_Z; z += 1.2) {
        // Leave the opening in front of the Start Gate and its pit clear, and the nameplate.
        const cz = plot.frame.rot === 0 ? z + 0.6 - plot.frame.minZ : plot.frame.minZ + PLOT_UNITS_Z - z - 0.6;
        if (Math.abs(cz - GATE_Z_C) < GATE_OPENING + 0.6) continue;
        if (Math.abs(z + 0.6 - sign.z) < 8) continue;
        b.box(0.6, 0.32, 1.18, Math.floor(z / 1.2) % 2 === 0 ? KERB_RED : KERB_WHITE, 'stud', { x, y: G + 0.16, z: z + 0.6 });
      }
    }
    // Lamp posts down the road, chunky and bright.
    for (let z = z0 + 30; z < z1; z += 40) for (const s of [-1, 1]) {
      const x = s * (ROAD_HALF_W + 1.2);
      b.add(cyl(0.16, 0.22, 6, 8), 0x3a3f55, 'smooth', { x, y: G + 3, z });
      b.box(0.2, 0.2, 1.6, 0x3a3f55, 'smooth', { x: x - s * 0.7, y: G + 6, z, ry: Math.PI / 2 });
      b.box(0.7, 0.24, 0.5, 0xfff4b0, 'glow', { x: x - s * 1.4, y: G + 5.85, z });
    }
  }

  // ---------------------------------------------------------------- a plot

  private plot(b: PartBuilder, plot: PlotDef): void {
    const W = PLOT_UNITS_X;
    const L = PLOT_UNITS_Z;
    // Fence: posts every 4 units and two rails, round three sides and the road side either side of the gate's opening.
    const post = (cx: number, cz: number): void => {
      const p = pw(plot, cx, cz);
      b.box(0.4, 1.3, 0.4, FENCE_DARK, 'flat', { x: p.x, y: G + 0.65, z: p.z });
      b.box(0.5, 0.14, 0.5, FENCE, 'flat', { x: p.x, y: G + 1.35, z: p.z });
    };
    const rail = (ax: number, az: number, bx: number, bz: number): void => {
      const a = pw(plot, ax, az);
      const c = pw(plot, bx, bz);
      const len = Math.hypot(c.x - a.x, c.z - a.z);
      const yaw = Math.atan2(c.x - a.x, c.z - a.z);
      for (const y of [0.45, 0.95]) b.box(0.16, 0.18, len, FENCE, 'flat', { x: (a.x + c.x) / 2, y: G + y, z: (a.z + c.z) / 2, ry: yaw });
    };
    for (let cz = 0; cz <= L; cz += 4) post(W + 0.3, cz);
    rail(W + 0.3, 0, W + 0.3, L);
    for (let cx = 0; cx <= W; cx += 4) {
      post(cx, -0.3);
      post(cx, L + 0.3);
    }
    rail(0, -0.3, W + 0.3, -0.3);
    rail(0, L + 0.3, W + 0.3, L + 0.3);
    const o0 = GATE_Z_C - GATE_OPENING;
    const o1 = GATE_Z_C + GATE_OPENING;
    for (let cz = 0; cz <= o0; cz += 4) post(-0.3, cz);
    for (let cz = L; cz >= o1; cz -= 4) post(-0.3, cz);
    rail(-0.3, -0.3, -0.3, o0);
    rail(-0.3, o1, -0.3, L + 0.3);
    this.entranceArch(b, plot);
    // Tyre stacks at the road-side corners, red and white flags.
    for (const cz of [-1.5, L + 1.5]) {
      const p = pw(plot, -1.2, cz);
      for (let i = 0; i < 3; i += 1) for (let j = 0; j < 2 + (i % 2); j += 1) {
        b.add(cyl(0.5, 0.5, 0.36, 10), 0x2b2f45, 'flat', { x: p.x + (i - 1) * 1.05 * plot.side, y: G + 0.19 + j * 0.37, z: p.z });
        b.add(cyl(0.51, 0.51, 0.08, 10), (i + j) % 2 ? KERB_WHITE : 0xb8a8ec, 'smooth', { x: p.x + (i - 1) * 1.05 * plot.side, y: G + 0.19 + j * 0.37, z: p.z });
      }
    }
    // Chequered flag pairs at the far corners.
    for (const cz of [2, L - 2]) {
      const p = pw(plot, W - 1.5, cz);
      for (const s of [-1, 1]) {
        b.add(cyl(0.06, 0.06, 4.2, 6), 0x2b2f45, 'smooth', { x: p.x + s * 0.5, y: G + 2.1, z: p.z, rz: s * 0.18 });
        for (let a = 0; a < 4; a += 1) for (let c = 0; c < 3; c += 1) b.box(0.42, 0.42, 0.05, (a + c) % 2 ? 0xffffff : 0x1f2230, 'smooth', { x: p.x + s * (0.9 + a * 0.42), y: G + 3.9 - c * 0.42, z: p.z });
      }
    }
    // The pit: the Spawn Car pad (a lavender pedestal with its big red button) and the Pit Stop canopy.
    const sp = spawnPad(plot);
    b.box(2.8, 0.2, 2.8, 0x7a6ad8, 'stud', { x: sp.x, y: G + 0.1, z: sp.z });
    b.box(2.2, 0.08, 2.2, 0xb9a8ec, 'glow', { x: sp.x, y: G + 0.24, z: sp.z });
    const btn = pw(plot, 0.7, GATE_Z_C + 2.6);
    b.box(0.9, 1.1, 0.9, 0x7a6ad8, 'stud', { x: btn.x, y: G + 0.55, z: btn.z });
    b.add(cyl(0.32, 0.32, 0.2, 10), 0xff3a2a, 'glow', { x: btn.x, y: G + 1.2, z: btn.z });
    const pit = pitPad(plot);
    b.box(2.8, 0.2, 2.8, 0x5a6070, 'stud', { x: pit.x, y: G + 0.1, z: pit.z });
    for (const [dx, dz] of [
      [-1.2, -1.2],
      [1.2, -1.2],
      [-1.2, 1.2],
      [1.2, 1.2],
    ] as const)
      b.box(0.22, 3.2, 0.22, 0xffd23f, 'smooth', { x: pit.x + dx, y: G + 1.6, z: pit.z + dz });
    b.box(3.0, 0.3, 3.0, 0xe8352e, 'stud', { x: pit.x, y: G + 3.3, z: pit.z });
    b.box(3.1, 0.12, 0.5, 0xffffff, 'smooth', { x: pit.x, y: G + 3.5, z: pit.z });
    // A wrench and a tyre on the pit pad.
    b.box(0.25, 0.08, 1.0, 0xa8b4c8, 'smooth', { x: pit.x + 0.6, y: G + 0.26, z: pit.z, ry: 0.6 });
    b.add(cyl(0.4, 0.4, 0.3, 10), 0x2b2f45, 'flat', { x: pit.x - 0.8, y: G + 0.36, z: pit.z + 0.7 });
    // The nameplate: a long low brick wall on the verge facing the road ("Nobody's Base").
    const sign = plotSign(plot);
    b.box(0.6, 1.5, 14.6, 0x8a3a3a, 'stud', { x: sign.x + plot.side * 0.35, y: G + 0.75, z: sign.z });
    b.box(0.7, 0.18, 14.8, 0xa84a4a, 'smooth', { x: sign.x + plot.side * 0.35, y: G + 1.56, z: sign.z });
    const name = new LivePanel(14, 1.2, 64);
    name.mesh.position.set(sign.x - plot.side * 0.02, G + 0.78, sign.z);
    name.mesh.rotation.y = sign.yaw;
    this.group.add(name.mesh);
    // Length and Likes boards by the pit, on posts.
    const lenAt = pw(plot, LENGTH_BOARD_C[0], LENGTH_BOARD_C[1]);
    const likeAt = pw(plot, LIKES_BOARD_C[0], LIKES_BOARD_C[1]);
    const mk = (p: { x: number; z: number }, color: number): LivePanel => {
      b.box(0.2, 2.2, 0.2, 0x5a3a20, 'flat', { x: p.x, y: G + 1.1, z: p.z });
      b.box(0.24, 1.1, 2.7, color, 'smooth', { x: p.x, y: G + 2.5, z: p.z });
      const panel = new LivePanel(2.5, 0.95, 96);
      panel.mesh.position.set(p.x - plot.side * 0.14, G + 2.5, p.z);
      panel.mesh.rotation.y = sign.yaw;
      this.group.add(panel.mesh);
      return panel;
    };
    const length = mk(lenAt, 0x6a4020);
    const likes = mk(likeAt, 0x6a4020);
    this.signs[plot.index] = { name, length, likes };
    this.setOwner(plot.index, null);
    this.setPlotStats(plot.index, 0, 25, 0);
  }

  /**
   * The plot's ENTRANCE ARCH, in the middle of its road side with its face to
   * the road (the track's own Start Gate sits in the corner): chunky lavender
   * towers banded red and white, a battlemented beam, chequered flags.
   */
  private entranceArch(b: PartBuilder, plot: PlotDef): void {
    const half = GATE_OPENING + 0.2;
    const x = pw(plot, -0.3, GATE_Z_C).x;
    const zc = pw(plot, -0.3, GATE_Z_C).z;
    for (const side of [-1, 1]) {
      const z = zc + side * half;
      b.box(1.7, 0.5, 1.7, 0x9a88d8, 'stud', { x, y: G + 0.25, z });
      for (let lvl = 0; lvl < 7; lvl += 1) {
        const color = lvl === 2 || lvl === 5 ? KERB_RED : lvl === 3 ? KERB_WHITE : lvl % 2 ? 0xa898e0 : 0xb9a8ec;
        b.box(1.25 - (lvl > 4 ? 0.1 : 0), 0.9, 1.25 - (lvl > 4 ? 0.1 : 0), color, 'stud', { x, y: G + 0.95 + lvl * 0.9, z });
      }
      // Chequered flags on poles above each tower, flying out over the road.
      b.add(cyl(0.07, 0.07, 2.6, 6), 0x2b2f45, 'smooth', { x, y: G + 9.4, z: z + side * 0.2 });
      for (let a = 0; a < 5; a += 1) for (let c = 0; c < 3; c += 1) b.box(0.05, 0.42, 0.42, (a + c) % 2 ? 0xffffff : 0x1f2230, 'smooth', { x, y: G + 10.4 - c * 0.42, z: z + side * (0.45 + a * 0.42) });
    }
    // The beam, its battlements, and a lit underside.
    b.box(1.5, 1.0, half * 2 + 1.9, 0x8f80c8, 'stud', { x, y: G + 7.3, z: zc });
    b.box(1.2, 0.08, half * 2 - 1.2, 0xfff4b0, 'glow', { x, y: G + 6.76, z: zc });
    for (let j = -4; j <= 4; j += 2) b.box(1.1, 0.5, 0.8, 0xa898e0, 'stud', { x, y: G + 8.05, z: zc + j * 1.05 });
    // A banner across the face (both faces), red and white kerb blocks.
    for (const face of [-1, 1]) for (let j = 0; j < 10; j += 1) b.box(0.1, 0.36, (half * 2 - 1.4) / 10, j % 2 ? KERB_WHITE : KERB_RED, 'smooth', { x: x + face * 0.78, y: G + 7.3, z: zc - (half - 0.7) + (j + 0.5) * ((half * 2 - 1.4) / 10) });
  }

  /** "Name's Base" on a plot's nameplate (null: Nobody's). */
  setOwner(plot: number, name: string | null): void {
    const s = this.signs[plot];
    if (!s) return;
    const text = name ? `${name}'s Base` : "Nobody's Base";
    s.name.draw(text, (c, W, H) => {
      c.fillStyle = 'rgba(0,0,0,0)';
      const px = fitText(c, text, Math.round(H * 0.62), W * 0.92, 800);
      strokeText(c, text, W / 2, H / 2, '#ffffff', px, 'rgba(60,10,10,0.75)');
    });
  }

  setPlotStats(plot: number, length: number, max: number, likes: number): void {
    const s = this.signs[plot];
    if (!s) return;
    s.length.draw(`${length}/${max}`, (c, W, H) => {
      const t = `${length}/${max} Length`;
      const px = fitText(c, t, Math.round(H * 0.42), W * 0.9);
      strokeText(c, t, W / 2, H / 2, '#ffe14a', px);
    });
    s.likes.draw(`${likes}`, (c, W, H) => {
      const t = `${likes} Likes`;
      const px = fitText(c, t, Math.round(H * 0.42), W * 0.9);
      strokeText(c, t, W / 2, H / 2, '#ff8ad8', px);
    });
  }

  // ---------------------------------------------------------------- the stalls

  private stall(b: PartBuilder, kind: ShopKind): void {
    const shop = SHOPS.find((s) => s.kind === kind)!;
    const { x, z } = shop;
    buildShop(b, this.group, shop);
    const name = kind === 'track' ? 'Haze the Builder' : kind === 'decor' ? 'Daisy the Decorator' : 'Crate Keeper Kai';
    const keeper = buildShopkeeper(OUTFITS[kind], name);
    keeper.root.position.set(x, G + 0.36, z - 0.6);
    keeper.root.rotation.y = shop.yaw;
    this.group.add(keeper.root);
    this.keepers.push({ kind, avatar: keeper });
  }

  // ---------------------------------------------------------------- cliff and tunnel

  private cliff(b: PartBuilder, r: Rand): void {
    const z0 = CLIFF_Z0;
    const z1 = CLIFF_Z1;
    const depth = z1 - z0;
    // Big stepped purple-rock blocks with grass caps, either side of the tunnel.
    for (const side of [-1, 1]) {
      for (let x = TUNNEL.halfW; x < ISLAND.maxX; x += 6) {
        const h = 12 + Math.floor(r() * 3) * 2 + (x < 20 ? 2 : 0);
        const wx = side * (x + 3);
        b.box(6.2, h, depth, ROCK[Math.floor(r() * ROCK.length)]!, 'stud', { x: wx, y: G + h / 2, z: (z0 + z1) / 2 });
        b.box(6.4, 0.8, depth + 0.4, 0x4ed838, 'stud', { x: wx, y: G + h + 0.4, z: (z0 + z1) / 2 });
        // Chunky ledges on the face.
        if (r() > 0.4) b.box(2 + r() * 2, 1.6, 1.4, ROCK[Math.floor(r() * ROCK.length)]!, 'stud', { x: wx + (r() - 0.5) * 3, y: G + 2 + r() * (h - 4), z: z1 + 0.6 });
      }
    }
    // The tunnel: a dark mouth framed by grey stone, its inside walls and roof.
    const T = TUNNEL;
    b.box(T.halfW * 2 + 4, 4, depth, ROCK[0], 'stud', { x: 0, y: G + T.h + 2, z: (z0 + z1) / 2 });
    b.box(T.halfW * 2 + 4.4, 0.8, depth + 0.4, 0x4ed838, 'stud', { x: 0, y: G + T.h + 4.4, z: (z0 + z1) / 2 });
    for (const s of [-1, 1]) {
      b.box(1.6, T.h + 1, 1.6, 0x6a6e80, 'stud', { x: s * (T.halfW + 0.8), y: G + (T.h + 1) / 2, z: z1 + 0.5 });
      b.box(0.4, T.h, depth, 0x1a1a24, 'flat', { x: s * (T.halfW - 0.2), y: G + T.h / 2, z: (z0 + z1) / 2 });
    }
    b.box(T.halfW * 2 + 3.2, 1.6, 1.6, 0x6a6e80, 'stud', { x: 0, y: G + T.h + 0.8, z: z1 + 0.5 });
    b.box(T.halfW * 2, 0.4, depth, 0x1a1a24, 'flat', { x: 0, y: G + T.h - 0.2, z: (z0 + z1) / 2 });
    const showcase = signBoard('SHOWCASE', 'Drive published racetracks', '#2b1f5a', '#ff8ad8', 6.4, 1.6, 0xffd23f);
    showcase.position.set(0, G + T.h + 2.4, z1 + 1.4);
    this.group.add(showcase);
  }

  private arena(b: PartBuilder, r: Rand): void {
    const a = ARENA;
    // Walls round the Showcase, lavender with red and white tops.
    const wall = (x0: number, z0: number, x1: number, z1: number): void => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      b.box(4, 6, len, PILLAR, 'stud', { x: (x0 + x1) / 2, y: G + 3, z: (z0 + z1) / 2, ry: yaw });
      for (let t = 0; t < len; t += 2) b.box(4.2, 0.6, 2, Math.floor(t / 2) % 2 ? KERB_WHITE : KERB_RED, 'stud', { x: x0 + ((x1 - x0) * (t + 1)) / len, y: G + 6.3, z: z0 + ((z1 - z0) * (t + 1)) / len, ry: yaw });
    };
    wall(-38, -310, 38, -310);
    wall(-38, -310, -38, -202);
    wall(38, -310, 38, -202);
    // The Showcase's Spawn Car pad and a sign.
    const sp = spawnPad(a);
    b.box(2.8, 0.2, 2.8, 0x7a6ad8, 'stud', { x: sp.x, y: G + 0.1, z: sp.z });
    b.box(2.2, 0.08, 2.2, 0xff8ad8, 'glow', { x: sp.x, y: G + 0.24, z: sp.z });
    const board = signBoard('SHOWCASE PAD', 'Drive the track you loaded', '#7a3fe0', '#ffe14a', 4.4, 1.3, 0xffd23f);
    board.position.set(sp.x - 3.2, G + 2.4, sp.z);
    board.rotation.y = Math.PI / 2;
    this.group.add(board);
    b.box(0.2, 2.2, 0.2, 0x5a3a20, 'flat', { x: sp.x - 3.3, y: G + 1.1, z: sp.z });
    // Grandstands along both sides.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i += 1) {
        const x = s * (32 - i * 1.4);
        b.box(1.4, 1 + i * 0.9, 60, i % 2 ? 0x3a7bea : 0x3fa2ff, 'stud', { x, y: G + (1 + i * 0.9) / 2, z: a.cz });
        for (let k = 0; k < 20; k += 1) {
          if (r() < 0.45) continue;
          const c = [0xe8352e, 0xffd23f, 0x58d36a, 0xff8a2a, 0xb15cff, 0xff4fb8][Math.floor(r() * 6)]!;
          b.box(0.6, 0.9, 0.6, c, 'smooth', { x, y: G + 1 + i * 0.9 + 0.45, z: a.cz - 28 + k * 3 });
          b.box(0.5, 0.5, 0.5, 0xf2c89a, 'smooth', { x, y: G + 1 + i * 0.9 + 1.15, z: a.cz - 28 + k * 3 });
        }
      }
    }
  }

  // ---------------------------------------------------------------- spawn plaza

  private spawnPlaza(b: PartBuilder): void {
    const z = ROAD_SOUTH - 32;
    // The title arch over the road, just north of the spawn: its title faces the spawn (south).
    for (const s of [-1, 1]) {
      for (let lvl = 0; lvl < 8; lvl += 1) b.box(1.8, 1, 1.8, lvl === 3 ? KERB_RED : lvl === 4 ? KERB_WHITE : lvl % 2 ? 0xa898e0 : PILLAR, 'stud', { x: s * (ROAD_HALF_W + 2), y: G + 0.5 + lvl, z });
    }
    b.box((ROAD_HALF_W + 3) * 2, 1.2, 1.6, 0x8f80c8, 'stud', { x: 0, y: G + 8.6, z });
    const title = signBoard('BUILD A RACETRACK', 'Build it. Drive it. Get rich.', '#e8352e', '#ffe14a', 13, 2.6, 0xffffff);
    title.position.set(0, G + 10.6, z + 0.3);
    this.group.add(title);
    const back = signBoard('BUILD A RACETRACK', 'Back to spawn', '#3fa2ff', '#ffffff', 13, 2.6, 0xffffff);
    back.position.set(0, G + 10.6, z - 0.3);
    back.rotation.y = Math.PI;
    this.group.add(back);
    // The golden trophy on its plinth.
    b.box(TROPHY.r * 2, 1.4, TROPHY.r * 2, 0x8f80c8, 'stud', { x: TROPHY.x, y: G + 0.7, z: TROPHY.z });
    b.box(TROPHY.r * 2 + 0.4, 0.3, TROPHY.r * 2 + 0.4, 0xb9a8ec, 'stud', { x: TROPHY.x, y: G + 1.55, z: TROPHY.z });
    b.add(new CylinderGeometry(0.9, 1.4, 1.8, 10), 0xffcf3a, 'smooth', { x: TROPHY.x, y: G + 2.6, z: TROPHY.z });
    b.add(new CylinderGeometry(0.45, 0.8, 2.2, 10), 0xffcf3a, 'smooth', { x: TROPHY.x, y: G + 4.6, z: TROPHY.z });
    b.add(new CylinderGeometry(2.6, 1.1, 3.0, 12), 0xffcf3a, 'smooth', { x: TROPHY.x, y: G + 7.2, z: TROPHY.z });
    for (const s of [-1, 1]) b.add(new CylinderGeometry(0.9, 0.9, 0.5, 10, 1, true), 0xffcf3a, 'smooth', { x: TROPHY.x + s * 2.7, y: G + 7.4, z: TROPHY.z, rz: Math.PI / 2 });
    b.box(1.8, 0.5, 1.8, 0xfff2b3, 'glow', { x: TROPHY.x, y: G + 8.95, z: TROPHY.z });
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      flowers(b, seeded(40 + i), TROPHY.x + Math.cos(a) * (TROPHY.r + 2.2), G, TROPHY.z + Math.sin(a) * (TROPHY.r + 2.2), 0.7);
    }
    // Grandstands full of fans either side of the road by the arch.
    for (const gs of GRANDSTANDS) {
      const crowd = seeded(gs.x * 7 + 3);
      for (let step = 0; step < 5; step += 1) {
        const h = 0.8 + step * 0.9;
        const x = gs.x + gs.side * (-3.4 + step * 1.7);
        b.box(1.7, h, 18, step % 2 ? 0x3a7bea : 0x3fa2ff, 'stud', { x, y: G + h / 2, z: gs.z });
        for (let k = 0; k < 9; k += 1) {
          if (crowd() < 0.3) continue;
          const c = [0xe8352e, 0xffd23f, 0x58d36a, 0xff8a2a, 0xb15cff, 0xff4fb8, 0xffffff][Math.floor(crowd() * 7)]!;
          b.box(0.7, 0.9, 0.6, c, 'smooth', { x, y: G + h + 0.45, z: gs.z - 8 + k * 2 });
          b.box(0.6, 0.6, 0.6, [0xf2c89a, 0xc98a5e, 0x8a5a3a, 0xffe0bd][Math.floor(crowd() * 4)]!, 'smooth', { x, y: G + h + 1.2, z: gs.z - 8 + k * 2 });
        }
      }
      // A roof on red posts.
      for (const dz of [-8.6, 8.6]) b.box(0.4, 7, 0.4, 0xe8352e, 'smooth', { x: gs.x + gs.side * 4, y: G + 3.5, z: gs.z + dz });
      b.box(9.6, 0.4, 19, 0xffffff, 'stud', { x: gs.x, y: G + 7.2, z: gs.z, rz: gs.side * -0.12 });
      for (let k = 0; k < 9; k += 1) b.box(9.7, 0.42, 1, k % 2 ? 0xe8352e : 0xffffff, 'smooth', { x: gs.x, y: G + 7.25, z: gs.z - 8.5 + k * 2.1, rz: gs.side * -0.12 });
    }
    // Bunting across the road: strings of bright pennants between the lamp posts.
    for (const bz of [126, 46, -34, -114]) {
      for (let i = 0; i < 14; i += 1) {
        const x = -7 + i + 0.5;
        const sag = 0.6 * (1 - Math.pow((x / 7.5), 2));
        const c = [0xe8352e, 0xffd23f, 0x3fa2ff, 0x58d36a, 0xff4fb8, 0xff8a2a][i % 6]!;
        b.add(new ConeGeometry(0.32, 0.8, 3), c, 'smooth', { x, y: G + 6.2 - sag - 0.4, z: bz, rx: Math.PI });
      }
      b.box(15, 0.05, 0.05, 0x2b2f45, 'smooth', { x: 0, y: G + 6.25 - 0.3, z: bz });
    }
    // The leaderboards: tall framed boards, a coloured header each.
    for (const lb of LEADERBOARDS) {
      const frame = new Group();
      frame.position.set(lb.x, G, lb.z);
      frame.rotation.y = lb.yaw;
      const bb = new PartBuilder();
      bb.box(12.6, 12.6, 0.8, lb.color, 'stud', { y: 6.8, z: -0.45 });
      bb.box(13.2, 0.8, 1.2, shade(lb.color, 0.8), 'stud', { y: 13.3, z: -0.45 });
      for (const s of [-1, 1]) bb.box(0.9, 1.2, 0.9, shade(lb.color, 0.7), 'stud', { x: s * 5.5, y: 0.6, z: -0.45 });
      frame.add(bb.build('board'));
      const panel = new LivePanel(11.6, 11.6, 48);
      panel.mesh.position.set(0, 6.8, 0.0);
      frame.add(panel.mesh);
      this.group.add(frame);
      this.boards.set(lb.key, panel);
      this.setBoard(lb.key, []);
    }
  }

  /** A leaderboard's rows (best first). */
  setBoard(key: 'money' | 'playtime' | 'air', rows: { name: string; value: number }[]): void {
    const panel = this.boards.get(key);
    const lb = LEADERBOARDS.find((l) => l.key === key);
    if (!panel || !lb) return;
    const fmt = (v: number): string => (key === 'money' ? fmtMoney(v) : key === 'air' ? `${v.toFixed(1)} studs` : `${Math.floor(v / 3600)}h ${Math.floor((v % 3600) / 60)}m`);
    panel.draw(JSON.stringify(rows.slice(0, 8).map((r) => [r.name, Math.floor(r.value * 10)])), (c, W, H) => {
      c.fillStyle = 'rgba(20,18,40,0.92)';
      c.fillRect(0, 0, W, H);
      c.fillStyle = hex(lb.color);
      c.fillRect(0, 0, W, H * 0.16);
      const hp = fitText(c, lb.title, Math.round(H * 0.11), W * 0.9);
      strokeText(c, lb.title, W / 2, H * 0.08, '#ffffff', hp);
      const rowH = (H * 0.8) / 8;
      rows.slice(0, 8).forEach((row, i) => {
        const y = H * 0.2 + rowH * (i + 0.5);
        if (i % 2 === 0) {
          c.fillStyle = 'rgba(255,255,255,0.06)';
          c.fillRect(0, y - rowH / 2, W, rowH);
        }
        c.textAlign = 'left';
        const color = ['#ffd23f', '#e2e8f5', '#e8a46a'][i] ?? '#ffffff';
        const px = fitText(c, `${i + 1}. ${row.name}`, Math.round(rowH * 0.55), W * 0.55, 700);
        c.font = `700 ${px}px ${FONT}`;
        c.fillStyle = color;
        c.fillText(`${i + 1}. ${row.name}`, W * 0.05, y);
        c.textAlign = 'right';
        c.fillStyle = '#7dff6a';
        c.fillText(fmt(row.value), W * 0.95, y);
        c.textAlign = 'center';
      });
      if (!rows.length) {
        const t = 'Be the first!';
        const px = fitText(c, t, Math.round(H * 0.07), W * 0.8, 700);
        strokeText(c, t, W / 2, H * 0.55, '#c8cde8', px);
      }
    });
  }

  // ---------------------------------------------------------------- scenery

  private scenery(b: PartBuilder, r: Rand): void {
    const free = (x: number, z: number, pad = 3): boolean => {
      if (Math.abs(x) < ROAD_HALF_W + 6 && z > ROAD_NORTH - 4 && z < ROAD_SOUTH + 4) return false;
      for (const p of PLOTS) if (Math.abs(x - p.cx) < PLOT_UNITS_X / 2 + pad + 2 && Math.abs(z - p.cz) < PLOT_UNITS_Z / 2 + pad) return false;
      if (z < CLIFF_Z1 + 22 && z > CLIFF_Z0 - 4) return false;
      for (const s of SHOPS) if (Math.abs(x - s.x) < 13 && Math.abs(z - s.z) < 13) return false;
      if (z < CLIFF_Z0) return Math.abs(x) > 42;
      if (z > ROAD_SOUTH - 52 && Math.abs(x) < 52) return false;
      return x > ISLAND.minX + 3 && x < ISLAND.maxX - 3 && z > ISLAND.minZ + 3 && z < ISLAND.maxZ - 3;
    };
    // Trees round the edges and in the gaps between plots.
    let placed = 0;
    for (let i = 0; i < 900 && placed < 150; i += 1) {
      const x = ISLAND.minX + r() * (ISLAND.maxX - ISLAND.minX);
      const z = ISLAND.minZ + r() * (ISLAND.maxZ - ISLAND.minZ);
      if (!free(x, z)) continue;
      placed += 1;
      const pick = r();
      if (pick < 0.62) broadleaf(b, r, x, G, z, 0.8 + r() * 0.5);
      else if (pick < 0.8) this.pine(b, r, x, z, 0.9 + r() * 0.5);
      else palm(b, r, x, G, z, 0.8 + r() * 0.4);
    }
    for (let i = 0; i < 700; i += 1) {
      const x = ISLAND.minX + r() * (ISLAND.maxX - ISLAND.minX);
      const z = ISLAND.minZ + r() * (ISLAND.maxZ - ISLAND.minZ);
      if (!free(x, z, 1)) continue;
      const pick = r();
      if (pick < 0.4) bush(b, r, x, G, z, 0.6 + r() * 0.5, Math.floor(r() * 4));
      else if (pick < 0.65) flowers(b, r, x, G, z, 0.8);
      else if (pick < 0.8) boulders(b, r, x, G, z, 0.6 + r() * 0.6, 0x9a9ab0);
    }
    // Hills in the far corners (stepped grass blocks).
    for (const [hx, hz] of [
      [-88, 196],
      [88, 196],
      [-88, -170],
      [88, -150],
    ] as const) {
      for (let lvl = 0; lvl < 4; lvl += 1) {
        const s = 14 - lvl * 3;
        b.box(s, 2, s, shade(0x4ed838, 1 - lvl * 0.04), 'stud', { x: hx + (r() - 0.5) * 2, y: G + 1 + lvl * 2, z: hz + (r() - 0.5) * 2 });
      }
    }
  }

  private pine(b: PartBuilder, r: Rand, x: number, z: number, s: number): void {
    b.add(cyl(0.3 * s, 0.38 * s, 2.2 * s, 6), 0x7a4e28, 'flat', { x, y: G + 1.1 * s, z });
    for (let i = 0; i < 4; i += 1) {
      const w = (2.6 - i * 0.5) * s;
      b.add(new BoxGeometry(w, 1.1 * s, w), shade(0x2fa84a, 0.88 + i * 0.07 + r() * 0.05), 'flat', { x, y: G + (2.4 + i * 1.05) * s, z, ry: i * 0.4 + r() * 0.2 });
    }
  }

  update(delta: number): void {
    this.time += delta;
    for (const k of this.keepers) k.avatar.update(delta);
  }
}
