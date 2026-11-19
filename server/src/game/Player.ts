import {
  CAR_UPGRADES,
  adoptLayout,
  CROUCH_EYE_HEIGHT,
  DECORS,
  EYE_HEIGHT,
  MAX_TIER,
  SAVE_SLOTS,
  STARTER_CAR,
  STARTER_ITEMS,
  STARTING_CASH,
  TRACK_ITEMS,
  createMotion,
  createSimEvents,
  createSimParams,
  emptyCarLevels,
  isCarKey,
  packDecor,
  packPieces,
  unpackDecor,
  unpackPieces,
  withStart,
  type BodyMotion,
  type CarLevels,
  type Decor,
  type MovementInput,
  type Piece,
  type SimEvents,
  type SimParams,
  type TrackPath,
} from '@race/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/** One owned car on the server. */
export interface Car {
  lv: CarLevels;
  cond: number;
}

/** What a player's game saves (the `players` document). */
export interface PlayerSave {
  v: 2;
  cash: number;
  tier: number;
  inventory: Record<string, number>;
  decor: Record<string, number>;
  cars: Record<string, { lv: Partial<CarLevels>; cond: number }>;
  car: string;
  pass2x: boolean;
  boostUntil: number;
  /** Seconds played toward the next free gift. */
  giftClock: number;
  /** Shop stock bought this restock (epoch and counts). */
  epoch: number;
  bought: Record<string, number>;
  bestAir: number;
  /** Save slots: packed pieces each ([] empty). */
  slots: number[][];
  /** The code of their published track ('' none). */
  code: string;
  /** When they left (epoch ms), for offline earnings. */
  leftAt: number;
}

/** Their track (the `tracks` document): pieces, decorations, piles, likes. */
export interface TrackSave {
  p: number[];
  d: number[];
  piles: number[];
  likes: number;
  visits: number;
  /** Who liked it (profile keys or session names, capped). */
  likers: string[];
}

/** A run in progress (server only). */
export interface Run {
  id: number;
  plot: number;
  /** Their own track (piles collected) or a visit (tips). */
  own: boolean;
  path: TrackPath;
  /** Chain order position of the last piece reached, lap, and when. */
  lastK: number;
  lap: number;
  lastAt: number;
  startedAt: number;
  collected: number;
  /** Visits: when each piece was last tipped (no farming). */
  tipped: Map<number, number>;
  /** The car's top speed this run, for plausibility checks. */
  speed: number;
  cash: number;
  ended: boolean;
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

/**
 * ONE PLAYER on the server: the replicated `PlayerState` plus everything only
 * the server holds - the body simulation, inventories, cars, stock, their
 * track and its cash piles, the run in progress.
 */
export class Player {
  readonly motion: BodyMotion = createMotion();
  readonly params: SimParams = createSimParams();
  readonly events: SimEvents = createSimEvents();
  input: MovementInput = { moveX: 0, moveZ: 0, cameraYaw: 0, jump: false, sprint: false, crouch: false, face: false };
  inventory = new Map<string, number>();
  decorInv = new Map<string, number>();
  cars = new Map<string, Car>();
  pass2x = false;
  boostUntil = 0;
  giftClock = 0;
  epoch = 0;
  bought = new Map<string, number>();
  slots: number[][] = [];
  code = '';
  leftAt = 0;
  /** Their track, Start Gate first (canonical tiles), its decorations, and cash piled on each piece. */
  pieces: Piece[] = withStart([]);
  decor: Decor[] = [];
  piles: number[] = [0];
  likers: string[] = [];
  run: Run | null = null;
  /** Published tracks / plots they liked this session. */
  liked = new Set<string>();
  /** The published track loaded on their Showcase. */
  arena: { code: string; pieces: Piece[]; owner: string; ownerKey: string } | null = null;
  lastSeq = 0;
  budget = 0;
  lastRefill = Date.now();
  nextChat = 0;
  actions = 20;
  carry = 0;
  lastPose = 0;

  constructor(
    readonly sessionId: string,
    readonly state: PlayerState,
    public key: string,
  ) {}

  get name(): string {
    return this.state.displayName || this.state.username || 'Player';
  }

  get plot(): number {
    return this.state.plot;
  }

  eye(): { x: number; y: number; z: number } {
    return { x: this.motion.x, y: this.motion.y + (this.motion.crouched ? CROUCH_EYE_HEIGHT : EYE_HEIGHT), z: this.motion.z };
  }

  count(key: string): number {
    return this.inventory.get(key) ?? 0;
  }

  give(key: string, n: number): void {
    this.inventory.set(key, Math.max(0, Math.min(99999, this.count(key) + n)));
  }

  decorCount(key: string): number {
    return this.decorInv.get(key) ?? 0;
  }

  giveDecor(key: string, n: number): void {
    this.decorInv.set(key, Math.max(0, Math.min(99999, this.decorCount(key) + n)));
  }

  /** The car they drive (always one they own). */
  car(): Car {
    let c = this.cars.get(this.state.car);
    if (!c) {
      this.state.car = STARTER_CAR;
      c = this.cars.get(STARTER_CAR)!;
    }
    return c;
  }

  /** Stock bought this restock of one shop item ('t:', 'd:', 'c:' prefixed keys). */
  boughtOf(key: string, epoch: number): number {
    if (epoch !== this.epoch) {
      this.epoch = epoch;
      this.bought.clear();
    }
    return this.bought.get(key) ?? 0;
  }

  spend(cost = 1): boolean {
    if (this.actions < cost) return false;
    this.actions -= cost;
    return true;
  }

  refill(dt: number): void {
    this.actions = Math.min(24, this.actions + dt * 12);
  }

  publishMotion(): void {
    const m = this.motion;
    const s = this.state;
    s.x = m.x;
    s.y = m.y;
    s.z = m.z;
    s.rotationY = m.yaw;
    s.velocityX = m.vx;
    s.velocityY = m.vy;
    s.velocityZ = m.vz;
    s.grounded = m.grounded;
    s.sprinting = m.sprinting;
    s.crouched = m.crouched;
    s.fallStart = m.fallStart;
  }

  toSave(): PlayerSave {
    const s = this.state;
    return {
      v: 2,
      cash: Math.floor(s.cash),
      tier: s.tier,
      inventory: Object.fromEntries([...this.inventory].filter(([, n]) => n > 0)),
      decor: Object.fromEntries([...this.decorInv].filter(([, n]) => n > 0)),
      cars: Object.fromEntries([...this.cars].map(([k, c]) => [k, { lv: { ...c.lv }, cond: Math.round(c.cond) }])),
      car: s.car,
      pass2x: this.pass2x,
      boostUntil: this.boostUntil,
      giftClock: Math.floor(this.giftClock),
      epoch: this.epoch,
      bought: Object.fromEntries(this.bought),
      bestAir: Math.round(s.bestAir * 10) / 10,
      slots: this.slots.map((sl) => [...sl]),
      code: this.code,
      leftAt: Date.now(),
    };
  }

  toTrack(): TrackSave {
    return {
      p: packPieces(this.pieces),
      d: packDecor(this.decor),
      piles: this.piles.map((c) => Math.floor(c)),
      likes: this.state.likes,
      visits: this.state.visits,
      likers: this.likers.slice(-500),
    };
  }

  restore(save: Partial<PlayerSave> | null): void {
    const s = this.state;
    s.cash = save ? Math.floor(num(save.cash)) : STARTING_CASH;
    s.tier = Math.min(MAX_TIER, Math.floor(num(save?.tier)));
    this.inventory = new Map();
    const inv = save?.inventory && typeof save.inventory === 'object' ? save.inventory : save ? {} : STARTER_ITEMS;
    const items = new Set(TRACK_ITEMS.map((i) => i.key));
    for (const [key, n] of Object.entries(inv)) if (items.has(key)) this.inventory.set(key, Math.min(99999, Math.floor(num(n))));
    this.decorInv = new Map();
    const decorKeys = new Set(DECORS.map((d) => d.key));
    for (const [key, n] of Object.entries(save?.decor ?? {})) if (decorKeys.has(key)) this.decorInv.set(key, Math.min(99999, Math.floor(num(n))));
    this.cars = new Map([[STARTER_CAR, { lv: emptyCarLevels(), cond: 100 }]]);
    for (const [key, raw] of Object.entries(save?.cars ?? {})) {
      if (!isCarKey(key) || !raw || typeof raw !== 'object') continue;
      const lv = emptyCarLevels();
      for (const u of CAR_UPGRADES) lv[u.key] = Math.min(u.max, Math.floor(num((raw.lv as Record<string, unknown> | undefined)?.[u.key])));
      this.cars.set(key, { lv, cond: Math.min(100, num(raw.cond, 100)) });
    }
    s.car = typeof save?.car === 'string' && this.cars.has(save.car) ? save.car : STARTER_CAR;
    s.carsOwned = this.cars.size;
    s.condition = Math.round(this.car().cond);
    this.pass2x = save?.pass2x === true;
    this.boostUntil = num(save?.boostUntil);
    this.giftClock = num(save?.giftClock);
    this.epoch = Math.floor(num(save?.epoch));
    this.bought = new Map(Object.entries(save?.bought ?? {}).map(([k, n]) => [k, Math.floor(num(n))]));
    s.bestAir = num(save?.bestAir);
    this.slots = Array.from({ length: SAVE_SLOTS }, (_, i) => (Array.isArray(save?.slots?.[i]) ? save!.slots![i]!.filter((n) => Number.isInteger(n)).slice(0, 5 * 120) : []));
    this.code = typeof save?.code === 'string' ? save.code.slice(0, 8) : '';
    this.leftAt = num(save?.leftAt);
  }

  restoreTrack(raw: unknown): void {
    const doc = raw && typeof raw === 'object' ? (raw as Partial<TrackSave>) : null;
    // Tracks from before the Start Gate moved beside the entrance arch are shifted to leave it the same way.
    const laid = adoptLayout(unpackPieces(doc?.p), unpackDecor(doc?.d));
    this.pieces = withStart(laid.pieces);
    this.decor = laid.decor;
    const piles = Array.isArray(doc?.piles) ? doc.piles : [];
    this.piles = this.pieces.map((_, i) => num(piles[i]));
    this.state.likes = Math.floor(num(doc?.likes));
    this.state.visits = Math.floor(num(doc?.visits));
    this.likers = Array.isArray(doc?.likers) ? doc.likers.filter((x): x is string => typeof x === 'string').slice(-500) : [];
  }
}
