import {
  AD_BOOST_SECONDS,
  AIR_PAY_SECONDS,
  ARENA,
  ARENA_ENTRY,
  ARENA_INDEX,
  BOOST_COLLECT,
  CAR_UPGRADES,
  CRATES,
  FINISH_BONUS,
  FREE_GIFT_INCOME_SECONDS,
  FREE_GIFT_MIN,
  FREE_GIFT_SECONDS,
  MAX_AIR_SECONDS,
  MAX_REBIRTHS,
  MAX_SIM_DELTA,
  MAX_TIER,
  MessageType,
  OFFLINE_MAX_HOURS,
  OFFLINE_MIN_SECONDS,
  OFFLINE_SHARE,
  PACK_CONTENTS,
  packItem,
  PLOTS,
  REBIRTH_TIER,
  RESTOCK_SECONDS,
  SAVE_SLOTS,
  SHOPS,
  SPAWN_POINT,
  STARTING_CASH,
  TRACK_ITEMS,
  TrackPath,
  VISIT_OWNER_SHARE,
  VISIT_TIP_SECONDS,
  VOID_Y,
  WORLD_BOUNDS,
  baseTier,
  carDef,
  carStats,
  carUpgradeCost,
  carUpgradeDef,
  checkDecor,
  checkPlace,
  crashDamage,
  crateDef,
  decorAtCell,
  decorByCode,
  decorDef,
  emptyCarLevels,
  fmtMoney,
  headingYaw,
  incomeScale,
  isCarKey,
  itemKeyOf,
  mapBase,
  packDecor,
  packPieces,
  plotDef,
  plotEntry,
  rebirthCost,
  rebirthScale,
  refusalText,
  decorRefusalText,
  repairCost,
  resetMotion,
  restockEpoch,
  rollCrate,
  sanitiseInput,
  shapeRate,
  stepBody,
  tileCenter,
  traceChain,
  trackItem,
  unpackDecor,
  unpackPieces,
  withStart,
  adoptLayout,
  ENDGAME_TRACK,
  layTrack,
  type BuyMessage,
  type Chain,
  type CoinsMessage,
  type DriveCollectMessage,
  type DriveEndMessage,
  type DrivePoseMessage,
  type DriveStartMessage,
  type FxMessage,
  type MoveMessage,
  type NoticeKind,
  type Piece,
  type PlaceDecorMessage,
  type PlaceMessage,
  type PlacedMessage,
  type PlacedReason,
  type ProfileMessage,
  type RemoveDecorMessage,
  type TeleportTarget,
  type TrackMessage,
  type DriveAirMessage,
} from '@race/shared';
import { recordScore } from '../bloxity/leaderboardReporter.js';
import type { GameState } from '../rooms/state/GameState.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { ChatService } from './ChatService.js';
import { gallery, cleanText } from './Gallery.js';
import { Player, type PlayerSave, type TrackSave } from './Player.js';

export interface GameContext {
  now(): number;
  send(sessionId: string, type: string, message: unknown): void;
  broadcast(type: string, message: unknown): void;
  notify(sessionId: string, kind: NoticeKind, text: string): void;
  /** Ask the room to save this player soon (after a big change). */
  save(sessionId: string): void;
}

const MAX_TIME_BUDGET_RATIO = 1.5;
const MAX_SEQ_JUMP = 600;
const COINS_EVERY = 1;
/** Visiting tips per piece wait this long before paying again. */
const TIP_COOLDOWN_MS = 25_000;
/** A visitor counts again after this long. */
const VISIT_COUNT_GAP_MS = 10 * 60_000;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * ONE ROOM'S GAME, server-authoritative: six plots, every racetrack on them,
 * their cash piles, the runs being driven, and the economy. Clients send input
 * and requests; everything here checks them (whose plot, what they own, what
 * they can afford, what fits, whether a car could really have got there)
 * before anything changes.
 */
export class RaceGame {
  readonly players = new Map<string, Player>();
  readonly chat: ChatService;
  private readonly world = mapBase();
  private readonly chains = new Map<Player, Chain>();
  private coinClock = 0;
  private secondClock = 0;
  /** Owner key -> visitor -> when they last counted. */
  private readonly visitors = new Map<string, Map<string, number>>();

  constructor(
    readonly state: GameState,
    readonly ctx: GameContext,
  ) {
    this.chat = new ChatService(this);
  }

  get now(): number {
    return this.ctx.now();
  }

  // ---------------------------------------------------------------- players

  addPlayer(sessionId: string, ps: PlayerState, key: string, save: Partial<PlayerSave> | null, track: Record<string, unknown> | null): Player {
    const p = new Player(sessionId, ps, key);
    this.players.set(sessionId, p);
    p.restore(save);
    p.restoreTrack(track);
    this.sanitiseTrack(p);
    ps.plot = this.freePlot();
    this.recompute(p);
    for (const o of this.players.values()) if (o !== p && o.plot >= 0) this.ctx.send(sessionId, MessageType.Track, this.trackMessage(o));
    if (p.plot >= 0) this.ctx.broadcast(MessageType.Track, this.trackMessage(p));
    if (save) this.toBase(p, 'join');
    else this.placeAt(p, SPAWN_POINT.x, SPAWN_POINT.y, SPAWN_POINT.z, SPAWN_POINT.yaw, 'join');
    this.chat.line({ kind: 'join', text: `${p.name} joined the raceway` });
    if (!save) this.ctx.send(sessionId, MessageType.ChatLine, { kind: 'tip', text: 'Welcome! Buy track at the TRACKS stall, snap it onto your track (B), then drive it (E at your Spawn Car pad) to grab the cash it piles up.' });
    this.offline(p, save);
    this.sendProfile(p);
    return p;
  }

  /** Welcome back: what the track earned while they were away (a share of its rate), and the piles it filled. */
  private offline(p: Player, save: Partial<PlayerSave> | null): void {
    if (!save || !p.leftAt) return;
    const away = Math.max(0, (Date.now() - p.leftAt) / 1000);
    if (away < OFFLINE_MIN_SECONDS) return;
    const seconds = Math.min(away, OFFLINE_MAX_HOURS * 3600);
    this.fillPiles(p, seconds);
    const amount = Math.floor(p.state.rate * seconds * OFFLINE_SHARE);
    if (amount <= 0) return;
    this.earn(p, amount, '');
    this.ctx.send(p.sessionId, MessageType.Offline, { amount, seconds: Math.floor(seconds) });
  }

  switchProfile(p: Player, save: Partial<PlayerSave> | null, track: Record<string, unknown> | null): void {
    if (p.run) this.endRun(p, 'exit', 0);
    p.restore(save);
    p.restoreTrack(track);
    this.sanitiseTrack(p);
    this.trackChanged(p);
  }

  removePlayer(sessionId: string): { save: PlayerSave; track: TrackSave } | null {
    const p = this.players.get(sessionId);
    if (!p) return null;
    p.run = null;
    const plot = p.plot;
    this.players.delete(sessionId);
    this.chains.delete(p);
    if (plot >= 0) this.ctx.broadcast(MessageType.Track, { plot, p: [], d: [], likes: 0, visits: 0, tier: 0 } satisfies TrackMessage);
    this.chat.line({ kind: 'leave', text: `${p.name} left the raceway` });
    return { save: p.toSave(), track: p.toTrack() };
  }

  private freePlot(): number {
    const taken = new Set([...this.players.values()].map((o) => o.state.plot));
    for (let i = 0; i < PLOTS.length; i += 1) if (!taken.has(i)) return i;
    return -1;
  }

  /** Keep only pieces that still form one legal road from the gate (and decorations that fit). */
  private sanitiseTrack(p: Player): void {
    const kept: Piece[] = withStart([]);
    const piles: number[] = [0];
    const chain = traceChain(p.pieces);
    let broken = false;
    for (const i of chain.order) {
      const piece = p.pieces[i]!;
      if (piece.k === 'start') continue;
      if (!broken && checkPlace(kept, [], piece, p.state.tier) === null) {
        kept.push(piece);
        piles.push(p.piles[i] ?? 0);
      } else {
        broken = true;
        const item = itemKeyOf(piece.k);
        if (item) p.give(item, 1);
      }
    }
    p.pieces.forEach((piece, i) => {
      if (piece.k !== 'start' && !chain.connected[i]) {
        const item = itemKeyOf(piece.k);
        if (item) p.give(item, 1);
      }
    });
    p.pieces = kept;
    p.piles = piles;
    const decor = p.decor;
    p.decor = [];
    for (const d of decor) {
      if (checkDecor(p.pieces, p.decor, d, p.state.tier) === null) p.decor.push(d);
      else {
        const def = decorByCode(d.d);
        if (def) p.giveDecor(def.key, 1);
      }
    }
  }

  placeAt(p: Player, x: number, y: number, z: number, yaw: number, reason: PlacedReason): void {
    resetMotion(p.motion, x, y, z, yaw);
    p.publishMotion();
    const placed: PlacedMessage = { x, y, z, rotationY: yaw, reason };
    this.ctx.send(p.sessionId, MessageType.Placed, placed);
  }

  private toBase(p: Player, reason: PlacedReason): void {
    const plot = PLOTS[p.plot];
    if (!plot) {
      this.placeAt(p, SPAWN_POINT.x, SPAWN_POINT.y, SPAWN_POINT.z, SPAWN_POINT.yaw, reason);
      return;
    }
    const e = plotEntry(plot);
    this.placeAt(p, e.x, e.y, e.z, e.yaw, reason);
  }

  base(p: Player): void {
    if (p.run) this.endRun(p, 'exit', 0);
    else this.toBase(p, 'base');
  }

  teleport(p: Player, to: TeleportTarget): void {
    if (p.run) this.endRun(p, 'exit', 0);
    if (to === 'base') return this.toBase(p, 'teleport');
    if (to === 'spawn') return this.placeAt(p, SPAWN_POINT.x, SPAWN_POINT.y, SPAWN_POINT.z, SPAWN_POINT.yaw, 'teleport');
    if (to === 'arena') return this.placeAt(p, ARENA_ENTRY.x, ARENA_ENTRY.y, ARENA_ENTRY.z, ARENA_ENTRY.yaw, 'teleport');
    const shop = SHOPS.find((s) => s.kind === to);
    if (!shop) return;
    const fx = Math.sin(shop.yaw);
    const fz = Math.cos(shop.yaw);
    this.placeAt(p, shop.x + fx * 6, SPAWN_POINT.y, shop.z + fz * 6, shop.yaw + Math.PI, 'teleport');
  }

  // ---------------------------------------------------------------- movement

  move(sessionId: string, message: MoveMessage): void {
    const p = this.players.get(sessionId);
    if (!p) return;
    const seq = message?.seq;
    const dt = message?.dt;
    if (!finite(seq) || !finite(dt) || dt < 0) return;
    if (seq <= p.lastSeq || seq > p.lastSeq + MAX_SEQ_JUMP) return;
    const step = Math.min(dt, MAX_SIM_DELTA);
    const nowMs = Date.now();
    p.budget = Math.min(p.budget + Math.max(0, (nowMs - p.lastRefill) / 1000) * MAX_TIME_BUDGET_RATIO, MAX_SIM_DELTA * 20);
    p.lastRefill = nowMs;
    if (step > p.budget) return;
    p.budget -= step;
    p.lastSeq = seq;
    p.state.lastInputSeq = seq;
    const pitch = Number(message.pitch);
    if (Number.isFinite(pitch)) p.state.pitch = Math.max(-1.6, Math.min(1.6, pitch));
    if (p.run) return;
    p.input = sanitiseInput(message);
    stepBody(p.motion, p.input, p.params, step, this.world, p.events);
    if ((p.input.moveX !== 0 || p.input.moveZ !== 0 || p.events.jumped) && p.state.emote) p.state.emote = '';
    if (p.motion.y < VOID_Y) this.toBase(p, 'respawn');
    p.publishMotion();
    p.state.ready = true;
  }

  // ---------------------------------------------------------------- income

  moneyBoost(p: Player): number {
    return (p.pass2x ? 2 : 1) * (p.boostUntil > Date.now() ? 2 : 1);
  }

  private scaleOf(p: Player, chain: Chain): number {
    return incomeScale({ rebirths: p.state.rebirths, closed: chain.closed, decor: p.decor.length, likes: p.state.likes, boost: 1 });
  }

  private recompute(p: Player): void {
    const chain = traceChain(p.pieces);
    this.chains.set(p, chain);
    let rate = 0;
    for (const i of chain.order) rate += shapeRate(p.pieces[i]!.k);
    p.state.rate = rate * this.scaleOf(p, chain) * this.moneyBoost(p);
    p.state.boost = this.moneyBoost(p);
  }

  private trackMessage(p: Player, by?: string): TrackMessage {
    const m: TrackMessage = { plot: p.plot, p: packPieces(p.pieces), d: packDecor(p.decor), likes: p.state.likes, visits: p.state.visits, tier: p.state.tier };
    if (by) m.by = by;
    return m;
  }

  private trackChanged(p: Player): void {
    this.recompute(p);
    if (p.plot >= 0) this.ctx.broadcast(MessageType.Track, this.trackMessage(p, p.sessionId));
    this.sendProfile(p);
  }

  /** Every connected piece piles up cash up to its cap. */
  private fillPiles(p: Player, dt: number): void {
    const chain = this.chains.get(p);
    if (!chain || p.plot < 0) return;
    const scale = this.scaleOf(p, chain);
    const hold = baseTier(p.state.tier).pile;
    for (const i of chain.order) {
      const rate = shapeRate(p.pieces[i]!.k) * scale;
      if (rate <= 0) continue;
      p.piles[i] = Math.min(rate * hold, (p.piles[i] ?? 0) + rate * dt);
    }
  }

  earn(p: Player, amount: number, why: string): void {
    if (amount <= 0) return;
    const s = p.state;
    s.cash += amount;
    s.earned += amount;
    if (why) this.ctx.send(p.sessionId, MessageType.Reward, { amount, why });
  }

  // ---------------------------------------------------------------- building

  place(p: Player, m: PlaceMessage): void {
    if (p.plot < 0) return;
    if (p.run) return this.ctx.notify(p.sessionId, 'bad', 'Stop driving first');
    const item = typeof m?.k === 'string' ? trackItem(m.k) : undefined;
    if (!item || !p.spend()) return;
    if (p.count(item.key) <= 0) return this.ctx.notify(p.sessionId, 'bad', `No ${item.name} left - buy more at the Track Shop`);
    const chain = this.chains.get(p) ?? traceChain(p.pieces);
    const end = chain.end;
    if (!end) return this.ctx.notify(p.sessionId, 'bad', refusalText.closed);
    const shape = item.shapes[m.flip === true && item.shapes.length > 1 ? 1 : 0]!;
    const piece: Piece = { k: shape, x: end.x, z: end.z, y: end.y, r: end.r };
    const why = checkPlace(p.pieces, p.decor, piece, p.state.tier);
    if (why) return this.ctx.notify(p.sessionId, 'bad', refusalText[why]);
    p.pieces.push(piece);
    p.piles.push(0);
    p.give(item.key, -1);
    p.state.careerPlaced += 1;
    const plot = PLOTS[p.plot]!;
    const c = tileCenter(plot.frame, piece.x, piece.z, piece.y);
    this.fx({ k: 'place', x: c.x, y: c.y, z: c.z, v: item.color, by: p.sessionId });
    this.trackChanged(p);
    if (this.chains.get(p)?.closed) this.ctx.send(p.sessionId, MessageType.Banner, { title: 'Circuit Complete!', sub: '+50% income from every piece - and you can lap it!', tone: 'gold', seconds: 3.5 });
  }

  /** Take back piece i and every piece after it; their piles are paid out. */
  remove(p: Player, m: { i?: unknown }): void {
    if (p.plot < 0 || !int(m?.i)) return;
    if (p.run) return this.ctx.notify(p.sessionId, 'bad', 'Stop driving first');
    if (!p.spend()) return;
    const i = m.i;
    if (i < 1 || i >= p.pieces.length) return;
    const removed = p.pieces.splice(i);
    const piles = p.piles.splice(i);
    for (const piece of removed) {
      const key = itemKeyOf(piece.k);
      if (key) p.give(key, 1);
    }
    const pile = Math.floor(piles.reduce((a, n) => a + n, 0));
    if (pile > 0) this.earn(p, pile, 'Piles collected');
    const c = tileCenter(PLOTS[p.plot]!.frame, removed[0]!.x, removed[0]!.z, removed[0]!.y);
    this.fx({ k: 'remove', x: c.x, y: c.y, z: c.z, by: p.sessionId });
    this.trackChanged(p);
  }

  clearTrack(p: Player): void {
    if (p.plot < 0) return;
    if (p.run) return this.ctx.notify(p.sessionId, 'bad', 'Stop driving first');
    if (p.pieces.length <= 1) return;
    this.remove(p, { i: 1 });
    this.ctx.notify(p.sessionId, 'info', 'Every piece is back in your inventory');
  }

  placeDecor(p: Player, m: PlaceDecorMessage): void {
    if (p.plot < 0 || !m || typeof m.k !== 'string' || ![m.x, m.z, m.r].every(int)) return;
    if (p.run) return;
    const def = decorDef(m.k);
    if (!def || !p.spend()) return;
    if (p.decorCount(def.key) <= 0) return this.ctx.notify(p.sessionId, 'bad', `No ${def.name} left - buy more at the Decors stall`);
    const d = { d: def.code, x: m.x, z: m.z, r: m.r & 3 };
    const why = checkDecor(p.pieces, p.decor, d, p.state.tier);
    if (why) return this.ctx.notify(p.sessionId, 'bad', decorRefusalText[why]);
    p.decor.push(d);
    p.giveDecor(def.key, -1);
    const c = tileCenter(PLOTS[p.plot]!.frame, Math.floor(m.x / 2), Math.floor(m.z / 2));
    this.fx({ k: 'place', x: c.x, y: c.y, z: c.z, v: def.color, by: p.sessionId });
    this.trackChanged(p);
  }

  removeDecor(p: Player, m: RemoveDecorMessage): void {
    if (p.plot < 0 || !m || ![m.x, m.z].every(int) || !p.spend()) return;
    const i = decorAtCell(p.decor, m.x, m.z);
    if (i < 0) return;
    const [d] = p.decor.splice(i, 1);
    const def = decorByCode(d!.d);
    if (def) p.giveDecor(def.key, 1);
    this.trackChanged(p);
  }

  // ---------------------------------------------------------------- shops

  private deny(p: Player, text: string): void {
    this.ctx.notify(p.sessionId, 'bad', text);
    this.fx({ k: 'denied', x: p.motion.x, y: p.motion.y + 1, z: p.motion.z, by: p.sessionId });
  }

  buy(p: Player, m: BuyMessage): void {
    if (!m || typeof m.key !== 'string' || !p.spend(0.5)) return;
    const s = p.state;
    const epoch = restockEpoch(Date.now());
    if (m.kind === 'track' || m.kind === 'decor') {
      const def = m.kind === 'track' ? trackItem(m.key) : decorDef(m.key);
      if (!def) return;
      if (s.tier < def.tier) return this.deny(p, `${def.name} needs Base Upgrade ${def.tier}`);
      const stockKey = `${m.kind === 'track' ? 't' : 'd'}:${def.key}`;
      const left = def.stock - p.boughtOf(stockKey, epoch);
      const want = m.count === 5 ? 5 : 1;
      const n = Math.min(want, left);
      if (n <= 0) return this.deny(p, `${def.name} is out of stock - restocks soon`);
      const cost = def.price * n;
      if (s.cash < cost) return this.deny(p, `You need ${fmtMoney(cost - s.cash)} more`);
      s.cash -= cost;
      p.bought.set(stockKey, p.boughtOf(stockKey, epoch) + n);
      if (m.kind === 'track') p.give(def.key, n);
      else p.giveDecor(def.key, n);
      this.bought(p, `Bought ${n} x ${def.name}`);
      return;
    }
    if (m.kind === 'crate') {
      const crate = crateDef(m.key);
      if (!crate) return;
      if (s.tier < crate.tier) return this.deny(p, `${crate.name} needs Base Upgrade ${crate.tier}`);
      const stockKey = `c:${crate.key}`;
      if (crate.stock - p.boughtOf(stockKey, epoch) <= 0) return this.deny(p, `${crate.name} is sold out - restocks soon`);
      if (s.cash < crate.price) return this.deny(p, `You need ${fmtMoney(crate.price - s.cash)} more`);
      s.cash -= crate.price;
      p.bought.set(stockKey, p.boughtOf(stockKey, epoch) + 1);
      this.openCrate(p, crate.key);
      this.sendProfile(p);
      this.ctx.save(p.sessionId);
      return;
    }
    if (m.kind === 'base') {
      if (s.tier >= MAX_TIER) return this.deny(p, 'Your Base is fully upgraded!');
      const next = baseTier(s.tier + 1);
      if (s.cash < next.cost) return this.deny(p, `You need ${fmtMoney(next.cost - s.cash)} more`);
      s.cash -= next.cost;
      s.tier += 1;
      this.fx({ k: 'upgrade', x: p.motion.x, y: p.motion.y + 1, z: p.motion.z, by: p.sessionId });
      this.ctx.send(p.sessionId, MessageType.Banner, { title: `${next.name}!`, sub: `Plot expanded - ${next.length} track length - new shop items`, tone: 'level', seconds: 4 });
      this.chat.line({ kind: 'system', text: `${p.name} upgraded their base to ${next.name}` });
      this.trackChanged(p);
      this.ctx.save(p.sessionId);
      return;
    }
    if (m.kind === 'carup') {
      const key = typeof m.car === 'string' ? m.car : s.car;
      const car = p.cars.get(key);
      const up = carUpgradeDef(m.key);
      if (!car || !up) return;
      const level = car.lv[up.key];
      if (level >= up.max) return this.deny(p, `${up.name} is maxed out`);
      const cost = carUpgradeCost(carDef(key), up.key, level);
      if (s.cash < cost) return this.deny(p, `You need ${fmtMoney(cost - s.cash)} more`);
      s.cash -= cost;
      car.lv[up.key] = level + 1;
      this.fx({ k: 'upgrade', x: p.motion.x, y: p.motion.y + 1, z: p.motion.z, by: p.sessionId });
      this.bought(p, `${carDef(key).name}: ${up.name} level ${level + 1}!`);
    }
  }

  /** Open a crate: a car, or (a duplicate) a third of the crate back in cash. */
  private openCrate(p: Player, key: string): void {
    const crate = crateDef(key);
    if (!crate) return;
    const car = rollCrate(crate, Math.random());
    const duplicate = p.cars.has(car);
    let refund = 0;
    if (duplicate) {
      refund = Math.floor(crate.price * 0.35);
      this.earn(p, refund, '');
    } else p.cars.set(car, { lv: emptyCarLevels(), cond: 100 });
    p.state.carsOwned = p.cars.size;
    this.ctx.send(p.sessionId, MessageType.Crate, { crate: crate.key, car, duplicate, refund });
    this.fx({ k: 'buy', x: p.motion.x, y: p.motion.y + 1.2, z: p.motion.z, by: p.sessionId });
    if (!duplicate && ['legendary', 'mythic'].includes(carDef(car).rarity)) this.chat.line({ kind: 'system', text: `${p.name} unboxed the ${carDef(car).name}!` });
  }

  private bought(p: Player, text: string): void {
    this.ctx.notify(p.sessionId, 'good', text);
    this.fx({ k: 'buy', x: p.motion.x, y: p.motion.y + 1.2, z: p.motion.z, by: p.sessionId });
    this.sendProfile(p);
  }

  equip(p: Player, key: unknown): void {
    if (!isCarKey(key) || !p.cars.has(key)) return;
    if (p.run) return this.ctx.notify(p.sessionId, 'bad', 'Stop driving first');
    p.state.car = key;
    p.state.condition = Math.round(p.car().cond);
    this.ctx.notify(p.sessionId, 'info', `Driving the ${carDef(key).name}`);
    this.sendProfile(p);
  }

  repair(p: Player, key: unknown): void {
    const k = isCarKey(key) ? key : p.state.car;
    const car = p.cars.get(k);
    if (!car) return;
    if (car.cond >= 100) return this.ctx.notify(p.sessionId, 'info', 'That car is in perfect shape');
    const cost = repairCost(carDef(k), car.cond);
    if (p.state.cash < cost) return this.deny(p, `Repairs cost ${fmtMoney(cost)}`);
    p.state.cash -= cost;
    car.cond = 100;
    if (k === p.state.car) p.state.condition = 100;
    this.fx({ k: 'repair', x: p.motion.x, y: p.motion.y + 1, z: p.motion.z, by: p.sessionId });
    this.bought(p, `${carDef(k).name} repaired!`);
  }

  rebirth(p: Player): void {
    const s = p.state;
    if (s.rebirths >= MAX_REBIRTHS) return;
    if (s.tier < REBIRTH_TIER) return this.deny(p, `Rebirth needs Base Upgrade ${REBIRTH_TIER}`);
    const cost = rebirthCost(s.rebirths);
    if (s.cash < cost) return this.deny(p, `Rebirth needs ${fmtMoney(cost)}`);
    if (p.run) return this.ctx.notify(p.sessionId, 'bad', 'Stop driving first');
    s.rebirths += 1;
    s.cash = STARTING_CASH;
    s.tier = 0;
    // The plot shrinks back: track and decorations return to the inventory.
    for (const piece of p.pieces) {
      const key = itemKeyOf(piece.k);
      if (key) p.give(key, 1);
    }
    for (const d of p.decor) {
      const def = decorByCode(d.d);
      if (def) p.giveDecor(def.key, 1);
    }
    p.pieces = withStart([]);
    p.piles = [0];
    p.decor = [];
    this.fx({ k: 'rebirth', x: p.motion.x, y: p.motion.y + 1, z: p.motion.z, by: p.sessionId });
    this.ctx.send(p.sessionId, MessageType.Banner, { title: `Rebirth ${s.rebirths}!`, sub: `All income is now x${rebirthScale(s.rebirths).toFixed(1)}`, tone: 'gold', seconds: 4 });
    this.chat.line({ kind: 'system', text: `${p.name} rebirthed! (${s.rebirths})` });
    if (p.key) recordScore(p.key, 'rebirths', s.rebirths);
    this.trackChanged(p);
    this.ctx.save(p.sessionId);
  }

  // ---------------------------------------------------------------- boosts, gifts, packs

  grantAdBoost(p: Player): void {
    p.boostUntil = Math.max(Date.now(), p.boostUntil) + AD_BOOST_SECONDS * 1000;
    this.recompute(p);
    this.bought(p, '2x Money for 10 minutes!');
  }

  freeGift(p: Player): void {
    if (p.giftClock < FREE_GIFT_SECONDS) return this.ctx.notify(p.sessionId, 'info', `Your next gift is ready in ${Math.ceil((FREE_GIFT_SECONDS - p.giftClock) / 60)} min`);
    p.giftClock = 0;
    const amount = Math.max(FREE_GIFT_MIN, Math.floor(p.state.rate * FREE_GIFT_INCOME_SECONDS));
    this.earn(p, amount, 'Free gift!');
    this.fx({ k: 'buy', x: p.motion.x, y: p.motion.y + 1.2, z: p.motion.z, by: p.sessionId });
    this.sendProfile(p);
  }

  /** Buy a pack or the 2x Money pass with in-game cash (priced only in `PACKS`). */
  buyPack(p: Player, sku: unknown): void {
    if (typeof sku !== 'string' || !p.spend(2)) return;
    const item = packItem(sku);
    const pack = PACK_CONTENTS[sku];
    if (!item || !pack) return;
    if (item.kind === 'pass' && p.pass2x) return this.ctx.notify(p.sessionId, 'info', `You already have ${item.name}!`);
    if (p.state.tier < item.tier) return this.deny(p, `Base Upgrade to ${baseTier(item.tier).name} to unlock the ${item.name}`);
    if (p.state.cash < item.price) return this.deny(p, `You need ${fmtMoney(item.price - p.state.cash)} more for the ${item.name}`);
    p.state.cash -= item.price;
    if (pack.pass === 'money2') p.pass2x = true;
    for (const [key, n] of Object.entries(pack.items ?? {})) p.give(key, n);
    for (const [key, n] of Object.entries(pack.crates ?? {})) for (let i = 0; i < n; i += 1) this.openCrate(p, key);
    if (pack.cash) this.earn(p, pack.cash, '');
    this.recompute(p);
    this.bought(p, `${item.name} bought!`);
  }

  // ---------------------------------------------------------------- driving

  /** Start a run on a plot: yours (collect the piles), someone's (tips), or the Showcase. */
  startDrive(p: Player, plotIndex: unknown): void {
    if (!int(plotIndex) || p.run) return;
    const car = p.car();
    if (car.cond <= 0) return this.deny(p, 'Your car is wrecked! Repair it at your Pit Stop');
    let pieces: Piece[];
    let own = false;
    let ownerKey = '';
    if (plotIndex === ARENA_INDEX) {
      if (!p.arena) return this.ctx.notify(p.sessionId, 'info', 'Pick a racetrack to visit first (RaceTracks)');
      pieces = p.arena.pieces;
      ownerKey = p.arena.ownerKey;
    } else {
      const owner = [...this.players.values()].find((o) => o.plot === plotIndex);
      if (!owner) return;
      pieces = owner.pieces;
      own = owner === p;
      ownerKey = owner.key || owner.sessionId;
      if (!own) this.countVisit(owner, p);
    }
    const plot = plotDef(plotIndex)!;
    const chain = traceChain(pieces);
    if (chain.order.length < 2) return this.ctx.notify(p.sessionId, 'info', own ? 'Build some track first! (B)' : 'That track has nothing to drive yet');
    const path = new TrackPath(plot.frame, pieces, chain.order);
    const stats = carStats(carDef(p.state.car), car.lv, car.cond);
    const s = p.state;
    s.runId = (s.runId + 1) % 65536;
    p.run = {
      id: s.runId,
      plot: plotIndex,
      own,
      path,
      lastK: 0,
      lap: 0,
      lastAt: Date.now(),
      startedAt: Date.now(),
      collected: 0,
      tipped: new Map(),
      speed: stats.speed,
      cash: stats.cash,
      ended: false,
    };
    void ownerKey;
    s.driving = true;
    s.drivePlot = plotIndex;
    s.emote = '';
    s.building = false;
    // The body rides in the car, at the gate.
    const pos = { x: 0, y: 0, z: 0 };
    path.at(2, pos);
    const yaw = headingYaw(plot.frame, pieces[chain.order[0]!]!.r);
    resetMotion(p.motion, pos.x, pos.y, pos.z, yaw);
    p.publishMotion();
    const start: DriveStartMessage = { run: s.runId, plot: plotIndex, car: s.car, speed: stats.speed, accel: stats.accel, handling: stats.handling, cash: stats.cash };
    this.ctx.send(p.sessionId, MessageType.DriveStart, start);
  }

  private countVisit(owner: Player, visitor: Player): void {
    const ownerKey = owner.key || owner.sessionId;
    const who = visitor.key || visitor.sessionId;
    let seen = this.visitors.get(ownerKey);
    if (!seen) this.visitors.set(ownerKey, (seen = new Map()));
    const last = seen.get(who) ?? 0;
    if (Date.now() - last < VISIT_COUNT_GAP_MS) return;
    seen.set(who, Date.now());
    owner.state.visits += 1;
    this.ctx.notify(owner.sessionId, 'good', `${visitor.name} is driving your racetrack!`);
  }

  drivePose(p: Player, m: DrivePoseMessage): void {
    const run = p.run;
    if (!run || m?.run !== run.id) return;
    const { x, y, z, yaw, pitch, roll, v } = m;
    if (![x, y, z, yaw, pitch, roll, v].every(finite)) return;
    const b = WORLD_BOUNDS;
    if (x < b.minX || x > b.minX + b.sizeX || z < b.minZ || z > b.minZ + b.sizeZ || y < -5 || y > 80) return;
    const mo = p.motion;
    mo.x = x;
    mo.y = y;
    mo.z = z;
    mo.yaw = yaw;
    mo.vx = mo.vy = mo.vz = 0;
    mo.grounded = true;
    p.publishMotion();
    p.state.carPitch = Math.max(-Math.PI, Math.min(Math.PI, pitch));
    p.state.carRoll = Math.max(-Math.PI, Math.min(Math.PI, roll));
    p.state.carSpeed = Math.max(-20, Math.min(120, v));
  }

  /** The car reached piece i: pay its pile (own track) or a tip (a visit). */
  driveCollect(p: Player, m: DriveCollectMessage): void {
    const run = p.run;
    if (!run || run.ended || m?.run !== run.id || !int(m.i) || !int(m.lap)) return;
    const owner = run.plot === ARENA_INDEX ? null : [...this.players.values()].find((o) => o.plot === run.plot);
    const pieces = run.plot === ARENA_INDEX ? p.arena?.pieces : owner?.pieces;
    if (!pieces) return;
    const chain = traceChain(pieces);
    const k = chain.order.indexOf(m.i);
    if (k <= 0) return;
    // Laps: only forward, at most one lap on, and only round a circuit.
    const lapDiff = m.lap - run.lap;
    if (lapDiff < 0 || lapDiff > 1 || (lapDiff === 1 && !chain.closed)) return;
    if (lapDiff === 0 && k <= run.lastK) return;
    // Could a car really have got here so soon?
    const from = run.path.pieceStart(chain.order[run.lastK]!);
    const to = run.path.pieceStart(m.i);
    if (from < 0 || to < 0) return;
    const dist = to - from + lapDiff * run.path.length;
    const minTime = Math.max(0, dist / (run.speed * 1.6 + 6) - 0.35);
    const nowMs = Date.now();
    if ((nowMs - run.lastAt) / 1000 < minTime) return;
    run.lastK = k;
    run.lap = m.lap;
    run.lastAt = nowMs;
    const piece = pieces[m.i]!;
    const boostPiece = piece.k === 'boost' ? BOOST_COLLECT : 1;
    let amount = 0;
    if (run.own && owner === p) {
      const pile = Math.floor(p.piles[m.i] ?? 0);
      if (pile <= 0) return;
      p.piles[m.i] = (p.piles[m.i] ?? 0) - pile;
      amount = Math.floor(pile * run.cash * boostPiece * this.moneyBoost(p));
    } else {
      const last = run.tipped.get(m.i) ?? 0;
      if (nowMs - last < TIP_COOLDOWN_MS) return;
      run.tipped.set(m.i, nowMs);
      const scale = owner ? this.scaleOf(owner, this.chains.get(owner) ?? chain) : 1;
      amount = Math.floor(shapeRate(piece.k) * scale * VISIT_TIP_SECONDS * run.cash * boostPiece * this.moneyBoost(p));
      if (owner && amount > 0) {
        const share = Math.floor(amount * VISIT_OWNER_SHARE);
        if (share > 0) this.earn(owner, share, '');
      }
    }
    if (amount <= 0) return;
    run.collected += amount;
    this.earn(p, amount, '');
    this.fx({ k: 'collect', x: p.motion.x, y: p.motion.y + 1.5, z: p.motion.z, v: amount, by: p.sessionId });
  }

  /** A jump: pay air time (capped and checked against the run's clock). */
  driveAir(p: Player, m: DriveAirMessage): void {
    const run = p.run;
    if (!run || run.ended || m?.run !== run.id || !finite(m.air) || !finite(m.dist)) return;
    const air = Math.max(0, Math.min(MAX_AIR_SECONDS, m.air, (Date.now() - run.startedAt) / 1000));
    const dist = Math.max(0, Math.min(m.dist, air * run.speed * 1.7 + 4));
    if (air < 0.25) return;
    const owner = run.plot === ARENA_INDEX ? null : [...this.players.values()].find((o) => o.plot === run.plot);
    const rate = run.own ? p.state.rate / this.moneyBoost(p) : (owner?.state.rate ?? 20) * 0.5;
    const amount = Math.floor(Math.max(1, rate) * air * AIR_PAY_SECONDS * run.cash * this.moneyBoost(p));
    run.collected += amount;
    this.earn(p, amount, '');
    if (dist > p.state.bestAir) {
      p.state.bestAir = Math.round(dist * 10) / 10;
      if (p.key) recordScore(p.key, 'rides', 0);
    }
  }

  driveEnd(p: Player, m: DriveEndMessage): void {
    const run = p.run;
    if (!run || m?.run !== run.id) return;
    const reason = m.reason === 'crash' || m.reason === 'finish' ? m.reason : 'exit';
    this.endRun(p, reason, finite(m.impact) ? Math.max(0, Math.min(60, m.impact)) : 0);
  }

  private endRun(p: Player, reason: 'crash' | 'finish' | 'exit', impact: number): void {
    const run = p.run;
    if (!run) return;
    run.ended = true;
    p.run = null;
    const s = p.state;
    s.driving = false;
    s.drivePlot = -1;
    s.carSpeed = 0;
    s.carPitch = 0;
    s.carRoll = 0;
    if (reason === 'crash') {
      const car = p.car();
      const stats = carStats(carDef(s.car), car.lv, car.cond);
      const dmg = crashDamage(impact, stats.armor);
      car.cond = Math.max(0, car.cond - dmg);
      s.condition = Math.round(car.cond);
      this.fx({ k: 'crash', x: p.motion.x, y: p.motion.y, z: p.motion.z, v: dmg, by: p.sessionId });
      if (car.cond <= 0) this.ctx.send(p.sessionId, MessageType.Banner, { title: 'Car Wrecked!', sub: 'Repair it at your Pit Stop (or the Garage)', tone: 'info', seconds: 3 });
      else if (car.cond < 50) this.ctx.notify(p.sessionId, 'bad', `Car condition ${Math.round(car.cond)}% - it is slowing down. Repair at the Pit Stop!`);
    }
    if (reason === 'finish') {
      const pieces = run.plot === ARENA_INDEX ? p.arena?.pieces : [...this.players.values()].find((o) => o.plot === run.plot)?.pieces;
      const chain = pieces ? traceChain(pieces) : null;
      const last = chain && pieces ? pieces[chain.order[chain.order.length - 1]!] : null;
      if (chain && last?.k === 'finish' && run.lastK >= chain.order.length - 2) {
        const bonus = Math.floor(run.collected * FINISH_BONUS);
        if (bonus > 0) {
          run.collected += bonus;
          this.earn(p, bonus, 'Finish bonus');
        }
        this.fx({ k: 'finish', x: p.motion.x, y: p.motion.y + 1, z: p.motion.z, by: p.sessionId });
      }
    }
    s.rides += 1;
    if (p.key) recordScore(p.key, 'rides', 1);
    if (p.key) recordScore(p.key, 'earned', Math.floor(s.earned));
    // Back to the pit of the plot they drove (the Showcase: its entry).
    if (run.plot === ARENA_INDEX) this.placeAt(p, ARENA_ENTRY.x, ARENA_ENTRY.y, ARENA_ENTRY.z, ARENA_ENTRY.yaw, 'drive');
    else {
      const plot = PLOTS[run.plot];
      if (plot) {
        const e = plotEntry(plot);
        this.placeAt(p, e.x, e.y, e.z, e.yaw, 'drive');
      } else this.toBase(p, 'drive');
    }
    if (run.collected > 0) this.ctx.send(p.sessionId, MessageType.Reward, { amount: run.collected, why: 'this run' });
    this.sendProfile(p);
  }

  // ---------------------------------------------------------------- social: likes, gallery, slots

  like(p: Player, m: { plot?: unknown; code?: unknown }): void {
    const who = p.key || p.sessionId;
    if (int(m?.plot)) {
      const owner = [...this.players.values()].find((o) => o.plot === m.plot);
      if (!owner || owner === p) return;
      if (owner.likers.includes(who)) return this.ctx.notify(p.sessionId, 'info', 'You already liked this track');
      owner.likers.push(who);
      owner.state.likes += 1;
      p.liked.add(`plot:${owner.key || owner.sessionId}`);
      this.recompute(owner);
      this.ctx.notify(owner.sessionId, 'good', `${p.name} liked your racetrack!`);
      this.ctx.notify(p.sessionId, 'good', `You liked ${owner.name}'s racetrack`);
      this.fx({ k: 'like', x: p.motion.x, y: p.motion.y + 2, z: p.motion.z, by: p.sessionId });
      this.ctx.broadcast(MessageType.Track, this.trackMessage(owner));
      this.sendProfile(p);
      return;
    }
    if (typeof m?.code === 'string') {
      const code = m.code;
      void gallery
        .like(code, who)
        .then((ok) => {
          if (!this.players.has(p.sessionId)) return;
          p.liked.add(`code:${code}`);
          this.ctx.notify(p.sessionId, ok ? 'good' : 'info', ok ? 'Liked!' : 'You already liked this track');
          this.sendProfile(p);
        })
        .catch(() => this.ctx.notify(p.sessionId, 'bad', 'Could not reach the gallery right now'));
    }
  }

  publish(p: Player, m: { name?: unknown; desc?: unknown }): void {
    if (p.pieces.length < 4) return this.ctx.notify(p.sessionId, 'bad', 'Build at least 3 pieces of track before publishing');
    if (!p.spend(4)) return;
    const name = cleanText(m?.name, 24);
    const desc = cleanText(m?.desc, 140);
    void gallery
      .publish(p.code, p.key || `guest:${p.sessionId}`, p.name, name, desc, packPieces(p.pieces), packDecor(p.decor))
      .then((code) => {
        if (!this.players.has(p.sessionId)) return;
        p.code = code;
        this.ctx.send(p.sessionId, MessageType.Banner, { title: 'Racetrack Published!', sub: `Code: ${code}`, tone: 'gold', seconds: 5 });
        this.sendProfile(p);
        this.ctx.save(p.sessionId);
      })
      .catch(() => this.ctx.notify(p.sessionId, 'bad', 'Could not publish right now - try again'));
  }

  browse(p: Player, m: { tab?: unknown }): void {
    const tab = m?.tab === 'new' || m?.tab === 'liked' || m?.tab === 'visited' || m?.tab === 'mine' ? m.tab : 'hot';
    if (!p.spend(1)) return;
    void gallery
      .list(tab, p.key || `guest:${p.sessionId}`)
      .then(({ items, mine }) => this.ctx.send(p.sessionId, MessageType.Gallery, { tab, items, mine }))
      .catch(() => this.ctx.notify(p.sessionId, 'bad', 'Could not reach the gallery right now'));
  }

  visit(p: Player, m: { code?: unknown }): void {
    if (typeof m?.code !== 'string' || !p.spend(2)) return;
    void gallery
      .get(m.code)
      .then((doc) => {
        if (!this.players.has(p.sessionId)) return;
        if (!doc) return this.ctx.notify(p.sessionId, 'bad', 'No racetrack has that code');
        const laid = adoptLayout(unpackPieces(doc.p), unpackDecor(doc.d));
        const pieces = withStart(laid.pieces);
        p.arena = { code: doc.code, pieces, owner: doc.owner, ownerKey: doc.ownerKey };
        this.ctx.send(p.sessionId, MessageType.Arena, { code: doc.code, name: doc.name, owner: doc.owner, p: packPieces(pieces), d: packDecor(laid.decor) });
        if (doc.ownerKey !== (p.key || `guest:${p.sessionId}`)) void gallery.visit(doc.code).catch(() => undefined);
        if (p.run) this.endRun(p, 'exit', 0);
        this.placeAt(p, ARENA_ENTRY.x, ARENA_ENTRY.y, ARENA_ENTRY.z, ARENA_ENTRY.yaw, 'teleport');
      })
      .catch(() => this.ctx.notify(p.sessionId, 'bad', 'Could not reach the gallery right now'));
  }

  /** Save the layout to a slot, or load one (the current track goes back to the inventory first). */
  slot(p: Player, m: { slot?: unknown; action?: unknown }): void {
    if (!int(m?.slot) || m.slot < 0 || m.slot >= SAVE_SLOTS || p.plot < 0 || !p.spend(2)) return;
    if (p.run) return this.ctx.notify(p.sessionId, 'bad', 'Stop driving first');
    if (m.action === 'save') {
      p.slots[m.slot] = packPieces(p.pieces.slice(1));
      this.ctx.notify(p.sessionId, 'good', `Saved ${p.pieces.length - 1} pieces to Slot ${m.slot + 1}`);
      this.sendProfile(p);
      this.ctx.save(p.sessionId);
      return;
    }
    const saved = adoptLayout(unpackPieces(p.slots[m.slot])).pieces;
    if (!saved.length) return this.ctx.notify(p.sessionId, 'info', 'That slot is empty');
    // Everything back into the inventory, then rebuild from it in order.
    if (p.pieces.length > 1) this.remove(p, { i: 1 });
    let placed = 0;
    for (const piece of saved) {
      const key = itemKeyOf(piece.k);
      if (!key || p.count(key) <= 0) break;
      if (checkPlace(p.pieces, p.decor, piece, p.state.tier) !== null) break;
      p.pieces.push(piece);
      p.piles.push(0);
      p.give(key, -1);
      placed += 1;
    }
    this.ctx.notify(p.sessionId, placed === saved.length ? 'good' : 'info', placed === saved.length ? `Loaded Slot ${m.slot + 1}!` : `Loaded ${placed} of ${saved.length} pieces - buy more track to finish it`);
    this.trackChanged(p);
  }

  // ---------------------------------------------------------------- profile

  sendProfile(p: Player): void {
    const epoch = restockEpoch(Date.now());
    const left = (prefix: string, key: string, stock: number): number => Math.max(0, stock - p.boughtOf(`${prefix}:${key}`, epoch));
    const message: ProfileMessage = {
      inventory: Object.fromEntries(p.inventory),
      decor: Object.fromEntries(p.decorInv),
      cars: Object.fromEntries([...p.cars].map(([k, c]) => [k, { lv: { ...c.lv }, cond: Math.round(c.cond) }])),
      stock: {
        track: Object.fromEntries(TRACK_ITEMS.map((i) => [i.key, left('t', i.key, i.stock)])),
        decor: Object.fromEntries([...decorStocks()].map(([k, n]) => [k, left('d', k, n)])),
        crate: Object.fromEntries(CRATES.map((c) => [c.key, left('c', c.key, c.stock)])),
      },
      restockAt: (epoch + 1) * RESTOCK_SECONDS * 1000,
      pass2x: p.pass2x,
      boostUntil: p.boostUntil,
      giftIn: Math.max(0, Math.ceil(FREE_GIFT_SECONDS - p.giftClock)),
      slots: p.slots.map((s) => Math.floor(s.length / 5)),
      code: p.code,
      liked: [...p.liked],
    };
    this.ctx.send(p.sessionId, MessageType.Profile, message);
  }

  dev(p: Player, m: { cash?: number; tier?: number; piles?: boolean; items?: number; cond?: number; cars?: boolean; endgame?: boolean }): void {
    if (typeof m.cash === 'number' && Number.isFinite(m.cash)) p.state.cash = Math.max(0, Math.floor(m.cash));
    if (typeof m.tier === 'number') p.state.tier = Math.max(0, Math.min(MAX_TIER, Math.floor(m.tier)));
    if (typeof m.items === 'number') for (const i of TRACK_ITEMS) p.give(i.key, m.items);
    if (typeof m.cond === 'number') {
      p.car().cond = Math.max(0, Math.min(100, m.cond));
      p.state.condition = Math.round(p.car().cond);
    }
    if (m.cars) for (const c of CRATES) for (const [key] of c.pool) if (!p.cars.has(key)) p.cars.set(key, { lv: emptyCarLevels(), cond: 100 });
    if (m.endgame) this.devEndgame(p);
    p.state.carsOwned = p.cars.size;
    this.recompute(p);
    if (m.piles || m.endgame) this.fillPiles(p, 99999);
    this.sendProfile(p);
    this.ctx.broadcast(MessageType.Track, this.trackMessage(p));
  }

  /**
   * DEV: the end-game test setup - max base tier, plenty of cash, every car
   * (the fastest one fully upgraded and driven), and the full end-game track
   * (every piece there is) laid on their plot in place of whatever was there.
   */
  private devEndgame(p: Player): void {
    if (p.plot < 0) return;
    if (p.run) this.endRun(p, 'exit', 0);
    p.state.tier = MAX_TIER;
    p.state.cash = Math.max(p.state.cash, 50_000_000);
    for (const c of CRATES) for (const [key] of c.pool) if (!p.cars.has(key)) p.cars.set(key, { lv: emptyCarLevels(), cond: 100 });
    const best = [...p.cars.keys()].sort((a, b) => carDef(b).speed - carDef(a).speed)[0]!;
    const car = p.cars.get(best)!;
    for (const u of CAR_UPGRADES) car.lv[u.key] = u.max;
    car.cond = 100;
    p.state.car = best;
    p.state.condition = 100;
    // Their track and decorations back into the inventory, then the end-game track from it.
    for (const piece of p.pieces.slice(1)) {
      const item = itemKeyOf(piece.k);
      if (item) p.give(item, 1);
    }
    for (const d of p.decor) {
      const def = decorByCode(d.d);
      if (def) p.giveDecor(def.key, 1);
    }
    p.decor = [];
    const { pieces, refused } = layTrack(ENDGAME_TRACK, MAX_TIER);
    if (refused) this.ctx.notify(p.sessionId, 'bad', `End-game track stopped at ${refused}`);
    for (const piece of pieces.slice(1)) {
      const item = itemKeyOf(piece.k);
      if (item) p.give(item, p.count(item) > 0 ? -1 : 0);
    }
    p.pieces = pieces;
    p.piles = pieces.map(() => 0);
    this.chains.delete(p);
    this.trackChanged(p);
    this.ctx.notify(p.sessionId, 'good', `End-game test track laid: ${pieces.length - 1} pieces, every kind`);
  }

  // ---------------------------------------------------------------- clock

  tick(dt: number): void {
    for (const p of this.players.values()) {
      p.refill(dt);
      this.fillPiles(p, dt);
      if (p.state.ready) p.giftClock += dt;
    }
    this.secondClock += dt;
    if (this.secondClock >= 1) {
      this.secondClock = 0;
      for (const p of this.players.values()) {
        const boost = this.moneyBoost(p);
        if (boost !== p.state.boost) {
          this.recompute(p);
          this.sendProfile(p);
        }
        // A run left hanging (the client vanished mid-drive) ends itself.
        if (p.run && Date.now() - p.run.lastAt > 120_000) this.endRun(p, 'exit', 0);
      }
    }
    this.coinClock += dt;
    if (this.coinClock >= COINS_EVERY) {
      this.coinClock = 0;
      if (this.players.size > 0) this.ctx.broadcast(MessageType.Coins, this.coinsMessage());
    }
    this.chat.tick(dt);
  }

  private coinsMessage(): CoinsMessage {
    const plots: CoinsMessage['plots'] = [];
    for (const p of this.players.values()) {
      if (p.plot < 0) continue;
      const chain = this.chains.get(p);
      plots.push({ plot: p.plot, f: p.pieces.map((_, i) => (chain?.connected[i] ? Math.floor(p.piles[i] ?? 0) : 0)), sc: chain ? this.scaleOf(p, chain) : 1 });
    }
    return { plots };
  }

  private fx(m: FxMessage): void {
    this.ctx.broadcast(MessageType.Fx, m);
  }
}

const decorStocks = (): Map<string, number> => {
  const out = new Map<string, number>();
  for (const code of DECOR_CODES) {
    const d = decorByCode(code);
    if (d) out.set(d.key, d.stock);
  }
  return out;
};
const DECOR_CODES: number[] = [];
for (let c = 0; c < 100; c += 1) if (decorByCode(c)) DECOR_CODES.push(c);
void CAR_UPGRADES;
void ARENA;
