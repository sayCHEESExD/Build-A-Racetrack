import { CAMERA, CROUCH_EYE_HEIGHT, CROUCH_HEIGHT, EYE_HEIGHT, IS_SOLID, type VoxelWorld } from '@race/shared';
import { PerspectiveCamera, Vector3 } from 'three';

const DIR = new Vector3();
const PIVOT = new Vector3();
const LOOK = new Vector3();

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t: number): number => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** Something that takes the camera over for a moment (a jumpscare). */
export interface CameraOverride {
  /** Write the camera for this frame; return false when finished. */
  update(camera: PerspectiveCamera, delta: number): boolean;
}

/**
 * THE CHARACTER CAMERA - the same one in the lobby and in every map.
 *
 * It owns its own yaw and pitch (from the mouse / touch look) and orbits a
 * PIVOT on the character. The wheel moves it along ONE continuous dolly:
 * out behind the character, in over the shoulder, and on into the head. On
 * the last stretch the pivot rises from the shoulders to the EYES, so the
 * camera glides into the face rather than the chest; at distance 0 it is
 * first person. There is no mode switch anywhere - zooming back out simply
 * reverses it.
 *
 * It never enters a wall: a ray from the pivot pulls it in at once and it
 * eases back out when clear. In a vent that pull brings it right to the
 * eyes, so crawling is first person without the player doing anything.
 */
export class CharacterCamera {
  readonly camera: PerspectiveCamera;

  private readonly target = new Vector3();
  private readonly followed = new Vector3();
  private orbitYaw = 0;
  private orbitPitch = 0.22;
  private initialised = false;
  private zoomTarget: number = CAMERA.distance;
  private zoomEased: number = CAMERA.distance;
  /** The distance actually used this frame, after walls. */
  private effective: number = CAMERA.distance;
  private clearance = 1;
  private crouchBlend = 0;
  private crouched = false;
  private collision: VoxelWorld | null = null;
  private shakeAmount = 0;
  private shakeTime = 0;
  private override: CameraOverride | null = null;
  private respawnDolly = 0;

  constructor() {
    this.camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  }

  setViewport(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  /** The direction the camera faces. This is what "forward" means. */
  get yaw(): number {
    return this.orbitYaw;
  }

  get pitch(): number {
    return this.orbitPitch;
  }

  /** 0 = far behind .. 1 = in the head. */
  get headAmount(): number {
    return smooth(1 - this.effective / CAMERA.headBlend);
  }

  /** True at (or within a hair of) the head: the body is hidden, the body faces the camera. */
  get firstPerson(): boolean {
    return this.effective <= CAMERA.firstPerson;
  }

  /** Close enough that the body would fill (or clip) the view. */
  get hideBody(): boolean {
    return this.effective < 1.25;
  }

  /** The zoom the player chose (not the wall-limited one). */
  get chosenDistance(): number {
    return this.zoomTarget;
  }

  setTarget(position: Vector3, crouched: boolean): void {
    this.target.copy(position);
    this.crouched = crouched;
  }

  /** Arrive instead of easing (a placement). `dolly` plays a short pull-in (a respawn). */
  snapTo(position: Vector3, dolly = false): void {
    this.target.copy(position);
    this.followed.copy(position);
    this.initialised = true;
    this.respawnDolly = dolly && this.zoomTarget > 1 ? 6 : 0;
  }

  setOrbit(yaw: number, pitch: number): void {
    this.orbitYaw = yaw;
    this.orbitPitch = pitch;
  }

  setZoom(distance: number): void {
    this.zoomTarget = distance;
  }

  /** Jump the zoom there at once (no glide): entering a map starts in the head. */
  snapZoom(distance: number): void {
    this.zoomTarget = distance;
    this.zoomEased = distance;
    this.effective = distance;
    this.respawnDolly = 0;
  }

  setCollision(collision: VoxelWorld): void {
    this.collision = collision;
  }

  /** Pitch limits for the current zoom: first person may look much further up. */
  pitchLimits(): { min: number; max: number } {
    const head = smooth(1 - this.zoomTarget / CAMERA.headBlend);
    return { min: CAMERA.minPitch + (CAMERA.minPitchFirstPerson - CAMERA.minPitch) * head, max: CAMERA.maxPitch };
  }

  shake(amount: number, seconds: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTime = Math.max(this.shakeTime, seconds);
  }

  setOverride(override: CameraOverride | null): void {
    this.override = override;
  }

  get overridden(): boolean {
    return this.override !== null;
  }

  /** Where the eyes are right now (for the scares and the listener). */
  eyePosition(out: Vector3): Vector3 {
    const eye = EYE_HEIGHT + (CROUCH_EYE_HEIGHT - EYE_HEIGHT) * this.crouchBlend;
    return out.set(this.followed.x, this.followed.y + eye, this.followed.z);
  }

  update(delta: number): void {
    const dt = Math.max(0, delta);
    if (this.override) {
      if (this.override.update(this.camera, dt)) return;
      this.override = null;
    }
    if (!this.initialised) {
      this.followed.copy(this.target);
      this.initialised = true;
    }
    this.crouchBlend += ((this.crouched ? 1 : 0) - this.crouchBlend) * (1 - Math.exp(-12 * dt));
    this.zoomEased += (this.zoomTarget - this.zoomEased) * (1 - Math.exp(-CAMERA.zoomEase * dt));
    if (Math.abs(this.zoomEased - this.zoomTarget) < 0.005) this.zoomEased = this.zoomTarget;
    if (this.respawnDolly > 0) {
      this.respawnDolly *= Math.exp(-5 * dt);
      if (this.respawnDolly < 0.01) this.respawnDolly = 0;
    }
    const wanted = Math.max(0, this.zoomEased + this.respawnDolly);
    const head = smooth(1 - wanted / CAMERA.headBlend);

    // Close to the head the follow must not lag, or the view swims.
    const follow = head > 0.6 ? 40 : CAMERA.followLerp;
    this.followed.lerp(this.target, 1 - Math.exp(-follow * dt));

    // The pivot: shoulders far out, the eyes close in; lower when crouched.
    const shoulder = CAMERA.lookAtHeight + (CROUCH_HEIGHT * 0.95 - CAMERA.lookAtHeight) * this.crouchBlend;
    const eye = EYE_HEIGHT + (CROUCH_EYE_HEIGHT - EYE_HEIGHT) * this.crouchBlend;
    PIVOT.set(this.followed.x, this.followed.y + shoulder + (eye - shoulder) * head, this.followed.z);

    const cosPitch = Math.cos(this.orbitPitch);
    DIR.set(Math.sin(this.orbitYaw) * cosPitch, -Math.sin(this.orbitPitch), Math.cos(this.orbitYaw) * cosPitch);

    // Walls: pull in to the first solid between the pivot and the camera.
    let distance = wanted;
    if (this.collision && wanted > 0.05) {
      const reach = wanted + 0.3;
      const ray = this.collision.raycast(PIVOT.x, PIVOT.y, PIVOT.z, -DIR.x, -DIR.y, -DIR.z, reach);
      const allowed = ray && IS_SOLID[ray.id] ? Math.max(0, ray.distance - 0.25) : wanted;
      const want = wanted > 0 ? allowed / wanted : 1;
      this.clearance = want < this.clearance ? want : this.clearance + (want - this.clearance) * (1 - Math.exp(-5 * dt));
      distance = wanted * Math.min(1, this.clearance);
    }
    // Never below the floor.
    const floor = this.followed.y + 0.35;
    if (PIVOT.y - DIR.y * distance < floor && DIR.y > 0) distance = Math.min(distance, (PIVOT.y - floor) / DIR.y);
    this.effective = Math.max(0, distance);

    const cam = this.camera;
    cam.position.copy(PIVOT).addScaledVector(DIR, -this.effective);
    LOOK.copy(cam.position).add(DIR);

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const a = this.shakeAmount * Math.min(1, this.shakeTime * 3);
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      cam.position.z += (Math.random() - 0.5) * a;
      if (this.shakeTime <= 0) this.shakeAmount = 0;
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(LOOK);

    const fov = CAMERA.fov + (CAMERA.firstPersonFov - CAMERA.fov) * this.headAmount;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
