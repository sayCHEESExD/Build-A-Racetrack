/**
 * MOVEMENT FEEL, measured on the shared body simulation (what the server,
 * the client's prediction and the bots all run): on flat ground, every
 * direction reaches full speed quickly, letting go stops almost at once,
 * reversing is immediate, the jump clears a block and does not float, and
 * letting go mid-air stops your own drift (knockback still carries).
 *   node scripts/verify-movement.mjs
 */
import { GROUND, MOVEMENT, VoxelWorld, createMotion, createSimEvents, createSimParams, resetMotion, stepBody } from '../shared/dist/index.js';

const world = new VoxelWorld({ minX: -40, minZ: -40, sizeX: 80, sizeY: 40, sizeZ: 80 });
for (let x = -40; x < 40; x += 1) for (let z = -40; z < 40; z += 1) world.set(x, 10, z, GROUND);
const dt = 1 / 60;
const params = createSimParams();
const events = createSimEvents();
const m = createMotion();
const input = (moveX, moveZ, extra = {}) => ({ moveX, moveZ, cameraYaw: 0, jump: false, sprint: false, crouch: false, face: true, ...extra });
const run = (seconds, inp, each) => {
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    stepBody(m, inp, params, dt, world, events);
    each?.(i);
  }
};
const reset = () => resetMotion(m, 0.5, 11, 0.5, 0);
const speed = () => Math.hypot(m.vx, m.vz);

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
};

// Every direction, the same top speed, reached fast.
for (const [name, mx, mz, dirX, dirZ] of [
  ['forward', 0, 1, 0, 1],
  ['backward', 0, -1, 0, -1],
  ['strafe left', -1, 0, 1, 0],
  ['strafe right', 1, 0, -1, 0],
]) {
  reset();
  let reach = -1;
  run(0.5, input(mx, mz), (i) => {
    if (reach < 0 && speed() >= MOVEMENT.walkSpeed * 0.95) reach = (i + 1) * dt;
  });
  const along = (m.vx * dirX + m.vz * dirZ) / speed();
  check(reach > 0 && reach <= 0.08 && along > 0.99, `${name}: full speed (${speed().toFixed(2)}) in ${(reach * 1000).toFixed(0)} ms, moving the right way`);
}

// Let go: stops within a short slide.
reset();
run(0.5, input(0, 1, { sprint: true }));
const z0 = m.z;
let stopped = -1;
run(0.5, input(0, 0), (i) => {
  if (stopped < 0 && speed() < 0.01) stopped = (i + 1) * dt;
});
check(stopped > 0 && stopped <= 0.1 && m.z - z0 < 0.35, `release from a sprint: stops in ${(stopped * 1000).toFixed(0)} ms, slides ${(m.z - z0).toFixed(2)} blocks`);

// Reverse: full speed the other way, quickly.
reset();
run(0.5, input(0, 1));
let flipped = -1;
run(0.5, input(0, -1), (i) => {
  if (flipped < 0 && m.vz <= -MOVEMENT.walkSpeed * 0.95) flipped = (i + 1) * dt;
});
check(flipped > 0 && flipped <= 0.1, `forward -> backward at full speed in ${(flipped * 1000).toFixed(0)} ms`);

// Jump: clears a block, lands in well under 0.6 s.
reset();
let top = m.y;
let air = 0;
let landed = false;
run(0.05, input(0, 0));
const ground = m.y;
for (let i = 0; i < 120 && !landed; i += 1) {
  stepBody(m, input(0, 0, { jump: i === 0 }), params, dt, world, events);
  top = Math.max(top, m.y);
  air += dt;
  if (i > 0 && events.landed) landed = true;
}
check(top - ground >= 1.2 && top - ground <= 1.4 && air <= 0.6, `jump: ${(top - ground).toFixed(2)} blocks high, ${(air * 1000).toFixed(0)} ms in the air`);

// Mid-air release: your own drift stops; a knockback-sized shove still carries.
reset();
run(0.3, input(0, 1, { sprint: true }));
stepBody(m, input(0, 1, { sprint: true, jump: true }), params, dt, world, events);
run(0.12, input(0, 1, { sprint: true }));
const airZ = m.z;
run(0.3, input(0, 0));
check(m.z - airZ < 0.9 && speed() < 1.5, `release mid-jump: drifts ${(m.z - airZ).toFixed(2)} blocks, speed ${speed().toFixed(2)}`);
reset();
m.vz = 9;
m.vy = 5.4;
m.grounded = false;
const kz = m.z;
run(0.4, input(0, 0));
check(m.z - kz > 2.5, `a knockback shove still flies ${(m.z - kz).toFixed(2)} blocks`);

console.log(failures === 0 ? '\nmovement OK' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
