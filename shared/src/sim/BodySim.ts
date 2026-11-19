import { BODY_COLLIDE_HEIGHT, BODY_HALF_WIDTH, SNEAK_COLLIDE_HEIGHT } from '../constants/world.js';
import { rotateTowards } from '../types/math.js';
import { IS_BOUNCE, IS_CLIMB, IS_SOLID, IS_WATER, SHAPE } from '../voxel/blocks.js';
import type { Box } from '../voxel/shapes.js';
import type { ExtraSolid, VoxelWorld } from '../voxel/VoxelWorld.js';

/**
 * THE BODY SIMULATION: Minecraft-style AABB physics against the voxel world,
 * shared by the server (authority, humans and bots alike) and the client's
 * prediction. The two only ever disagree through inputs and impulses.
 *
 * Walk, sprint, jump (held = keep jumping), SNEAK (slower, and you cannot walk
 * off an edge - the bridging stance), climb ladders, fall. Knockback is an
 * impulse the server writes into the velocity: friction on the ground eats it
 * quickly, so hits LIFT the body and the air carries it.
 */
export interface BodyMotion {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  grounded: boolean;
  sprinting: boolean;
  crouched: boolean;
  /** The highest point since the feet left the ground (fall damage). */
  fallStart: number;
}

/** One frame of intent. Carries no position - only what was pressed. */
export interface MovementInput {
  moveX: number;
  moveZ: number;
  cameraYaw: number;
  /** Held. */
  jump: boolean;
  sprint: boolean;
  /** Sneak, held. */
  crouch: boolean;
  /** The body faces where the camera looks (always, first-person style). */
  face: boolean;
}

/** Server-owned facts the step reads but never changes. */
export interface SimParams {
  walkSpeed: number;
  sprintSpeed: number;
  sneakSpeed: number;
  /** Multiplies every speed (potions, frost). */
  speedScale: number;
  /** Multiplies the jump velocity (jump potion). */
  jumpScale: number;
  /** Cannot move at all (dead, spectating, frozen by the server). */
  frozen: boolean;
  /** The server places the body; the step does nothing. */
  pinned: boolean;
  /** Flying (the Rainbow Carpet): no gravity, Space rises, sneak sinks. */
  fly: boolean;
  /** Multiplies gravity (the Gravity Coil). */
  gravityScale: number;
  /** A flood's water surface (-Infinity: none): below it, bodies swim. */
  waterLevel: number;
}

export interface SimEvents {
  landed: boolean;
  jumped: boolean;
  /** Blocks fallen, on the step that landed (0 otherwise). */
  fell: number;
}

export const MOVEMENT = {
  walkSpeed: 4.6,
  sprintSpeed: 6.1,
  sneakSpeed: 1.9,
  /** Ground: reach full speed in ~0.05 s, stop in ~0.07 s; reversing adds both (no skating through a turn). */
  groundAccel: 95,
  groundFriction: 85,
  /** Air: real steering, and letting go stops your own drift - but knockback (faster than you run) still carries. */
  airAccel: 32,
  airStop: 24,
  airDrag: 0.6,
  /** A heavier, quicker jump: ~1.3 blocks high, ~0.56 s in the air. */
  gravity: 34,
  jumpVelocity: 9.5,
  terminalVelocity: 58,
  turnSpeed: 14,
  climbSpeed: 3.2,
  /** Ledges this low are stepped onto (slabs, stairs, carpets). */
  stepHeight: 0.6,
  flySpeed: 10,
  flyVertical: 8,
  swimUp: 4.2,
  swimSink: 2.4,
  swimGravity: 9,
  buoyancy: 1.4,
  /** Swimming into a bank leaps you up out of the water and onto it (~1.2 blocks). */
  waterLeap: 9,
  /** A Bounce Pad launches whoever lands on it (about eight blocks up). */
  bounceVelocity: 23,
} as const;

/** Largest single step the simulation will take, in seconds. */
export const MAX_SIM_DELTA = 0.1;
const EPS = 1e-4;

export const createMotion = (): BodyMotion => ({
  x: 0,
  y: 60,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  grounded: false,
  sprinting: false,
  crouched: false,
  fallStart: 60,
});

export const createSimEvents = (): SimEvents => ({ landed: false, jumped: false, fell: 0 });

export const createSimParams = (): SimParams => ({
  walkSpeed: MOVEMENT.walkSpeed,
  sprintSpeed: MOVEMENT.sprintSpeed,
  sneakSpeed: MOVEMENT.sneakSpeed,
  speedScale: 1,
  jumpScale: 1,
  frozen: false,
  pinned: false,
  fly: false,
  gravityScale: 1,
  waterLevel: -Infinity,
});

export const copyMotion = (from: BodyMotion, to: BodyMotion): void => {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.vx = from.vx;
  to.vy = from.vy;
  to.vz = from.vz;
  to.yaw = from.yaw;
  to.grounded = from.grounded;
  to.sprinting = from.sprinting;
  to.crouched = from.crouched;
  to.fallStart = from.fallStart;
};

/** Put a body somewhere, standing and still. */
export const resetMotion = (motion: BodyMotion, x: number, y: number, z: number, yaw: number): void => {
  motion.x = x;
  motion.y = y;
  motion.z = z;
  motion.vx = 0;
  motion.vy = 0;
  motion.vz = 0;
  motion.yaw = yaw;
  motion.grounded = true;
  motion.sprinting = false;
  motion.crouched = false;
  motion.fallStart = y;
};

export const horizontalSpeed = (motion: BodyMotion): number => Math.hypot(motion.vx, motion.vz);

export const bodyHeight = (motion: BodyMotion): number => (motion.crouched ? SNEAK_COLLIDE_HEIGHT : BODY_COLLIDE_HEIGHT);

/** Sanitise one input before it is simulated. Applied on the SERVER. */
export const sanitiseInput = (input: Partial<MovementInput> | undefined): MovementInput => {
  const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  let moveX = finite(input?.moveX);
  let moveZ = finite(input?.moveZ);
  const magnitude = Math.hypot(moveX, moveZ);
  if (magnitude > 1) {
    moveX /= magnitude;
    moveZ /= magnitude;
  }
  return {
    moveX,
    moveZ,
    cameraYaw: finite(input?.cameraYaw),
    jump: input?.jump === true,
    sprint: input?.sprint === true,
    crouch: input?.crouch === true,
    face: input?.face === true,
  };
};

/** World direction for camera-relative stick input: forward is where the camera looks. */
export const wishDirection = (moveX: number, moveZ: number, yaw: number): { x: number; z: number } => {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  return { x: rx * moveX + fx * moveZ, z: rz * moveX + fz * moveZ };
};

/** The stick values that walk a body (camera yaw 0) toward a world direction. Bots use this. */
export const stickToward = (dx: number, dz: number): { moveX: number; moveZ: number } => {
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return { moveX: 0, moveZ: 0 };
  return { moveX: -dx / length, moveZ: dz / length };
};

// ---------------------------------------------------------------- collision

const FULL: Box = [0, 0, 0, 1, 1, 1];
const NEAR: ExtraSolid[] = [];

/** The collision boxes of one cell, in cell-local units (a full cube's fast path). */
const collisionBoxes = (world: VoxelWorld, x: number, y: number, z: number, id: number): readonly Box[] => (SHAPE[id] === 0 ? [FULL] : world.boxesAt(x, y, z, true));

/** Any solid block or piece of furniture overlapping the box? */
export const boxHitsSolid = (world: VoxelWorld, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean => {
  const x0 = Math.floor(minX);
  const x1 = Math.floor(maxX - EPS);
  // One cell lower: a fence or wall below reaches half a block up into this one.
  const y0 = Math.floor(minY) - 1;
  const y1 = Math.floor(maxY - EPS);
  const z0 = Math.floor(minZ);
  const z1 = Math.floor(maxZ - EPS);
  for (let y = y0; y <= y1; y += 1)
    for (let z = z0; z <= z1; z += 1)
      for (let x = x0; x <= x1; x += 1) {
        const id = world.get(x, y, z);
        if (!IS_SOLID[id]) continue;
        for (const b of collisionBoxes(world, x, y, z, id)) {
          if (x + b[3] <= minX + EPS || x + b[0] >= maxX - EPS) continue;
          if (y + b[4] <= minY + EPS || y + b[1] >= maxY - EPS) continue;
          if (z + b[5] <= minZ + EPS || z + b[2] >= maxZ - EPS) continue;
          return true;
        }
      }
  for (const e of world.extrasNear(minX, minZ, maxX, maxZ, NEAR)) {
    if (e.maxX <= minX + EPS || e.minX >= maxX - EPS || e.maxY <= minY + EPS || e.minY >= maxY - EPS || e.maxZ <= minZ + EPS || e.minZ >= maxZ - EPS) continue;
    return true;
  }
  return false;
};

/** Would a standing body fit here? */
export const bodyFits = (world: VoxelWorld, x: number, y: number, z: number, height = BODY_COLLIDE_HEIGHT): boolean =>
  !boxHitsSolid(world, x - BODY_HALF_WIDTH, y, z - BODY_HALF_WIDTH, x + BODY_HALF_WIDTH, y + height, z + BODY_HALF_WIDTH);

/** Is there something to stand on right under the box (within `depth`)? */
const supported = (world: VoxelWorld, x: number, y: number, z: number, depth: number): boolean =>
  boxHitsSolid(world, x - BODY_HALF_WIDTH, y - depth, z - BODY_HALF_WIDTH, x + BODY_HALF_WIDTH, y, z + BODY_HALF_WIDTH);

/** Clamp a move along one axis so the box does not enter a solid. Returns the allowed delta. */
const sweep = (world: VoxelWorld, m: BodyMotion, height: number, axis: 0 | 1 | 2, delta: number): number => {
  if (delta === 0) return 0;
  const hw = BODY_HALF_WIDTH;
  let minX = m.x - hw;
  let maxX = m.x + hw;
  let minY = m.y;
  let maxY = m.y + height;
  let minZ = m.z - hw;
  let maxZ = m.z + hw;
  if (axis === 0) {
    if (delta > 0) maxX += delta;
    else minX += delta;
  } else if (axis === 1) {
    if (delta > 0) maxY += delta;
    else minY += delta;
  } else if (delta > 0) maxZ += delta;
  else minZ += delta;
  let allowed = delta;
  // One box against the body: does it overlap on the other two axes, and how far may we go?
  const test = (bx0: number, by0: number, bz0: number, bx1: number, by1: number, bz1: number): void => {
    if (axis !== 0 && (bx1 <= m.x - hw + EPS || bx0 >= m.x + hw - EPS)) return;
    if (axis !== 1 && (by1 <= m.y + EPS || by0 >= m.y + height - EPS)) return;
    if (axis !== 2 && (bz1 <= m.z - hw + EPS || bz0 >= m.z + hw - EPS)) return;
    // Only what lies ahead counts: a box behind (or under the feet while rising) is no wall.
    if (axis === 0) {
      if (delta > 0 && bx0 >= m.x + hw - EPS) allowed = Math.min(allowed, bx0 - (m.x + hw));
      else if (delta < 0 && bx1 <= m.x - hw + EPS) allowed = Math.max(allowed, bx1 - (m.x - hw));
    } else if (axis === 1) {
      if (delta > 0 && by0 >= m.y + height - EPS) allowed = Math.min(allowed, by0 - (m.y + height));
      else if (delta < 0 && by1 <= m.y + EPS) allowed = Math.max(allowed, by1 - m.y);
    } else if (delta > 0 && bz0 >= m.z + hw - EPS) allowed = Math.min(allowed, bz0 - (m.z + hw));
    else if (delta < 0 && bz1 <= m.z - hw + EPS) allowed = Math.max(allowed, bz1 - (m.z - hw));
  };
  const x0 = Math.floor(minX);
  const x1 = Math.floor(maxX - EPS);
  const y0 = Math.floor(minY) - 1;
  const y1 = Math.floor(maxY - EPS);
  const z0 = Math.floor(minZ);
  const z1 = Math.floor(maxZ - EPS);
  for (let y = y0; y <= y1; y += 1)
    for (let z = z0; z <= z1; z += 1)
      for (let x = x0; x <= x1; x += 1) {
        const id = world.get(x, y, z);
        if (!IS_SOLID[id]) continue;
        for (const b of collisionBoxes(world, x, y, z, id)) test(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
      }
  for (const e of world.extrasNear(minX, minZ, maxX, maxZ, NEAR)) test(e.minX, e.minY, e.minZ, e.maxX, e.maxY, e.maxZ);
  if (delta > 0) return Math.max(0, allowed);
  return Math.min(0, allowed);
};

/** Is the body's middle in water (a water block, or under a flood)? */
export const inWater = (world: VoxelWorld, m: BodyMotion, waterLevel: number): boolean => m.y + 0.7 < waterLevel || IS_WATER[world.at(m.x, m.y + 0.6, m.z)] === 1;

const onLadder = (world: VoxelWorld, m: BodyMotion): boolean => {
  const hw = BODY_HALF_WIDTH - 0.02;
  for (const y of [m.y + 0.1, m.y + 1]) {
    for (const [dx, dz] of [
      [-hw, -hw],
      [hw, -hw],
      [-hw, hw],
      [hw, hw],
    ] as const) {
      if (IS_CLIMB[world.at(m.x + dx, y, m.z + dz)]) return true;
    }
  }
  return false;
};

/**
 * Advance one body by one step.
 *
 * @param motion mutated in place
 * @param input  already sanitised intent
 * @param params server-owned facts
 * @param delta  seconds; clamped internally to [0, MAX_SIM_DELTA]
 * @param world  the voxels
 * @param events mutated in place with the edges this step produced
 */
export const stepBody = (motion: BodyMotion, input: MovementInput, params: SimParams, delta: number, world: VoxelWorld, events: SimEvents): void => {
  events.landed = false;
  events.jumped = false;
  events.fell = 0;
  const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_SIM_DELTA) : 0;
  if (dt === 0 || params.pinned) return;
  const m = motion;

  // Sneak: held goes down at once; let go stands up only with headroom.
  if (input.crouch && !params.frozen) m.crouched = true;
  else if (m.crouched && bodyFits(world, m.x, m.y, m.z, BODY_COLLIDE_HEIGHT)) m.crouched = false;
  const height = bodyHeight(m);

  const wish = wishDirection(input.moveX, input.moveZ, input.cameraYaw);
  let wishX = wish.x;
  let wishZ = wish.z;
  let wishLength = Math.hypot(wishX, wishZ);
  if (params.frozen) {
    wishX = 0;
    wishZ = 0;
    wishLength = 0;
  }
  m.sprinting = input.sprint && !m.crouched && !params.frozen && input.moveZ > 0.3;
  const base = m.crouched ? params.sneakSpeed : m.sprinting ? params.sprintSpeed : params.walkSpeed;
  const speed = base * params.speedScale;
  const targetX = wishX * speed;
  const targetZ = wishZ * speed;

  if (m.grounded) {
    // On the ground: accelerate to the wish, friction kills anything faster (knockback) quickly.
    const dvx = targetX - m.vx;
    const dvz = targetZ - m.vz;
    const dv = Math.hypot(dvx, dvz);
    // Turning against your own momentum brakes and accelerates at once: direction changes are immediate.
    const against = wishLength > 0.01 && targetX * m.vx + targetZ * m.vz < 0;
    const rate = (wishLength > 0.01 ? MOVEMENT.groundAccel + (against ? MOVEMENT.groundFriction : 0) : MOVEMENT.groundFriction) * dt;
    if (dv <= rate) {
      m.vx = targetX;
      m.vz = targetZ;
    } else {
      m.vx += (dvx / dv) * rate;
      m.vz += (dvz / dv) * rate;
    }
  } else {
    // In the air: a little steering, a little drag - momentum (and knockback) carries.
    const hs = Math.hypot(m.vx, m.vz);
    if (wishLength > 0.01) {
      m.vx += wishX * MOVEMENT.airAccel * dt;
      m.vz += wishZ * MOVEMENT.airAccel * dt;
      const after = Math.hypot(m.vx, m.vz);
      const cap = Math.max(hs, speed);
      if (after > cap) {
        m.vx *= cap / after;
        m.vz *= cap / after;
      }
    } else if (hs <= params.sprintSpeed * params.speedScale + 0.5) {
      // Let go mid-air: your own run comes to a stop - no floating on.
      const k = Math.max(0, hs - MOVEMENT.airStop * dt) / (hs || 1);
      m.vx *= k;
      m.vz *= k;
    } else {
      // Faster than you can run (a hit, an explosion): the air carries it.
      const k = Math.exp(-MOVEMENT.airDrag * dt);
      m.vx *= k;
      m.vz *= k;
    }
  }

  if (input.face && !params.frozen) m.yaw = input.cameraYaw;
  else if (wishLength > 0.05) m.yaw = rotateTowards(m.yaw, Math.atan2(wishX, wishZ), MOVEMENT.turnSpeed * dt);

  const climbing = !params.fly && onLadder(world, m);
  const swimming = !params.fly && inWater(world, m, params.waterLevel);
  if (params.fly && !params.frozen) {
    // The carpet: hold Space to rise, sneak to sink, nothing to hover.
    const flySpeed = MOVEMENT.flySpeed * params.speedScale;
    m.vx = wishX * flySpeed;
    m.vz = wishZ * flySpeed;
    m.vy = input.jump ? MOVEMENT.flyVertical : input.crouch ? -MOVEMENT.flyVertical : 0;
    m.fallStart = m.y;
  } else if (swimming && m.vy > MOVEMENT.swimUp + 0.5) {
    // Mid-leap out of the water: it carries on like a jump.
    m.vy -= MOVEMENT.gravity * params.gravityScale * dt;
    m.fallStart = m.y;
  } else if (swimming) {
    // Water carries you up gently; Space swims up faster, sneak dives.
    const want = params.frozen ? 0 : input.jump ? MOVEMENT.swimUp : input.crouch ? -MOVEMENT.swimSink : MOVEMENT.buoyancy;
    m.vy += (want - m.vy) * Math.min(1, 6 * dt);
    m.vx *= 0.9;
    m.vz *= 0.9;
    m.fallStart = m.y;
  } else if (climbing) {
    if ((input.moveZ > 0.2 || input.jump) && !params.frozen) m.vy = MOVEMENT.climbSpeed;
    else if (m.crouched) m.vy = 0;
    else m.vy = Math.max(m.vy - MOVEMENT.gravity * dt, -2.4);
    m.fallStart = m.y;
  } else {
    if (input.jump && m.grounded && !params.frozen) {
      m.vy = MOVEMENT.jumpVelocity * params.jumpScale;
      m.grounded = false;
      events.jumped = true;
    }
    m.vy = Math.max(m.vy - MOVEMENT.gravity * params.gravityScale * dt, -MOVEMENT.terminalVelocity);
  }

  const wasGrounded = m.grounded;
  const fallingSpeed = m.vy;

  // ---- Y first (Minecraft's order), then X and Z.
  const dy = m.vy * dt;
  const ay = sweep(world, m, height, 1, dy);
  m.y += ay;
  if (dy < 0 && ay > dy + EPS) {
    // Landed - or bounced, on a Bounce Pad.
    m.grounded = true;
    if (!wasGrounded) {
      events.landed = true;
      events.fell = Math.max(0, m.fallStart - m.y);
    }
    m.vy = 0;
    if (IS_BOUNCE[world.at(m.x, m.y + 0.1, m.z)] === 1 || IS_BOUNCE[world.at(m.x, m.y - 0.05, m.z)] === 1) {
      m.vy = MOVEMENT.bounceVelocity;
      m.grounded = false;
      events.jumped = true;
    }
  } else if (dy > 0 && ay < dy - EPS) {
    m.vy = 0;
    m.grounded = false;
  } else {
    m.grounded = false;
  }
  if (m.grounded || climbing || m.vy > 0) m.fallStart = m.y;
  else m.fallStart = Math.max(m.fallStart, m.y);

  let dx = m.vx * dt;
  let dz = m.vz * dt;
  // Standing on a moving walkway: carried along with it, on top of your own walking.
  if (m.grounded && !params.fly) {
    const belt = world.conveyorAt(m.x, m.z);
    if (belt) {
      dx += belt.vx * dt;
      dz += belt.vz * dt;
    }
  }
  // Sneaking on the ground: never walk off an edge (the bridging stance).
  if (m.crouched && m.grounded) {
    const step = 0.05;
    while (dx !== 0 && !supported(world, m.x + dx, m.y, m.z, 0.6)) dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
    while (dz !== 0 && !supported(world, m.x, m.y, m.z + dz, 0.6)) dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
    while (dx !== 0 && dz !== 0 && !supported(world, m.x + dx, m.y, m.z + dz, 0.6)) {
      dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
      dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
    }
  }
  let bumped = false;
  const ax = sweep(world, m, height, 0, dx);
  if (Math.abs(ax - dx) > EPS && !tryStep(world, m, height, 0, dx)) {
    m.x += ax;
    m.vx = 0;
    bumped = true;
  } else if (Math.abs(ax - dx) <= EPS) m.x += ax;
  const az = sweep(world, m, height, 2, dz);
  if (Math.abs(az - dz) > EPS && !tryStep(world, m, height, 2, dz)) {
    m.z += az;
    m.vz = 0;
    bumped = true;
  } else if (Math.abs(az - dz) <= EPS) m.z += az;
  // Swimming into a bank (or a wall of the pool) leaps you up and out, as in Minecraft.
  if (swimming && bumped && !params.frozen && wishLength > 0.05 && m.vy <= MOVEMENT.swimUp + 0.5) {
    m.vy = MOVEMENT.waterLeap * params.jumpScale;
    events.jumped = true;
  }

  if (!m.grounded && m.vy <= 0 && supported(world, m.x, m.y, m.z, 0.001)) m.grounded = true;
  const edge = BODY_HALF_WIDTH + 0.05;
  m.x = Math.min(world.maxX - edge, Math.max(world.minX + edge, m.x));
  m.z = Math.min(world.maxZ - edge, Math.max(world.minZ + edge, m.z));
  if (m.y > world.sizeY + 16) {
    m.y = world.sizeY + 16;
    if (m.vy > 0) m.vy = 0;
  }
};

/** A low ledge in the way of a grounded body: step up onto it (beds). Returns true when it stepped. */
const tryStep = (world: VoxelWorld, m: BodyMotion, height: number, axis: 0 | 2, delta: number): boolean => {
  if (!m.grounded) return false;
  const up = sweep(world, m, height, 1, MOVEMENT.stepHeight);
  if (up < MOVEMENT.stepHeight - EPS) return false;
  const saveY = m.y;
  m.y += up;
  const along = sweep(world, m, height, axis, delta);
  if (Math.abs(along - delta) > EPS) {
    m.y = saveY;
    return false;
  }
  if (axis === 0) m.x += along;
  else m.z += along;
  const down = sweep(world, m, height, 1, -up);
  m.y += down;
  return true;
};
