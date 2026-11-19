/**
 * ONE LIVE SESSION PER PROFILE (in this process). A player's save is
 * loaded from storage when they join and saved when they leave; two sessions
 * on the same profile (two tabs, a reconnect racing the old socket) would
 * each hold a copy and overwrite the other's saves. So a newer join evicts
 * the older session and waits for its saves to land before reading.
 */
interface Holder {
  /** Disconnect the session; resolves once its leave-saves have landed (or timed out). */
  evict(): Promise<void>;
}

const active = new Map<string, Holder>();

export const activeKeys = {
  /** Claim a key for a session; returns a release function. */
  claim(key: string, holder: Holder): () => void {
    active.set(key, holder);
    return () => {
      if (active.get(key) === holder) active.delete(key);
    };
  },

  /** If someone holds the key, evict them and wait. */
  async evict(key: string): Promise<boolean> {
    const holder = active.get(key);
    if (!holder) return false;
    active.delete(key);
    await holder.evict();
    return true;
  },
};
