/**
 * The gameplay signals the animator consumes each frame. It reads these and
 * never writes back. The local player fills it from its prediction and every
 * remote from replicated state, so both run the exact same animation code.
 */
export interface AnimationInput {
  grounded: boolean;
  /** Horizontal speed in world units per second. */
  horizontalSpeed: number;
  verticalVelocity: number;
  /** -1..1 steering, for the lean. */
  turn: number;
  /** Which way the body is MOVING relative to where it faces, radians (0 forward, +-PI/2 strafe, PI backward). */
  moveAngle: number;
  landed: boolean;
  sprinting: boolean;
  crouched: boolean;
  /** Holding E on something. */
  interacting: boolean;
  /** The last item used (an item kind) and seconds since (large when none). */
  useItem: string;
  useAge: number;
  /** Pinned (hidden, caught) / carrying something heavy / something in the right hand, and what. */
  carried: boolean;
  carrying: boolean;
  holding: boolean;
  hand: string;
  /** In a monster's grip. */
  caught: boolean;
  /** Drawing a bow / eating (both arms forward). */
  drawing: boolean;
  /** Digging a block (the arm keeps swinging). */
  digging: boolean;
  /** Seen from its own eyes: the right arm is held out in front of the camera. */
  firstPerson: boolean;
  /** The camera's pitch (radians, + looks down), which that arm follows. */
  aimPitch: number;
}

export const createAnimationInput = (): AnimationInput => ({
  grounded: true,
  horizontalSpeed: 0,
  verticalVelocity: 0,
  turn: 0,
  moveAngle: 0,
  landed: false,
  sprinting: false,
  crouched: false,
  interacting: false,
  useItem: '',
  useAge: 99,
  carried: false,
  carrying: false,
  holding: false,
  hand: '',
  caught: false,
  drawing: false,
  digging: false,
  firstPerson: false,
  aimPitch: 0,
});

/** The direction of travel relative to the facing (for `moveAngle`), 0 when (nearly) still. */
export const relativeMoveAngle = (vx: number, vz: number, yaw: number): number => {
  if (Math.hypot(vx, vz) < 0.3) return 0;
  let a = Math.atan2(vx, vz) - yaw;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
