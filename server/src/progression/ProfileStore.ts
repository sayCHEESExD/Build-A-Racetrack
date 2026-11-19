import { emptyProgress, progressOf, storage, type MigrationFields, type ProfileFields, type ProgressFields, type StoredProfile } from '../persistence/index.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/**
 * A player's CAREER (what Bloxity's profile stats show), per key.
 *
 * A thin front on the storage: a profile is READ FROM STORAGE AT JOIN TIME,
 * never from a cache filled at boot, because several pods share one database
 * and the boot cache of one knows nothing of what another has written since.
 */
class ProfileStore {
  get kind(): string {
    return storage.kind;
  }

  /** Connect the store. Never throws. */
  async open(): Promise<void> {
    await storage.open();
  }

  /** The profile under a key, read from storage NOW. Throws when storage is unreachable. */
  load(key: string): Promise<StoredProfile | null> {
    return storage.get(key);
  }

  /** What a live session is worth on disk. */
  snapshot(player: PlayerState): ProfileFields {
    return {
      placed: player.careerPlaced,
      rides: player.rides,
      earned: player.earned,
      rebirths: player.rebirths,
      playSeconds: player.playSeconds,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
      updatedAt: Date.now(),
    };
  }

  /** Put a stored career onto a live player (or a fresh one when there is none). */
  applyTo(player: PlayerState, profile: StoredProfile | null, keepIdentity = false): void {
    const p = profile ? progressOf(profile) : emptyProgress();
    player.careerPlaced = p.placed;
    player.rides = p.rides;
    player.earned = p.earned;
    player.rebirths = p.rebirths;
    player.playSeconds = p.playSeconds;
    if (!keepIdentity) {
      player.displayName = profile?.displayName ?? '';
      player.avatarUrl = profile?.avatarUrl ?? '';
    }
  }

  save(key: string, player: PlayerState, extras?: MigrationFields): Promise<void> {
    return storage.put(key, this.snapshot(player), extras);
  }

  insertIfAbsent(key: string, profile: ProfileFields & MigrationFields): Promise<boolean> {
    return storage.insertIfAbsent(key, profile);
  }

  /** RETIRE a guest profile whose progress just became an account's. */
  async retireGuest(guestKey: string, accountKey: string, snapshot: ProgressFields, identity: { displayName: string; avatarUrl: string }): Promise<void> {
    const now = Date.now();
    const fields: ProfileFields = { ...emptyProgress(), ...identity, updatedAt: now };
    await storage.put(guestKey, fields, { migratedTo: accountKey, migratedAt: now, migratedSnapshot: snapshot });
  }

  flush(timeoutMs?: number): Promise<boolean> {
    return storage.flush(timeoutMs);
  }

  close(): Promise<void> {
    return storage.close();
  }
}

export const profileStore = new ProfileStore();
