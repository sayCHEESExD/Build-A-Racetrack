/**
 * World-space constants shared by the renderer and the authoritative server.
 *
 * ONE WORLD UNIT IS ONE BLOCK. Everything voxel is integer-aligned; bodies
 * and monsters are measured in blocks.
 */

/** The supplied player.fbx is authored 320 units tall; this makes it 3.2. */
export const FBX_TO_WORLD_SCALE = 0.01;

/** The loaded body's height before the avatar scale (320 * FBX_TO_WORLD_SCALE). */
export const PLAYER_HEIGHT = 3.2;

/** Bodies are drawn this tall, in blocks: a Roblox character next to the reference's chunky building blocks. */
export const BODY_HEIGHT = 1.8;

/** The avatar scale that turns the 3.2-unit rig into a BODY_HEIGHT body. */
export const AVATAR_SCALE = BODY_HEIGHT / PLAYER_HEIGHT;

/** Collision box: half the width, and the heights standing and sneaking. */
export const BODY_HALF_WIDTH = 0.3;
export const BODY_COLLIDE_HEIGHT = 1.75;
export const SNEAK_COLLIDE_HEIGHT = 1.5;

/** Eyes, for the first-person camera and every reach check. */
export const EYE_HEIGHT = 1.58;
export const CROUCH_EYE_HEIGHT = 1.32;
/** The camera config's names for the same (third person pivots around the shoulders). */
export const CROUCH_HEIGHT = 1.5;

/** How large the head is drawn, Roblox-style. Applied to the neck bone by `PlayerRig`. */
export const HEAD_SCALE = 1.12;

export const neckScale = (portalHeadScale = 1): number => {
  const chosen = Number.isFinite(portalHeadScale) && portalHeadScale > 0 ? portalHeadScale : 1;
  return HEAD_SCALE * chosen;
};

/**
 * THE MAP (see world/map.ts): the raceway. A road runs north-south down the
 * middle, three plots either side, shops by the tunnel in the north, the
 * Showcase beyond it. 220 x 24 x 540 blocks.
 */
export const WORLD_BOUNDS = { minX: -110, minZ: -330, sizeX: 220, sizeY: 24, sizeZ: 550 } as const;
/** The baseplate is one layer at y 0; feet stand at 1. */
export const GROUND_Y = 1;
/** Fallen below this: back to your station. */
export const VOID_Y = -20;
/** Where everyone arrives before they have a plot: the spawn plaza, looking north up the road. */
export const SPAWN_POINT = { x: 0, y: GROUND_Y, z: 184, yaw: Math.PI } as const;
