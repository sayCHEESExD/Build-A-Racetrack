import { PLAYER_HEIGHT } from '@race/shared';
import { Group, type Mesh, type Object3D } from 'three';
import type { AnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator, type AnimationState } from '../animation/PlayerAnimator.js';
import { attachToMount, measureMounts } from '../animation/rig/BoneMounts.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { PLAYER_MODEL_YAW_OFFSET } from '../config/worldVisuals.js';
import { ArmorModel } from './ArmorModel.js';
import { playerModelLoader } from './PlayerModelLoader.js';

/**
 * The visual half of a player, arranged so animation can never move them.
 *
 *   root          where the body is (the avatar puts it on the ground or in a saddle)
 *     visual      the bob and the lean
 *       model     the cloned FBX (or a Bloxity body), posed by the rig
 *         (bones) the hand mount: food rides the right forearm
 */
export class PlayerCharacter {
  readonly root = new Group();

  private readonly visual = new Group();
  private readonly defaultModel: Object3D;
  private model: Object3D;
  private readonly animator: PlayerAnimator;
  private rig: PlayerRig;

  /** Bolted to the right forearm; whatever is in the hand hangs off it. */
  readonly handMount = new Group();
  private headScale = 1;
  /** Minecraft armour plates on the bones (tier 0 = none). */
  private readonly armor = new ArmorModel();
  private armorTier = 0;

  constructor() {
    this.handMount.userData['gear'] = true;
    this.defaultModel = playerModelLoader.createInstance();
    this.model = this.defaultModel;
    this.model.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.root.add(this.visual);
    this.visual.add(this.model);
    this.rig = new PlayerRig(this.model, this.model);
    this.animator = new PlayerAnimator(this.rig, this.visual);
    this.mountHand();
  }

  get body(): { visual: Group; model: Object3D } {
    return { visual: this.visual, model: this.model };
  }

  get height(): number {
    return PLAYER_HEIGHT;
  }

  /** Wear a different body, or null for the bundled one. */
  setModel(next: Object3D | null): Object3D {
    const target = next ?? this.defaultModel;
    if (target === this.model) return target;
    const previous = this.model;
    previous.removeFromParent();
    // The hand mount rides the old body's bones: take it off BEFORE its materials go.
    this.handMount.removeFromParent();
    this.armor.clear();
    releaseBody(previous);
    target.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.rig = new PlayerRig(target, target);
    this.rig.resetToBindPose();
    target.updateMatrixWorld(true);
    this.model = target;
    this.visual.add(target);
    this.animator.setRig(this.rig);
    this.mountHand();
    return target;
  }

  /** Wear armour of a tier (0 = none): plates measured on this body, pinned to its bones. */
  setArmor(tier: number): void {
    if (tier === this.armorTier) return;
    this.armorTier = tier;
    this.inBindPose(() => this.armor.build(this.rig, this.root, tier));
  }

  /** Bolt the hand mount to this body's right forearm (and re-fit the armour), measured in the bind pose at the origin. */
  private mountHand(): void {
    this.inBindPose(() => {
      const mounts = measureMounts(this.rig, this.root);
      if (mounts.hand) attachToMount(this.handMount, mounts.hand, this.root);
      this.armor.measure(this.rig, this.root, this.model);
      this.armor.build(this.rig, this.root, this.armorTier);
    });
  }

  /** Run with the body at the origin, unrotated, in its bind pose (how every mount is measured). */
  private inBindPose(body: () => void): void {
    const parent = this.root.parent;
    const savedPosition = this.root.position.clone();
    const savedRotation = this.root.rotation.clone();
    parent?.remove(this.root);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.visual.position.set(0, 0, 0);
    this.visual.rotation.set(0, 0, 0);
    this.rig.resetToBindPose();
    this.root.updateMatrixWorld(true);
    body();
    this.root.position.copy(savedPosition);
    this.root.rotation.copy(savedRotation);
    parent?.add(this.root);
    this.root.updateMatrixWorld(true);
    this.animator.reset();
  }

  update(delta: number, input: AnimationInput): void {
    this.animator.update(Math.max(0, delta), input);
    this.hideHead(input.firstPerson);
  }

  /**
   * In first person the camera sits in the head, so the head (and the hat,
   * hair and mask on it) is shrunk away; the rest of the body - its arms -
   * stays. The head's real scale (the avatar's proportions) is kept and put
   * back, re-read every frame so a proportions change while hidden is not lost.
   */
  private hideHead(hidden: boolean): void {
    const neck = this.rig.getBone('Neck1');
    if (!neck) return;
    if (hidden) {
      if (neck.scale.x > 0.01) this.headScale = neck.scale.x;
      neck.scale.setScalar(0.0001);
    } else if (neck.scale.x <= 0.01) neck.scale.setScalar(this.headScale);
  }

  /** Play a Bloxity emote on this body (an unknown id does nothing). */
  playEmote(id: string): boolean {
    return this.animator.playEmote(id);
  }

  stopEmote(): void {
    this.animator.stopEmote();
  }

  /** The emote this body is playing ('' for none). */
  get emoteId(): string {
    return this.animator.emoteId;
  }

  get animationState(): AnimationState {
    return this.animator.currentState;
  }

  resetAnimation(): void {
    this.animator.reset();
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}

/** Let go of a Bloxity body's materials when it is swapped out. */
const releaseBody = (model: Object3D): void => {
  if (model.userData['bloxityBody'] !== true) return;
  model.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
};
