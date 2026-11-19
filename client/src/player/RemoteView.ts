import type { Scene } from 'three';
import { AvatarDresser } from '../bloxity/AvatarDresser.js';
import { lookFromState } from '../bloxity/avatarLook.js';
import { relativeMoveAngle } from '../animation/AnimationInput.js';
import type { NetPlayerState } from '../net/netTypes.js';
import { PlayerAvatar } from './PlayerAvatar.js';

const FOLLOW_RATE = 16;
const SNAP_DISTANCE = 12;

const shortestAngle = (from: number, to: number): number => {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
};

/**
 * Another player, drawn from replicated state ONLY. The transform is
 * smoothed toward the replicated one; nothing here is sent.
 */
export class RemoteView {
  readonly avatar = new PlayerAvatar();
  private readonly dresser: AvatarDresser;
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private targetYaw = 0;
  private wasGrounded = true;
  private placed = false;
  private lastLook = '';
  private lastEmoteCount = -1;
  /** Their last swing time we reacted to (sounds). */
  heardUseAt = 0;
  state: NetPlayerState;

  constructor(
    readonly id: string,
    state: NetPlayerState,
  ) {
    this.state = state;
    this.dresser = new AvatarDresser(this.avatar.character);
    this.apply(state);
  }

  get x(): number {
    return this.avatar.root.position.x;
  }

  get y(): number {
    return this.avatar.root.position.y;
  }

  get z(): number {
    return this.avatar.root.position.z;
  }

  get name(): string {
    return this.state.displayName || 'Guest';
  }

  get alive(): boolean {
    return true;
  }

  apply(state: NetPlayerState): void {
    this.state = state;
    this.targetX = state.x;
    this.targetY = state.y;
    this.targetZ = state.z;
    this.targetYaw = state.rotationY;
    const { emote, emoteCount } = state;
    if (emote && emoteCount !== this.lastEmoteCount) this.avatar.character.playEmote(emote);
    else if (!emote && this.avatar.character.emoteId) this.avatar.character.stopEmote();
    this.lastEmoteCount = emoteCount;
    if (state.avatar) {
      const look = lookFromState(state.avatar);
      const key = JSON.stringify(look);
      if (key !== this.lastLook) {
        this.lastLook = key;
        this.dresser.setLook(look.appearance, look.proportions);
      }
    }
  }

  show(scene: Scene): void {
    if (!this.avatar.root.parent) scene.add(this.avatar.root);
  }

  hide(): void {
    this.avatar.root.removeFromParent();
    this.placed = false;
  }

  get shown(): boolean {
    return this.avatar.root.parent !== null;
  }

  update(delta: number, clock: number, tagColor: string, pose: '' | 'sit' | 'sleep', scale: number): void {
    const dt = Math.max(0, delta);
    const position = this.avatar.root.position;
    const gap = Math.hypot(this.targetX - position.x, this.targetY - position.y, this.targetZ - position.z);
    if (!this.placed || gap > SNAP_DISTANCE) {
      position.set(this.targetX, this.targetY, this.targetZ);
      this.avatar.root.rotation.y = this.targetYaw;
      this.placed = true;
    } else {
      const alpha = 1 - Math.exp(-FOLLOW_RATE * dt);
      position.x += (this.targetX - position.x) * alpha;
      position.y += (this.targetY - position.y) * alpha;
      position.z += (this.targetZ - position.z) * alpha;
      const yaw = this.avatar.root.rotation.y;
      this.avatar.root.rotation.y = yaw + shortestAngle(yaw, this.targetYaw) * Math.min(1, alpha * 1.5);
    }
    const s = this.state;
    this.avatar.setTag(this.name, null, -1, tagColor, false);
    this.avatar.setPose(pose);
    this.avatar.setCarpet(false);
    this.avatar.setScale(scale);
    if (pose) {
      // Seated bodies snap to the seat and face along it.
      position.set(this.targetX, this.targetY, this.targetZ);
      this.avatar.root.rotation.y = this.targetYaw;
    }
    const input = this.avatar.input;
    const speed = Math.hypot(s.velocityX, s.velocityZ);
    input.grounded = s.grounded;
    input.horizontalSpeed = speed;
    input.verticalVelocity = s.velocityY;
    input.landed = s.grounded && !this.wasGrounded;
    this.wasGrounded = s.grounded;
    input.sprinting = s.sprinting;
    input.crouched = s.crouched;
    input.useItem = '';
    input.useAge = 99;
    input.drawing = false;
    input.digging = false;
    input.turn = 0;
    input.moveAngle = relativeMoveAngle(s.velocityX, s.velocityZ, s.rotationY);
    this.avatar.setHand(s.building ? 'wrench' : '', 0);
    this.avatar.update(dt);
    this.avatar.root.visible = this.alive;
  }

  dispose(): void {
    this.dresser.dispose();
    this.avatar.dispose();
  }
}
