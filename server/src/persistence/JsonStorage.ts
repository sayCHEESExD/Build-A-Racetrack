import { join } from 'node:path';
import { logger } from '../util/logger.js';
import { AtomicJsonFile } from './AtomicJsonFile.js';
import type { DocCollection, ProfileStorage, StoredGrant } from './Storage.js';
import {
  CLEARABLE_FIELDS,
  coerceProfile,
  type MigrationFields,
  type ProfileFields,
  type StoredProfile,
} from './StoredProfile.js';

const SCOPE = 'persistence';

/**
 * How long a claimed-but-unapplied grant stays claimed before it may be
 * retaken. Long, because a claim is settled only after the profile save that
 * carries its Money has landed, and during a storage outage that save waits;
 * a lease that expired first would pay the same grant twice.
 */
export const GRANT_LEASE_MS = 10 * 60_000;

type ProfileDocument = Record<string, StoredProfile>;
type GrantDocument = Record<string, StoredGrant>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * THE DEV STORE: two JSON files under the data directory, `profiles.json`
 * and `grants.json`, held in memory and written atomically per change.
 *
 * Same per-key contract as the database, so the room above cannot tell them
 * apart - but a single process is the only writer here, which is why a
 * whole-document file is acceptable in a way it never would be for Mongo.
 */
export class JsonStorage implements ProfileStorage {
  readonly kind = 'json' as const;

  private readonly profiles = new Map<string, StoredProfile>();
  private readonly grants = new Map<string, StoredGrant>();
  private readonly profileFile: AtomicJsonFile<ProfileDocument>;
  private readonly grantFile: AtomicJsonFile<GrantDocument>;
  private readonly docs = new Map<DocCollection, { file: AtomicJsonFile<Record<string, Record<string, unknown>>>; data: Map<string, Record<string, unknown>> }>();
  private readonly directory: string;

  constructor(directory: string) {
    this.profileFile = new AtomicJsonFile<ProfileDocument>(join(directory, 'profiles.json'));
    this.grantFile = new AtomicJsonFile<GrantDocument>(join(directory, 'grants.json'));
    this.directory = directory;
  }

  /** One JSON file per world collection, loaded on first use. */
  private collection(name: DocCollection): { file: AtomicJsonFile<Record<string, Record<string, unknown>>>; data: Map<string, Record<string, unknown>> } {
    let entry = this.docs.get(name);
    if (!entry) {
      const file = new AtomicJsonFile<Record<string, Record<string, unknown>>>(join(this.directory, `${name}.json`));
      const data = new Map<string, Record<string, unknown>>();
      try {
        const raw = file.load();
        if (raw && typeof raw === 'object') for (const [id, doc] of Object.entries(raw)) if (doc && typeof doc === 'object') data.set(id, doc);
      } catch (error) {
        logger.error(SCOPE, `json store: could not read ${name}:`, error);
      }
      entry = { file, data };
      this.docs.set(name, entry);
    }
    return entry;
  }

  async getDoc(collection: DocCollection, id: string): Promise<Record<string, unknown> | null> {
    const doc = this.collection(collection).data.get(id);
    return doc ? clone(doc) : null;
  }

  async putDoc(collection: DocCollection, id: string, doc: Record<string, unknown>): Promise<void> {
    const entry = this.collection(collection);
    entry.data.set(id, clone(doc));
    await entry.file.write(Object.fromEntries(entry.data));
  }

  async listDocs(collection: DocCollection, prefix: string): Promise<Map<string, Record<string, unknown>>> {
    const out = new Map<string, Record<string, unknown>>();
    for (const [id, doc] of this.collection(collection).data) if (id.startsWith(prefix)) out.set(id, clone(doc));
    return out;
  }

  async open(): Promise<void> {
    try {
      const raw = this.profileFile.load();
      if (raw && typeof raw === 'object') {
        for (const [key, value] of Object.entries(raw)) {
          const profile = coerceProfile(value);
          if (profile) this.profiles.set(key, profile);
        }
      }
      logger.info(SCOPE, `json store: ${this.profiles.size} profile(s) in ${this.profileFile.location}`);
    } catch (error) {
      logger.error(SCOPE, `json store: could not read profiles:`, error);
    }
    try {
      const raw = this.grantFile.load();
      if (raw && typeof raw === 'object') {
        for (const [id, value] of Object.entries(raw)) {
          if (value && typeof value === 'object' && typeof value.accountKey === 'string') {
            this.grants.set(id, { ...value, transactionId: id });
          }
        }
      }
      if (this.grants.size > 0) logger.info(SCOPE, `json store: ${this.grants.size} grant(s) on record`);
    } catch (error) {
      logger.error(SCOPE, `json store: could not read grants:`, error);
    }
  }

  async get(key: string): Promise<StoredProfile | null> {
    const profile = this.profiles.get(key);
    return profile ? clone(profile) : null;
  }

  async put(key: string, fields: ProfileFields, extras: MigrationFields = {}): Promise<void> {
    const existing = this.profiles.get(key) ?? ({} as StoredProfile);
    const merged: StoredProfile = { ...existing, ...fields, ...extras };
    for (const field of CLEARABLE_FIELDS) {
      if (!merged[field]) delete merged[field];
    }
    this.profiles.set(key, merged);
    await this.profileFile.write(this.profileDocument());
  }

  async insertIfAbsent(key: string, profile: ProfileFields & MigrationFields): Promise<boolean> {
    if (this.profiles.has(key)) return false;
    const stored: StoredProfile = { ...profile };
    for (const field of CLEARABLE_FIELDS) {
      if (!stored[field]) delete stored[field];
    }
    this.profiles.set(key, stored);
    await this.profileFile.write(this.profileDocument());
    return true;
  }

  async loadAll(): Promise<Map<string, StoredProfile>> {
    const out = new Map<string, StoredProfile>();
    for (const [key, profile] of this.profiles) out.set(key, clone(profile));
    return out;
  }

  async recordGrant(grant: StoredGrant): Promise<'recorded' | 'duplicate'> {
    if (this.grants.has(grant.transactionId)) return 'duplicate';
    this.grants.set(grant.transactionId, { ...grant });
    await this.grantFile.write(this.grantDocument());
    return 'recorded';
  }

  async claimGrants(accountKey: string, claimedBy: string): Promise<StoredGrant[]> {
    const now = Date.now();
    const claimed: StoredGrant[] = [];
    for (const grant of this.grants.values()) {
      if (grant.accountKey !== accountKey || grant.appliedAt !== null) continue;
      if (grant.claimedAt !== null && now - grant.claimedAt < GRANT_LEASE_MS) continue;
      grant.claimedAt = now;
      grant.claimedBy = claimedBy;
      claimed.push({ ...grant });
    }
    if (claimed.length > 0) await this.grantFile.write(this.grantDocument());
    return claimed;
  }

  async settleGrants(transactionIds: readonly string[]): Promise<void> {
    const now = Date.now();
    let changed = false;
    for (const id of transactionIds) {
      const grant = this.grants.get(id);
      if (grant && grant.appliedAt === null) {
        grant.appliedAt = now;
        changed = true;
      }
    }
    if (changed) await this.grantFile.write(this.grantDocument());
  }

  async flush(timeoutMs = 10_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const profiles = await this.profileFile.drain(timeoutMs);
    const grants = await this.grantFile.drain(Math.max(0, deadline - Date.now()));
    let docs = true;
    for (const entry of this.docs.values()) docs = (await entry.file.drain(Math.max(0, deadline - Date.now()))) && docs;
    return profiles && grants && docs;
  }

  /** The exit path: blocking, so it completes before the process goes. */
  flushSync(): void {
    this.profileFile.flushSync();
    this.grantFile.flushSync();
    for (const entry of this.docs.values()) entry.file.flushSync();
  }

  async close(): Promise<void> {
    await this.flush();
  }

  private profileDocument(): ProfileDocument {
    return Object.fromEntries(this.profiles);
  }

  private grantDocument(): GrantDocument {
    return Object.fromEntries(this.grants);
  }
}
