/**
 * The facts of a player's career that outlive a session: what Bloxity's
 * profile stats and the leaderboards are made of. (Their cash, inventory,
 * cars, upgrades and their racetrack live in the `players` and `tracks`
 * documents.)
 */
export interface ProgressFields {
  /** Track pieces placed, ever. */
  placed: number;
  /** Rides finished. */
  rides: number;
  /** Money earned, ever (the leaderboards rank it). */
  earned: number;
  rebirths: number;
  /** Seconds spent in the game, ever. */
  playSeconds: number;
}

/** What one save writes. */
export interface ProfileFields extends ProgressFields {
  displayName: string;
  avatarUrl: string;
  updatedAt: number;
}

/** The first-login migration's bookkeeping (see `GameRoom.resolveProfile`). */
export interface MigrationFields {
  migratedFrom?: string;
  migratedTo?: string;
  migratedAt?: number;
  migratedSnapshot?: ProgressFields;
}

/**
 * A profile as READ from storage. Beyond the fields this build knows, it may
 * carry any field a newer or older build wrote: those are kept and written
 * back untouched, never dropped.
 */
export type StoredProfile = ProfileFields & MigrationFields & { [field: string]: unknown };

/** Optional string fields a save may CLEAR. The only fields ever $unset. */
export const CLEARABLE_FIELDS = ['displayName', 'avatarUrl'] as const;

const numeric = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);
const count = (value: unknown): number => Math.floor(numeric(value));
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** A brand-new player. */
export const emptyProgress = (): ProgressFields => ({ placed: 0, rides: 0, earned: 0, rebirths: 0, playSeconds: 0 });

/** Just the progression of a profile, coerced. */
export const progressOf = (source: Partial<ProgressFields>): ProgressFields => ({
  placed: count(source.placed),
  rides: count(source.rides),
  earned: numeric(source.earned),
  rebirths: count(source.rebirths),
  playSeconds: numeric(source.playSeconds),
});

/** Coerce whatever storage held into a profile, KEEPING every unknown field. */
export const coerceProfile = (raw: unknown): StoredProfile | null => {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const profile: StoredProfile = {
    ...source,
    ...progressOf(source as Partial<ProgressFields>),
    displayName: text(source['displayName']),
    avatarUrl: text(source['avatarUrl']),
    updatedAt: numeric(source['updatedAt']),
  };
  if (typeof source['migratedFrom'] !== 'string') delete profile.migratedFrom;
  if (typeof source['migratedTo'] !== 'string') delete profile.migratedTo;
  if (typeof source['migratedAt'] !== 'number') delete profile.migratedAt;
  if (source['migratedSnapshot'] && typeof source['migratedSnapshot'] === 'object') profile.migratedSnapshot = progressOf(source['migratedSnapshot'] as Partial<ProgressFields>);
  else delete profile.migratedSnapshot;
  return profile;
};

/** Whether a profile holds anything worth carrying into an account. */
export const hasProgress = (p: ProgressFields): boolean => p.placed > 0 || p.rides > 0 || p.earned > 0 || p.playSeconds >= 60;
