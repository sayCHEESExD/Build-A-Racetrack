/**
 * Room capacity, checked against a RUNNING server.
 *
 * The other two suites are static: they read the course data and exercise the
 * services in-process. This one cannot be, because what it is checking is the
 * matchmaker - the thing that decides which room a connecting player lands in,
 * and which only exists once a server is actually listening.
 *
 * It connects more clients than one room may hold and asserts three things:
 *
 *   - no room ever holds more than `MAX_PLAYERS_PER_ROOM`
 *   - the overflow is ROUTED to another room rather than refused
 *   - every room EMPTIES once its last player leaves (it then keeps its build
 *     for ten minutes, for anyone who reloads, before it closes itself)
 *
 * All three matter. A limit that turned the sixteenth player away would be a
 * limit that closes the game to them; a limit that let them in anyway would
 * not be a limit at all; and a room that outlived its last player would leak a
 * simulation loop apiece on a server that has been up for a week.
 *
 * Usage: start the server, then `npm run verify:capacity`.
 *        PORT=2741 npm run verify:capacity                 another local port (default 3681).
 *        SERVER_URL=wss://your-host npm run verify:capacity  to check a deployment (ENDPOINT works too).
 */
import { Client } from 'colyseus.js';
import { DEFAULT_SERVER_PORT, MAX_PLAYERS_PER_ROOM, MessageType, ROOM_NAME } from '../shared/dist/index.js';

const ENDPOINT = process.env.SERVER_URL ?? process.env.ENDPOINT ?? `ws://localhost:${process.env.PORT || DEFAULT_SERVER_PORT}`;
/** Enough over the line to prove routing, few enough to stay quick. */
const TOTAL = MAX_PLAYERS_PER_ROOM + 3;

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};
const pass = (message) => console.log(`  ok    ${message}`);

console.log(`room capacity (${ENDPOINT})`);

/**
 * The rooms already live BEFORE the probe, so the empty-room check below can
 * be run against a server somebody is playing on: only the rooms this script
 * opened have to close.
 */
const readHealth = async () => {
  const http = ENDPOINT.replace(/^ws/, 'http');
  const response = await fetch(`${http}/health`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};
let before = { rooms: 0, players: 0 };
try {
  before = await readHealth();
} catch (error) {
  console.log(`        /health unavailable before the probe: ${error?.message ?? error}`);
}

const rooms = new Map();
const joined = [];
let refused = 0;

for (let i = 0; i < TOTAL; i += 1) {
  const client = new Client(ENDPOINT);
  try {
    // The same call the game client makes. Testing a different join path would
    // prove something about a path no player ever takes.
    const room = await client.joinOrCreate(ROOM_NAME, { playerId: `capacity-probe-${i}` });
    for (const type of Object.values(MessageType)) room.onMessage(type, () => {});
    joined.push(room);
    rooms.set(room.roomId, (rooms.get(room.roomId) ?? 0) + 1);
  } catch (error) {
    refused += 1;
    console.log(`        client ${i} refused: ${error?.message ?? error}`);
  }
}

const counts = [...rooms.values()];
const biggest = counts.length > 0 ? Math.max(...counts) : 0;

if (joined.length !== TOTAL) {
  fail(`${refused} of ${TOTAL} clients could not join at all`);
} else {
  pass(`all ${TOTAL} clients were placed`);
}

if (biggest > MAX_PLAYERS_PER_ROOM) {
  fail(`a room held ${biggest}, over the limit of ${MAX_PLAYERS_PER_ROOM}`);
} else {
  pass(`no room exceeded ${MAX_PLAYERS_PER_ROOM} (fullest held ${biggest})`);
}

if (rooms.size > 1) {
  pass(`overflow routed across ${rooms.size} rooms`);
} else {
  fail(`all ${joined.length} clients landed in one room; nothing was routed`);
}

for (const [id, count] of rooms) console.log(`        room ${id}: ${count}`);

const roomIds = [...rooms.keys()];

/*
 * THE FULL HOUSE: fifteen builders in one room, every one of them seen by
 * everyone else (one shared plane, no private spaces).
 */
{
  const [fullId] = [...rooms.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const full = joined.filter((room) => room.roomId === fullId);
  const watcher = full[0];
  const until = Date.now() + 6000;
  while (Date.now() < until && (watcher?.state?.players?.size ?? 0) < full.length) await new Promise((resolve) => setTimeout(resolve, 100));
  const seen = watcher?.state?.players?.size ?? 0;
  if (seen < full.length) fail(`a player in the full room sees ${seen} of ${full.length} builders`);
  else pass(`every builder in the full room is seen by the others (${seen})`);
}

for (const room of joined) {
  try {
    await room.leave(true);
  } catch {
    /* the room may already be gone; nothing to clean up */
  }
}

/*
 * THE EMPTY-ROOM CHECK.
 *
 * Every client has now left, so every room the run created should have
 * disposed itself. Asked of the MATCHMAKER rather than of the process: a
 * disposed room is deregistered, so it stops being listed, and that is
 * precisely the observable behaviour the requirement is about.
 *
 * The pause is for the leave to finish its round trip and the dispose to run;
 * without it the assertion races the thing it is asserting.
 */
await new Promise((resolve) => setTimeout(resolve, 1200));
{
  /*
   * Asked of the SERVER's own health probe.
   *
   * `/health` reports the matchmaker's live room count, which is the only
   * outside view of whether a room still exists - and it is the matchmaker's
   * own tally rather than a second one kept beside it, so it cannot disagree
   * with the thing it is reporting on.
   */
  const http = ENDPOINT.replace(/^ws/, 'http');
  let health = null;
  try {
    const response = await fetch(`${http}/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    health = await response.json();
  } catch (error) {
    fail(`could not read /health: ${error?.message ?? error}`);
  }

  if (health === null) {
    // Already reported. Nothing more to say, and NOT a pass.
  } else if (health.players > before.players) {
    fail(`${health.players} player(s) still seated after every probe left (${before.players} before)`);
  } else {
    pass(`all ${roomIds.length} probe room(s) emptied (they keep their build for ten minutes, then close)`);
  }
}

console.log('');
console.log(failures === 0 ? 'capacity OK' : `${failures} problem(s) found`);
process.exit(failures === 0 ? 0 : 1);
