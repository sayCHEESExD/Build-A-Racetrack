/**
 * MULTIPLAYER + GAMEPLAY, against a RUNNING dev server (`npm run dev`, which
 * has --dev-cheats). Bots join and ask the server to do the right thing - and
 * the wrong thing, which it must refuse:
 *
 *   - six players share one room, each on their own plot; a seventh is refused
 *   - buying charges the shared prices and takes shop stock; no cash, no sale
 *   - pieces snap onto the glowing end only, on the placer's own plot; the
 *     server picks the position (a client cannot name one)
 *   - connected pieces pile cash; a run driven with the SHARED car physics
 *     collects it (cash rises), a crash damages the car, repairs restore it
 *   - collecting too fast (a teleporting client) is refused
 *   - another player can drive your track for tips (you get a share and a
 *     visit) and like it once
 *   - deleting a piece takes back everything after it
 *   - leaving and rejoining brings the track back, with offline earnings
 *
 * Usage: ENDPOINT=ws://localhost:3681 node scripts/verify-multiplayer.mjs
 */
import { Client } from 'colyseus.js';
import { ARENA_INDEX, CarSim, DEFAULT_SERVER_PORT, MessageType, PLOTS, ROOM_NAME, TrackPath, plotDef, trackItem, traceChain, unpackPieces, withStart } from '../shared/dist/index.js';

const ENDPOINT = process.env.ENDPOINT ?? `ws://localhost:${DEFAULT_SERVER_PORT}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
const check = (ok, message) => {
  if (ok) console.log(`  ok    ${message}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
};
const stamp = Date.now().toString(36);

const join = async (name, how, id) => {
  const client = new Client(ENDPOINT);
  const options = { playerId: id ?? `p_${name}${stamp}` };
  const room = how === 'create' ? await client.create(ROOM_NAME, options) : how ? await client.joinById(how, options) : await client.joinOrCreate(ROOM_NAME, options);
  const bot = { name, room, client, tracks: new Map(), notices: [], fx: [], profile: null, start: null, offline: null, coins: new Map(), rewards: [] };
  room.onMessage(MessageType.Track, (m) => bot.tracks.set(m.plot, { pieces: unpackPieces(m.p), likes: m.likes, visits: m.visits }));
  room.onMessage(MessageType.Coins, (m) => {
    for (const p of m.plots) bot.coins.set(p.plot, p.f);
  });
  room.onMessage(MessageType.Notice, (m) => bot.notices.push(m.text));
  room.onMessage(MessageType.Fx, (m) => bot.fx.push(m));
  room.onMessage(MessageType.Profile, (m) => (bot.profile = m));
  room.onMessage(MessageType.DriveStart, (m) => (bot.start = m));
  room.onMessage(MessageType.Offline, (m) => (bot.offline = m));
  room.onMessage(MessageType.Reward, (m) => bot.rewards.push(m));
  room.onMessage(MessageType.Gallery, (m) => (bot.gallery = m));
  room.onMessage(MessageType.Arena, (m) => (bot.arena = m));
  room.onMessage(MessageType.Banner, (m) => (bot.banner = m));
  for (const t of [MessageType.Placed, MessageType.ChatLine, MessageType.AuthState, MessageType.Crate]) room.onMessage(t, () => undefined);
  await sleep(500);
  bot.me = () => room.state.players.get(room.sessionId);
  bot.mine = () => bot.tracks.get(bot.me().plot)?.pieces ?? [];
  bot.place = async (k, flip = false) => {
    const before = bot.mine().length;
    room.send(MessageType.Place, { k, flip });
    await sleep(140);
    return bot.mine().length > before;
  };
  bot.lastNotice = () => bot.notices[bot.notices.length - 1] ?? '';
  /** Drive a plot's track with the shared physics, full throttle, reporting like the client. Returns the end reason. */
  bot.drive = async (plot, pieces, steer = 0) => {
    bot.start = null;
    room.send(MessageType.Drive, { plot });
    for (let i = 0; i < 30 && !bot.start; i += 1) await sleep(50);
    if (!bot.start) return 'no-start';
    const s = bot.start;
    const chain = traceChain(pieces);
    const path = new TrackPath(plotDef(plot).frame, pieces, chain.order);
    const sim = new CarSim(path, chain.closed, { speed: s.speed, accel: s.accel, handling: s.handling });
    let reason = 'exit';
    let impact = 0;
    for (let t = 0; t < 30 * 20; t += 1) {
      sim.step(1 / 30, { throttle: 1, steer });
      for (const e of sim.events.splice(0)) {
        if (e.t === 'piece') room.send(MessageType.DriveCollect, { run: s.run, i: e.i, lap: e.lap });
        if (e.t === 'air') room.send(MessageType.DriveAir, { run: s.run, air: e.air, dist: e.dist });
        if (e.t === 'crash') {
          reason = 'crash';
          impact = e.impact;
        }
        if (e.t === 'finish') reason = 'finish';
      }
      if (t % 3 === 0) room.send(MessageType.DrivePose, { run: s.run, x: sim.pos.x, y: sim.pos.y, z: sim.pos.z, yaw: 0, pitch: 0, roll: 0, v: sim.v });
      await sleep(1000 / 30);
      if (sim.mode === 'crashed' || sim.mode === 'done' || (chain.closed && sim.lap >= 1)) break;
    }
    room.send(MessageType.DriveEnd, { run: s.run, reason, impact });
    await sleep(300);
    return reason;
  };
  return bot;
};

const main = async () => {
  console.log(`verify-multiplayer against ${ENDPOINT}`);
  const bots = [await join('alice', 'create')];
  const roomId = bots[0].room.roomId;
  for (const name of ['bob', 'cara', 'dan', 'eve', 'finn']) bots.push(await join(name, roomId));
  const [a, b] = bots;
  check(bots.every((x) => x.room.roomId === roomId), 'six players share one room');
  const plots = bots.map((x) => x.me().plot);
  check(new Set(plots).size === 6 && plots.every((p) => p >= 0 && p < PLOTS.length), `six different plots: ${plots.join(',')}`);
  try {
    const g = await join('gus', roomId);
    check(false, 'a seventh player is refused by a full room');
    await g.room.leave();
  } catch {
    check(true, 'a seventh player is refused by a full room');
  }
  for (const x of bots.slice(2)) await x.room.leave();
  await sleep(300);

  // ---- a new player: starter cash and pieces
  check(a.me().cash === 35, `starting cash is $35 (${a.me().cash})`);
  check((a.profile?.inventory.straight ?? 0) >= 4, 'starter Straight Track pieces');

  // ---- buying: shared price, stock
  const price = trackItem('straight').price;
  const before = a.me().cash;
  a.room.send(MessageType.Buy, { kind: 'track', key: 'straight', count: 1 });
  await sleep(250);
  check(a.me().cash === before - price, `a Straight Track costs ${price}`);
  check(a.profile.stock.track.straight === trackItem('straight').stock - 1, 'buying takes shop stock');
  a.room.send(MessageType.Buy, { kind: 'track', key: 'loop', count: 1 });
  await sleep(200);
  check(/Base Upgrade/.test(a.lastNotice()), `a locked piece is refused (${a.lastNotice()})`);
  a.room.send(MessageType.Buy, { kind: 'track', key: 'uturn', count: 1 });
  await sleep(200);
  check(/need/.test(a.lastNotice()), `buying without the cash is refused (${a.lastNotice()})`);

  // ---- building: snapping onto the end
  check(await a.place('straight'), 'a straight snaps onto the glowing end');
  const chain = traceChain(a.mine());
  check(chain.order.length === a.mine().length, 'every piece is on one connected road');
  check(b.tracks.get(a.me().plot)?.pieces.length === a.mine().length, 'the other player sees the new piece');
  a.room.send(MessageType.Place, { k: 'straight', x: 0, z: 0, y: 0, r: 0 });
  await sleep(150);
  check(traceChain(a.mine()).order.length === a.mine().length, 'a client cannot pick where a piece goes (it always joins the end)');
  // Build a longer track with the dev hooks: a bump and a finish.
  a.room.send('dev', { cash: 2_000_000, tier: 3, items: 4 });
  await sleep(250);
  for (const k of ['turn', 'straight', 'bump', 'straight', 'straight', 'climb', 'straight', 'drop', 'straight', 'finish']) await a.place(k);
  const pieces = a.mine();
  check(pieces.length >= 12, `a longer track is built (${pieces.length} pieces)`);
  check(pieces[pieces.length - 1].k === 'finish', 'it ends on a Finish Line');

  // ---- cash piles up; a run collects it
  await sleep(2600);
  const fills = a.coins.get(a.me().plot) ?? [];
  check(fills.slice(1).some((f) => f > 0), `connected pieces pile cash (${fills.slice(0, 6).join(',')})`);
  a.room.send('dev', { piles: true });
  await sleep(300);
  const cashBefore = a.me().cash;
  const reason = await a.drive(a.me().plot, pieces);
  check(reason === 'finish', `the run reaches the Finish Line (${reason})`);
  check(a.me().cash > cashBefore + 1000, `the run collected the piles (+${Math.floor(a.me().cash - cashBefore)})`);
  check(a.rewards.some((r) => r.why === 'Finish bonus'), 'a Finish bonus was paid');
  check(a.me().driving === false, 'the run ended and the driver is on foot again');

  // ---- cheating: collecting faster than a car can drive is refused
  a.room.send('dev', { piles: true });
  await sleep(300);
  a.start = null;
  a.room.send(MessageType.Drive, { plot: a.me().plot });
  await sleep(300);
  const c0 = a.me().cash;
  const order = traceChain(pieces).order;
  a.room.send(MessageType.DriveCollect, { run: a.start.run, i: order[order.length - 1], lap: 0 });
  await sleep(250);
  check(a.me().cash === c0, 'jumping straight to the last piece pays nothing');
  a.room.send(MessageType.DriveEnd, { run: a.start.run, reason: 'exit', impact: 0 });
  await sleep(200);

  // ---- a crash: off the end of a track without a finish
  a.room.send(MessageType.Remove, { i: a.mine().length - 1 });
  await sleep(200);
  check(a.mine()[a.mine().length - 1].k !== 'finish', 'the Finish Line was taken back');
  const cond0 = a.me().condition;
  const r2 = await a.drive(a.me().plot, a.mine());
  check(r2 === 'crash', `flying off the end crashes (${r2})`);
  check(a.me().condition < cond0, `the crash damaged the car (${cond0} -> ${a.me().condition})`);
  a.room.send(MessageType.Repair, { key: a.me().car });
  await sleep(250);
  check(a.me().condition === 100, 'repairing at the Pit Stop restores it');

  // ---- visiting: Bob drives Alice's track, she gets a visit and a share
  b.room.send('dev', { cash: 0 });
  await sleep(150);
  const aliceBefore = a.me().cash;
  const r3 = await b.drive(a.me().plot, a.mine());
  check(r3 === 'crash' || r3 === 'exit', `Bob drove Alice's track (${r3})`);
  check(b.me().cash > 0, `Bob earned tips on it ($${Math.floor(b.me().cash)})`);
  check(a.me().cash > aliceBefore, `Alice got a share (+${Math.floor(a.me().cash - aliceBefore)})`);
  check(a.me().visits >= 1, `Alice's track counted a visit (${a.me().visits})`);
  b.room.send(MessageType.Like, { plot: a.me().plot });
  await sleep(250);
  b.room.send(MessageType.Like, { plot: a.me().plot });
  await sleep(250);
  check(a.me().likes === 1, `a like counts once (${a.me().likes})`);

  // ---- the gallery: publish, browse, visit by code, drive it in the Showcase
  a.room.send(MessageType.Publish, { name: 'Verify Speedway', desc: 'made by the test' });
  for (let i = 0; i < 30 && !a.profile?.code; i += 1) await sleep(100);
  const code = a.profile?.code ?? '';
  check(/^[A-Z0-9]{6}$/.test(code), `publishing gives a code (${code})`);
  b.room.send(MessageType.Browse, { tab: 'new' });
  for (let i = 0; i < 30 && !b.gallery; i += 1) await sleep(100);
  check(Boolean(b.gallery?.items.some((e) => e.code === code && e.name === 'Verify Speedway')), 'it is listed under New');
  b.room.send(MessageType.Visit, { code: code.toLowerCase() });
  for (let i = 0; i < 30 && !b.arena; i += 1) await sleep(100);
  check(b.arena?.code === code && unpackPieces(b.arena.p).length === a.mine().length, 'entering the code loads the track onto the Showcase');
  const tipsBefore = b.me().cash;
  const r4 = await b.drive(ARENA_INDEX, withStart(unpackPieces(b.arena.p)));
  check(r4 === 'crash' || r4 === 'finish' || r4 === 'exit', `it can be driven in the Showcase (${r4})`);
  check(b.me().cash > tipsBefore, `driving a published track pays tips (+${Math.floor(b.me().cash - tipsBefore)})`);
  b.gallery = null;
  b.room.send(MessageType.Browse, { tab: 'visited' });
  for (let i = 0; i < 30 && !b.gallery; i += 1) await sleep(100);
  check((b.gallery?.items.find((e) => e.code === code)?.visits ?? 0) >= 1, 'the visit was counted on the published track');

  // ---- deleting takes everything after
  const n = a.mine().length;
  a.room.send(MessageType.Remove, { i: 3 });
  await sleep(250);
  check(a.mine().length === 3, `deleting piece 3 of ${n} keeps 3`);
  check(traceChain(a.mine()).order.length === a.mine().length, 'what is left is still one road');

  // ---- leave and rejoin: the track and cash come back
  const keep = { pieces: a.mine().length, cash: Math.floor(a.me().cash) };
  const id = `p_alice${stamp}`;
  await a.room.leave();
  await sleep(1200);
  const a2 = await join('alice2', roomId, id);
  await sleep(300);
  check(a2.mine().length === keep.pieces, `the track comes back (${a2.mine().length} pieces)`);
  check(Math.floor(a2.me().cash) >= keep.cash, 'the cash comes back');

  await a2.room.leave();
  await b.room.leave();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
