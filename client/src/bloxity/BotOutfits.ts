import { DEFAULT_APPEARANCE, type AvatarAppearance } from '@race/shared';
import { logger } from '../util/logger.js';
import { primeItem, type BloxityItem } from './bloxityAssets.js';
import { bloxityEnv } from './environment.js';

const SCOPE = 'bloxity/bots';

/**
 * WHAT A BOT WEARS: a real outfit out of Bloxity's public avatar catalogue,
 * so a bot in a map looks like any other player who wandered in - somebody's
 * skin, often a hat, sometimes wings - rather than a stock body.
 *
 * The catalogue is read once per session, one page per slot
 * (`GET /v1/avatar/items?type=skin|hat|back&limit=N`, the same public,
 * unauthenticated route the item lookups use), and every item on it is primed
 * into the item cache, so dressing a bot costs no further requests. Which
 * items a bot gets is decided by a hash of its name and look: the same bot
 * wears the same outfit on every client, and for its whole run.
 *
 * If the catalogue cannot be reached, bots fall back to the portal's own
 * built-in free skins (ids read from that catalogue), and failing even those
 * the dresser shows the default Bloxity skin - never an untextured body.
 */

/** Pages of each slot to draw from. Skins are the look; hats and backs are seasoning. */
const PAGES = { skin: 240, hat: 160, back: 80 } as const;

/** How often a bot wears each accessory (real players mostly wear a hat, few wear wings). */
const HAT_CHANCE = 0.55;
const BACK_CHANCE = 0.18;

/** Built-in free skins, for when the catalogue is unreachable. */
const FALLBACK_SKINS = [
  '69d8a70b2240b84a28355eeb', // Midnight Denim
  '6a05227281f9706108234f12', // Wanderer
  '69cccd98e846506e2c476254', // Patchwork
  '6a1706a6d4201907d64acbeb', // Grey Tactical Rig
  '69cf6a006beecd2f1a3bc792', // Crisp White
  '6a33f3e99e820be9a1eab1a7', // Cyan Circuit
  '6a406d92cb8211ae598d9d13', // Galaxy Knight
  '6a33eae79e8362499889c351', // Skull Enforcer
];

interface Pools {
  skins: string[];
  hats: string[];
  backs: string[];
}

let pools: Promise<Pools> | null = null;

const fetchSlot = async (type: keyof typeof PAGES): Promise<string[]> => {
  const response = await fetch(`${bloxityEnv().apiUrl}/v1/avatar/items?type=${type}&limit=${PAGES[type]}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { items?: BloxityItem[] };
  const out: string[] = [];
  for (const item of body.items ?? []) {
    // Only items that can actually be drawn: a skin needs its texture, an accessory its mesh.
    const paths = item.assetPaths;
    if (item.type !== type || !paths || (type === 'skin' ? !paths.texture : !paths.mesh)) continue;
    // The plain default skin is what an undressed bot already looks like.
    if (type === 'skin' && paths.texture === '/avatars/skins/0.png') continue;
    primeItem(item);
    out.push(item.id);
  }
  return out;
};

const loadPools = (): Promise<Pools> => {
  pools ??= Promise.all([fetchSlot('skin'), fetchSlot('hat'), fetchSlot('back')])
    .then(([skins, hats, backs]) => {
      logger.info(SCOPE, `bot wardrobe: ${skins.length} skins, ${hats.length} hats, ${backs.length} backs`);
      return { skins: skins.length > 0 ? skins : FALLBACK_SKINS, hats, backs };
    })
    .catch((error: unknown) => {
      logger.warn(SCOPE, `catalogue unavailable, bots wear built-in skins: ${String(error)}`);
      return { skins: FALLBACK_SKINS, hats: [], backs: [] };
    });
  return pools;
};

/** A small deterministic generator from a string seed (FNV-1a into mulberry32). */
const seeded = (seed: string): (() => number) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (list: readonly string[], rng: () => number): string => list[Math.floor(rng() * list.length)] ?? '';

/** The outfit for one bot: the same on every client for the same name + look. */
export const botOutfit = async (name: string, look: number): Promise<AvatarAppearance> => {
  const wardrobe = await loadPools();
  const rng = seeded(`${name}#${look}`);
  return {
    ...DEFAULT_APPEARANCE,
    skinId: pick(wardrobe.skins, rng),
    hatId: wardrobe.hats.length > 0 && rng() < HAT_CHANCE ? pick(wardrobe.hats, rng) : '',
    backId: wardrobe.backs.length > 0 && rng() < BACK_CHANCE ? pick(wardrobe.backs, rng) : '',
  };
};
