/**
 * THE ECONOMY: every price, rate, stock, unlock and multiplier in Build A
 * Racetrack. The shop windows read these tables and the server charges
 * exactly these; nothing about money is written anywhere else.
 *
 * THE LOOP. Buy track pieces at the Track Shop (limited stock, restocked
 * every few minutes), snap them onto the glowing end of your track, and every
 * piece CONNECTED to your Start Gate piles up cash ($/s, up to a cap). Drive
 * your car over the track to grab the piles, launch off the end for air-time
 * bonuses, and come back to cash that kept piling up while you were away.
 * Cars come from crates; better cars are faster and multiply what they
 * collect. Crashes wear cars down (repair them at your Pit Stop). Upgrading
 * your Base unlocks pieces, crates, decorations and a bigger plot; a Rebirth
 * trades it all in for a permanent multiplier.
 */

// ---------------------------------------------------------------- rarity

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const RARITIES: Readonly<Record<Rarity, { name: string; color: number }>> = {
  common: { name: 'Common', color: 0xb8c2cc },
  uncommon: { name: 'Uncommon', color: 0x5bd35b },
  rare: { name: 'Rare', color: 0x3fa2ff },
  epic: { name: 'Epic', color: 0xb15cff },
  legendary: { name: 'Legendary', color: 0xffb21f },
  mythic: { name: 'Mythic', color: 0xff3d8b },
};

// ---------------------------------------------------------------- track shapes

/** Every piece SHAPE a track can hold (what is saved). Turns come in mirrored pairs. */
export type ShapeKey =
  | 'start'
  | 'straight'
  | 'turn_r'
  | 'turn_l'
  | 'bumpy'
  | 'climb'
  | 'drop'
  | 'uturn_r'
  | 'uturn_l'
  | 'finish'
  | 'bump'
  | 'swerve_r'
  | 'swerve_l'
  | 'cliff'
  | 'upturn_r'
  | 'upturn_l'
  | 'wide_r'
  | 'wide_l'
  | 'boost'
  | 'jump'
  | 'loop'
  | 'mega'
  | 'corkscrew'
  | 'rainbow'
  | 'golden';

/**
 * A TRACK ITEM: what the Track Shop sells and the inventory holds. Placing it
 * puts down one of its shapes (R flips a turn's direction).
 */
export interface TrackItem {
  readonly key: string;
  readonly name: string;
  readonly blurb: string;
  /** Shapes it can be placed as: [default, flipped]. */
  readonly shapes: readonly [ShapeKey] | readonly [ShapeKey, ShapeKey];
  readonly price: number;
  /** Cash a connected piece piles up per second (before multipliers). */
  readonly rate: number;
  readonly rarity: Rarity;
  /** Base Upgrade needed to buy it (0 = from the start). */
  readonly tier: number;
  /** How many the shop holds per restock. */
  readonly stock: number;
  /** Swatch colour (shop cards, hotbar). */
  readonly color: number;
}

export const TRACK_ITEMS: readonly TrackItem[] = [
  { key: 'straight', name: 'Straight Track', blurb: 'A plain stretch of road.', shapes: ['straight'], price: 25, rate: 1, rarity: 'common', tier: 0, stock: 12, color: 0x4b4f63 },
  { key: 'turn', name: 'Sharp Turn Track', blurb: 'A tight quarter turn. R flips it.', shapes: ['turn_l', 'turn_r'], price: 55, rate: 3, rarity: 'common', tier: 0, stock: 8, color: 0x4b4f63 },
  { key: 'bumpy', name: 'Bumpy Road Track', blurb: 'Rumble strips that rattle your teeth.', shapes: ['bumpy'], price: 165, rate: 6, rarity: 'common', tier: 0, stock: 8, color: 0xd94a4a },
  { key: 'climb', name: 'Climb Track', blurb: 'Climbs one level.', shapes: ['climb'], price: 275, rate: 10, rarity: 'common', tier: 0, stock: 7, color: 0x5a6aa8 },
  { key: 'drop', name: 'Drop Track', blurb: 'Drops one level.', shapes: ['drop'], price: 300, rate: 11, rarity: 'common', tier: 0, stock: 7, color: 0x5a6aa8 },
  { key: 'finish', name: 'Finish Line', blurb: 'End your track here for a +25% run bonus.', shapes: ['finish'], price: 450, rate: 8, rarity: 'uncommon', tier: 0, stock: 2, color: 0xf2f2f2 },
  { key: 'uturn', name: 'Tight U-Turn Track', blurb: 'Turns right round over two tiles. R flips it.', shapes: ['uturn_l', 'uturn_r'], price: 1100, rate: 22, rarity: 'uncommon', tier: 0, stock: 5, color: 0xff8a2a },
  { key: 'bump', name: 'Bump Track', blurb: 'A hump that throws you into the air.', shapes: ['bump'], price: 1900, rate: 38, rarity: 'uncommon', tier: 1, stock: 6, color: 0xffc42a },
  { key: 'swerve', name: 'Swerve Track', blurb: 'An S-bend over two tiles. R flips it.', shapes: ['swerve_l', 'swerve_r'], price: 2700, rate: 50, rarity: 'uncommon', tier: 1, stock: 5, color: 0x4fd36a },
  { key: 'cliff', name: 'Cliff Drop Track', blurb: 'Plunges two levels at once.', shapes: ['cliff'], price: 4400, rate: 75, rarity: 'rare', tier: 1, stock: 5, color: 0x8a5a3a },
  { key: 'upturn', name: 'Uphill Turn Track', blurb: 'Turns and climbs a level. R flips it.', shapes: ['upturn_l', 'upturn_r'], price: 7700, rate: 120, rarity: 'rare', tier: 2, stock: 4, color: 0x3fa2ff },
  { key: 'wide', name: 'Banked Curve Track', blurb: 'A sweeping banked turn over 2x2 tiles. R flips it.', shapes: ['wide_l', 'wide_r'], price: 12000, rate: 170, rarity: 'rare', tier: 2, stock: 4, color: 0x2fd3c4 },
  { key: 'boost', name: 'Boost Pad Track', blurb: 'Rockets you forward. Collects double!', shapes: ['boost'], price: 18000, rate: 240, rarity: 'rare', tier: 2, stock: 4, color: 0x7dff4a },
  { key: 'jump', name: 'Ramp Jump Track', blurb: 'A kicker, a gap and a landing over three tiles.', shapes: ['jump'], price: 30000, rate: 380, rarity: 'epic', tier: 3, stock: 3, color: 0xff5ab4 },
  { key: 'loop', name: 'Loop Track', blurb: 'A full loop-the-loop over two tiles.', shapes: ['loop'], price: 55000, rate: 650, rarity: 'epic', tier: 3, stock: 3, color: 0xb15cff },
  { key: 'mega', name: 'Mega Ramp Track', blurb: 'Climbs three levels over two tiles.', shapes: ['mega'], price: 90000, rate: 1000, rarity: 'epic', tier: 4, stock: 3, color: 0xff6a2a },
  { key: 'corkscrew', name: 'Corkscrew Track', blurb: 'A barrel roll over two tiles.', shapes: ['corkscrew'], price: 160000, rate: 1700, rarity: 'legendary', tier: 4, stock: 2, color: 0xffd23f },
  { key: 'rainbow', name: 'Rainbow Road Track', blurb: 'Glowing, gorgeous and very lucrative.', shapes: ['rainbow'], price: 300000, rate: 3000, rarity: 'legendary', tier: 5, stock: 2, color: 0xff4fd8 },
  { key: 'golden', name: 'Golden Track', blurb: 'Solid gold road. The best there is.', shapes: ['golden'], price: 800000, rate: 7500, rarity: 'mythic', tier: 5, stock: 2, color: 0xffcf3a },
];

const ITEM_BY_KEY = new Map(TRACK_ITEMS.map((i) => [i.key, i]));
export const trackItem = (key: string): TrackItem | undefined => ITEM_BY_KEY.get(key);
const ITEM_BY_SHAPE = new Map<ShapeKey, TrackItem>();
for (const item of TRACK_ITEMS) for (const s of item.shapes) ITEM_BY_SHAPE.set(s, item);
/** The item a placed shape came from (null: the Start Gate). */
export const itemOfShape = (k: ShapeKey): TrackItem | null => ITEM_BY_SHAPE.get(k) ?? null;
/** Income a placed shape piles per second, before multipliers. */
export const shapeRate = (k: ShapeKey): number => ITEM_BY_SHAPE.get(k)?.rate ?? 0;

/** Packed into track messages and saves: never renumber. */
export const SHAPE_CODES: Readonly<Record<ShapeKey, number>> = {
  start: 0,
  straight: 1,
  turn_r: 2,
  turn_l: 3,
  bumpy: 4,
  climb: 5,
  drop: 6,
  uturn_r: 7,
  uturn_l: 8,
  finish: 9,
  bump: 10,
  swerve_r: 11,
  swerve_l: 12,
  cliff: 13,
  upturn_r: 14,
  upturn_l: 15,
  wide_r: 16,
  wide_l: 17,
  boost: 18,
  jump: 19,
  loop: 20,
  mega: 21,
  corkscrew: 22,
  rainbow: 23,
  golden: 24,
};
const SHAPE_BY_CODE = new Map(Object.entries(SHAPE_CODES).map(([k, c]) => [c, k as ShapeKey]));
export const shapeByCode = (code: number): ShapeKey | undefined => SHAPE_BY_CODE.get(code);

/** A new player's inventory: enough for a first little track. */
export const STARTER_ITEMS: Readonly<Record<string, number>> = { straight: 4, turn: 1 };
export const STARTING_CASH = 35;

// ---------------------------------------------------------------- restock

/** Shops restock every this many seconds (one clock for everybody). */
export const RESTOCK_SECONDS = 300;
export const restockEpoch = (nowMs: number): number => Math.floor(nowMs / 1000 / RESTOCK_SECONDS);
export const restockLeft = (nowMs: number): number => RESTOCK_SECONDS - ((nowMs / 1000) % RESTOCK_SECONDS);

// ---------------------------------------------------------------- base upgrades

export interface BaseTier {
  readonly tier: number;
  readonly name: string;
  /** Cost to reach this tier from the one below (0 for tier 0). */
  readonly cost: number;
  /** Most pieces (Start Gate not counted) on the track. */
  readonly length: number;
  /** Plot rows of tiles open to build on (centred on the Start Gate; see `openRows`). */
  readonly rows: number;
  /** Highest level track may reach. */
  readonly height: number;
  /** Seconds of income a pile holds. */
  readonly pile: number;
}

export const BASE_TIERS: readonly BaseTier[] = [
  { tier: 0, name: 'Dirt Lot', cost: 0, length: 25, rows: 10, height: 2, pile: 90 },
  { tier: 1, name: 'Local Circuit', cost: 6000, length: 40, rows: 13, height: 3, pile: 120 },
  { tier: 2, name: 'Racing Club', cost: 60000, length: 55, rows: 16, height: 4, pile: 150 },
  { tier: 3, name: 'Speedway', cost: 450000, length: 70, rows: 19, height: 5, pile: 180 },
  { tier: 4, name: 'Grand Prix', cost: 3000000, length: 85, rows: 22, height: 6, pile: 240 },
  { tier: 5, name: 'World Champion', cost: 20000000, length: 100, rows: 22, height: 7, pile: 300 },
];
export const MAX_TIER = BASE_TIERS.length - 1;
export const baseTier = (tier: number): BaseTier => BASE_TIERS[Math.max(0, Math.min(MAX_TIER, Math.floor(tier)))]!;

// ---------------------------------------------------------------- rebirth

export const MAX_REBIRTHS = 30;
/** Every rebirth adds this to the income multiplier. */
export const REBIRTH_BONUS = 0.5;
export const rebirthScale = (rebirths: number): number => 1 + rebirths * REBIRTH_BONUS;
export const rebirthCost = (rebirths: number): number => Math.round(1_000_000 * Math.pow(3, rebirths));
/** The Base Upgrade a rebirth needs. */
export const REBIRTH_TIER = 3;

// ---------------------------------------------------------------- income

/** A track that comes back into its Start Gate (a circuit) earns this much more. */
export const CIRCUIT_BONUS = 1.5;
/** Cash collected from a Boost Pad's pile counts double. */
export const BOOST_COLLECT = 2;
/** Finishing a run on a Finish Line pays this share of the run again. */
export const FINISH_BONUS = 0.25;
/** Each placed decoration adds this much income, up to DECOR_BONUS_MAX. */
export const DECOR_BONUS = 0.01;
export const DECOR_BONUS_MAX = 0.3;
/** Each Like on your track adds this much income, up to LIKE_BONUS_MAX. */
export const LIKE_BONUS = 0.01;
export const LIKE_BONUS_MAX = 0.25;
/** Offline: this share of the income rate is paid for time away, up to OFFLINE_MAX_HOURS. */
export const OFFLINE_SHARE = 0.5;
export const OFFLINE_MAX_HOURS = 8;
export const OFFLINE_MIN_SECONDS = 60;
/** Visiting someone else's track pays this many seconds of each piece's income (piles stay theirs). */
export const VISIT_TIP_SECONDS = 4;
/** The owner gets this share of what visitors earn on their track. */
export const VISIT_OWNER_SHARE = 0.1;
/** Air time pays this many seconds of the track's income per second airborne. */
export const AIR_PAY_SECONDS = 2;
export const MAX_AIR_SECONDS = 6;

/** The whole income multiplier of a track: rebirths, circuit, decorations, likes, the money pass and boosts. */
export const incomeScale = (o: { rebirths: number; closed: boolean; decor: number; likes: number; boost: number }): number =>
  rebirthScale(o.rebirths) *
  (o.closed ? CIRCUIT_BONUS : 1) *
  (1 + Math.min(DECOR_BONUS_MAX, o.decor * DECOR_BONUS)) *
  (1 + Math.min(LIKE_BONUS_MAX, o.likes * LIKE_BONUS)) *
  o.boost;

// ---------------------------------------------------------------- cars

export type CarStyle = 'kart' | 'buggy' | 'formula' | 'muscle' | 'monster' | 'shark' | 'croc' | 'bee' | 'rocket' | 'ufo' | 'neon' | 'gold' | 'truck' | 'dino';

export interface CarDef {
  readonly key: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly style: CarStyle;
  /** Body, trim, accent. */
  readonly colors: readonly [number, number, number];
  /** Top speed, units / s. */
  readonly speed: number;
  /** Acceleration, units / s^2. */
  readonly accel: number;
  /** Steering and grip, 1 = average. */
  readonly handling: number;
  /** Cash collected per cash on the track. */
  readonly cash: number;
  /** What the car is worth (repairs and upgrades scale with it). */
  readonly value: number;
}

export const CARS: readonly CarDef[] = [
  // Starter (everybody owns it)
  { key: 'kart', name: 'Go-Kart', rarity: 'common', style: 'kart', colors: [0x3fa2ff, 0xffd23f, 0x2b2f45], speed: 18, accel: 14, handling: 1, cash: 1, value: 100 },
  // Starter Crate
  { key: 'buggy', name: 'Dune Buggy', rarity: 'common', style: 'buggy', colors: [0xff8a2a, 0x2b2f45, 0xffe14a], speed: 19, accel: 15, handling: 1.05, cash: 1.2, value: 400 },
  { key: 'redkart', name: 'Red Racer', rarity: 'uncommon', style: 'kart', colors: [0xe8352e, 0xffffff, 0x2b2f45], speed: 20, accel: 16, handling: 1.1, cash: 1.4, value: 700 },
  { key: 'minif', name: 'Mini Formula', rarity: 'rare', style: 'formula', colors: [0x2fd36a, 0xffffff, 0x1f2230], speed: 22, accel: 18, handling: 1.15, cash: 1.7, value: 1500 },
  { key: 'rocketkart', name: 'Rocket Kart', rarity: 'epic', style: 'rocket', colors: [0xdfe6ee, 0xff3b3b, 0x3a7bea], speed: 24, accel: 21, handling: 1.1, cash: 2.2, value: 3000 },
  // Turbo Crate
  { key: 'muscle', name: 'Muscle Car', rarity: 'common', style: 'muscle', colors: [0x8a2be2, 0xffd23f, 0x1f2230], speed: 23, accel: 18, handling: 1, cash: 2, value: 4000 },
  { key: 'hotrod', name: 'Hot Rod', rarity: 'uncommon', style: 'muscle', colors: [0x1f2230, 0xff7a1a, 0xffd23f], speed: 24, accel: 20, handling: 1.05, cash: 2.4, value: 6500 },
  { key: 'f1blue', name: 'Blue Bolt F1', rarity: 'rare', style: 'formula', colors: [0x1f5fff, 0xffffff, 0xffd23f], speed: 27, accel: 23, handling: 1.25, cash: 3, value: 12000 },
  { key: 'turbobuggy', name: 'Turbo Buggy', rarity: 'epic', style: 'buggy', colors: [0x2fd3c4, 0xff4fb8, 0x1f2230], speed: 28, accel: 25, handling: 1.2, cash: 3.8, value: 20000 },
  // Animal Kingdom Crate
  { key: 'bee', name: 'Bumble Bee', rarity: 'common', style: 'bee', colors: [0xffd23f, 0x1f2230, 0xffffff], speed: 26, accel: 21, handling: 1.15, cash: 3.5, value: 22000 },
  { key: 'croc', name: 'Croc Cruiser', rarity: 'uncommon', style: 'croc', colors: [0x3fae3a, 0x9ee05a, 0xffffff], speed: 27, accel: 22, handling: 1.1, cash: 4.2, value: 32000 },
  { key: 'shark', name: 'Shark Attack', rarity: 'rare', style: 'shark', colors: [0x6f8fa8, 0xf2f4f7, 0xe8352e], speed: 30, accel: 25, handling: 1.2, cash: 5.2, value: 55000 },
  { key: 'dino', name: 'Dino Dasher', rarity: 'legendary', style: 'dino', colors: [0x58d36a, 0xff8a2a, 0x2b2f45], speed: 33, accel: 28, handling: 1.25, cash: 7, value: 120000 },
  // Monster Mayhem Crate
  { key: 'monster', name: 'Monster Truck', rarity: 'common', style: 'monster', colors: [0xe8352e, 0x1f2230, 0xffd23f], speed: 28, accel: 24, handling: 1, cash: 5, value: 60000 },
  { key: 'bigfoot', name: 'Bigfoot', rarity: 'uncommon', style: 'monster', colors: [0x3a7bea, 0xffffff, 0xff4a3a], speed: 29, accel: 26, handling: 1.05, cash: 6, value: 85000 },
  { key: 'toxic', name: 'Toxic Crusher', rarity: 'rare', style: 'monster', colors: [0x7dff4a, 0x1f2230, 0xb15cff], speed: 31, accel: 28, handling: 1.1, cash: 7.5, value: 140000 },
  { key: 'hauler', name: 'Big Hauler', rarity: 'epic', style: 'truck', colors: [0xffc42a, 0x2b2f45, 0xe8352e], speed: 32, accel: 30, handling: 1.1, cash: 9, value: 220000 },
  // Street Racer Crate
  { key: 'street', name: 'Street Tuner', rarity: 'common', style: 'muscle', colors: [0xff4fb8, 0xffffff, 0x1f2230], speed: 32, accel: 28, handling: 1.2, cash: 9, value: 260000 },
  { key: 'f1red', name: 'Scarlet F1', rarity: 'rare', style: 'formula', colors: [0xe8352e, 0xffffff, 0x1f2230], speed: 36, accel: 33, handling: 1.4, cash: 12, value: 500000 },
  { key: 'neonrider', name: 'Neon Rider', rarity: 'epic', style: 'neon', colors: [0x1f2230, 0x3affff, 0xff4fd8], speed: 37, accel: 34, handling: 1.35, cash: 14, value: 750000 },
  { key: 'goldbuggy', name: 'Gold Buggy', rarity: 'legendary', style: 'buggy', colors: [0xffcf3a, 0xfff2b3, 0x8a5a12], speed: 38, accel: 35, handling: 1.3, cash: 17, value: 1100000 },
  // Space Crate
  { key: 'rover', name: 'Moon Rover', rarity: 'common', style: 'buggy', colors: [0xdfe6ee, 0x3a7bea, 0xffd23f], speed: 37, accel: 34, handling: 1.3, cash: 16, value: 1300000 },
  { key: 'ufo', name: 'UFO Racer', rarity: 'rare', style: 'ufo', colors: [0x9aa8b8, 0x7dff4a, 0xb15cff], speed: 41, accel: 38, handling: 1.45, cash: 22, value: 2500000 },
  { key: 'rocket', name: 'Star Rocket', rarity: 'epic', style: 'rocket', colors: [0xffffff, 0xff3b3b, 0x1f5fff], speed: 44, accel: 42, handling: 1.4, cash: 27, value: 4000000 },
  { key: 'galaxy', name: 'Galaxy Cruiser', rarity: 'mythic', style: 'neon', colors: [0x3a1a7a, 0xff4fd8, 0x3affff], speed: 48, accel: 46, handling: 1.55, cash: 36, value: 7000000 },
  // Golden Crate
  { key: 'goldkart', name: 'Golden Kart', rarity: 'rare', style: 'gold', colors: [0xffcf3a, 0xfff2b3, 0x8a5a12], speed: 46, accel: 44, handling: 1.5, cash: 34, value: 8000000 },
  { key: 'goldf1', name: 'Golden F1', rarity: 'epic', style: 'formula', colors: [0xffcf3a, 0xffffff, 0x8a5a12], speed: 50, accel: 48, handling: 1.6, cash: 45, value: 14000000 },
  { key: 'goldmonster', name: 'Golden Monster', rarity: 'legendary', style: 'monster', colors: [0xffcf3a, 0x1f2230, 0xfff2b3], speed: 52, accel: 50, handling: 1.5, cash: 55, value: 20000000 },
  { key: 'king', name: 'King of the Road', rarity: 'mythic', style: 'gold', colors: [0xffcf3a, 0xe8352e, 0xffffff], speed: 56, accel: 54, handling: 1.7, cash: 75, value: 35000000 },
];
const CAR_BY_KEY = new Map(CARS.map((c) => [c.key, c]));
export const carDef = (key: string): CarDef => CAR_BY_KEY.get(key) ?? CARS[0]!;
export const isCarKey = (key: unknown): key is string => typeof key === 'string' && CAR_BY_KEY.has(key);
export const STARTER_CAR = 'kart';

export interface CrateDef {
  readonly key: string;
  readonly name: string;
  readonly price: number;
  readonly tier: number;
  readonly stock: number;
  /** Colours of the crate model and its card. */
  readonly colors: readonly [number, number];
  /** Car keys and their odds (percent, summing to 100). */
  readonly pool: readonly (readonly [string, number])[];
}

export const CRATES: readonly CrateDef[] = [
  { key: 'starter', name: 'Starter Crate', price: 400, tier: 0, stock: 6, colors: [0x3fa2ff, 0xffd23f], pool: [['buggy', 55], ['redkart', 30], ['minif', 12], ['rocketkart', 3]] },
  { key: 'turbo', name: 'Turbo Crate', price: 5000, tier: 0, stock: 5, colors: [0xff8a2a, 0x1f2230], pool: [['muscle', 55], ['hotrod', 30], ['f1blue', 12], ['turbobuggy', 3]] },
  { key: 'animal', name: 'Animal Kingdom Crate', price: 18000, tier: 1, stock: 4, colors: [0x58d36a, 0xffd23f], pool: [['bee', 55], ['croc', 30], ['shark', 13], ['dino', 2]] },
  { key: 'monster', name: 'Monster Mayhem Crate', price: 45000, tier: 1, stock: 4, colors: [0xe8352e, 0x1f2230], pool: [['monster', 55], ['bigfoot', 30], ['toxic', 12], ['hauler', 3]] },
  { key: 'street', name: 'Street Racer Crate', price: 200000, tier: 2, stock: 3, colors: [0xff4fb8, 0x3affff], pool: [['street', 60], ['f1red', 28], ['neonrider', 10], ['goldbuggy', 2]] },
  { key: 'space', name: 'Space Crate', price: 1000000, tier: 3, stock: 3, colors: [0x3a1a7a, 0x7dff4a], pool: [['rover', 60], ['ufo', 28], ['rocket', 10], ['galaxy', 2]] },
  { key: 'golden', name: 'Golden Crate', price: 6000000, tier: 4, stock: 2, colors: [0xffcf3a, 0xe8352e], pool: [['goldkart', 60], ['goldf1', 28], ['goldmonster', 10], ['king', 2]] },
];
const CRATE_BY_KEY = new Map(CRATES.map((c) => [c.key, c]));
export const crateDef = (key: string): CrateDef | undefined => CRATE_BY_KEY.get(key);

/** Roll a crate: a car key (r in 0..1). */
export const rollCrate = (crate: CrateDef, r: number): string => {
  let acc = 0;
  const x = r * 100;
  for (const [key, odds] of crate.pool) {
    acc += odds;
    if (x < acc) return key;
  }
  return crate.pool[crate.pool.length - 1]![0];
};

// ---------------------------------------------------------------- car upgrades and condition

export type CarStat = 'engine' | 'turbo' | 'tires' | 'armor' | 'cash';

export interface CarUpgradeDef {
  readonly key: CarStat;
  readonly name: string;
  readonly per: string;
  readonly max: number;
  /** Cost of a level as a share of the car's value, times growth^level. */
  readonly share: number;
  readonly growth: number;
}

export const CAR_UPGRADES: readonly CarUpgradeDef[] = [
  { key: 'engine', name: 'Engine', per: '+5% top speed', max: 10, share: 0.25, growth: 1.45 },
  { key: 'turbo', name: 'Turbo', per: '+8% acceleration', max: 10, share: 0.2, growth: 1.45 },
  { key: 'tires', name: 'Tires', per: '+6% grip and steering', max: 10, share: 0.2, growth: 1.45 },
  { key: 'armor', name: 'Armor', per: '-8% crash damage', max: 8, share: 0.3, growth: 1.5 },
  { key: 'cash', name: 'Cash Tuning', per: '+6% cash collected', max: 10, share: 0.4, growth: 1.55 },
];
export const carUpgradeDef = (key: string): CarUpgradeDef | undefined => CAR_UPGRADES.find((u) => u.key === key);
export type CarLevels = Record<CarStat, number>;
export const emptyCarLevels = (): CarLevels => ({ engine: 0, turbo: 0, tires: 0, armor: 0, cash: 0 });
export const carUpgradeCost = (car: CarDef, stat: CarStat, level: number): number => {
  const u = carUpgradeDef(stat)!;
  return Math.max(10, Math.round((car.value * u.share * Math.pow(u.growth, level)) / 5) * 5);
};

/** A car's driving numbers with its upgrades and its condition (0..100). */
export interface CarStats {
  speed: number;
  accel: number;
  handling: number;
  cash: number;
  armor: number;
}

export const carStats = (car: CarDef, lv: CarLevels, condition: number): CarStats => {
  const worn = condition >= 50 ? 1 : 0.6 + (0.4 * Math.max(0, condition)) / 50;
  return {
    speed: car.speed * (1 + lv.engine * 0.05) * worn,
    accel: car.accel * (1 + lv.turbo * 0.08) * worn,
    handling: car.handling * (1 + lv.tires * 0.06),
    cash: car.cash * (1 + lv.cash * 0.06) * (condition >= 25 ? 1 : 0.75),
    armor: Math.min(0.64, lv.armor * 0.08),
  };
};

/** Condition a crash takes off (before armor), from the impact speed. */
export const crashDamage = (impact: number, armor: number): number => Math.round(Math.max(4, Math.min(28, 5 + impact * 0.6)) * (1 - armor));
/** What repairing a car to 100% costs. */
export const repairCost = (car: CarDef, condition: number): number => Math.max(5, Math.round(car.value * 0.004 * (100 - condition)));

// ---------------------------------------------------------------- decorations

export type DecorCategory = 'terrain' | 'structure' | 'greenery' | 'decoration';

export interface DecorDef {
  readonly key: string;
  /** Packed into saves: never renumber. */
  readonly code: number;
  readonly name: string;
  readonly category: DecorCategory;
  readonly price: number;
  readonly rarity: Rarity;
  readonly tier: number;
  readonly stock: number;
  /** Cells it covers along its facing and across (2-unit cells). */
  readonly size: readonly [number, number];
  /** Flat (a pad on the ground: track may NOT cross, but it never blocks the car view). */
  readonly flat?: boolean;
  readonly color: number;
}

export const DECORS: readonly DecorDef[] = [
  // Terrain
  { key: 'dirtpad', code: 1, name: 'Dirt Pad', category: 'terrain', price: 100, rarity: 'common', tier: 0, stock: 14, size: [1, 1], flat: true, color: 0x9a6a3e },
  { key: 'sandpad', code: 2, name: 'Sand Pad', category: 'terrain', price: 100, rarity: 'common', tier: 0, stock: 12, size: [1, 1], flat: true, color: 0xf0d58a },
  { key: 'grasspad', code: 3, name: 'Flower Meadow', category: 'terrain', price: 120, rarity: 'common', tier: 0, stock: 12, size: [1, 1], flat: true, color: 0x5ee048 },
  { key: 'stonetile', code: 4, name: 'Stone Tile', category: 'terrain', price: 120, rarity: 'common', tier: 0, stock: 14, size: [1, 1], flat: true, color: 0xb8b8c2 },
  { key: 'rock', code: 5, name: 'Rock', category: 'terrain', price: 150, rarity: 'common', tier: 0, stock: 10, size: [1, 1], color: 0x9a9aa8 },
  { key: 'pond', code: 6, name: 'Pond', category: 'terrain', price: 900, rarity: 'uncommon', tier: 1, stock: 4, size: [2, 2], flat: true, color: 0x3fc8ff },
  // Structure
  { key: 'woodfence', code: 20, name: 'Wood Fence', category: 'structure', price: 150, rarity: 'common', tier: 0, stock: 16, size: [1, 1], color: 0x9a6232 },
  { key: 'barrier', code: 21, name: 'Race Barrier', category: 'structure', price: 250, rarity: 'common', tier: 0, stock: 14, size: [1, 1], color: 0xe8352e },
  { key: 'tirewall', code: 22, name: 'Tire Wall', category: 'structure', price: 300, rarity: 'common', tier: 0, stock: 12, size: [1, 1], color: 0x2b2f45 },
  { key: 'lightpost', code: 23, name: 'Light Post', category: 'structure', price: 600, rarity: 'uncommon', tier: 0, stock: 8, size: [1, 1], color: 0x3a3f55 },
  { key: 'metalfence', code: 24, name: 'Metal Fence', category: 'structure', price: 800, rarity: 'uncommon', tier: 1, stock: 12, size: [1, 1], color: 0xa8b4c8 },
  { key: 'billboard', code: 25, name: 'Billboard', category: 'structure', price: 2500, rarity: 'rare', tier: 1, stock: 4, size: [1, 2], color: 0xff4fb8 },
  { key: 'grandstand', code: 26, name: 'Grandstand', category: 'structure', price: 6000, rarity: 'rare', tier: 2, stock: 3, size: [2, 3], color: 0x3fa2ff },
  { key: 'tower', code: 27, name: 'Control Tower', category: 'structure', price: 15000, rarity: 'epic', tier: 3, stock: 2, size: [2, 2], color: 0xf2f4f7 },
  // Greenery
  { key: 'bush', code: 40, name: 'Bush', category: 'greenery', price: 150, rarity: 'common', tier: 0, stock: 14, size: [1, 1], color: 0x3cc234 },
  { key: 'flowers', code: 41, name: 'Flower Bed', category: 'greenery', price: 200, rarity: 'common', tier: 0, stock: 12, size: [1, 1], color: 0xff4fb8 },
  { key: 'oak', code: 42, name: 'Oak Tree', category: 'greenery', price: 400, rarity: 'common', tier: 0, stock: 10, size: [1, 1], color: 0x4fd23e },
  { key: 'pine', code: 43, name: 'Pine Tree', category: 'greenery', price: 450, rarity: 'common', tier: 0, stock: 10, size: [1, 1], color: 0x2fa84a },
  { key: 'palm', code: 44, name: 'Palm Tree', category: 'greenery', price: 900, rarity: 'uncommon', tier: 1, stock: 8, size: [1, 1], color: 0x6fd23e },
  { key: 'blossom', code: 45, name: 'Blossom Tree', category: 'greenery', price: 3000, rarity: 'rare', tier: 2, stock: 5, size: [1, 1], color: 0xffa8d8 },
  // Decoration
  { key: 'cone', code: 60, name: 'Traffic Cone', category: 'decoration', price: 200, rarity: 'common', tier: 0, stock: 14, size: [1, 1], color: 0xff7a1a },
  { key: 'beachball', code: 61, name: 'Beach Ball', category: 'decoration', price: 300, rarity: 'common', tier: 0, stock: 10, size: [1, 1], color: 0xffd23f },
  { key: 'trashcan', code: 62, name: 'Trash Can', category: 'decoration', price: 400, rarity: 'common', tier: 0, stock: 10, size: [1, 1], color: 0x4f8a5a },
  { key: 'barrel', code: 63, name: 'Wood Barrel', category: 'decoration', price: 500, rarity: 'common', tier: 0, stock: 10, size: [1, 1], color: 0x9a6232 },
  { key: 'tires', code: 64, name: 'Tire Stack', category: 'decoration', price: 600, rarity: 'common', tier: 0, stock: 10, size: [1, 1], color: 0x2b2f45 },
  { key: 'flagred', code: 65, name: 'Red Flag', category: 'decoration', price: 700, rarity: 'uncommon', tier: 0, stock: 8, size: [1, 1], color: 0xe8352e },
  { key: 'flagblue', code: 66, name: 'Blue Flag', category: 'decoration', price: 700, rarity: 'uncommon', tier: 0, stock: 8, size: [1, 1], color: 0x3a7bea },
  { key: 'flaggreen', code: 67, name: 'Green Flag', category: 'decoration', price: 700, rarity: 'uncommon', tier: 0, stock: 8, size: [1, 1], color: 0x3fae3a },
  { key: 'checkered', code: 68, name: 'Checkered Flags', category: 'decoration', price: 1500, rarity: 'rare', tier: 1, stock: 6, size: [1, 1], color: 0xffffff },
  { key: 'trophy', code: 69, name: 'Giant Trophy', category: 'decoration', price: 25000, rarity: 'legendary', tier: 3, stock: 2, size: [1, 1], color: 0xffcf3a },
];
const DECOR_BY_KEY = new Map(DECORS.map((d) => [d.key, d]));
const DECOR_BY_CODE = new Map(DECORS.map((d) => [d.code, d]));
export const decorDef = (key: string): DecorDef | undefined => DECOR_BY_KEY.get(key);
export const decorByCode = (code: number): DecorDef | undefined => DECOR_BY_CODE.get(code);
export const DECOR_CATEGORIES: readonly { key: DecorCategory; name: string }[] = [
  { key: 'terrain', name: 'Terrain' },
  { key: 'structure', name: 'Structure' },
  { key: 'greenery', name: 'Greenery' },
  { key: 'decoration', name: 'Decoration' },
];
/** Most decorations a plot holds. */
export const DECOR_LIMIT = 120;

// ---------------------------------------------------------------- boosts, passes, free rewards

/** The rewarded ad placement: 2x Money for a while. */
export const AD_MONEY_BOOST = 'money-boost';
export const AD_BOOST_SECONDS = 600;
/** A free gift every this many seconds played. */
export const FREE_GIFT_SECONDS = 600;
/** The free gift pays this many seconds of the track's income (at least FREE_GIFT_MIN). */
export const FREE_GIFT_INCOME_SECONDS = 120;
export const FREE_GIFT_MIN = 100;

/** Gems catalogue (SKUs must exist in the Bloxity portal for this game's slug). */
export interface GemItem {
  readonly sku: string;
  readonly name: string;
  readonly blurb: string;
  readonly gems: number;
  readonly kind: 'pass' | 'pack' | 'cash';
}

export const GEM_ITEMS: readonly GemItem[] = [
  { sku: 'pass_money2', name: '2x Money', blurb: 'Double every dollar, forever.', gems: 199, kind: 'pass' },
  { sku: 'first_lap_pack', name: 'First Lap Pack', blurb: '2 Turbo Crates + $1.5K cash.', gems: 6, kind: 'pack' },
  { sku: 'stunt_pack', name: 'Stunt Pack', blurb: '4 Bump, 2 Ramp Jump and 2 Loop tracks.', gems: 129, kind: 'pack' },
  { sku: 'boost_pack', name: 'Boost Pack', blurb: '6 Boost Pad tracks. Go WAY too fast!', gems: 109, kind: 'pack' },
  { sku: 'cash_small', name: 'Bag of Cash', blurb: '$25K cash.', gems: 49, kind: 'cash' },
  { sku: 'cash_large', name: 'Vault of Cash', blurb: '$500K cash.', gems: 399, kind: 'cash' },
];

/** What each pack holds: track items, crates opened at once, cash. */
export const PACK_CONTENTS: Readonly<Record<string, { items?: Record<string, number>; crates?: Record<string, number>; cash?: number; pass?: 'money2' }>> = {
  pass_money2: { pass: 'money2' },
  first_lap_pack: { crates: { turbo: 2 }, cash: 1500 },
  stunt_pack: { items: { bump: 4, jump: 2, loop: 2 } },
  boost_pack: { items: { boost: 6 } },
  cash_small: { cash: 25_000 },
  cash_large: { cash: 500_000 },
};

// ---------------------------------------------------------------- the gallery

export const TRACK_NAME_MAX = 24;
export const TRACK_DESC_MAX = 140;
export const SAVE_SLOTS = 3;

// ---------------------------------------------------------------- formatting

export const fmtMoney = (n: number): string => {
  const v = Math.max(0, Math.floor(n));
  if (v < 1000) return `$${v}`;
  const units: [number, string][] = [
    [1e15, 'Qa'],
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [d, s] of units) if (v >= d) return `$${(v / d).toFixed(v / d >= 100 ? 0 : 1).replace(/\.0$/, '')}${s}`;
  return `$${v}`;
};

export const fmtNum = (n: number): string => fmtMoney(n).slice(1);
