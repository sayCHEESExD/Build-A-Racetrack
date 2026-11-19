/**
 * THE TRACK RULES AND GEOMETRY, offline (shared/dist):
 *
 *   - every shape, in every heading, on both plot orientations: its road ends
 *     EXACTLY where the next piece's road begins (position, height and
 *     direction) - so snapping never leaves a gap, a step or a kink
 *   - a circuit closes back into the Start Gate, and the car can lap it
 *   - placement is only ever onto the glowing end; overlaps, the pit lane,
 *     the plot edge, the height limit and the length limit are refused
 *   - the car drives every shape at speed without falling through it
 */
import assert from 'node:assert/strict';
import { CARS, CAR_UPGRADES, DRIVE, ENDGAME_TRACK, layTrack, CarSim, PLOTS, openRows, adoptLayout, SHAPE_KEYS, TrackPath, baseTier, checkPlace, pieceNext, piecePoint, traceChain, withStart } from '../shared/dist/index.js';

let failures = 0;
const check = (ok, m) => {
  if (!ok) {
    failures += 1;
    console.log(`  FAIL  ${m}`);
  }
};

// ---- 1. joins: the end of every shape is the start of whatever follows
const frames = [PLOTS[0].frame, PLOTS[3].frame];
const a = { x: 0, y: 0, z: 0 };
const b = { x: 0, y: 0, z: 0 };
const up = { x: 0, y: 1, z: 0 };
let joins = 0;
for (const f of frames) {
  for (const k of SHAPE_KEYS) {
    for (let r = 0; r < 4; r += 1) {
      const p = { k, x: 5, z: 8, y: 2, r };
      const next = { ...pieceNext(p), k: 'straight' };
      piecePoint(f, p, 1, a, up);
      piecePoint(f, next, 0, b, up);
      const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      check(gap < 1e-4, `${k} r${r} rot${f.rot}: its end is ${gap.toFixed(4)} from the next piece's start`);
      // Direction: the last step of this piece and the first of the next point the same way.
      const a2 = { x: 0, y: 0, z: 0 };
      const b2 = { x: 0, y: 0, z: 0 };
      piecePoint(f, p, 0.995, a2, up);
      piecePoint(f, next, 0.005, b2, up);
      const d1 = [a.x - a2.x, a.z - a2.z];
      const d2 = [b2.x - b.x, b2.z - b.z];
      const l1 = Math.hypot(...d1) || 1;
      const l2 = Math.hypot(...d2) || 1;
      const dot = (d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2);
      check(dot > 0.98, `${k} r${r} rot${f.rot}: the road keeps its direction into the next piece (${dot.toFixed(3)})`);
      joins += 1;
    }
  }
}
console.log(`  ok    ${joins} joins checked (every shape x heading x plot orientation)`);

// ---- 2. a circuit, built only onto the glowing end
let pieces = withStart([]);
const add = (k, tier = 5) => {
  const end = traceChain(pieces).end;
  if (!end) return 'closed';
  const p = { k, x: end.x, z: end.z, y: end.y, r: end.r };
  const why = checkPlace(pieces, [], p, tier);
  if (why) return why;
  pieces.push(p);
  return null;
};
// Up beside the pit, across, down to row 0, back and into the gate from behind: a rectangle.
for (let i = 0; i < 8; i += 1) add('straight');
add('turn_l');
for (let i = 0; i < 4; i += 1) add('straight');
add('turn_l');
for (let i = 0; i < 10; i += 1) add('straight');
add('turn_l');
for (let i = 0; i < 4; i += 1) add('straight');
add('turn_l');
const chain = traceChain(pieces);
check(chain.closed, `a rectangle closes into the Start Gate (end ${JSON.stringify(chain.end)})`);
check(chain.order.length === pieces.length, 'every piece is on the circuit');
check(add('straight') === 'closed', 'nothing more goes onto a closed circuit');
if (chain.closed) {
  const path = new TrackPath(PLOTS[0].frame, pieces, chain.order);
  const sim = new CarSim(path, true, { speed: 18, accel: 14, handling: 1 });
  let laps = 0;
  let crashed = false;
  for (let t = 0; t < 60 * 60; t += 1) {
    sim.step(1 / 60, { throttle: 1, steer: 0 });
    for (const e of sim.events.splice(0)) {
      if (e.t === 'lap') laps += 1;
      if (e.t === 'crash') crashed = true;
    }
    if (laps >= 2 || crashed) break;
  }
  check(laps >= 2 && !crashed, `the kart laps the circuit (laps ${laps}, crashed ${crashed})`);
  console.log(`  ok    circuit of ${pieces.length} pieces, ${path.length.toFixed(0)} studs`);
}

// ---- 3. refusals
pieces = withStart([]);
const end0 = traceChain(pieces).end;
check(checkPlace(pieces, [], { k: 'straight', x: end0.x + 1, z: end0.z, y: 0, r: end0.r }, 0) === 'end', 'a piece away from the glowing end is refused');
check(checkPlace(pieces, [], { k: 'climb', x: end0.x, z: end0.z, y: 0, r: end0.r }, 0) === null, 'a climb at the end is fine');
// Into the pit lane: right toward the road, right again, then down into it.
add('turn_r', 0);
add('turn_r', 0);
check(add('straight', 0) === 'pit', 'the pit lane stays clear');
pieces = withStart([]);
let edge = null;
for (let i = 0; i < 12 && !edge; i += 1) edge = add('straight', 0);
check(edge === 'outside' && traceChain(pieces).end.z === openRows(0)[1], `the plot edge (tier 0's open rows) stops a track (${edge})`);
check(openRows(0)[0] > 0 && openRows(0)[1] < openRows(5)[1] && openRows(5)[0] === 0, 'base tiers open rows either side of the gate');
// A track saved before the gate moved beside the arch still leaves the gate the same way.
{
  const old = [
    { k: 'straight', x: 2, z: 3, y: 0, r: 1 },
    { k: 'turn_r', x: 2, z: 4, y: 0, r: 1 },
    { k: 'straight', x: 1, z: 4, y: 0, r: 2 },
  ];
  const moved = adoptLayout(old).pieces;
  check(traceChain(withStart(moved)).order.length === 4, 'an old-layout track is moved onto the new gate');
  check(adoptLayout(moved).pieces.every((p, i) => p.x === moved[i].x && p.z === moved[i].z), 'a new-layout track is left as it is');
}
// Height: climb past tier 0's limit.
pieces = withStart([]);
let why = null;
for (let i = 0; i < 6 && !why; i += 1) why = add('climb', 0);
check(why === 'height', `climbing past the base's height limit is refused (${why})`);
// Length limit.
pieces = withStart([]);
why = null;
for (let i = 0; i < 40 && !why; i += 1) {
  why = add('straight', 0);
  if (why === 'outside') {
    pieces.pop();
    why = add('turn_l', 0) ?? null;
  }
}
check(why !== null, `a long track meets a limit at tier 0 (${why}, ${pieces.length - 1}/${baseTier(0).length})`);
check(pieces.length - 1 <= baseTier(0).length, 'never more pieces than the base allows');

// ---- 4. the car drives every shape without falling through it
for (const k of SHAPE_KEYS) {
  if (k === 'start') continue;
  // Up the road side, turn into the plot, a run-up, then the shape (raised first if it drops).
  pieces = withStart([]);
  for (let i = 0; i < 6; i += 1) add('straight');
  add('turn_l');
  for (let i = 0; i < 4; i += 1) add('straight');
  if (k === 'drop' || k === 'cliff') {
    add('climb');
    add('climb');
  }
  add('straight');
  if (add(k)) {
    check(false, `${k} could not be placed for the drive test`);
    continue;
  }
  for (let i = 0; i < 4; i += 1) if (add('straight')) break;
  add('finish');
  const ch = traceChain(pieces);
  const path = new TrackPath(PLOTS[0].frame, pieces, ch.order);
  const sim = new CarSim(path, ch.closed, { speed: 22, accel: 18, handling: 1.1 });
  let result = 'timeout';
  let furthest = 0;
  for (let t = 0; t < 60 * 30; t += 1) {
    sim.step(1 / 60, { throttle: 1, steer: 0 });
    if (sim.mode === 'road') furthest = Math.max(furthest, sim.s);
    for (const e of sim.events.splice(0)) {
      // Off the very end of a track with no room for a Finish Line is the end too.
      if (e.t === 'crash') result = furthest > path.length - 1 ? 'finish' : `crash at ${furthest.toFixed(1)}/${path.length.toFixed(1)}`;
      if (e.t === 'finish') result = 'finish';
    }
    if (result !== 'timeout') break;
    if (sim.pos.y < -2) {
      result = 'fell through';
      break;
    }
  }
  check(result === 'finish', `the car drives over ${k} to the finish (${result})`);
}

// ---- 5. the end-game test track: every shape, laid at max tier, driven to the Finish by fast cars
{
  const { pieces: eg, refused } = layTrack(ENDGAME_TRACK, 5);
  check(refused === null, `the end-game track lays onto the glowing end at max tier (${refused})`);
  const used = new Set(eg.map((p) => p.k));
  const missing = SHAPE_KEYS.filter((k) => !used.has(k));
  check(missing.length === 0, `the end-game track uses every shape (missing: ${missing.join(', ')})`);
  check(eg.length - 1 <= baseTier(5).length && eg[eg.length - 1].k === 'finish', 'it fits the max length and ends on a Finish Line');
  const ch = traceChain(eg);
  const path = new TrackPath(PLOTS[3].frame, eg, ch.order);
  // A player-ish driver: holds the middle of the road, brakes for corners it cannot take flat out.
  const A = { x: 0, y: 0, z: 0 };
  const B = { x: 0, y: 0, z: 0 };
  const O = { x: 0, y: 0, z: 0 };
  const bot = (sim, handling) => {
    if (sim.mode !== 'road') return { throttle: 1, steer: 0 };
    let k = 0;
    for (let ahead = 0; ahead < Math.max(6, sim.v * 0.9); ahead += 0.5) {
      const s0 = Math.min(path.length - 0.5, sim.s + ahead);
      path.at(s0, O, A);
      path.at(s0 + 0.4, O, B);
      k = Math.max(k, Math.hypot(B.x - A.x, B.z - A.z) / 0.4);
    }
    const vmax = k > 1e-3 ? Math.sqrt((DRIVE.grip * handling * 0.9) / k) : Infinity;
    return { throttle: sim.v > vmax ? -1 : 1, steer: Math.max(-1, Math.min(1, -(sim.d * 1.2 + sim.vd * 0.3))) };
  };
  const engine = CAR_UPGRADES.find((u) => u.key === 'engine').max;
  const tops = [Math.min(...CARS.map((c) => c.speed)), 27, Math.max(...CARS.map((c) => c.speed)) * (1 + engine * 0.05)];
  for (const speed of tops) {
    const sim = new CarSim(path, false, { speed, accel: speed * 0.85, handling: 1.2 });
    let result = 'timeout';
    for (let t = 0; t < 60 * 120 && result === 'timeout'; t += 1) {
      sim.step(1 / 60, bot(sim, 1.2));
      for (const e of sim.events.splice(0)) {
        if (e.t === 'crash') result = `crash at ${sim.s.toFixed(1)}/${path.length.toFixed(1)}`;
        if (e.t === 'finish') result = 'finish';
      }
    }
    check(result === 'finish', `a car with top speed ${speed.toFixed(0)} drives the end-game track to the Finish (${result})`);
  }
  console.log(`  ok    end-game track: ${eg.length - 1} pieces, ${used.size - 1} kinds, ${path.length.toFixed(0)} studs`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall track checks passed');
process.exit(failures ? 1 : 0);
