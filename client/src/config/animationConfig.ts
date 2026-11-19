import type { PoseDefinition } from '../animation/PoseBuffer.js';

const deg = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Procedural animation tuning. Every number the animator uses lives here.
 * All rotations are in CHARACTER space (see `PlayerRig`): +X pitch swings a
 * limb BACKWARD, so a raised arm is a large negative X.
 */

/** The walk/run cycle: ONE cycle at three depths. */
export const LOCOMOTION = {
  minFrequency: 0.9,
  maxFrequency: 3.4,
  /** Blocks travelled per full stride cycle (two steps): feet stay planted at 4.6 and 6.1 blocks/s. */
  strideDistance: 2.7,
  idleSpeed: 0.6,
  walkSpeed: 2.2,
  runSpeed: 5.2,
  sprintSpeed: 6.6,
  /** How far the hips turn toward a strafe / diagonal (the head keeps looking ahead), and how fast. */
  bodyTurn: deg(42),
  bodyTurnRate: 14,

  hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
  kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
  armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
  elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
  torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
  torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
  headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
  torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
  bob: { walk: 0.05, run: 0.11, sprint: 0.15 },
  bankAngle: deg(9),
  bankRate: 8,
} as const;

/** The idle: a relaxed stance, breathing. */
export const IDLE = {
  breathFrequency: 0.35,
  breathAmount: deg(1.8),
  breathBob: 0.012,
  basePose: {
    ArmL1: { x: deg(-8), z: deg(14) },
    ArmL2: { x: deg(38) },
    ArmR1: { x: deg(4), z: deg(-6) },
    ArmR2: { x: deg(12) },
    LegL1: { x: deg(-4) },
    LegR1: { x: deg(4) },
  } satisfies PoseDefinition,
} as const;

/** In the air: knees tucked on the way up, legs reaching on the way down. */
export const AIRBORNE = {
  rise: {
    LegL1: { x: deg(-38) },
    LegR1: { x: deg(8) },
    LegL2: { x: deg(62) },
    LegR2: { x: deg(40) },
    ArmL1: { x: deg(-40), z: deg(34) },
    ArmR1: { x: deg(-30), z: deg(-34) },
    ArmL2: { x: deg(30) },
    ArmR2: { x: deg(30) },
    Spine1: { x: deg(6) },
  } satisfies PoseDefinition,
  fall: {
    LegL1: { x: deg(-14) },
    LegR1: { x: deg(10) },
    LegL2: { x: deg(22) },
    LegR2: { x: deg(18) },
    ArmL1: { x: deg(-70), z: deg(40) },
    ArmR1: { x: deg(-60), z: deg(-40) },
    ArmL2: { x: deg(20) },
    ArmR2: { x: deg(20) },
    Spine1: { x: deg(-4) },
  } satisfies PoseDefinition,
  velocityReference: 20,
} as const;

/** The landing crouch after a jump. */
export const LANDING = {
  duration: 0.16,
  pose: {
    LegL1: { x: deg(-34) },
    LegR1: { x: deg(-34) },
    LegL2: { x: deg(58) },
    LegR2: { x: deg(58) },
    ArmL1: { x: deg(-18), z: deg(20) },
    ArmR1: { x: deg(-18), z: deg(-20) },
    Spine1: { x: deg(14) },
  } satisfies PoseDefinition,
  bobY: -0.32,
} as const;

/**
 * RIDING SHOULDERS: seated astride a friend who is carrying you. Thighs
 * forward and yawed OUT so the legs straddle their neck; hands on their head.
 */
export const RIDE = {
  pose: {
    LegL1: { x: deg(-62), y: deg(30) },
    LegR1: { x: deg(-62), y: deg(-30) },
    LegL2: { x: deg(58), y: deg(20) },
    LegR2: { x: deg(58), y: deg(-20) },
    ArmL1: { x: deg(-48), y: deg(-22) },
    ArmR1: { x: deg(-48), y: deg(22) },
    ArmL2: { x: deg(45) },
    ArmR2: { x: deg(45) },
    Spine1: { x: deg(5) },
    Spine2: { x: deg(2) },
    Neck1: { x: deg(-5) },
  } satisfies PoseDefinition,
  /** The rider's lean into a fast ride. */
  gallopLean: deg(13),
  bounce: deg(5),
  postingHeight: 0.06,
} as const;

/** CARRYING A FRIEND: both arms up, holding the rider on your shoulders. */
export const CARRY = {
  ArmL1: { x: deg(-168), z: deg(12) },
  ArmR1: { x: deg(-168), z: deg(-12) },
  ArmL2: { x: deg(14) },
  ArmR2: { x: deg(14) },
  Spine2: { x: deg(-4) },
} satisfies PoseDefinition;

/** Something in the right hand, carried a little forward. */
export const HOLD = {
  ArmR1: { x: deg(-38), z: deg(-6) },
  ArmR2: { x: deg(30) },
} satisfies PoseDefinition;

/** A shotgun / crossbow held up and ready: both hands on it. */
export const AIM = {
  ArmL1: { x: deg(-78), z: deg(20) },
  ArmR1: { x: deg(-82), z: deg(-6) },
  ArmL2: { x: deg(6) },
  ArmR2: { x: deg(10) },
} satisfies PoseDefinition;

/** Seconds a pose change takes to blend in. */
export const TRANSITIONS = {
  toLocomotion: 0.14,
  toAirborne: 0.12,
  toLanding: 0.06,
} as const;

/**
 * THE CROUCH: low enough to fit a 3.2-unit body under a 2.2-unit vent ceiling.
 * Deep knees, the spine pitched forward, hands near the floor, the head
 * tipped up to see where it is going. The visual node drops by `drop`.
 */
export const CROUCH = {
  pose: {
    LegL1: { x: deg(-78) },
    LegR1: { x: deg(-78) },
    LegL2: { x: deg(118) },
    LegR2: { x: deg(118) },
    Spine1: { x: deg(38) },
    Spine2: { x: deg(14) },
    Neck1: { x: deg(-40) },
    ArmL1: { x: deg(-62), z: deg(10) },
    ArmR1: { x: deg(-62), z: deg(-10) },
    ArmL2: { x: deg(24) },
    ArmR2: { x: deg(24) },
  } satisfies PoseDefinition,
  drop: -0.8,
  /** The crouch-walk: a small alternating shuffle of thighs and hands. */
  thighSwing: deg(16),
  armSwing: deg(22),
  strideDistance: 2.4,
} as const;

/** Holding E: bent over whatever is being searched, hands rummaging. */
export const RUMMAGE = {
  Spine1: { x: deg(26) },
  Neck1: { x: deg(10) },
  ArmL1: { x: deg(-72), z: deg(12) },
  ArmR1: { x: deg(-72), z: deg(-12) },
  ArmL2: { x: deg(34) },
  ArmR2: { x: deg(34) },
} satisfies PoseDefinition;

/** Caught: arms thrown up, a stiff scared recoil. */
export const CAUGHT = {
  ArmL1: { x: deg(-150), z: deg(35) },
  ArmR1: { x: deg(-150), z: deg(-35) },
  ArmL2: { x: deg(30) },
  ArmR2: { x: deg(30) },
  Spine1: { x: deg(-18) },
  Neck1: { x: deg(-20) },
  LegL1: { x: deg(-20) },
  LegR1: { x: deg(10) },
} satisfies PoseDefinition;
