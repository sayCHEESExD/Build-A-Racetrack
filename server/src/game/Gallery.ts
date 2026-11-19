import { TRACK_DESC_MAX, TRACK_NAME_MAX, unpackPieces, type GalleryEntry, type GalleryTab } from '@race/shared';
import { storage } from '../persistence/index.js';
import { logger } from '../util/logger.js';

const SCOPE = 'gallery';

/** One published racetrack (the `published` document, id = its code). */
export interface Published {
  code: string;
  name: string;
  desc: string;
  owner: string;
  ownerKey: string;
  p: number[];
  d: number[];
  likes: number;
  visits: number;
  likers: string[];
  createdAt: number;
  updatedAt: number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LIST_TTL_MS = 20_000;
const MAX_LIST = 24;

/** Names and descriptions: printable, trimmed, capped; a few words never shown. */
const BLOCKED = /\b(fuck|shit|bitch|cunt|nigg|fag|rape|porn|sex)\w*/gi;
export const cleanText = (raw: unknown, max: number): string =>
  (typeof raw === 'string' ? raw : '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(BLOCKED, '***')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

const coerce = (raw: Record<string, unknown> | null): Published | null => {
  if (!raw || typeof raw['code'] !== 'string') return null;
  return {
    code: raw['code'],
    name: cleanText(raw['name'], TRACK_NAME_MAX) || 'Racetrack',
    desc: cleanText(raw['desc'], TRACK_DESC_MAX),
    owner: cleanText(raw['owner'], 32) || 'Player',
    ownerKey: typeof raw['ownerKey'] === 'string' ? raw['ownerKey'] : '',
    p: Array.isArray(raw['p']) ? (raw['p'] as unknown[]).filter((n): n is number => Number.isInteger(n)) : [],
    d: Array.isArray(raw['d']) ? (raw['d'] as unknown[]).filter((n): n is number => Number.isInteger(n)) : [],
    likes: Math.floor(num(raw['likes'])),
    visits: Math.floor(num(raw['visits'])),
    likers: Array.isArray(raw['likers']) ? (raw['likers'] as unknown[]).filter((x): x is string => typeof x === 'string').slice(-2000) : [],
    createdAt: num(raw['createdAt']),
    updatedAt: num(raw['updatedAt']),
  };
};

/**
 * THE RACETRACK GALLERY: tracks players published, under six-character
 * codes, shared by every room and pod through storage. Browsing reads a
 * cached list (refreshed every few seconds); a visit or a like writes the
 * document straight back.
 */
class Gallery {
  private cache: Published[] | null = null;
  private cachedAt = 0;

  async get(code: string): Promise<Published | null> {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!clean) return null;
    return coerce(await storage.getDoc('published', clean));
  }

  private async newCode(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let code = '';
      for (let i = 0; i < 6; i += 1) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!(await storage.getDoc('published', code))) return code;
    }
    throw new Error('no free code');
  }

  /** Publish (or update) a player's track. Returns its code. */
  async publish(existing: string, ownerKey: string, owner: string, name: string, desc: string, p: number[], d: number[]): Promise<string> {
    const now = Date.now();
    let doc = existing ? await this.get(existing) : null;
    if (doc && doc.ownerKey !== ownerKey) doc = null;
    const code = doc?.code ?? (await this.newCode());
    const out: Published = {
      code,
      name: cleanText(name, TRACK_NAME_MAX) || `${owner}'s Racetrack`,
      desc: cleanText(desc, TRACK_DESC_MAX),
      owner,
      ownerKey,
      p,
      d,
      likes: doc?.likes ?? 0,
      visits: doc?.visits ?? 0,
      likers: doc?.likers ?? [],
      createdAt: doc?.createdAt ?? now,
      updatedAt: now,
    };
    await storage.putDoc('published', code, { ...out });
    this.cache = null;
    logger.info(SCOPE, `${owner} published ${code} (${unpackPieces(p).length} pieces)`);
    return code;
  }

  async visit(code: string): Promise<void> {
    const doc = await this.get(code);
    if (!doc) return;
    doc.visits += 1;
    await storage.putDoc('published', doc.code, { ...doc });
    this.refreshCached(doc);
  }

  /** Keep the browse list in step with a document just written. */
  private refreshCached(doc: Published): void {
    if (!this.cache) return;
    const i = this.cache.findIndex((d) => d.code === doc.code);
    if (i >= 0) this.cache[i] = doc;
    else this.cache.push(doc);
  }

  /** Like a published track once per player. True if it counted. */
  async like(code: string, who: string): Promise<boolean> {
    const doc = await this.get(code);
    if (!doc || doc.likers.includes(who) || doc.ownerKey === who) return false;
    doc.likes += 1;
    doc.likers.push(who);
    await storage.putDoc('published', doc.code, { ...doc });
    this.refreshCached(doc);
    return true;
  }

  private async all(): Promise<Published[]> {
    if (this.cache && Date.now() - this.cachedAt < LIST_TTL_MS) return this.cache;
    const docs = await storage.listDocs('published', '');
    this.cache = [...docs.values()].map(coerce).filter((d): d is Published => d !== null);
    this.cachedAt = Date.now();
    return this.cache;
  }

  async list(tab: GalleryTab, ownerKey: string): Promise<{ items: GalleryEntry[]; mine: { visits: number; likes: number; tracks: number } }> {
    const all = await this.all();
    const now = Date.now();
    const score = (d: Published): number => {
      switch (tab) {
        case 'new':
          return d.createdAt;
        case 'liked':
          return d.likes;
        case 'visited':
          return d.visits;
        default: {
          const ageDays = (now - d.updatedAt) / 86_400_000;
          return (d.likes * 3 + d.visits + 1) / Math.pow(ageDays + 2, 1.2);
        }
      }
    };
    const pool = tab === 'mine' ? all.filter((d) => d.ownerKey === ownerKey) : all;
    const items = [...pool]
      .sort((a, b) => score(b) - score(a))
      .slice(0, MAX_LIST)
      .map((d) => ({ code: d.code, name: d.name, owner: d.owner, likes: d.likes, visits: d.visits, pieces: Math.floor(d.p.length / 5), p: d.p }));
    const mineDocs = all.filter((d) => d.ownerKey === ownerKey);
    const mine = { visits: mineDocs.reduce((a, d) => a + d.visits, 0), likes: mineDocs.reduce((a, d) => a + d.likes, 0), tracks: mineDocs.length };
    return { items, mine };
  }
}

export const gallery = new Gallery();
