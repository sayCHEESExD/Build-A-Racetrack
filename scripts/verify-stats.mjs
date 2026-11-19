/**
 * Bloxity stat reporting, exercised against a local stub of the stats route.
 *
 * Proves the checklist: nothing is sent without the environment; guests are
 * skipped and only `legion_` identities go out; a `#m` mode suffix is
 * stripped; values that are not finite, negative or over their ceiling are
 * omitted (never clamped); players are batched at 200; the definitions and the
 * bearer token ride every call; a failing endpoint never throws.
 *
 * Run after `npm run build:server`.
 */
import { createServer } from 'node:http';

let failures = 0;
const check = (condition, message) => {
  if (condition) console.log(`  ok    ${message}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
};

const received = [];
let answer = 200;
const stub = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    received.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body || '{}') });
    res.writeHead(answer, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: answer === 200, accepted: 1, dropped: {} }));
  });
});
await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
const port = stub.address().port;

const R = await import('../server/dist/bloxity/statReporter.js');
const { PlayerState } = await import('../server/dist/rooms/state/PlayerState.js');

console.log('\nIdentities');
check(R.reportIdentityOf('bloxity:abc123') === 'legion_abc123', 'an account key becomes legion_<id>');
check(R.reportIdentityOf('bloxity:abc123#m2') === 'legion_abc123', 'a #m mode suffix is stripped');
check(R.reportIdentityOf('p_guest1') === null && R.reportIdentityOf(null) === null, 'guests (and nobody) have no Bloxity identity');

console.log('\nValues come from server state');
{
  const p = new PlayerState();
  p.earned = 4000.7;
  p.rides = 9;
  p.careerPlaced = 2;
  p.rebirths = 3;
  p.rate = 125.6;
  p.carsOwned = 4;
  p.tier = 2;
  p.likes = 7;
  const v = R.statValuesOf(p);
  check(v.money_earned === 4000 && v.rides === 9 && v.pieces_placed === 2 && v.rebirths === 3 && Object.keys(v).length === 8, 'money earned, runs, track placed and rebirths read off PlayerState');
  check(v.track_income === 125 && v.cars_owned === 4 && v.base_upgrade === 2 && v.track_likes === 7, 'track income, cars owned, base upgrade and likes read off PlayerState');
  const keys = R.STAT_DEFINITIONS.map((d) => d.key);
  check(keys.every((k) => /^[a-z0-9_]{1,32}$/.test(k)) && R.STAT_DEFINITIONS.every((d) => d.label.length <= 40), 'every key and label fits Bloxity\'s rules');
  check(!keys.some((k) => /play|session|streak|level/.test(k)), 'nothing Bloxity already tracks (playtime, sessions, streaks, level)');
}

console.log('\nWithout the environment nothing is sent');
{
  delete process.env.BLOXITY_REPORT_TOKEN;
  delete process.env.BLOXITY_GAME_ID;
  const off = R.installStatReporter();
  const remove = R.statRegistry.addSource(() => [{ userId: 'legion_x', values: { pieces_placed: 1 } }]);
  await off.flush();
  remove();
  check(received.length === 0, 'no token, no game id: no request at all');
}

console.log('\nA report');
{
  process.env.BLOXITY_REPORT_TOKEN = 'test-token';
  process.env.BLOXITY_GAME_ID = 'build-racetrack';
  process.env.BLOXITY_API_URL = `http://127.0.0.1:${port}`;
  const reporter = R.installStatReporter();
  const rows = [];
  for (let i = 0; i < 450; i += 1) rows.push({ userId: `legion_u${i}`, values: { pieces_placed: i, rides: 3 } });
  rows.push({ userId: 'legion_bad', values: { pieces_placed: -1, rides: Number.NaN, rebirths: 2e9, unknown_key: 5 } });
  rows.push({ userId: 'legion_cap', values: { rebirths: 2e9, pieces_placed: 4 } });
  const remove = R.statRegistry.addSource(() => rows);
  R.statRegistry.depart('legion_left', { pieces_placed: 9 });
  await reporter.flush();
  remove();
  reporter.stop();
  const players = received.flatMap((r) => r.body.players ?? []);
  check(received.length === 3 && received.every((r) => (r.body.players ?? []).length <= 200), `batched at 200 players a request (${received.map((r) => r.body.players.length).join(' + ')})`);
  check(received.every((r) => r.url === '/v1/games/build-racetrack/stats' && r.auth === 'Bearer test-token'), 'POST /v1/games/<id>/stats with the bearer token');
  check(received.every((r) => Array.isArray(r.body.definitions) && r.body.definitions.length === R.STAT_DEFINITIONS.length), 'the definitions ride every call');
  check(!players.some((p) => p.userId === 'legion_bad'), 'a player with no valid value is left out entirely');
  const cap = players.find((p) => p.userId === 'legion_cap');
  check(cap && cap.values.pieces_placed === 4 && !('rebirths' in cap.values), 'a value over its ceiling is omitted, not clamped');
  check(players.some((p) => p.userId === 'legion_left' && p.values.pieces_placed === 9), 'a player who left is reported with their last figures');
  check(players.every((p) => p.userId.startsWith('legion_')), 'only legion_ identities are sent');
}

console.log('\nFailures never throw');
{
  answer = 500;
  const before = received.length;
  const reporter = R.installStatReporter();
  const remove = R.statRegistry.addSource(() => [{ userId: 'legion_y', values: { pieces_placed: 1 } }]);
  let threw = false;
  try {
    await reporter.flush();
  } catch {
    threw = true;
  }
  process.env.BLOXITY_API_URL = 'http://127.0.0.1:1';
  const dead = R.installStatReporter();
  try {
    await dead.flush();
  } catch {
    threw = true;
  }
  remove();
  reporter.stop();
  dead.stop();
  check(!threw && received.length === before + 1, 'a 500 and an unreachable endpoint are logged, never thrown');
}

stub.close();
console.log(failures === 0 ? '\nstats OK' : `\n${failures} stats check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
