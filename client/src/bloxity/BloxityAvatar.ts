import {
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Bone,
  type Group,
  type Object3D,
  type Texture,
} from 'three';
import { neckScale } from '@race/shared';
import { logger } from '../util/logger.js';
import { bloxityRiderFactory } from './BloxityRiderFactory.js';
import { assetUrl, defaultSkinUrl, describeItem, skinTextureUrl, specItemPaths } from './bloxityAssets.js';
import {
  isEquippedId,
  type LegionEquipped,
  type LegionProportions,
} from './legionTypes.js';
import { BoneFollower, ITEM_SLOTS, discard, instantiate, itemAssets, type ItemAsset, type ItemSlot } from './wornItems.js';

const SCOPE = 'bloxity/avatar';

type SlotName = ItemSlot['name'];

/** One slot's worn copies (two for a pair) and the cache reference they hold. */
interface Worn {
  readonly nodes: Object3D[];
  readonly key: string;
}

/**
 * Bloxity cosmetics, applied to one rider.
 *
 * Three things are applied, and the choice of which three is deliberate:
 *
 *  - the SKIN, as a texture swap on the rider's own material - the composite
 *    skin when a face, shirt or pants is worn (`skinTextureUrl`);
 *  - the nine MESH items (`ITEM_SLOTS`): hat, hair and mask on the head, the
 *    back item, the rest-pose neck/chest/waist accessories, and the hand and
 *    shoe pairs;
 *  - the PROPORTIONS, as scales and offsets on the bones.
 *
 * The body PARTS are not applied here: those replace geometry on the body
 * itself and so belong to whatever built it - see `BloxityRiderFactory`. This
 * class dresses whichever rider is currently mounted, Bloxity body or bundled
 * `player.fbx`, which is why `rebind` exists.
 *
 * Asset paths come from Bloxity's item catalogue first, used verbatim; the
 * spec's own path pattern is the fallback for an item the catalogue cannot
 * describe.
 */
export class BloxityAvatar {
  private riderVisual: Group;
  private riderModel: Object3D;
  private bones: ReadonlyMap<string, Bone>;
  /** True while the rider is a Bloxity body rather than the bundled one. */
  private wearingBloxityBody = false;

  /** The rider's own material, cloned so remote players keep the default. */
  private material: MeshStandardMaterial | null = null;
  /** The texture the model shipped with, to go back to when a skin is removed. */
  private defaultMap: Texture | null = null;

  private readonly worn = new Map<SlotName, Worn>();
  private readonly loadedTextures: Texture[] = [];

  /*
   * What is currently WORN in each slot.
   *
   * THREE states, not two: `undefined` (absent from the map) means "nothing
   * has been applied to this body yet", `null` means "applied, and the answer
   * was none". Collapsing those two once left a freshly built body with no
   * skin at all, which renders white: for a player with nothing equipped the
   * WANTED value is also null, so a rebind that reset to null matched and
   * skipped the load.
   *
   * The skin's value is a KEY: the catalogue skin id, or the composite URL.
   */
  private currentSkin: string | null | undefined = undefined;
  private readonly current = new Map<SlotName, string | null>();
  /** Bumped on every change of a slot, so a stale load never lands. */
  private readonly requests = new Map<SlotName, number>();
  /** Bumped on a rebind or dispose: a load begun for the old body never lands on the new one. */
  private epoch = 0;

  private readonly textureLoader = new TextureLoader();

  private disposed = false;

  constructor(riderVisual: Group, riderModel: Object3D) {
    this.riderVisual = riderVisual;
    this.riderModel = riderModel;
    this.bones = collectBones(riderModel);
    this.material = this.cloneRiderMaterial(riderModel);
    this.defaultMap = this.material?.map ?? null;
  }

  /**
   * Wear what the account has equipped.
   *
   * Safe to call on every avatar event: each slot is compared against what is
   * already worn, so the common case - a proportions change - touches no
   * network at all.
   */
  apply(equipped: LegionEquipped, proportions: LegionProportions): void {
    if (this.disposed) return;

    this.applySkin(equipped);
    for (const slot of ITEM_SLOTS) void this.applyItem(slot, equipped[slot.field] ?? null);
    this.applyProportions(proportions);
  }

  /**
   * Follow the rider onto a new body.
   *
   * Called when the mount swaps in a Bloxity avatar, or swaps back to the
   * bundled one. Everything this class holds is bound to a particular model -
   * the bones it hangs items on, the material it re-skins - so a swap has to
   * re-collect all of it and then re-wear what was already worn, which is what
   * forgetting every `current` value arranges: the next `apply` sees every
   * slot as changed and puts it back on the new body.
   */
  rebind(riderVisual: Group, riderModel: Object3D, bloxityBody: boolean): void {
    this.takeOffAll();

    this.riderVisual = riderVisual;
    this.riderModel = riderModel;
    this.bones = collectBones(riderModel);
    this.material = this.cloneRiderMaterial(riderModel);
    this.defaultMap = this.material?.map ?? null;
    this.wearingBloxityBody = bloxityBody;

    // UNDEFINED, not null: "not applied to this body yet". See the fields.
    this.currentSkin = undefined;
    this.current.clear();
    this.epoch += 1;
  }

  dispose(): void {
    this.disposed = true;
    this.epoch += 1;
    this.takeOffAll();
    for (const texture of this.loadedTextures) texture.dispose();
    this.loadedTextures.length = 0;
    this.material?.dispose();
    this.material = null;
  }

  // ------------------------------------------------------------------ skin

  /**
   * The skin to wear, as a key: the composite URL when a face, shirt or pants
   * is worn (Bloxity draws them INTO the skin), else the catalogue skin id.
   */
  private applySkin(equipped: LegionEquipped): void {
    const composite = skinTextureUrl(equipped);
    const skinId = equipped.skinId ?? null;
    const wanted = composite ?? (isEquippedId(skinId) ? skinId : null);
    if (wanted === this.currentSkin) return;
    this.currentSkin = wanted;
    void this.loadSkin(wanted, composite !== null);
  }

  /**
   * Put a skin on the body.
   *
   * A Bloxity body with no skin equipped is not bare - it wears Bloxity's own
   * default, which is what their renderer falls back to. The bundled rider
   * instead goes back to the texture it shipped with, because a Bloxity skin
   * is authored for a different UV layout entirely.
   */
  private async loadSkin(wanted: string | null, composite: boolean): Promise<void> {
    const material = this.material;
    if (!material) return;

    let url: string | null = null;
    if (wanted && composite) {
      url = wanted;
    } else if (wanted) {
      const item = await describeItem(wanted);
      const path = item?.assetPaths?.texture;
      if (path) url = assetUrl(path);
    } else if (this.wearingBloxityBody) {
      url = defaultSkinUrl();
    }

    // Still wanted? The player may have changed skin while this was in flight.
    if (this.disposed || this.currentSkin !== wanted) return;

    if (!url) {
      material.map = this.defaultMap;
      material.needsUpdate = true;
      return;
    }

    this.textureLoader.load(
      url,
      (texture) => {
        if (this.disposed || this.currentSkin !== wanted) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = false;
        // Bloxity skins are 64x64 pixel art. Smoothing them turns a face into
        // a smudge, which is why their own renderer filters them this way too.
        texture.magFilter = NearestFilter;
        texture.minFilter = NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        this.loadedTextures.push(texture);
        material.map = texture;
        material.needsUpdate = true;
      },
      undefined,
      () => logger.warn(SCOPE, `skin ${wanted ?? 'default'} failed to load`),
    );
  }

  // ------------------------------------------------------------------ items

  /**
   * Wear (or take off) one slot's item.
   *
   * To a BONE, not to the rider group: an item hung off the group would keep
   * its own idea of where the head is while the head moved. The rest-pose
   * accessories and the pairs are authored against `player.glb` itself, so they
   * are worn only on a Bloxity body; the head and back items are sized for
   * either.
   */
  private async applyItem(slot: ItemSlot, id: string | null): Promise<void> {
    const wanted = isEquippedId(id) ? id : null;
    if (this.current.has(slot.name) && this.current.get(slot.name) === wanted) return;
    this.current.set(slot.name, wanted);
    const request = (this.requests.get(slot.name) ?? 0) + 1;
    this.requests.set(slot.name, request);
    const epoch = this.epoch;
    this.takeOff(slot.name);
    if (!wanted) return;

    const onRig = slot.mount.kind === 'rest' || slot.mount.kind === 'pair';
    if (onRig && !this.wearingBloxityBody) return;

    const stale = (): boolean => this.disposed || epoch !== this.epoch || this.requests.get(slot.name) !== request;

    // The catalogue knows where the item lives; the spec's pattern is the fallback.
    const item = await describeItem(wanted);
    if (stale()) return;
    const fallback = specItemPaths(slot.dir, wanted);
    const meshPath = item?.assetPaths?.mesh ?? fallback.mesh;
    const texturePath = item?.assetPaths?.texture ?? fallback.texture;

    const { key, asset } = itemAssets.acquire(assetUrl(meshPath), assetUrl(texturePath));
    const loaded = await asset;
    if (!loaded || stale()) {
      itemAssets.release(key);
      return;
    }
    const nodes = this.mount(slot, loaded);
    if (nodes.length === 0) {
      itemAssets.release(key);
      return;
    }
    this.worn.set(slot.name, { nodes, key });
    logger.info(SCOPE, `wearing ${slot.name} ${wanted}`);
  }

  /** Hang one loaded item on the current body. Returns what was added (none if the bone is missing). */
  private mount(slot: ItemSlot, asset: ItemAsset): Object3D[] {
    const mount = slot.mount;
    const native = this.wearingBloxityBody;
    switch (mount.kind) {
      case 'head':
      case 'back': {
        const anchor = this.bones.get(mount.kind === 'head' ? 'Neck1' : 'Spine2');
        if (!anchor) return [];
        const object = instantiate(asset);
        // An item is sized against the BONE it hangs on, and the two bodies do
        // not share a bone space: `player.fbx` is authored in centimetres and
        // scaled down on load, while the Bloxity body is the rig these items
        // were made for. So a Bloxity body gets Bloxity's own numbers - scale 1,
        // lifted 0.8 up the head bone, a back item sitting on the spine - and
        // the bundled body keeps the values tuned for it.
        object.scale.setScalar(native ? 1 : ITEM_SCALE);
        if (mount.kind === 'head') object.position.set(0, native ? BLOXITY_HAT_LIFT : HAT_LIFT, 0);
        else object.position.set(0, 0, native ? 0 : BACK_OFFSET);
        anchor.add(object);
        return [object];
      }
      case 'rest': {
        // restInverse(bone) x translate(origin): undo the bone's rest pose, so
        // the item - modelled in the body's rest space - then follows every pose
        // and bone scale the body does.
        const bone = this.bones.get(mount.bone);
        const restInverse = bloxityRiderFactory.restInverse(mount.bone);
        if (!bone || !restInverse) return [];
        const object = instantiate(asset);
        const local = restInverse.clone().multiply(new Matrix4().makeTranslation(new Vector3(...mount.origin)));
        local.decompose(object.position, object.quaternion, object.scale);
        bone.add(object);
        return [object];
      }
      case 'pair': {
        // The mesh is the LEFT piece; the right wears a copy mirrored across x.
        // Both follow their bone's position and rotation only (see BoneFollower),
        // so a longer arm does not stretch the glove on its end.
        const nodes: Object3D[] = [];
        for (const [boneName, mirrored] of [[mount.bone, false], [mount.mirror, true]] as const) {
          const bone = this.bones.get(boneName);
          const restInverse = bloxityRiderFactory.restInverse(boneName);
          if (!bone || !restInverse) continue;
          const local = restInverse.clone();
          if (mirrored) local.multiply(new Matrix4().makeScale(-1, 1, 1));
          const follower = new BoneFollower(bone, this.riderModel, local);
          follower.userData['gear'] = true;
          follower.add(instantiate(asset));
          this.riderModel.add(follower);
          nodes.push(follower);
        }
        return nodes;
      }
    }
  }

  private takeOff(slot: SlotName): void {
    const worn = this.worn.get(slot);
    if (!worn) return;
    this.worn.delete(slot);
    for (const node of worn.nodes) discard(node);
    itemAssets.release(worn.key);
  }

  private takeOffAll(): void {
    for (const slot of [...this.worn.keys()]) this.takeOff(slot);
  }

  // ----------------------------------------------------------- proportions

  /**
   * Apply the account's proportions.
   *
   * Scale and POSITION only - never rotation. `PlayerRig` rebuilds every
   * bone's quaternion from its rest pose on every single frame, so a rotation
   * written here would be gone before it was drawn; scale and position are
   * untouched by it and therefore survive.
   */
  private applyProportions(p: LegionProportions): void {
    const num = (value: number, fallback = 1): number =>
      Number.isFinite(value) && value > 0 ? value : fallback;

    // Height scales the whole rider. The robot's seat is a fixed point, so
    // this grows the rider upward from where they sit rather than through the
    // robot's back.
    this.riderVisual.scale.setScalar(num(p.height));

    const spine1 = this.bones.get('Spine1');
    if (spine1) spine1.scale.x = num(p.torsoScaleX);

    const spine2 = this.bones.get('Spine2');
    if (spine2) spine2.scale.x = num(p.shoulderWidth);

    /*
     * The portal's head proportion, TIMES this game's own.
     *
     * Not `setScalar(num(p.headScale))`. That ran after the rig was bound and
     * overwrote the enlargement the pilot needs to be recognisable from the
     * chase camera, putting almost every player back on a head scale of
     * exactly 1. `neckScale` multiplies the two, so a player's own choice
     * still does what they chose.
     */
    const neck = this.bones.get('Neck1');
    if (neck) neck.scale.setScalar(neckScale(num(p.headScale)));

    for (const name of ['ArmL1', 'ArmR1'] as const) {
      const bone = this.bones.get(name);
      if (bone) bone.scale.y = num(p.armLength);
    }

    // `legOffsetX` is a straddle, so it moves the legs apart rather than
    // scaling them: the rider is sitting on a barrel, and that is the one
    // proportion this game's pose actually cares about.
    const straddle = Number.isFinite(p.legOffsetX) ? p.legOffsetX : 1;
    for (const [name, side] of [['LegL1', 1], ['LegR1', -1]] as const) {
      const bone = this.bones.get(name);
      if (!bone) continue;
      bone.position.x = bone.userData['restX'] as number ?? bone.position.x;
      if (bone.userData['restX'] === undefined) bone.userData['restX'] = bone.position.x;
      bone.position.x = (bone.userData['restX'] as number) + side * (straddle - 1) * LEG_SPREAD;
    }
  }

  /**
   * Give the local rider its own material.
   *
   * Every instance shares ONE material by design, which is exactly right until
   * one of them needs a different skin - at which point writing to it would
   * re-skin every remote player too.
   */
  private cloneRiderMaterial(model: Object3D): MeshStandardMaterial | null {
    let cloned: MeshStandardMaterial | null = null;
    model.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      // Gear bolted to the bones (the cutter) keeps its own material.
      if (isGear(child)) return;
      const material = child.material;
      if (!(material instanceof MeshStandardMaterial)) return;
      cloned ??= material.clone();
      child.material = cloned;
    });
    return cloned;
  }
}

/** How big a CDN item is, in the bone space it hangs in. */
const ITEM_SCALE = 0.9;
/** A hat sits above the head bone's origin, on the bundled body. */
const HAT_LIFT = 0.55;
/**
 * The same lift on a Bloxity body.
 *
 * Bloxity's own figure, not a tuned one: their renderer parents a hat to the
 * head bone at `(0, 0.8, 0)`. These items are authored for that rig, so the
 * number that makes them sit right is theirs.
 */
const BLOXITY_HAT_LIFT = 0.8;
/** A back item sits behind the chest. */
const BACK_OFFSET = -0.35;
/** World units the legs move apart per unit of `legOffsetX`. */
const LEG_SPREAD = 0.12;

/** True for anything under a mount the game bolted to a bone: never re-skinned. */
const isGear = (object: Object3D): boolean => {
  for (let at: Object3D | null = object; at; at = at.parent) if (at.userData['gear'] === true) return true;
  return false;
};

/** The rig's bones, by name. Same first-bone rule `PlayerRig` uses. */
const collectBones = (model: Object3D): Map<string, Bone> => {
  const found = new Map<string, Bone>();
  model.traverse((child) => {
    const bone = child as Bone;
    if (bone.isBone && !found.has(bone.name)) found.set(bone.name, bone);
  });
  return found;
};
