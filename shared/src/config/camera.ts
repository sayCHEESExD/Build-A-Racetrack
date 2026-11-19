/**
 * THE CHARACTER CAMERA, in blocks. Third person behind the shoulders by
 * default (as in the reference), zoomed with the wheel / pinch all the way
 * into the head (first person, Minecraft's view). V toggles the two.
 */
export interface CameraConfig {
  readonly distance: number;
  readonly lookAtHeight: number;
  readonly followLerp: number;
  readonly fov: number;
  readonly firstPersonFov: number;
  readonly near: number;
  readonly far: number;
  readonly zoomMinDistance: number;
  readonly zoomMaxDistance: number;
  readonly zoomStep: number;
  readonly zoomEase: number;
  readonly headBlend: number;
  readonly firstPerson: number;
  readonly minPitch: number;
  readonly minPitchFirstPerson: number;
  readonly maxPitch: number;
}

export const CAMERA: CameraConfig = {
  distance: 0,
  lookAtHeight: 1.62,
  followLerp: 32,
  fov: 72,
  firstPersonFov: 78,
  near: 0.05,
  far: 700,
  zoomMinDistance: 0,
  zoomMaxDistance: 70,
  zoomStep: 0.9,
  zoomEase: 12,
  headBlend: 1.4,
  firstPerson: 0.2,
  minPitch: -1.35,
  minPitchFirstPerson: -1.5,
  maxPitch: 1.45,
};
