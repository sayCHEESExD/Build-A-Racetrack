import {
  copyMotion,
  createMotion,
  createSimEvents,
  createSimParams,
  horizontalSpeed,
  resetMotion,
  stepBody,
  type BodyMotion,
  type MoveMessage,
  type MovementInput,
  type SimParams,
  type VoxelWorld,
} from '@race/shared';
import { Vector3 } from 'three';
import { relativeMoveAngle } from '../animation/AnimationInput.js';
import type { InputState } from '../input/InputState.js';
import { PlayerAvatar } from './PlayerAvatar.js';

const MAX_PENDING_INPUTS = 240;
const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const SNAP_DISTANCE = 6;
const CORRECTION_RATE = 16;

const lerp = (from: number, to: number, alpha: number): number => from + (to - from) * alpha;
const EMPTY_INPUTS: MoveMessage[] = [];

export type PlacementKind = 'none' | 'respawn' | 'correction';

interface PendingInput {
  seq: number;
  dt: number;
  input: MovementInput;
}

/** The authoritative fields the client reconciles against: every field of `BodyMotion`. */
export interface AuthoritativeMotion {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  grounded: boolean;
  sprinting: boolean;
  crouched: boolean;
  fallStart: number;
  lastInputSeq: number;
}

/**
 * The locally controlled fighter: a PREDICTION of the server's simulation.
 * Runs the identical `stepBody` against the client's copy of the voxels,
 * keeps every input the server has not acknowledged, and on each server
 * update snaps to the authoritative state and replays them - so walking,
 * bridging and jumping feel instant and still end where the server says.
 * Knockback arrives as a velocity in that state and is replayed like the rest.
 */
export class LocalPlayer {
  readonly avatar = new PlayerAvatar();
  readonly position = new Vector3();
  readonly velocity = new Vector3();

  private readonly previous = { x: 0, y: 0, z: 0 };
  private readonly motion: BodyMotion = createMotion();
  private readonly events = createSimEvents();
  private readonly replayEvents = createSimEvents();
  private world: VoxelWorld;
  readonly params: SimParams = createSimParams();
  /** First person: the body always faces the camera; third person: where it walks (Roblox). */
  faceCamera = true;

  private readonly pending: PendingInput[] = [];
  private nextSeq = 1;
  private readonly outgoing: MoveMessage[] = [];
  private accumulator = 0;
  private readonly correction = new Vector3();
  private placement: PlacementKind = 'none';
  /** The camera pitch, sent along for the head and the server's aim. */
  pitch = 0;

  landedEdge = false;
  jumpedEdge = false;
  fellEdge = 0;

  constructor(world: VoxelWorld) {
    this.world = world;
    this.avatar.showName = false;
    this.syncFromMotion();
    this.syncAvatar();
  }

  /** Walk in another world (the lobby's or the match's). */
  setWorld(world: VoxelWorld): void {
    this.world = world;
  }

  get currentWorld(): VoxelWorld {
    return this.world;
  }

  get horizontalSpeed(): number {
    return horizontalSpeed(this.motion);
  }

  get isGrounded(): boolean {
    return this.motion.grounded;
  }

  get yaw(): number {
    return this.motion.yaw;
  }

  get sprinting(): boolean {
    return this.motion.sprinting;
  }

  get crouched(): boolean {
    return this.motion.crouched;
  }

  get motionY(): number {
    return this.motion.y;
  }

  get verticalVelocity(): number {
    return this.motion.vy;
  }

  drainOutgoing(): MoveMessage[] {
    if (this.outgoing.length === 0) return EMPTY_INPUTS;
    const batch = this.outgoing.slice();
    this.outgoing.length = 0;
    return batch;
  }

  resetSession(): void {
    this.nextSeq = 1;
    this.pending.length = 0;
    this.outgoing.length = 0;
    this.accumulator = 0;
  }

  teleport(x: number, y: number, z: number, rotationY: number): void {
    resetMotion(this.motion, x, y, z, rotationY);
    this.previous.x = x;
    this.previous.y = y;
    this.previous.z = z;
    this.pending.length = 0;
    this.outgoing.length = 0;
    this.accumulator = 0;
    this.correction.set(0, 0, 0);
    this.placement = 'respawn';
    this.avatar.character.resetAnimation();
    this.syncFromMotion();
    this.syncAvatar();
  }

  /** A shove from the server (a hit, a push): carry on with this velocity until the next state lands. */
  impulse(vx: number, vy: number, vz: number): void {
    this.motion.vx = vx;
    this.motion.vy = vy;
    this.motion.vz = vz;
    this.motion.grounded = false;
  }

  /** Turn the body to face a direction (a swing). */
  faceYaw(yaw: number): void {
    this.motion.yaw = yaw;
  }

  reconcile(state: AuthoritativeMotion): void {
    const px = this.motion.x;
    const py = this.motion.y;
    const pz = this.motion.z;
    const m = this.motion;
    m.x = state.x;
    m.y = state.y;
    m.z = state.z;
    m.vx = state.velocityX;
    m.vy = state.velocityY;
    m.vz = state.velocityZ;
    m.yaw = state.rotationY;
    m.grounded = state.grounded;
    m.sprinting = state.sprinting;
    m.crouched = state.crouched;
    m.fallStart = state.fallStart;
    let kept = 0;
    for (const entry of this.pending) {
      if (entry.seq <= state.lastInputSeq) continue;
      this.pending[kept] = entry;
      kept += 1;
    }
    this.pending.length = kept;
    for (const entry of this.pending) stepBody(m, entry.input, this.params, entry.dt, this.world, this.replayEvents);
    const dx = px - m.x;
    const dy = py - m.y;
    const dz = pz - m.z;
    const snapped = Math.hypot(dx, dy, dz) > SNAP_DISTANCE;
    this.correction.set(snapped ? 0 : dx, snapped ? 0 : dy, snapped ? 0 : dz);
    if (snapped) {
      this.previous.x = m.x;
      this.previous.y = m.y;
      this.previous.z = m.z;
      if (this.placement === 'none') this.placement = 'correction';
    }
    this.syncFromMotion();
    this.syncAvatar();
  }

  update(delta: number, input: Readonly<InputState>, cameraYaw: number): void {
    this.landedEdge = false;
    this.jumpedEdge = false;
    this.fellEdge = 0;
    this.accumulator += Math.max(0, delta);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_DT;
      steps += 1;
      const movement: MovementInput = {
        moveX: input.moveX,
        moveZ: input.moveZ,
        cameraYaw,
        jump: input.jumpHeld,
        sprint: input.sprint,
        crouch: input.crouch,
        face: this.faceCamera,
      };
      const seq = this.nextSeq;
      this.nextSeq += 1;
      this.previous.x = this.motion.x;
      this.previous.y = this.motion.y;
      this.previous.z = this.motion.z;
      stepBody(this.motion, movement, this.params, FIXED_DT, this.world, this.events);
      this.landedEdge = this.landedEdge || this.events.landed;
      this.jumpedEdge = this.jumpedEdge || this.events.jumped;
      this.fellEdge = Math.max(this.fellEdge, this.events.fell);
      this.pending.push({ seq, dt: FIXED_DT, input: movement });
      if (this.pending.length > MAX_PENDING_INPUTS) this.pending.shift();
      this.outgoing.push({ seq, dt: FIXED_DT, ...movement, pitch: this.pitch });
    }
    if (this.accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) this.accumulator = 0;
    this.decayCorrection(delta);
    this.syncFromMotion();
    this.syncAvatar();
    const a = this.avatar.input;
    a.grounded = this.motion.grounded;
    a.horizontalSpeed = this.horizontalSpeed;
    a.verticalVelocity = this.motion.vy;
    a.turn = input.moveX;
    a.moveAngle = relativeMoveAngle(this.motion.vx, this.motion.vz, this.motion.yaw);
    a.landed = this.landedEdge;
    a.sprinting = this.motion.sprinting;
    a.crouched = this.motion.crouched;
    this.avatar.update(delta);
  }

  consumePlacement(): PlacementKind {
    const kind = this.placement;
    this.placement = 'none';
    return kind;
  }

  readMotion(into: BodyMotion): void {
    copyMotion(this.motion, into);
  }

  private decayCorrection(delta: number): void {
    if (this.correction.lengthSq() < 1e-8) {
      this.correction.set(0, 0, 0);
      return;
    }
    this.correction.multiplyScalar(Math.exp(-CORRECTION_RATE * delta));
  }

  private syncFromMotion(): void {
    const alpha = Math.min(Math.max(this.accumulator / FIXED_DT, 0), 1);
    this.position.set(
      lerp(this.previous.x, this.motion.x, alpha) + this.correction.x,
      lerp(this.previous.y, this.motion.y, alpha) + this.correction.y,
      lerp(this.previous.z, this.motion.z, alpha) + this.correction.z,
    );
    this.velocity.set(this.motion.vx, this.motion.vy, this.motion.vz);
  }

  private syncAvatar(): void {
    this.avatar.root.position.copy(this.position);
    this.avatar.root.rotation.y = this.motion.yaw;
  }
}
