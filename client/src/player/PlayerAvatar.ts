import { AVATAR_SCALE, BODY_HEIGHT } from '@race/shared';
import { BoxGeometry, CanvasTexture, CircleGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, NearestFilter, SRGBColorSpace } from 'three';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import { FIRST_PERSON_ARM } from '../animation/PlayerAnimator.js';
import { NameTag } from './NameTag.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const SHADOW_GEOMETRY = new CircleGeometry(0.42, 16);
const SHADOW_MATERIAL = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
/** How big a driver is in a car, against standing (cars are small; a full-size body pokes through them). */
const SEATED_SCALE = 0.78;

/** The Rainbow Carpet (the Shop's flying gear): seven stripes and a gold fringe, painted once. */
let carpetMaterial: MeshLambertMaterial | null = null;
const carpet = (): Mesh => {
  if (!carpetMaterial) {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 16;
    const ctx = c.getContext('2d')!;
    ['#e8403a', '#f5902a', '#f8d838', '#58c83a', '#3aa8e8', '#4858d0', '#9a48c8'].forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(1, 1 + i * 2, 6, 2);
    });
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(0, 0, 8, 1);
    ctx.fillRect(0, 15, 8, 1);
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(7, 0, 1, 16);
    const tex = new CanvasTexture(c);
    tex.magFilter = NearestFilter;
    tex.colorSpace = SRGBColorSpace;
    carpetMaterial = new MeshLambertMaterial({ map: tex });
  }
  const m = new Mesh(new BoxGeometry(1.1, 0.06, 1.8), carpetMaterial);
  m.position.y = -0.04;
  m.visible = false;
  return m;
};

/**
 * ONE FIGHTER, as everyone sees them:
 *
 *   root          the simulation's position and facing (in blocks)
 *     character   the player's own Bloxity body, scaled to ~1.8 blocks
 *       (hand)    the item in their right hand
 *     tag         name + team square + health bar
 *     shadow      a soft blob under the feet
 */
export class PlayerAvatar {
  readonly root = new Group();
  readonly character = new PlayerCharacter();
  readonly tag = new NameTag();
  readonly input: AnimationInput = createAnimationInput();
  private pose: '' | 'sit' | 'sleep' = '';
  private scaleK = 1;
  private shownScale = 1;
  /** Shrinks a little when seated in a car (eased), so the body fits inside the cockpit. */
  private seatK = 1;
  private readonly shadow = new Mesh(SHADOW_GEOMETRY, SHADOW_MATERIAL);
  private readonly carpet = carpet();
  private carpetTime = 0;
  private held: Group | null = null;
  private heldKey = '';

  /** Your own nameplate is not drawn over your own head. */
  showName = true;
  private hiddenBody = false;

  constructor() {
    this.character.root.scale.setScalar(AVATAR_SCALE);
    this.root.add(this.character.root, this.tag.sprite, this.shadow, this.carpet);
    this.tag.sprite.position.set(0, BODY_HEIGHT + 0.42, 0);
    this.tag.sprite.userData['overlay'] = true;
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.renderOrder = 1;
  }

  setTag(name: string, teamCss: string | null, health: number, color = '#ffffff', enemy = false): void {
    this.tag.set(name, teamCss, health, color, enemy);
    this.tag.sprite.visible = this.showName;
  }

  /** Sitting on a chair, lying in a bed, or standing (''). */
  setPose(pose: '' | 'sit' | 'sleep'): void {
    this.pose = pose;
  }

  /** The Troll menu's Super Size / Super Tiny (drawn only; the body's box is unchanged). */
  setScale(k: number): void {
    this.scaleK = k;
  }

  /** Flying on the Rainbow Carpet. */
  setCarpet(on: boolean): void {
    this.carpet.visible = on;
  }

  setBodyHidden(hidden: boolean): void {
    this.hiddenBody = hidden;
  }

  /** Seen from its own eyes: the body stays (its arm is the first-person hand), the head goes. */
  setFirstPerson(on: boolean, pitch: number): void {
    this.input.firstPerson = on;
    this.input.aimPitch = pitch;
  }

  /** What is in their right hand ('wrench' while building, or ''). */
  setHand(kind: string, team = 0): void {
    const key = `${kind}#${team}`;
    if (key === this.heldKey) return;
    this.heldKey = key;
    this.held?.removeFromParent();
    this.held = null;
    if (!kind) return;
    const model = wrench();
    // The mount lives in the (scaled) rig: undo the avatar scale.
    const holder = new Group();
    holder.scale.setScalar(1 / AVATAR_SCALE);
    model.position.set(0, 0.06, 0.04);
    holder.add(model);
    holder.position.set(0, -0.35, 0);
    this.character.handMount.add(holder);
    this.held = holder;
  }

  /** Armour tier worn (0 none .. 4 emerald). */
  setArmor(tier: number): void {
    this.character.setArmor(tier);
  }

  update(delta: number): void {
    this.input.hand = this.heldKey.split('#')[0] ?? '';
    this.input.holding = this.input.hand !== '';
    this.input.carried = this.pose === 'sit';
    // Ease the size toward the troll effect's.
    this.shownScale += (this.scaleK - this.shownScale) * Math.min(1, delta * 4);
    this.seatK += ((this.pose === 'sit' ? SEATED_SCALE : 1) - this.seatK) * Math.min(1, delta * 12);
    const k = this.shownScale * this.seatK;
    const body = this.character.root;
    body.scale.setScalar(AVATAR_SCALE * k);
    if (this.pose === 'sit') {
      // Hips on the seat: the drop and the lean-back scale with the body.
      body.rotation.set(0, 0, 0);
      body.position.set(0, -0.62 * k, -0.08 * k);
    } else if (this.pose === 'sleep') {
      // On the back, head toward the pillow (the bed's back), centred on the mattress.
      body.rotation.set(-Math.PI / 2, 0, 0);
      body.position.set(0, 0.12, 0.9 * k);
    } else if (this.input.firstPerson) {
      // Seen from its own eyes the body stands a little behind the camera, so the torso is out of view and the arm reaches into it.
      body.rotation.set(0, 0, 0);
      body.position.set(0, -FIRST_PERSON_ARM.down, -FIRST_PERSON_ARM.back);
    } else {
      body.rotation.set(0, 0, 0);
      body.position.set(0, 0, 0);
    }
    if (this.carpet.visible) {
      // It ripples a little under you.
      this.carpetTime += delta;
      this.carpet.rotation.x = Math.sin(this.carpetTime * 3) * 0.04;
      this.carpet.rotation.z = Math.sin(this.carpetTime * 2.3) * 0.03;
      this.carpet.scale.setScalar(k);
      this.input.carried = true;
    }
    this.character.update(delta, this.input);
    this.character.root.visible = !this.hiddenBody;
    this.shadow.visible = !this.hiddenBody;
    this.tag.sprite.visible = this.showName;
    this.tag.sprite.position.y = this.pose === 'sleep' ? 0.8 : this.pose === 'sit' ? BODY_HEIGHT * k - 0.35 : (this.input.crouched ? BODY_HEIGHT + 0.2 : BODY_HEIGHT + 0.42) * k;
    this.shadow.visible = !this.hiddenBody && this.pose === '';
    this.shadow.scale.setScalar(k);
  }

  dispose(): void {
    this.tag.dispose();
    this.character.dispose();
    this.root.removeFromParent();
  }
}

/** The builder's wrench, held while building. */
const wrench = (): Group => {
  const g = new Group();
  const steel = new MeshLambertMaterial({ color: 0xc9d1dc });
  const grip = new MeshLambertMaterial({ color: 0xff7a1a });
  const handle = new Mesh(new BoxGeometry(0.07, 0.42, 0.07), grip);
  handle.position.y = -0.05;
  const head = new Mesh(new BoxGeometry(0.2, 0.08, 0.07), steel);
  head.position.y = 0.2;
  const jaw = new Mesh(new BoxGeometry(0.06, 0.12, 0.07), steel);
  jaw.position.set(0.07, 0.27, 0);
  g.add(handle, head, jaw);
  return g;
};
