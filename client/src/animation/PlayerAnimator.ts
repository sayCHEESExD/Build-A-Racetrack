import type { Group } from 'three';
import { AIM, AIRBORNE, CARRY, CAUGHT, CROUCH, HOLD, IDLE, LANDING, LOCOMOTION, RIDE, RUMMAGE, TRANSITIONS } from '../config/animationConfig.js';
import type { AnimationInput } from './AnimationInput.js';
import { EmotePlayer } from './Emotes.js';
import { LocomotionCycle } from './LocomotionCycle.js';
import { PoseBuffer } from './PoseBuffer.js';
import type { PlayerRig } from './rig/PlayerRig.js';
import { BONE_NAMES, type BoneName } from './rig/boneNames.js';

/** The first-person arm pose (degrees), how much it follows the camera down / up, and how far the body sits behind the eye (m). */
export const FIRST_PERSON_ARM = { x: -105, y: 35, z: 10, elbow: 22, follow: 0.95, followUp: 0.6, back: 0.3, down: 0 };

/** The body's base state. Crouch, actions and poses are LAYERS over it. */
export type AnimationState = 'idle' | 'run' | 'airborne' | 'landing';

const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);
const ease = (t: number): number => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
const deg = (d: number): number => (d * Math.PI) / 180;
const TAU = Math.PI * 2;

const ARMS: readonly BoneName[] = ['ArmL1', 'ArmL2', 'ArmR1', 'ArmR2'];
const UPPER: readonly BoneName[] = ['ArmL1', 'ArmL2', 'ArmR1', 'ArmR2', 'Spine1', 'Spine2', 'Neck1'];

/**
 * Writes ONLY to bones (via `PlayerRig`) and to the visual node's position.
 * It never touches the physics root.
 *
 * The base is a procedural idle / run / jump; over it, in order: the CROUCH
 * (a low shuffle that fits under a vent ceiling), riding shoulders, carrying
 * something heavy, rummaging (holding E), the item in the hand (a weapon
 * held up to aim), an item used (a plate thrown, a shot's recoil), and the
 * caught recoil.
 */
export class PlayerAnimator {
  private readonly locomotion = new LocomotionCycle();
  private readonly target = new PoseBuffer();
  private readonly from = new PoseBuffer();
  private readonly output = new PoseBuffer();
  private readonly layer = new PoseBuffer();
  private readonly layerB = new PoseBuffer();
  /** The Bloxity emote this body is playing, if any (blended over everything else). */
  private readonly emote = new EmotePlayer();

  private state: AnimationState = 'idle';
  private stateTime = 0;
  private blendTime = 0;
  private blendDuration = 0;
  private idleTime = 0;
  private wasGrounded = true;
  private bank = 0;
  /** The hips' turn toward a strafe or diagonal, eased. */
  private bodyYaw = 0;
  private crouchW = 0;
  private crouchPhase = 0;
  private rideW = 0;
  private carryW = 0;
  private rummageW = 0;
  private holdW = 0;
  private aimW = 0;
  private caughtW = 0;
  private time = 0;

  constructor(
    private rig: PlayerRig,
    private readonly visual: Group,
  ) {}

  get currentState(): AnimationState {
    return this.state;
  }

  /** Play a Bloxity emote by catalogue id; false (and nothing happens) for an unknown one. */
  playEmote(id: string): boolean {
    return this.emote.play(id);
  }

  stopEmote(): void {
    this.emote.stop();
  }

  /** The emote playing ('' for none, or one fading out). */
  get emoteId(): string {
    return this.emote.currentId;
  }

  setRig(rig: PlayerRig): void {
    this.rig = rig;
  }

  reset(): void {
    this.state = 'idle';
    this.stateTime = 0;
    this.blendDuration = 0;
    this.wasGrounded = true;
    this.bank = 0;
    this.bodyYaw = 0;
    this.target.reset();
    this.from.reset();
    this.output.reset();
    this.rig.resetToBindPose();
    this.visual.position.set(0, 0, 0);
    this.visual.rotation.set(0, 0, 0);
  }

  update(delta: number, input: AnimationInput): void {
    const dt = Math.max(0, delta);
    this.time += dt;
    this.stateTime += dt;
    this.resolveState(input);
    this.writePose(dt, input);
    this.blend(dt);
    const w = (current: number, on: boolean, rate = 12): number => current + ((on ? 1 : 0) - current) * (1 - Math.exp(-rate * dt));
    this.crouchW = w(this.crouchW, input.crouched && !input.carried, 14);
    this.rideW = w(this.rideW, input.carried, 14);
    this.carryW = w(this.carryW, input.carrying);
    this.rummageW = w(this.rummageW, input.interacting && !input.carried);
    // Nothing here is aimed: every item is simply held.
    const weapon = false;
    this.holdW = w(this.holdW, input.holding && !weapon && !input.carrying);
    this.aimW = w(this.aimW, weapon && !input.carried);
    this.caughtW = w(this.caughtW, input.caught, 16);
    this.applyCrouch(dt, input);
    this.applyLayer(RIDE.pose, this.rideW);
    this.applyBones(CARRY, ARMS, this.carryW);
    this.applyRummage();
    this.applyBones(HOLD, ARMS, this.holdW);
    this.applyBones(AIM, ARMS, this.aimW);
    this.applyUse(input);
    if (input.firstPerson) this.applyFirstPersonArm(input);
    this.applyCaught();
    this.applyEmote(dt, input);
    this.turnBody(dt, input);
    this.rig.applyPose(this.output);
    this.applyVisual(dt, input);
  }

  private resolveState(input: AnimationInput): void {
    if (input.carried) {
      this.setState('idle', TRANSITIONS.toLocomotion);
      return;
    }
    if (input.landed || (input.grounded && !this.wasGrounded)) {
      this.wasGrounded = true;
      this.setState('landing', TRANSITIONS.toLanding);
      return;
    }
    this.wasGrounded = input.grounded;
    if (!input.grounded) {
      this.setState('airborne', TRANSITIONS.toAirborne);
      return;
    }
    if (this.state === 'landing' && this.stateTime < LANDING.duration) return;
    this.setState(input.horizontalSpeed < LOCOMOTION.idleSpeed ? 'idle' : 'run', TRANSITIONS.toLocomotion);
  }

  private setState(next: AnimationState, duration: number): void {
    if (next === this.state) return;
    this.from.copyFrom(this.output);
    this.state = next;
    this.stateTime = 0;
    this.blendTime = 0;
    this.blendDuration = duration;
  }

  private writePose(dt: number, input: AnimationInput): void {
    switch (this.state) {
      case 'idle': {
        this.locomotion.settleTowardNeutral(dt);
        this.idleTime += dt;
        const breath = Math.sin(this.idleTime * IDLE.breathFrequency * TAU);
        this.target.applyDefinition(IDLE.basePose);
        this.target.add('Spine1', breath * IDLE.breathAmount);
        this.target.add('Neck1', -breath * IDLE.breathAmount * 0.6);
        this.target.bobY = breath * IDLE.breathBob;
        break;
      }
      case 'run': {
        const backward = Math.cos(input.moveAngle) < -0.15;
        this.locomotion.advance(dt, input.horizontalSpeed, 1, input.sprinting, backward ? -1 : 1);
        // Leaning into a forward run; upright (a touch back) when backpedalling.
        this.locomotion.writePose(this.target, input.horizontalSpeed, 1, backward ? -0.35 : Math.max(0.3, Math.cos(input.moveAngle)));
        break;
      }
      case 'airborne': {
        const rising = clamp(input.verticalVelocity / AIRBORNE.velocityReference, -1, 1);
        this.target.applyDefinition(AIRBORNE.fall);
        this.layerB.applyDefinition(AIRBORNE.rise);
        this.target.lerpBetween(this.target, this.layerB, clamp(0.5 + rising * 0.5, 0, 1));
        this.target.bobY = 0;
        break;
      }
      case 'landing': {
        const depth = 1 - ease(this.stateTime / LANDING.duration);
        this.target.applyDefinition(LANDING.pose, depth);
        this.target.bobY = LANDING.bobY * depth;
        break;
      }
    }
  }

  private blend(dt: number): void {
    if (this.blendDuration > 0) {
      this.blendTime += dt;
      const t = clamp(this.blendTime / this.blendDuration, 0, 1);
      this.output.lerpBetween(this.from, this.target, ease(t));
      if (t >= 1) this.blendDuration = 0;
    } else {
      this.output.copyFrom(this.target);
    }
  }

  /** The crouch and its shuffle, over everything below it. */
  private applyCrouch(dt: number, input: AnimationInput): void {
    if (this.crouchW < 0.01) return;
    const moving = input.horizontalSpeed > 0.6;
    if (moving) this.crouchPhase = (this.crouchPhase + (input.horizontalSpeed / CROUCH.strideDistance) * TAU * dt) % TAU;
    const s = Math.sin(this.crouchPhase) * (moving ? 1 : 0);
    this.layer.applyDefinition(CROUCH.pose);
    this.layer.add('LegL1', CROUCH.thighSwing * s);
    this.layer.add('LegR1', -CROUCH.thighSwing * s);
    this.layer.add('ArmL1', -CROUCH.armSwing * s);
    this.layer.add('ArmR1', CROUCH.armSwing * s);
    this.layer.bobY = CROUCH.drop + Math.abs(s) * 0.04;
    this.overrideAll(this.layer, this.crouchW);
    this.output.bobY += (this.layer.bobY - this.output.bobY) * this.crouchW;
  }

  private applyLayer(definition: Parameters<PoseBuffer['applyDefinition']>[0], weight: number): void {
    if (weight < 0.01) return;
    this.layer.applyDefinition(definition);
    this.overrideAll(this.layer, weight);
  }

  private applyBones(definition: Parameters<PoseBuffer['applyDefinition']>[0], bones: readonly BoneName[], weight: number): void {
    if (weight < 0.01) return;
    this.layer.applyDefinition(definition);
    this.overrideBones(bones, this.layer, weight);
  }

  private applyRummage(): void {
    if (this.rummageW < 0.01) return;
    this.layer.applyDefinition(RUMMAGE);
    const t = this.time * 9;
    this.layer.add('ArmL1', Math.sin(t) * deg(12));
    this.layer.add('ArmR1', Math.sin(t + 2) * deg(12));
    this.layer.add('ArmL2', Math.cos(t) * deg(10));
    this.layer.add('ArmR2', Math.cos(t + 2) * deg(10));
    this.overrideBones(UPPER, this.layer, this.rummageW);
  }

  /** Using something: a key turned in a lock, a hand reaching for a pickup, fingers on a keypad. */
  private applyUse(input: AnimationInput): void {
    // Holding a bow drawn (or food to the mouth): both arms forward.
    if (input.drawing) {
      this.setBone('ArmR1', deg(-85), deg(-10), deg(-6), 1);
      this.setBone('ArmL1', deg(-85), deg(25), deg(6), 1);
      this.setBone('ArmR2', deg(10), 0, 0, 1);
      this.setBone('ArmL2', deg(25), 0, 0, 1);
    }
    // Digging: the arm swings over and over.
    if (input.digging) {
      const s = (Math.sin(this.time * 18) + 1) / 2;
      this.setBone('ArmR1', deg(-120 + 70 * s), 0, deg(-8), 1);
      this.setBone('ArmR2', deg(20), 0, 0, 1);
      return;
    }
    const t = input.useAge;
    if (t < 0 || t > 0.55 || !input.useItem) {
      // A weapon or tool in hand rides a little forward.
      if (input.holding) this.setBone('ArmR1', deg(-28), 0, deg(-4), 0.8);
      return;
    }
    switch (input.useItem) {
      case 'swing':
      case 'place':
      case 'ability': {
        // A quick slash: up and over, then down across the body.
        const d = 0.28;
        if (t > d) return;
        const k = ease(t / d);
        const w = t < d * 0.75 ? 1 : 1 - (t - d * 0.75) / (d * 0.25);
        this.setBone('ArmR1', deg(-135 + 115 * k), deg(-25 * k), deg(-10 + 20 * k), w);
        this.setBone('ArmR2', deg(30 - 20 * k), 0, 0, w);
        this.setBone('Spine2', deg(6 * k), deg(-18 * k), 0, w * 0.6);
        break;
      }
      default: {
        const w = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.15;
        this.setBone('ArmR1', deg(-80), 0, deg(-8), w);
        this.setBone('ArmR2', deg(30), 0, 0, w);
        break;
      }
    }
  }

  /**
   * FIRST PERSON, with the player's OWN arm: the right arm reaches forward
   * into the bottom right of the view, following the camera up and down so
   * it is always there (Minecraft's hand, Roblox's tool pose), and swings on
   * every block placed or broken. The left arm stays down, out of sight.
   */
  private applyFirstPersonArm(input: AnimationInput): void {
    const a = FIRST_PERSON_ARM;
    const pitch = clamp(input.aimPitch, -1.2, 1.35);
    let x = deg(a.x) + pitch * (pitch < 0 ? a.followUp : a.follow);
    let y = deg(a.y);
    const t = input.useAge;
    if (input.useItem && t >= 0 && t < 0.26) {
      const s = Math.sin((t / 0.26) * Math.PI);
      x -= deg(38) * s;
      y += deg(14) * s;
    }
    this.setBone('ArmR1', x, y, deg(a.z), 1);
    this.setBone('ArmR2', deg(a.elbow), 0, 0, 1);
  }

  private applyCaught(): void {
    if (this.caughtW < 0.01) return;
    this.layer.applyDefinition(CAUGHT);
    const shiver = Math.sin(this.time * 38) * deg(4);
    this.layer.add('ArmL1', shiver);
    this.layer.add('ArmR1', -shiver);
    this.overrideAll(this.layer, this.caughtW);
  }

  private setBone(bone: BoneName, x: number, y: number, z: number, weight: number): void {
    const at = BONE_NAMES.indexOf(bone) * 3;
    const out = this.output.rotations;
    out[at] = (out[at] ?? 0) + (x - (out[at] ?? 0)) * weight;
    out[at + 1] = (out[at + 1] ?? 0) + (y - (out[at + 1] ?? 0)) * weight;
    out[at + 2] = (out[at + 2] ?? 0) + (z - (out[at + 2] ?? 0)) * weight;
  }

  /**
   * The emote layer, last, over the whole body. Moving, jumping, crouching,
   * using something, hiding or being caught ends it at once (fading out), so
   * it never fights the walk cycle. Cosmetic: nothing in here may break a frame.
   */
  private applyEmote(dt: number, input: AnimationInput): void {
    try {
      const busy =
        input.horizontalSpeed > 1.5 || !input.grounded || input.crouched || input.interacting || input.carried || input.caught || input.useAge < 0.55;
      if (busy) this.emote.stop();
      this.emote.apply(dt, this.output, this.layerB);
    } catch {
      this.emote.stop();
    }
  }

  private overrideAll(layer: PoseBuffer, weight: number): void {
    const out = this.output.rotations;
    const src = layer.rotations;
    // Bone 0 is the rig root: never posed.
    for (let i = 3; i < out.length; i += 1) {
      const a = out[i] ?? 0;
      out[i] = a + ((src[i] ?? 0) - a) * weight;
    }
  }

  private overrideBones(bones: readonly BoneName[], layer: PoseBuffer, weight: number): void {
    const out = this.output.rotations;
    const src = layer.rotations;
    for (const bone of bones) {
      const at = BONE_NAMES.indexOf(bone) * 3;
      for (let k = 0; k < 3; k += 1) {
        const a = out[at + k] ?? 0;
        const b = src[at + k] ?? 0;
        out[at + k] = a + (b - a) * weight;
      }
    }
  }

  /** Lean, bob and the crouch drop, on the visual node only. */
  /**
   * Strafing and diagonals: the hips and legs turn toward the way you move
   * (backward diagonals turn the other way, legs stepping back), while the
   * chest and head counter-turn so the face keeps looking where you aim.
   */
  private turnBody(dt: number, input: AnimationInput): void {
    let want = 0;
    if (this.state === 'run' && input.grounded && this.emote.currentId === '') {
      const a = input.moveAngle;
      let rel = Math.cos(a) < -0.15 ? a - Math.PI * Math.sign(a || 1) : a;
      if (rel > Math.PI) rel -= Math.PI * 2;
      if (rel < -Math.PI) rel += Math.PI * 2;
      want = clamp(rel, -LOCOMOTION.bodyTurn, LOCOMOTION.bodyTurn);
    }
    this.bodyYaw += (want - this.bodyYaw) * (1 - Math.exp(-LOCOMOTION.bodyTurnRate * dt));
    if (Math.abs(this.bodyYaw) < 1e-4) return;
    this.output.add('Spine1', 0, -this.bodyYaw * 0.45, 0);
    this.output.add('Spine2', 0, -this.bodyYaw * 0.3, 0);
    this.output.add('Neck1', 0, -this.bodyYaw * 0.25, 0);
  }

  private applyVisual(dt: number, input: AnimationInput): void {
    const wantBank = this.state === 'run' && this.crouchW < 0.2 ? -input.turn * LOCOMOTION.bankAngle * 0.6 : 0;
    this.bank += (wantBank - this.bank) * (1 - Math.exp(-LOCOMOTION.bankRate * dt));
    const shake = this.caughtW > 0.01 ? Math.sin(this.time * 31) * 0.05 * this.caughtW : 0;
    this.visual.rotation.set(0, this.bodyYaw, this.bank + shake, 'YXZ');
    this.visual.position.set(0, this.output.bobY + (this.rideW > 0.01 ? -0.35 * this.rideW : 0), 0);
  }
}
