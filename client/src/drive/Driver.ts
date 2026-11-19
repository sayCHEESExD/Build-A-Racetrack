import { CarSim, TrackPath, type CarEvent, type DriveEndReason, type DriveStartMessage, type Vec3 } from '@race/shared';

/** What the driver needs from the rest of the game. */
export interface DriverHost {
  collect(run: number, i: number, lap: number): void;
  air(run: number, air: number, dist: number): void;
  end(run: number, reason: DriveEndReason, impact: number): void;
  pose(run: number, pos: Vec3, yaw: number, pitch: number, roll: number, v: number): void;
  /** Something to see and hear: air time, landings, crashes, laps, boosts. */
  event(e: CarEvent, sim: CarSim): void;
}

/** Seconds of tumble after a crash before the run ends; after a finish before it hands back. */
const CRASH_HOLD = 1.6;
const FINISH_HOLD = 1.4;
const POSE_EVERY = 0.1;

/**
 * THE LOCAL DRIVER: the player's own car, simulated here for instant response
 * (the shared `CarSim`), reporting to the server what it may check - the
 * pieces it reaches, its jumps, how the run ends - and streaming its pose so
 * everyone else sees it drive.
 */
export class Driver {
  sim: CarSim | null = null;
  run = 0;
  plot = -1;
  /** Air time of the jump in progress / just landed (for the HUD). */
  private poseClock = 0;
  private holdClock = 0;
  private ending: DriveEndReason | null = null;
  private impact = 0;

  constructor(private readonly host: DriverHost) {}

  get active(): boolean {
    return this.sim !== null;
  }

  start(m: DriveStartMessage, path: TrackPath, closed: boolean): void {
    this.sim = new CarSim(path, closed, { speed: m.speed, accel: m.accel, handling: m.handling });
    this.run = m.run;
    this.plot = m.plot;
    this.ending = null;
    this.holdClock = 0;
    this.poseClock = 0;
  }

  /** Leave the run now (the Exit button, Space). */
  exit(): void {
    if (!this.sim || this.ending) return;
    this.ending = 'exit';
    this.host.end(this.run, 'exit', 0);
    this.stop();
  }

  stop(): void {
    this.sim = null;
    this.ending = null;
  }

  update(dt: number, throttle: number, steer: number): void {
    const sim = this.sim;
    if (!sim) return;
    sim.step(dt, { throttle, steer });
    for (const e of sim.events.splice(0)) {
      switch (e.t) {
        case 'piece':
          this.host.collect(this.run, e.i, e.lap);
          break;
        case 'air':
          this.host.air(this.run, e.air, e.dist);
          break;
        case 'crash':
          this.ending = 'crash';
          this.impact = e.impact;
          this.holdClock = 0;
          break;
        case 'finish':
          this.ending = 'finish';
          this.holdClock = 0;
          break;
        default:
          break;
      }
      this.host.event(e, sim);
    }
    this.poseClock += dt;
    if (this.poseClock >= POSE_EVERY) {
      this.poseClock = 0;
      const { yaw, pitch, roll } = sim.euler();
      this.host.pose(this.run, sim.pos, yaw, pitch, roll, sim.mode === 'road' ? sim.v : Math.hypot(sim.vel.x, sim.vel.z));
    }
    if (this.ending === 'crash' || this.ending === 'finish') {
      this.holdClock += dt;
      if (this.holdClock >= (this.ending === 'crash' ? CRASH_HOLD : FINISH_HOLD)) {
        this.host.end(this.run, this.ending, this.impact);
        this.stop();
      }
    }
  }
}
