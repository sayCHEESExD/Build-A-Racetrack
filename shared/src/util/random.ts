/**
 * Seeded randomness.
 *
 * The forest, its egg nooks and every prop in it are GENERATED, on the server
 * (for collision and egg placement) and on the client (to draw them), from the
 * same seed. Both sides must produce the same numbers, so nothing here may
 * touch `Math.random`: a mulberry32 stream is integer maths and is identical
 * in every JavaScript engine.
 */
export type Rng = () => number;

/** A deterministic stream in [0, 1). */
export const seeded = (seed: number): Rng => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A float in [min, max). */
export const range = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

/** An integer in [min, max], both inclusive. */
export const rangeInt = (rng: Rng, min: number, max: number): number => Math.floor(min + rng() * (max - min + 1));

/** One entry, chosen by weight. Returns the last entry when every weight is 0. */
export const pickWeighted = <T>(rng: Rng, entries: readonly T[], weight: (entry: T) => number): T => {
  let total = 0;
  for (const entry of entries) total += Math.max(0, weight(entry));
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, weight(entry));
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1] as T;
};

/** A hash of a string to a 32-bit seed, for per-name variation. */
export const hashSeed = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
