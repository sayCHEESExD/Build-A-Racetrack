/**
 * OFFLINE EARNINGS, end to end, with its OWN server (fresh JSON store in a temp
 * directory, port 3684): a player builds a little track and leaves; the server
 * stops; their save's leave time is moved an hour back; the server starts again
 * and on rejoining the player is paid OFFLINE_SHARE of an hour of their track's
 * income, told so (the Offline message), and finds their piles full.
 *
 * Usage: npm run build:server && node scripts/verify-offline.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { Client } from 'colyseus.js';
import { MessageType, OFFLINE_SHARE, ROOM_NAME } from '../shared/dist/index.js';

const PORT = 3684;
const ENDPOINT = `ws://localhost:${PORT}`;
const dataDir = mkdtempSync(joinPath(tmpdir(), 'racetrack-offline-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, m) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${m}`);
  if (!ok) failures += 1;
};

const startServer = async () => {
  const child = spawn(process.execPath, ['server/dist/index.js', '--port', String(PORT), '--dev-cheats'], {
    env: { ...process.env, RACETRACK_DATA_DIR: dataDir, MONGODB_URI: '', PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`);
      if (r.ok) return child;
    } catch {
      /* not yet */
    }
    await sleep(250);
  }
  throw new Error('server did not start');
};
const stopServer = async (child) => {
  child.kill('SIGINT');
  await new Promise((r) => child.once('exit', r));
};

const id = `p_offline${Date.now().toString(36)}`;
const join = async () => {
  const room = await new Client(ENDPOINT).joinOrCreate(ROOM_NAME, { playerId: id });
  const bot = { room, offline: null, coins: null };
  room.onMessage(MessageType.Offline, (m) => (bot.offline = m));
  room.onMessage(MessageType.Coins, (m) => (bot.coins = m));
  for (const t of Object.values(MessageType)) if (t !== MessageType.Offline && t !== MessageType.Coins) room.onMessage(t, () => undefined);
  await sleep(700);
  bot.me = () => room.state.players.get(room.sessionId);
  return bot;
};

console.log(`verify-offline (own server on ${PORT}, store ${dataDir})`);
let server = await startServer();
const a = await join();
a.room.send(MessageType.Place, { k: 'straight' });
await sleep(200);
a.room.send(MessageType.Place, { k: 'straight' });
await sleep(500);
const rate = a.me().rate;
check(rate > 0, `the track earns $${rate}/s`);
await a.room.leave();
await sleep(800);
await stopServer(server);

const file = joinPath(dataDir, 'players.json');
const data = JSON.parse(readFileSync(file, 'utf8'));
check(Boolean(data[id]), 'the save was written on leaving');
data[id].leftAt = Date.now() - 3600 * 1000;
writeFileSync(file, JSON.stringify(data));

server = await startServer();
const b = await join();
await sleep(1500);
const expected = rate * 3600 * OFFLINE_SHARE;
check(b.offline !== null, 'the Offline message arrives on rejoining');
check(b.offline && Math.abs(b.offline.amount - expected) < rate * 120, `paid ${b.offline?.amount} for ${b.offline?.seconds}s away (expected about ${Math.round(expected)})`);
check(b.me().cash >= expected, `the cash was credited ($${Math.floor(b.me().cash)})`);
const piles = b.coins?.plots.find((p) => p.plot === b.me().plot)?.f ?? [];
check(piles.slice(1).every((f) => f > 30), `the piles filled while away (${piles.join(',')})`);
await b.room.leave();
await sleep(300);
await stopServer(server);
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
