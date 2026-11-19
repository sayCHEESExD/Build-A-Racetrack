import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MongoClient, type AnyBulkWriteOperation, type Collection, type Document } from 'mongodb';
import { logger } from '../util/logger.js';
import type { DocCollection, ProfileStorage } from './Storage.js';
import {
  CLEARABLE_FIELDS,
  coerceProfile,
  type MigrationFields,
  type ProfileFields,
  type StoredProfile,
} from './StoredProfile.js';
import { WriteQueue } from './WriteQueue.js';

const SCOPE = 'persistence';

/** How long the driver looks for a server before an operation fails. */
const SERVER_SELECTION_MS = 4000;
/** How often the boot work (indexes, legacy import) is retried while Mongo is down. */
const BOOT_RETRY_MS = 15_000;

type ProfileDoc = Document & { _id: string };

/**
 * THE PRODUCTION STORE: the managed MongoDB Legion injects as `MONGODB_URI`,
 * one database per game and channel, the database named in the URI.
 *
 * One document per profile (`profiles`, `_id` = key). Every write is a per-key `updateOne`
 * with `$set` and upsert - idempotent, and blind to every field this build
 * does not know - so several pods can share the database without any of them
 * writing back a snapshot another has since changed.
 *
 * BOOT NEVER FAILS ON MONGO. If the database is down when the pod starts,
 * `/health` still answers (or Legion would restart-loop the pod), the outage
 * is logged loudly, and joins fail cleanly until it is back: `get()` throws,
 * and the room refuses the join rather than seating a player on an empty
 * profile.
 */
export class MongoStorage implements ProfileStorage {
  readonly kind = 'mongo' as const;

  private readonly client: MongoClient;
  private readonly profiles: Collection<ProfileDoc>;
  private readonly puts: WriteQueue<{ fields: ProfileFields; extras: MigrationFields }>;
  private readonly docWrites: WriteQueue<{ collection: DocCollection; doc: Record<string, unknown> }>;
  private booted = false;
  private bootTimer: NodeJS.Timeout | null = null;

  constructor(
    uri: string,
    /** Where a legacy `profiles.json` might be waiting to be imported. */
    private readonly legacyDirectory: string,
  ) {
    this.client = new MongoClient(uri, {
      serverSelectionTimeoutMS: SERVER_SELECTION_MS,
      connectTimeoutMS: SERVER_SELECTION_MS,
      maxPoolSize: 10,
      retryWrites: true,
      retryReads: true,
    });
    const db = this.client.db();
    this.profiles = db.collection<ProfileDoc>('profiles');
    this.puts = new WriteQueue('profile', (key, { fields, extras }) => this.writeProfile(key, fields, extras));
    this.docWrites = new WriteQueue('doc', (key, { collection, doc }) => this.writeDoc(collection, key.slice(collection.length + 1), doc));
    logger.info(SCOPE, `mongo store: database "${db.databaseName}"`);
  }

  async open(): Promise<void> {
    await this.boot();
  }

  /**
   * READ YOUR OWN WRITES. A player who drops and reconnects a second later
   * (the client does this automatically) can be read here while this pod's
   * save from their leave is still queued or in flight; the database alone
   * would hand back the older copy, the new session would play on from it, and
   * its next autosave would overwrite the newer one. So a write this pod has
   * not landed yet is laid over what the database says. It is looked for
   * before AND after the read, so a write that lands mid-read is not missed.
   * (Another pod's unlanded write cannot be seen; the client's first reconnect
   * waits a second, which is far longer than a queued write takes to land.)
   */
  async get(key: string): Promise<StoredProfile | null> {
    const before = this.puts.peek(key);
    const doc = await this.profiles.findOne({ _id: key });
    const pending = this.puts.peek(key) ?? before;
    if (!doc && !pending) return null;
    const { _id: _ignored, ...rest } = doc ?? { _id: key };
    return coerceProfile(pending ? { ...rest, ...pending.fields, ...pending.extras } : rest);
  }

  put(key: string, fields: ProfileFields, extras: MigrationFields = {}): Promise<void> {
    return this.puts.put(key, { fields, extras });
  }

  async insertIfAbsent(key: string, profile: ProfileFields & MigrationFields): Promise<boolean> {
    const doc: ProfileDoc = { _id: key, ...profile };
    for (const field of CLEARABLE_FIELDS) {
      if (!doc[field]) delete doc[field];
    }
    try {
      await this.profiles.insertOne(doc);
      return true;
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  async loadAll(): Promise<Map<string, StoredProfile>> {
    const out = new Map<string, StoredProfile>();
    for (const doc of await this.profiles.find({}).toArray()) {
      const { _id, ...rest } = doc;
      const profile = coerceProfile(rest);
      if (profile) out.set(_id, profile);
    }
    return out;
  }

  async getDoc(collection: DocCollection, id: string): Promise<Record<string, unknown> | null> {
    const pending = this.docWrites.peek(`${collection}/${id}`);
    if (pending) return { ...pending.doc };
    const doc = await this.client.db().collection<Document & { _id: string }>(collection).findOne({ _id: id });
    if (!doc) return null;
    const { _id: _ignored, ...rest } = doc;
    return rest;
  }

  putDoc(collection: DocCollection, id: string, doc: Record<string, unknown>): Promise<void> {
    return this.docWrites.put(`${collection}/${id}`, { collection, doc });
  }

  async listDocs(collection: DocCollection, prefix: string): Promise<Map<string, Record<string, unknown>>> {
    const out = new Map<string, Record<string, unknown>>();
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const docs = await this.client.db().collection<Document & { _id: string }>(collection).find({ _id: { $regex: `^${escaped}` } }).toArray();
    for (const doc of docs) {
      const { _id, ...rest } = doc;
      out.set(_id, rest);
    }
    return out;
  }

  private async writeDoc(collection: DocCollection, id: string, doc: Record<string, unknown>): Promise<void> {
    await this.client.db().collection<Document & { _id: string }>(collection).replaceOne({ _id: id }, doc, { upsert: true });
  }

  async flush(timeoutMs = 20_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const puts = await this.puts.drain(timeoutMs);
    const docs = await this.docWrites.drain(Math.max(0, deadline - Date.now()));
    return puts && docs;
  }

  async close(): Promise<void> {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    await this.client.close();
  }

  /** One profile save: $set the known fields, $unset the empty clearables, upsert. */
  private async writeProfile(key: string, fields: ProfileFields, extras: MigrationFields): Promise<void> {
    const set: Document = { ...fields, ...extras };
    const unset: Document = {};
    for (const field of CLEARABLE_FIELDS) {
      if (!set[field]) {
        delete set[field];
        unset[field] = '';
      }
    }
    const update: Document = { $set: set };
    if (Object.keys(unset).length > 0) update['$unset'] = unset;
    await this.profiles.updateOne({ _id: key }, update, { upsert: true });
  }

  /**
   * Connect, index, and import the legacy JSON file. Retried on a timer while
   * the database is down; never lets an outage stop the process listening.
   */
  private async boot(): Promise<void> {
    if (this.booted) return;
    try {
      await this.client.connect();
      await this.client.db().command({ ping: 1 });
      await this.importLegacy();
      this.booted = true;
      logger.info(SCOPE, 'mongo store: connected');
    } catch (error) {
      logger.error(
        SCOPE,
        `MONGO IS UNREACHABLE - joins will be refused until it is back (retrying in ${BOOT_RETRY_MS / 1000}s):`,
        error,
      );
      this.bootTimer = setTimeout(() => {
        this.bootTimer = null;
        void this.boot();
      }, BOOT_RETRY_MS);
      this.bootTimer.unref?.();
    }
  }

  /**
   * Bring a `profiles.json` from the JSON store into the database, INSERT
   * ONLY: `$setOnInsert` with upsert creates what is missing and touches
   * nothing that already exists. Safe to run on every boot.
   */
  private async importLegacy(): Promise<void> {
    const path = join(this.legacyDirectory, 'profiles.json');
    if (!existsSync(path)) return;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      logger.warn(SCOPE, `legacy ${path} could not be parsed; nothing imported:`, error);
      return;
    }
    if (!raw || typeof raw !== 'object') return;
    const operations: AnyBulkWriteOperation<ProfileDoc>[] = [];
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const profile = coerceProfile(value);
      if (!profile) continue;
      const doc: Document = { ...profile };
      for (const field of CLEARABLE_FIELDS) {
        if (!doc[field]) delete doc[field];
      }
      operations.push({ updateOne: { filter: { _id: key }, update: { $setOnInsert: doc }, upsert: true } });
    }
    if (operations.length === 0) return;
    const result = await this.profiles.bulkWrite(operations, { ordered: false });
    logger.info(
      SCOPE,
      `legacy import from ${path}: ${result.upsertedCount} added, ${operations.length - result.upsertedCount} already present`,
    );
  }
}

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
