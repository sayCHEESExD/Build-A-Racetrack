import type { ShapeKey } from '../config/racetrack.js';
import { checkPlace, traceChain, withStart, type Piece } from './track.js';

/**
 * THE END-GAME TEST TRACK: a full max-tier racetrack that uses every piece
 * there is (all 24 shapes), laid only onto the glowing end like a player
 * would, and drivable start to Finish by fast cars (`verify-track` drives it
 * with a player-like bot at every top speed in the game). The dev command
 * `dev({ endgame: true })` lays it on your plot.
 *
 * Up the road side past the gate (bumps, Rainbow, Golden), a banked curve
 * onto the far row (Boost), down the far side (Ramp Jump, Loop, Corkscrew),
 * S-bends along the bottom, a hairpin snake, up the Mega Ramp, an Uphill
 * Turn into the Cliff Drop and down the stairs, a banked curve home and the
 * Finish Line.
 */
const run = (k: ShapeKey, n: number): ShapeKey[] => Array.from({ length: n }, () => k);

export const ENDGAME_TRACK: readonly ShapeKey[] = [
  'straight', 'bumpy', 'bump', 'straight', 'rainbow', 'golden', 'straight', 'wide_l',
  'straight', 'boost', ...run('straight', 7), 'turn_l',
  'straight', 'jump', 'straight', 'loop', 'straight', 'corkscrew', ...run('straight', 9), 'turn_l',
  'swerve_l', 'swerve_r', ...run('straight', 5), 'turn_l',
  ...run('straight', 8), 'uturn_l', ...run('straight', 7), 'uturn_r',
  'climb', 'straight', 'mega', 'straight', 'upturn_l', 'cliff', 'drop', 'drop', 'drop', 'turn_r',
  'straight', 'straight', 'straight', 'wide_r', 'upturn_r', 'drop', 'finish',
];

/**
 * Lay shapes one after another onto the glowing end from a bare Start Gate,
 * through `checkPlace` at a base tier. Returns the track (gate first) and
 * the first refusal, if any (the track then stops before it).
 */
export const layTrack = (shapes: readonly ShapeKey[], tier: number): { pieces: Piece[]; refused: string | null } => {
  const pieces = withStart([]);
  for (const k of shapes) {
    const end = traceChain(pieces).end;
    if (!end) return { pieces, refused: `${k}: closed` };
    const p: Piece = { k, x: end.x, z: end.z, y: end.y, r: end.r };
    const why = checkPlace(pieces, [], p, tier);
    if (why) return { pieces, refused: `${k} at (${p.x}, ${p.z}): ${why}` };
    pieces.push(p);
  }
  return { pieces, refused: null };
};
