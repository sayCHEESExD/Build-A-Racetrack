import {
  ARENA,
  CELL,
  GROUND_Y,
  LEVEL_H,
  PLOTS,
  PLOT_UNITS_X,
  PLOT_L,
  PLOT_W,
  RARITIES,
  TILE,
  TRACK_Y0,
  TrackPath,
  baseTier,
  openRows,
  decorByCode,
  decorCells,
  fmtMoney,
  itemOfShape,
  plotDef,
  shapeRate,
  toWorld,
  traceChain,
  type Chain,
  type Decor,
  type Piece,
  type PlotDef,
  type Vec3,
} from '@race/shared';
import {
  BoxGeometry,
  ConeGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type Camera,
} from 'three';
import { MeshBuilder } from '../render/MeshBuilder.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { studPlastic } from '../render/Studs.js';
import type { SceneManager } from '../rendering/SceneManager.js';
import { buildCar, type CarParts } from './CarModel.js';
import { drawDecor } from './DecorModels.js';
import { Effects } from './Effects.js';
import { Label } from './Label.js';
import { Raceway } from './Raceway.js';
import { Sky } from './Sky.js';
import { drawPiece, drawTrack } from './TrackMesh.js';
import { LivePanel, fitText, strokeText } from './signs.js';

const trackMaterial = studPlastic({ vertexColors: true, side: DoubleSide }, 0.8);
const ghostOk = new MeshBasicMaterial({ color: 0xfff04a, transparent: true, opacity: 0.45, depthWrite: false });
const ghostBad = new MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.45, depthWrite: false });
const deleteMat = new MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.5, depthWrite: false });
const glowMat = new MeshBasicMaterial({ color: 0xfff04a, transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide });
const lockedMat = new MeshBasicMaterial({ color: 0x0b3a14, transparent: true, opacity: 0.38, depthWrite: false });
const cashMat = new MeshLambertMaterial({ color: 0x3fd84a, emissive: 0x0c4a10 });
const MAX_CASH = 300;

/** A cash stack: three green bills with a paper band. */
const cashGeometry = new BoxGeometry(0.7, 0.16, 0.36);

const P = new Vector3();
const M4 = new Matrix4();
const Q = new Quaternion();
const S = new Vector3();
const UPV = new Vector3(0, 1, 0);

/** One plot's racetrack as drawn. */
export class PlotTrack {
  pieces: Piece[] = [];
  decor: Decor[] = [];
  chain: Chain = traceChain([]);
  path: TrackPath | null = null;
  tier = 0;
  likes = 0;
  visits = 0;
  owned = false;
  private mesh: Group | null = null;
  private decorMesh: Group | null = null;
  private locked: Mesh[] = [];
  private expand: LivePanel[] = [];
  /** Middle of each piece (for its label and cash stack). */
  spots: (Vec3 | null)[] = [];
  private labels: (Label | null)[] = [];
  fills: number[] = [];
  scale = 1;
  readonly cash: InstancedMesh;

  constructor(
    readonly plot: PlotDef,
    private readonly group: Group,
  ) {
    this.cash = new InstancedMesh(cashGeometry, cashMat, MAX_CASH);
    this.cash.instanceMatrix.setUsage(DynamicDrawUsage);
    this.cash.count = 0;
    this.cash.frustumCulled = false;
    group.add(this.cash);
  }

  set(pieces: Piece[], decor: Decor[], tier: number): void {
    const decorChanged = JSON.stringify(decor) !== JSON.stringify(this.decor);
    const tierChanged = tier !== this.tier || this.expand.length === 0;
    this.pieces = pieces;
    this.decor = decor;
    this.tier = tier;
    this.owned = pieces.length > 0;
    this.chain = traceChain(pieces);
    this.path = pieces.length ? new TrackPath(this.plot.frame, pieces, this.chain.order) : null;
    if (this.mesh) {
      for (const c of this.mesh.children) (c as Mesh).geometry.dispose();
      this.mesh.removeFromParent();
      this.mesh = null;
    }
    for (const l of this.labels) l?.dispose();
    this.labels = [];
    this.spots = [];
    if (pieces.length) {
      const b = drawTrack(this.plot.frame, pieces, this.chain.connected);
      const m = new Mesh(b.build(), trackMaterial);
      m.castShadow = true;
      m.receiveShadow = true;
      this.mesh = new Group();
      this.mesh.add(m);
      this.group.add(this.mesh);
      const pos = { x: 0, y: 0, z: 0 };
      const up = { x: 0, y: 1, z: 0 };
      pieces.forEach((p, i) => {
        if (p.k === 'start') {
          this.spots.push(null);
          this.labels.push(null);
          return;
        }
        const path = new TrackPath(this.plot.frame, [p], [0]);
        path.at(path.length / 2, pos, undefined, up);
        const flip = up.y < 0.3;
        this.spots.push({ x: pos.x, y: pos.y + (flip ? 0.5 : 1.2), z: pos.z });
        const label = new Label(0.5, '');
        label.sprite.position.set(pos.x, pos.y + (flip ? 1.2 : 3.0), pos.z);
        label.sprite.visible = false;
        this.group.add(label.sprite);
        this.labels.push(label);
      });
    }
    if (decorChanged || !this.decorMesh) this.drawDecor();
    if (tierChanged) this.drawLocked();
  }

  private drawDecor(): void {
    if (this.decorMesh) {
      this.decorMesh.traverse((c) => (c as Mesh).geometry?.dispose());
      this.decorMesh.removeFromParent();
      this.decorMesh = null;
    }
    if (!this.decor.length) return;
    const b = new PartBuilder();
    this.decor.forEach((d, i) => {
      const def = decorByCode(d.d);
      if (!def) return;
      const cells = decorCells(d, def);
      let cx = 0;
      let cz = 0;
      for (const [x, z] of cells) {
        cx += x;
        cz += z;
      }
      cx = (cx / cells.length) * CELL + CELL / 2;
      cz = (cz / cells.length) * CELL + CELL / 2;
      const [wx, wz] = toWorld(this.plot.frame, cx, cz);
      const yaw = (this.plot.frame.rot === 0 ? 0 : Math.PI) + [Math.PI / 2, 0, -Math.PI / 2, Math.PI][d.r & 3]!;
      drawDecor(b, def, wx, wz, yaw, d.x * 131 + d.z * 17 + i);
    });
    this.decorMesh = b.build('decor');
    this.group.add(this.decorMesh);
  }

  /** The rows not yet unlocked (either end; the plot grows outward from the gate): dim slabs over them and an Expand Plot sign at each edge. */
  private drawLocked(): void {
    if (this.plot.index > PLOTS.length - 1) return;
    for (const m of this.locked) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    this.locked = [];
    const [lo, hi] = openRows(this.tier);
    const slab = (z0: number, z1: number): void => {
      if (z1 <= z0) return;
      const [ax, az] = toWorld(this.plot.frame, 0, z0 * TILE);
      const [bx, bz] = toWorld(this.plot.frame, PLOT_UNITS_X, z1 * TILE);
      const m = new Mesh(new BoxGeometry(Math.abs(bx - ax), 0.1, Math.abs(bz - az)), lockedMat);
      m.position.set((ax + bx) / 2, GROUND_Y + 0.08, (az + bz) / 2);
      this.group.add(m);
      this.locked.push(m);
    };
    slab(0, lo);
    slab(hi, PLOT_L);
    const next = baseTier(this.tier + 1);
    // One sign at each open edge, facing back toward the gate.
    const edges: { z: number; yaw: number; on: boolean }[] = [
      { z: hi * TILE + 0.6, yaw: this.plot.frame.rot === 0 ? Math.PI : 0, on: hi < PLOT_L },
      { z: lo * TILE - 0.6, yaw: this.plot.frame.rot === 0 ? 0 : Math.PI, on: lo > 0 },
    ];
    edges.forEach((e, i) => {
      let panel = this.expand[i];
      if (!panel) {
        panel = new LivePanel(6, 1.7, 80);
        this.group.add(panel.mesh);
        this.expand[i] = panel;
      }
      panel.mesh.visible = this.owned && e.on;
      const [sx, sz] = toWorld(this.plot.frame, (PLOT_W * TILE) / 2, e.z);
      panel.mesh.position.set(sx, GROUND_Y + 2.2, sz);
      panel.mesh.rotation.y = e.yaw;
      panel.draw(`${this.tier}`, (c, W, H) => {
        c.fillStyle = 'rgba(40,24,10,0.85)';
        c.fillRect(0, 0, W, H);
        c.strokeStyle = '#ffd23f';
        c.lineWidth = 6;
        c.strokeRect(3, 3, W - 6, H - 6);
        const t = 'Expand Plot';
        strokeText(c, t, W / 2, H * 0.34, '#ffe14a', fitText(c, t, Math.round(H * 0.34), W * 0.9));
        const sub = `Base Upgrade: ${fmtMoney(next.cost)}`;
        strokeText(c, sub, W / 2, H * 0.72, '#ffffff', fitText(c, sub, Math.round(H * 0.22), W * 0.9, 700));
      });
    });
  }

  setFills(f: number[], scale: number): void {
    this.fills = f;
    this.scale = scale;
  }

  /** Labels (near the camera only) and cash stacks. */
  update(time: number, cam: Vector3, labels: boolean): void {
    let n = 0;
    this.spots.forEach((spot, i) => {
      const label = this.labels[i];
      if (!spot) return;
      const fill = this.fills[i] ?? 0;
      const piece = this.pieces[i]!;
      const connected = this.chain.connected[i] === true;
      if (label) {
        const near = labels && Math.hypot(spot.x - cam.x, spot.z - cam.z) < 48;
        label.sprite.visible = near;
        if (near) {
          const item = itemOfShape(piece.k);
          const rate = shapeRate(piece.k) * this.scale;
          const rarity = item ? RARITIES[item.rarity] : null;
          label.set(
            connected
              ? [
                  { text: `${fmtMoney(rate)}/s`, color: '#7dff6a', size: 26 },
                  { text: fmtMoney(fill), color: '#5bff3a', size: 40 },
                  { text: rarity?.name ?? '', color: `#${(rarity?.color ?? 0xffffff).toString(16).padStart(6, '0')}`, size: 22 },
                ]
              : [{ text: 'Not connected', color: '#ff8a8a', size: 26 }],
          );
        }
      }
      if (!connected || fill <= 0 || n >= MAX_CASH) return;
      const rate = Math.max(0.01, shapeRate(piece.k) * this.scale);
      const k = Math.min(1, fill / (rate * 30));
      const stacks = 1 + Math.floor(k * 2.99);
      for (let j = 0; j < stacks && n < MAX_CASH; j += 1) {
        Q.setFromAxisAngle(UPV, time * 1.4 + i + j * 0.8);
        S.setScalar(0.8 + k * 0.4);
        P.set(spot.x + (j - 1) * 0.15, spot.y + j * 0.18 + Math.sin(time * 2.4 + i) * 0.1, spot.z);
        M4.compose(P, Q, S);
        this.cash.setMatrixAt(n, M4);
        n += 1;
      }
    });
    this.cash.count = n;
    this.cash.instanceMatrix.needsUpdate = true;
  }

  /** The piece whose middle is nearest a world point (delete picking), never the gate. */
  pieceNear(x: number, y: number, z: number): number {
    let best = -1;
    let bestD = 3.2;
    this.spots.forEach((s, i) => {
      if (!s) return;
      const d = Math.hypot(s.x - x, (s.y - 1.2 - y) * 0.6, s.z - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }
}

/** One driving car in the world (anyone's). */
interface CarView {
  key: string;
  parts: CarParts;
  run: number;
  /** Smoothed pose. */
  pos: Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  spin: number;
}

/**
 * THE TRACK VIEW: every plot's road meshes, decorations, cash labels and
 * stacks; the Showcase's loaded track; the glowing end and the ghost while
 * building; and every car on the move.
 */
export class TrackView {
  readonly world: Raceway;
  readonly effects: Effects;
  readonly sky: Sky;
  private readonly group = new Group();
  private readonly plots = new Map<number, PlotTrack>();
  private ghost: Mesh | null = null;
  private ghostKey = '';
  private readonly glow: Mesh;
  private readonly arrow: Mesh;
  private delMark: Mesh | null = null;
  private delKey = '';
  private decorGhost: Group | null = null;
  private decorGhostKey = '';
  private readonly cars = new Map<string, CarView>();
  private time = 0;
  showLabels = true;

  constructor(private readonly scenes: SceneManager) {
    const scene = scenes.scene;
    scene.add(this.group);
    this.world = new Raceway(scene);
    this.effects = new Effects(scene);
    this.sky = new Sky(scene);
    this.sky.setClouds(true, 120);
    for (const plot of PLOTS) this.plots.set(plot.index, new PlotTrack(plot, this.group));
    this.plots.set(ARENA.index, new PlotTrack(ARENA, this.group));
    this.glow = new Mesh(new BoxGeometry(TILE * 0.96, 2.2, TILE * 0.96), glowMat);
    this.glow.visible = false;
    this.group.add(this.glow);
    this.arrow = new Mesh(new ConeGeometry(0.7, 1.5, 4), new MeshBasicMaterial({ color: 0xffffff }));
    this.arrow.rotation.x = Math.PI;
    this.arrow.visible = false;
    this.group.add(this.arrow);
  }

  plot(index: number): PlotTrack | undefined {
    return this.plots.get(index);
  }

  setTrack(index: number, pieces: Piece[], decor: Decor[], tier: number, likes = 0, visits = 0): void {
    const t = this.plots.get(index);
    if (!t) return;
    t.likes = likes;
    t.visits = visits;
    t.set(pieces, decor, tier);
    if (index < PLOTS.length) this.world.setPlotStats(index, Math.max(0, pieces.length - 1), baseTier(tier).length, likes);
  }

  setFills(index: number, f: number[], scale: number): void {
    this.plots.get(index)?.setFills(f, scale);
  }

  // ---------------------------------------------------------------- building visuals

  /** The glowing end of the track being built (null: hide). */
  setEnd(plot: number, end: Piece | null): void {
    const p = plotDef(plot);
    if (!p || !end) {
      this.glow.visible = false;
      this.arrow.visible = false;
      return;
    }
    const [x, z] = toWorld(p.frame, end.x * TILE + TILE / 2, end.z * TILE + TILE / 2);
    const y = TRACK_Y0 + end.y * LEVEL_H;
    this.glow.position.set(x, y + 1.0, z);
    this.glow.visible = true;
    this.arrow.position.set(x, y + 4 + Math.sin(this.time * 4) * 0.4, z);
    this.arrow.rotation.y = this.time * 2;
    this.arrow.visible = true;
    (this.glow.material as MeshBasicMaterial).opacity = 0.25 + 0.15 * Math.sin(this.time * 5);
  }

  /** The next piece's preview at the glowing end (null: none). */
  setGhost(plot: number, piece: Piece | null, ok: boolean): void {
    const key = piece ? `${plot}:${piece.k}:${piece.x}:${piece.z}:${piece.y}:${piece.r}:${ok}` : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    if (this.ghost) {
      this.ghost.geometry.dispose();
      this.ghost.removeFromParent();
      this.ghost = null;
    }
    const p = plotDef(plot);
    if (!piece || !p) return;
    const b = new MeshBuilder();
    drawPiece(b, p.frame, piece);
    this.ghost = new Mesh(b.build(), ok ? ghostOk : ghostBad);
    this.ghost.renderOrder = 4;
    this.ghost.position.y = 0.04;
    this.group.add(this.ghost);
  }

  /** Red overlay on the pieces a delete would take (from index on). */
  setDeleteMark(plot: number, from: number): void {
    const key = `${plot}:${from}`;
    if (key === this.delKey) return;
    this.delKey = key;
    if (this.delMark) {
      this.delMark.geometry.dispose();
      this.delMark.removeFromParent();
      this.delMark = null;
    }
    const t = this.plots.get(plot);
    if (!t || from < 1) return;
    const b = new MeshBuilder();
    for (let i = from; i < t.pieces.length; i += 1) drawPiece(b, t.plot.frame, t.pieces[i]!);
    this.delMark = new Mesh(b.build(), deleteMat);
    this.delMark.position.y = 0.05;
    this.delMark.renderOrder = 4;
    this.group.add(this.delMark);
  }

  /** A decoration's preview at a cell (null: none). */
  setDecorGhost(plot: number, d: Decor | null, ok: boolean): void {
    const key = d ? `${plot}:${d.d}:${d.x}:${d.z}:${d.r}:${ok}` : '';
    if (key === this.decorGhostKey) return;
    this.decorGhostKey = key;
    if (this.decorGhost) {
      this.decorGhost.traverse((c) => (c as Mesh).geometry?.dispose());
      this.decorGhost.removeFromParent();
      this.decorGhost = null;
    }
    const p = plotDef(plot);
    const def = d ? decorByCode(d.d) : undefined;
    if (!d || !p || !def) return;
    const cells = decorCells(d, def);
    let cx = 0;
    let cz = 0;
    for (const [x, z] of cells) {
      cx += x;
      cz += z;
    }
    const [wx, wz] = toWorld(p.frame, (cx / cells.length) * CELL + CELL / 2, (cz / cells.length) * CELL + CELL / 2);
    const yaw = (p.frame.rot === 0 ? 0 : Math.PI) + [Math.PI / 2, 0, -Math.PI / 2, Math.PI][d.r & 3]!;
    const b = new PartBuilder();
    drawDecor(b, def, wx, wz, yaw, 1);
    this.decorGhost = b.build('decor-ghost', false);
    this.decorGhost.traverse((c) => {
      if (c instanceof Mesh) {
        c.material = ok ? ghostOk : ghostBad;
        c.renderOrder = 4;
      }
    });
    // A footprint pad under it.
    for (const [x, z] of cells) {
      const [fx, fz] = toWorld(p.frame, x * CELL + CELL / 2, z * CELL + CELL / 2);
      const pad = new Mesh(new BoxGeometry(CELL * 0.94, 0.06, CELL * 0.94), ok ? ghostOk : ghostBad);
      pad.position.set(fx, GROUND_Y + 0.1, fz);
      this.decorGhost.add(pad);
    }
    this.group.add(this.decorGhost);
  }

  // ---------------------------------------------------------------- cars

  /** A car for a driver (made on first use, re-made when the car changes). */
  car(id: string, key: string, run: number): CarView {
    let v = this.cars.get(id);
    if (v && v.key !== key) {
      v.parts.root.removeFromParent();
      this.cars.delete(id);
      v = undefined;
    }
    if (!v) {
      const parts = buildCar(key);
      parts.root.traverse((c) => {
        c.castShadow = true;
      });
      this.group.add(parts.root);
      v = { key, parts, run, pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, spin: 0 };
      this.cars.set(id, v);
    }
    v.run = run;
    return v;
  }

  /** Pose a car from a forward and up vector (the local driver's car). */
  poseCar(v: CarView, pos: Vec3, fwd: Vec3, up: Vec3, speed: number, delta: number): void {
    const root = v.parts.root;
    root.position.set(pos.x, pos.y, pos.z);
    const z = new Vector3(fwd.x, fwd.y, fwd.z).normalize();
    const y = new Vector3(up.x, up.y, up.z).normalize();
    const x = new Vector3().crossVectors(y, z).normalize();
    y.crossVectors(z, x).normalize();
    M4.makeBasis(x, y, z);
    root.quaternion.setFromRotationMatrix(M4);
    this.spinWheels(v, speed, delta);
  }

  /** Pose a car from yaw / pitch / roll, smoothed (remote drivers). */
  poseCarEuler(v: CarView, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, speed: number, delta: number, snap: boolean): void {
    const k = snap ? 1 : Math.min(1, delta * 12);
    v.pos.set(snap ? x : v.pos.x + (x - v.pos.x) * k, snap ? y : v.pos.y + (y - v.pos.y) * k, snap ? z : v.pos.z + (z - v.pos.z) * k);
    const da = Math.atan2(Math.sin(yaw - v.yaw), Math.cos(yaw - v.yaw));
    v.yaw += da * k;
    v.pitch += (pitch - v.pitch) * k;
    v.roll += (roll - v.roll) * k;
    const root = v.parts.root;
    root.position.copy(v.pos);
    root.rotation.set(-v.pitch, v.yaw, v.roll, 'YXZ');
    this.spinWheels(v, speed, delta);
  }

  private spinWheels(v: CarView, speed: number, delta: number): void {
    v.spin += (speed / 0.4) * delta;
    for (const w of v.parts.wheels) w.rotation.x = v.spin;
  }

  /** The seat of a driver's car, world space (for the avatar). */
  seatOf(id: string, out: Vector3): boolean {
    const v = this.cars.get(id);
    if (!v) return false;
    v.parts.root.updateMatrixWorld(true);
    out.set(v.parts.seat.x, v.parts.seat.y, v.parts.seat.z).applyMatrix4(v.parts.root.matrixWorld);
    return true;
  }

  carRoot(id: string): Group | null {
    return this.cars.get(id)?.parts.root ?? null;
  }

  dropCar(id: string): void {
    const v = this.cars.get(id);
    if (!v) return;
    v.parts.root.removeFromParent();
    this.cars.delete(id);
  }

  pruneCars(alive: Set<string>): void {
    for (const id of [...this.cars.keys()]) if (!alive.has(id)) this.dropCar(id);
  }

  // ---------------------------------------------------------------- effects

  cashBurst(x: number, y: number, z: number, big: boolean): void {
    this.effects.burst(x, y, z, big ? 26 : 12, [0x3fd84a, 0x7dff6a, 0xffffff, 0xffd23f], big ? 7 : 5, 0.16, 0.8, 10, true);
  }

  update(delta: number, camera: Camera, px: number, pz: number): void {
    this.time += delta;
    const cam = camera.position;
    for (const t of this.plots.values()) t.update(this.time, cam, this.showLabels);
    this.world.update(delta);
    this.effects.update(delta);
    this.sky.update(delta, cam.x, cam.y, cam.z);
    void px;
    void pz;
  }
}
