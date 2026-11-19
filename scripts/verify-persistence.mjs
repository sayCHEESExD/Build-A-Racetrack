/**
 * PERSISTENCE: a player's cash, inventory, cars (with their upgrades and
 * condition), Base Upgrade, career and their racetrack survive leaving, rejoining, a server restart, signing in, and
 * a second tab.
 *
 * Spawns its OWN server (built: `npm run build:server`) on PERSIST_PORT
 * (default 3683) with a fresh JSON store in a temp directory and the Bloxity
 * token stub preloaded (`scripts/persistence/stub-bloxity.mjs`), so nothing
 * here touches a real database or Bloxity.
 *
 *   1. a guest buys track, a crate (a car) and a car upgrade, builds track,
 *      leaves, rejoins: all of it is back, the racetrack on their plot
 *   2. the server restarts: all of it is still back
 *   3. the guest signs in for the first time: it all becomes the account's,
 *      and a different browser signed in to the same account finds it
 *   4. the same account in two tabs: the older session is replaced and its
 *      saves land before the newer one reads (nothing lost)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'colyseus.js';
import { MessageType, ROOM_NAME, traceChain, unpackPieces } from '../shared/dist/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER_ENTRY = path.join(ROOT, 'server', 'dist', 'index.js');
const STUB = new URL('./persistence/stub-bloxity.mjs', import.meta.url).href;
const PORT = Number(process.env.PERSIST_PORT ?? 3683);
const ENDPOINT = `ws://localhost:${PORT}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
const check = (ok, message) => {
  if (ok) console.log(`  ok    ${message}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
};

const dataDir = mkdtempSync(path.join(tmpdir(), 'racetrack-persist-'));

const startServer = async () => {
  const proc = spawn(process.execPath, ['--import', STUB, SERVER_ENTRY, '--port', String(PORT), '--dev-cheats'], {
    cwd: ROOT,
    env: { ...process.env, RACETRACK_DATA_DIR: dataDir, MONGODB_URI: '', NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`);
      if (r.ok) return proc;
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  console.log(log);
  throw new Error('server did not start');
};

const stopServer = (proc) =>
  new Promise((resolve) => {
    proc.once('exit', resolve);
    proc.kill('SIGTERM');
  });

const join = async (playerId, token = null) => {
  const client = new Client(ENDPOINT);
  const room = await client.joinOrCreate(ROOM_NAME, { playerId, token, identity: { displayName: playerId.slice(2, 14), avatarUrl: '' } });
  const got = { tracks: new Map(), profile: null, closed: null };
  for (const type of Object.values(MessageType)) room.onMessage(type, () => {});
  room.onMessage(MessageType.Track, (m) => got.tracks.set(m.plot, unpackPieces(m.p)));
  room.onMessage(MessageType.Profile, (m) => (got.profile = m));
  room.onLeave((code) => (got.closed = code));
  const me = () => room.state.players.get(room.sessionId);
  const mine = () => got.tracks.get(me().plot) ?? [];
  const append = async (k) => {
    const end = traceChain(mine()).end;
    if (end) room.send(MessageType.Place, { k });
    await sleep(150);
  };
  await sleep(500);
  return { room, got, me, mine, append };
};


console.log(`persistence (own server on :${PORT}, store ${dataDir})`);
let server = await startServer();
try {
  // ---- 1. leave and rejoin
  const guest = `p_persist_${Date.now().toString(36)}`;
  let p = await join(guest);
  p.room.send('dev', { cash: 200000, tier: 2 });
  await sleep(200);
  p.room.send(MessageType.Buy, { kind: 'track', key: 'boost', count: 1 });
  p.room.send(MessageType.Buy, { kind: 'track', key: 'bumpy', count: 5 });
  p.room.send(MessageType.Buy, { kind: 'crate', key: 'starter' });
  await sleep(400);
  const won = Object.keys(p.got.profile?.cars ?? {}).find((k) => k !== 'kart');
  if (won) p.room.send(MessageType.Equip, { key: won });
  await sleep(200);
  p.room.send(MessageType.Buy, { kind: 'carup', key: 'engine', car: won });
  await sleep(300);
  for (const k of ['straight', 'boost', 'straight', 'bumpy', 'straight']) await p.append(k);
  await sleep(300);
  const inv = () => JSON.stringify(Object.entries(p.got.profile?.inventory ?? {}).filter(([, n]) => n > 0).sort());
  const before = { cash: Math.floor(p.me().cash), car: p.me().car, engine: p.got.profile?.cars[won]?.lv.engine, tier: p.me().tier, placed: p.me().careerPlaced, pieces: p.mine().length, inv: inv() };
  check(before.placed === 5 && before.pieces === 6 && before.car === won && before.engine === 1 && before.tier === 2, `built and bought: ${before.placed} pieces placed, driving ${before.car} with Engine ${before.engine}, Base ${before.tier}`);
  await p.room.leave(true);
  await sleep(700);

  p = await join(guest);
  check(Math.floor(p.me().cash) === before.cash && p.me().car === before.car && p.got.profile?.cars[before.car]?.lv.engine === before.engine && p.me().tier === before.tier, 'rejoining: cash, the car, its upgrade and the Base Upgrade are back');
  check(inv() === before.inv, 'rejoining: the inventory is back');
  check(p.mine().length === before.pieces && p.mine()[2]?.k === 'boost', 'rejoining: the racetrack came back on the plot');
  await p.room.leave(true);
  await sleep(700);

  // ---- 2. server restart
  await stopServer(server);
  server = await startServer();
  p = await join(guest);
  check(Math.floor(p.me().cash) === before.cash && p.me().careerPlaced === before.placed && p.mine().length === before.pieces, 'after a server restart, cash, career and the racetrack are back');

  // ---- 3. first sign-in carries everything into the account
  const account = `persist${Date.now().toString(36)}`;
  p.room.send(MessageType.SetAuth, { token: `valid:${account}` });
  await sleep(1200);
  await p.room.leave(true);
  await sleep(700);
  const q = await join(`p_elsewhere_${Date.now().toString(36)}`, `valid:${account}`);
  check(Math.floor(q.me().cash) === before.cash && q.me().car === before.car, 'signing in carries cash and cars to the account; another browser signed in finds them');
  check(q.mine().length === before.pieces, 'and the account owns the racetrack');

  // ---- rewarded ad: 2x Money, granted only for a token Boxity confirms, once
  const boost = () => q.got.profile?.boostUntil ?? 0;
  const b0 = boost();
  q.room.send(MessageType.AdReward, { placement: 'money-boost', token: 'forged' });
  await sleep(500);
  check(boost() === b0 && q.me().boost === 1, 'a forged ad token grants nothing');
  q.room.send(MessageType.AdReward, { placement: 'money-boost', token: 'ad-ok:1' });
  await sleep(500);
  const b1 = boost();
  check(b1 > Date.now() + 500_000 && q.me().boost === 2, 'a verified ad token grants 10 minutes of 2x Money');
  q.room.send(MessageType.AdReward, { placement: 'money-boost', token: 'ad-ok:1' });
  await sleep(500);
  check(boost() === b1, 'the same token never pays twice');

  // ---- 4. the same account in a second tab
  await q.append('straight');
  await sleep(300);
  const placedNow = q.me().careerPlaced;
  const r = await join(`p_tab2_${Date.now().toString(36)}`, `valid:${account}`);
  await sleep(600);
  check(q.got.closed === 4201, 'a second tab on the same account replaces the first');
  check(r.me().careerPlaced === placedNow && r.mine().length === before.pieces + 1, "the first tab's saves landed before the second read them");
  check(r.room.state.players.size === 1, 'only one session plays the profile');
  await r.room.leave(true);
  await sleep(600);
} catch (error) {
  failures += 1;
  console.log(`  FAIL  ${error?.stack ?? error}`);
} finally {
  await stopServer(server);
  rmSync(dataDir, { recursive: true, force: true });
}

console.log('');
console.log(failures === 0 ? 'persistence OK' : `${failures} problem(s) found`);
process.exit(failures === 0 ? 0 : 1);
