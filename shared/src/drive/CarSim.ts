import { GROUND_Y } from '../constants/world.js';
import { DRIVE, F_BOOST, F_FINISH, F_GAP, F_KICK, F_LAUNCH, F_LOCK, F_WALL, ROAD_HALF, type TrackPath } from '../track/track.js';
import type { Vec3 } from '../types/math.js';

/**
 * THE CAR. Arcade physics that drives ON a track's sampled path: while on the
 * road the car's state is distance along the path, sideways offset from its
 * middle, and speed - so it follows every curve, bank, climb and loop of the
 * real geometry without ever clipping through it. It leaves the road (and
 * becomes a free ballistic body) when it drives off an edge, over a gap,
 * over a crest too fast to stay down, or off the end of the track; it lands
 * back on any stretch of road under it, or hits the ground and CRASHES.
 *
 * Steering moves the car across the road; on tight turns too much speed
 * slides it outward (the turn's barrier scrapes it slower). Loops and
 * corkscrews hold the car in the middle at a safe speed; a Ramp Jump's kicker
 * sets the speed that clears its gap.
 *
 * Shared, so the client drives with it and test scripts can drive runs too.
 */

export interface CarInput {
  /** -1 brake / reverse .. 1 full throttle. */
  throttle: number;
  /** -1 left .. 1 right. */
  steer: number;
}

export interface CarParams {
  speed: number;
  accel: number;
  handling: number;
}

export type CarMode = 'road' | 'air' | 'crashed' | 'done';

export type CarEvent =
  | { t: 'piece'; i: number; lap: number }
  | { t: 'air'; air: number; dist: number }
  | { t: 'land'; impact: number }
  | { t: 'crash'; impact: number }
  | { t: 'finish' }
  | { t: 'lap'; lap: number }
  | { t: 'scrape' }
  | { t: 'boost' };

const STEP = 1 / 120;
const v3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const P = v3();
const T = v3();
const U = v3();
const R = v3();
const T2 = v3();

export class CarSim {
  mode: CarMode = 'road';
  /** Distance along the path, sideways offset, speed along, sideways speed. */
  s = 2;
  d = 0;
  v = 0;
  vd = 0;
  lap = 0;
  /** World position and velocity (always kept, road or air). */
  readonly pos: Vec3 = v3();
  readonly vel: Vec3 = v3();
  /** World orientation: forward and up (unit). */
  readonly fwd: Vec3 = { x: 0, y: 0, z: 1 };
  readonly upv: Vec3 = { x: 0, y: 1, z: 0 };
  /** Seconds in the air this jump, studs travelled, where it took off. */
  airTime = 0;
  private airFrom = v3();
  /** Crash tumble: spin axis and rate, seconds since. */
  private spin = v3();
  crashedFor = 0;
  /** Best of this run. */
  bestAir = 0;
  topSpeed = 0;
  private piece = -1;
  private stepLeft = 0;
  private boosting = false;
  readonly events: CarEvent[] = [];

  constructor(
    readonly path: TrackPath,
    readonly closed: boolean,
    public params: CarParams,
  ) {
    this.place(2);
  }

  /** Put the car at rest at distance s. */
  place(s: number): void {
    this.mode = 'road';
    this.s = Math.min(s, this.path.length - 0.1);
    this.d = 0;
    this.v = 0;
    this.vd = 0;
    this.piece = -1;
    this.syncRoad();
  }

  /** Advance by dt seconds of input. Events pile up in `events`. */
  step(dt: number, input: CarInput): void {
    this.stepLeft += Math.min(0.1, Math.max(0, dt));
    while (this.stepLeft >= STEP) {
      this.stepLeft -= STEP;
      if (this.mode === 'road' || this.mode === 'done') this.road(STEP, input);
      else if (this.mode === 'air') this.air(STEP);
      else this.tumble(STEP);
    }
  }

  // ---------------------------------------------------------------- on the road

  private road(h: number, input: CarInput): void {
    const path = this.path;
    const G = DRIVE.gravity;
    const flags = path.flagsAt(this.s);
    const index = path.at(this.s, P, T, U, R);
    const top = this.params.speed;
    const locked = (flags & F_LOCK) !== 0;
    const kick = (flags & F_KICK) !== 0;
    const done = this.mode === 'done';
    const throttle = done ? 0 : Math.max(-1, Math.min(1, input.throttle));
    const steer = done || locked || kick ? 0 : Math.max(-1, Math.min(1, input.steer));

    // ---- speed along the road
    let a = 0;
    if (throttle > 0) {
      const ratio = Math.max(0, this.v) / top;
      a += this.params.accel * throttle * Math.max(0, Math.min(1, 1 - ratio * ratio * ratio)) * (this.v < 0 ? 2 : 1);
    } else if (throttle < 0) {
      if (this.v > 0.3) a -= DRIVE.brake * -throttle;
      else if (this.v > -DRIVE.reverse) a -= this.params.accel * 0.5 * -throttle;
    } else a -= Math.sign(this.v) * Math.min(Math.abs(this.v) / h, 2 + 0.4 * Math.abs(this.v));
    if (done) a = -Math.sign(this.v) * Math.min(Math.abs(this.v) / h, 22);
    a -= G * T.y * (locked ? 0.15 : 1);
    a -= 0.03 * this.v * Math.abs(this.v) * (top > 0 ? 18 / top : 1) * 0.1;
    if ((flags & F_BOOST) !== 0 && this.v < top * DRIVE.boostTop) {
      a += DRIVE.boost;
      if (!this.boosting) this.events.push({ t: 'boost' });
      this.boosting = true;
    } else this.boosting = false;
    this.v += a * h;
    if (!(flags & F_BOOST) && this.v > top * DRIVE.boostTop) this.v = top * DRIVE.boostTop;
    if (locked) this.v = Math.max(this.v, DRIVE.lockSpeed);
    if (kick) {
      const target = Math.max(DRIVE.kickMin, Math.min(DRIVE.kickMax, this.v));
      this.v += (target - this.v) * Math.min(1, 8 * h);
    }
    this.topSpeed = Math.max(this.topSpeed, this.v);

    // ---- across the road
    const steerRate = DRIVE.steer * this.params.handling * Math.min(1, Math.abs(this.v) / 5);
    // No steering: a gentle pull back toward the middle of the road (friendly on phones).
    const centre = steer === 0 && !done ? -this.d * 0.9 : 0;
    this.vd += (steer * steerRate + centre - this.vd) * Math.min(1, 10 * h);
    // How hard the road turns here (positive: to the right), and the slide it asks of the tyres.
    const ds = 0.4;
    const s2 = Math.min(path.length, this.s + ds);
    path.at(s2, P, T2);
    const kappa = ((T2.x - T.x) * R.x + (T2.y - T.y) * R.y + (T2.z - T.z) * R.z) / Math.max(0.05, s2 - this.s);
    const lat = this.v * this.v * kappa;
    const grip = DRIVE.grip * this.params.handling;
    if (!locked && Math.abs(lat) > grip) this.vd -= Math.sign(lat) * (Math.abs(lat) - grip) * h;
    if (locked || kick) {
      this.d *= 1 - Math.min(1, 5 * h);
      this.vd = 0;
    }
    this.d += this.vd * h;
    const wall = (flags & F_WALL) !== 0;
    const edge = ROAD_HALF - 0.55;
    if (wall && Math.abs(this.d) > edge) {
      this.d = Math.sign(this.d) * edge;
      if (Math.abs(this.vd) > 0.5 || Math.abs(lat) > grip) {
        this.v *= 1 - Math.min(0.5, 1.6 * h);
        if (Math.random() < 0.08) this.events.push({ t: 'scrape' });
      }
      this.vd = 0;
    }

    // ---- along
    const ty = T.y;
    this.s += this.v * h;
    if (this.s < 0.5) {
      this.s = 0.5;
      if (this.v < 0) this.v = 0;
    }
    path.at(this.s, P, T, U, R);
    this.syncRoad();

    // ---- off the side
    if (!wall && Math.abs(this.d) > ROAD_HALF + 0.15) return this.takeOff();
    // ---- over a gap
    if ((path.flagsAt(this.s) & F_GAP) !== 0) return this.takeOff();
    // ---- over a launching crest (the Bump Track) faster than gravity can keep it down
    if (!locked && this.v > 4 && (flags & F_LAUNCH) !== 0) {
      const kv = (T.y - ty) / Math.max(1e-3, this.v * h);
      if (this.v * this.v * -kv > G * 0.95 && T.y < ty) return this.takeOff();
    }
    // ---- pieces, laps, the end
    if (index !== this.piece) {
      this.piece = index;
      if (index >= 0) this.events.push({ t: 'piece', i: index, lap: this.lap });
      if ((flags & F_FINISH) !== 0 && !this.closed) {
        /* the finish fires at the end of the track below */
      }
    }
    if (this.s >= path.length - 0.02) {
      if (this.closed) {
        this.s -= path.length;
        this.lap += 1;
        this.piece = -1;
        this.events.push({ t: 'lap', lap: this.lap });
      } else if ((path.flagsAt(path.length - 0.1) & F_FINISH) !== 0) {
        if (this.mode !== 'done') {
          this.mode = 'done';
          this.events.push({ t: 'finish' });
        }
        this.s = path.length - 0.05;
        this.v = 0;
      } else return this.takeOff();
    }
  }

  /** Position and orientation from the road state. */
  private syncRoad(): void {
    this.path.at(this.s, P, T, U, R);
    this.pos.x = P.x + R.x * this.d;
    this.pos.y = P.y + R.y * this.d;
    this.pos.z = P.z + R.z * this.d;
    const yaw = Math.max(-0.5, Math.min(0.5, Math.atan2(this.vd, Math.max(2, Math.abs(this.v)))));
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const sign = this.v < -0.1 ? 1 : 1;
    this.fwd.x = (T.x * c + R.x * sn) * sign;
    this.fwd.y = (T.y * c + R.y * sn) * sign;
    this.fwd.z = (T.z * c + R.z * sn) * sign;
    this.upv.x = U.x;
    this.upv.y = U.y;
    this.upv.z = U.z;
    this.vel.x = T.x * this.v + R.x * this.vd;
    this.vel.y = T.y * this.v + R.y * this.vd;
    this.vel.z = T.z * this.v + R.z * this.vd;
  }

  private takeOff(): void {
    this.mode = 'air';
    this.airTime = 0;
    this.airFrom.x = this.pos.x;
    this.airFrom.y = this.pos.y;
    this.airFrom.z = this.pos.z;
    this.pos.x += this.upv.x * 0.05;
    this.pos.y += this.upv.y * 0.05;
    this.pos.z += this.upv.z * 0.05;
    this.boosting = false;
  }

  // ---------------------------------------------------------------- in the air

  private air(h: number): void {
    const G = DRIVE.gravity;
    this.vel.y -= G * h;
    this.pos.x += this.vel.x * h;
    this.pos.y += this.vel.y * h;
    this.pos.z += this.vel.z * h;
    this.airTime += h;
    // Nose follows the flight a little; the car rights itself toward world up.
    const sp = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    if (sp > 1) {
      const k = Math.min(1, 2.2 * h);
      this.fwd.x += (this.vel.x / sp - this.fwd.x) * k;
      this.fwd.y += (this.vel.y / sp - this.fwd.y) * k * 0.6;
      this.fwd.z += (this.vel.z / sp - this.fwd.z) * k;
      normalize(this.fwd);
    }
    const ku = Math.min(1, 1.5 * h);
    this.upv.x += (0 - this.upv.x) * ku;
    this.upv.y += (1 - this.upv.y) * ku;
    this.upv.z += (0 - this.upv.z) * ku;
    normalize(this.upv);
    if (this.airTime > 0.06 && this.tryLand()) return;
    if (this.pos.y <= GROUND_Y + 0.05 || this.airTime > 9) {
      this.pos.y = Math.max(this.pos.y, GROUND_Y + 0.05);
      const impact = Math.abs(this.vel.y) + 0.35 * Math.hypot(this.vel.x, this.vel.z);
      this.reportAir();
      this.crash(impact);
    }
  }

  /** Land on any road under the car. */
  private tryLand(): boolean {
    const path = this.path;
    let best = -1;
    let bestH = Infinity;
    for (const i of path.near(this.pos.x, this.pos.z)) {
      if ((path.flags[i]! & F_GAP) !== 0) continue;
      const ox = this.pos.x - path.pos[i * 3]!;
      const oy = this.pos.y - path.pos[i * 3 + 1]!;
      const oz = this.pos.z - path.pos[i * 3 + 2]!;
      const along = ox * path.tan[i * 3]! + oy * path.tan[i * 3 + 1]! + oz * path.tan[i * 3 + 2]!;
      if (Math.abs(along) > 0.45) continue;
      const lat = ox * path.right[i * 3]! + oy * path.right[i * 3 + 1]! + oz * path.right[i * 3 + 2]!;
      if (Math.abs(lat) > ROAD_HALF + 0.2) continue;
      const hgt = ox * path.up[i * 3]! + oy * path.up[i * 3 + 1]! + oz * path.up[i * 3 + 2]!;
      if (hgt > 0.3 || hgt < -1.4) continue;
      const vUp = this.vel.x * path.up[i * 3]! + this.vel.y * path.up[i * 3 + 1]! + this.vel.z * path.up[i * 3 + 2]!;
      if (vUp > 0) continue;
      if (Math.abs(hgt) < bestH) {
        bestH = Math.abs(hgt);
        best = i;
      }
    }
    if (best < 0) return false;
    const i = best;
    const ox = this.pos.x - path.pos[i * 3]!;
    const oy = this.pos.y - path.pos[i * 3 + 1]!;
    const oz = this.pos.z - path.pos[i * 3 + 2]!;
    const along = ox * path.tan[i * 3]! + oy * path.tan[i * 3 + 1]! + oz * path.tan[i * 3 + 2]!;
    const lat = ox * path.right[i * 3]! + oy * path.right[i * 3 + 1]! + oz * path.right[i * 3 + 2]!;
    const vT = this.vel.x * path.tan[i * 3]! + this.vel.y * path.tan[i * 3 + 1]! + this.vel.z * path.tan[i * 3 + 2]!;
    const vR = this.vel.x * path.right[i * 3]! + this.vel.y * path.right[i * 3 + 1]! + this.vel.z * path.right[i * 3 + 2]!;
    const vUp = this.vel.x * path.up[i * 3]! + this.vel.y * path.up[i * 3 + 1]! + this.vel.z * path.up[i * 3 + 2]!;
    this.reportAir();
    this.mode = 'road';
    this.s = Math.max(0.5, path.s[i]! + along);
    this.d = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, lat));
    this.v = Math.max(0, vT) * (-vUp > DRIVE.hardLanding ? 0.75 : 0.95);
    this.vd = vR * 0.3;
    this.piece = path.piece[i]!;
    this.events.push({ t: 'land', impact: -vUp });
    this.syncRoad();
    return true;
  }

  private reportAir(): void {
    if (this.airTime < 0.25) return;
    const dist = Math.hypot(this.pos.x - this.airFrom.x, this.pos.z - this.airFrom.z);
    this.bestAir = Math.max(this.bestAir, dist);
    this.events.push({ t: 'air', air: this.airTime, dist });
  }

  // ---------------------------------------------------------------- crashes

  private crash(impact: number): void {
    this.mode = 'crashed';
    this.crashedFor = 0;
    this.events.push({ t: 'crash', impact });
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.spin.x = (Math.random() - 0.5) * 8 + sp * 0.2;
    this.spin.y = (Math.random() - 0.5) * 6;
    this.spin.z = (Math.random() - 0.5) * 8;
    this.vel.y = Math.min(9, 2 + Math.abs(this.vel.y) * 0.35);
    this.vel.x *= 0.45;
    this.vel.z *= 0.45;
  }

  /** The tumble after a crash (looks only; the run is over). */
  private tumble(h: number): void {
    this.crashedFor += h;
    this.vel.y -= DRIVE.gravity * h;
    this.pos.x += this.vel.x * h;
    this.pos.y += this.vel.y * h;
    this.pos.z += this.vel.z * h;
    if (this.pos.y < GROUND_Y + 0.35) {
      this.pos.y = GROUND_Y + 0.35;
      if (this.vel.y < 0) this.vel.y = -this.vel.y * 0.35;
      this.vel.x *= 0.8;
      this.vel.z *= 0.8;
      this.spin.x *= 0.75;
      this.spin.y *= 0.75;
      this.spin.z *= 0.75;
    }
    rotateAbout(this.fwd, this.spin, h);
    rotateAbout(this.upv, this.spin, h);
    normalize(this.fwd);
    normalize(this.upv);
  }

  /** Studs travelled (flat) since taking off. */
  get airDistance(): number {
    return Math.hypot(this.pos.x - this.airFrom.x, this.pos.z - this.airFrom.z);
  }

  /** World yaw, pitch and roll of the car (for the network). */
  euler(): { yaw: number; pitch: number; roll: number } {
    const f = this.fwd;
    const u = this.upv;
    const yaw = Math.atan2(f.x, f.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
    // Right (flat) = fwd x worldUp; roll from up's lean along it.
    const rx = f.z;
    const rz = -f.x;
    const rl = Math.hypot(rx, rz) || 1;
    const roll = Math.atan2((u.x * rx + u.z * rz) / rl, u.y);
    return { yaw, pitch, roll };
  }
}

const normalize = (v: Vec3): void => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  v.x /= l;
  v.y /= l;
  v.z /= l;
};

/** Rotate v about axis w (rad / s times h, Rodrigues small-step). */
const rotateAbout = (v: Vec3, w: Vec3, h: number): void => {
  const cx = w.y * v.z - w.z * v.y;
  const cy = w.z * v.x - w.x * v.z;
  const cz = w.x * v.y - w.y * v.x;
  v.x += cx * h;
  v.y += cy * h;
  v.z += cz * h;
};
