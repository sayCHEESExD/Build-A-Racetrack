import { logger } from '../util/logger.js';

const SCOPE = 'net/rooms';

const TIMEOUT_MS = 4000;

/** Where a named room can be joined. */
export interface RoomLocation {
  readonly roomId: string;
  /** The Colyseus endpoint of the pod holding it, or null for the default endpoint. */
  readonly endpoint: string | null;
}

interface DirectoryRow {
  relayRoomId?: unknown;
  colyseusRoomId?: unknown;
  locked?: unknown;
  players?: unknown;
  maxPlayers?: unknown;
  joinUrl?: unknown;
}

const fetchJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

/**
 * A HOSTED ROOM'S POD. A bare `joinById` through a freshly allocated relay
 * lands on whichever pod the matchmaker picked, which holds the room only by
 * coincidence. Boxity's cross-pod directory (GET {playUrl}/v1/dir/<hostingId>/list)
 * names each room's `joinUrl` - a relay pinned to the pod that holds it - so
 * the room is joined there. Gone or full: null, and the caller matchmakes.
 */
export const locateHostedRoom = async (playUrl: string, hostingId: string, roomId: string): Promise<RoomLocation | null> => {
  try {
    const body = (await fetchJson(`${playUrl.replace(/\/+$/, '')}/v1/dir/${encodeURIComponent(hostingId)}/list`)) as { rooms?: DirectoryRow[] };
    const row = (body.rooms ?? []).find((r) => r.colyseusRoomId === roomId);
    if (!row || typeof row.joinUrl !== 'string') {
      logger.info(SCOPE, `room ${roomId} is not in the directory (closed?); matchmaking instead`);
      return null;
    }
    const full = typeof row.players === 'number' && typeof row.maxPlayers === 'number' && row.players >= row.maxPlayers;
    if (row.locked === true || full) {
      logger.info(SCOPE, `room ${roomId} is full; matchmaking instead`);
      return null;
    }
    return { roomId, endpoint: row.joinUrl.replace(/^http/i, 'ws') };
  } catch (error) {
    logger.warn(SCOPE, `room directory unreadable (${String(error)}); matchmaking instead`);
    return null;
  }
};

/** The room list a LOCAL dev server publishes (`server/src/routes/rooms.ts`). */
const ALL_ROOMS_PATH = '/api/coly-matchmaker/all-rooms';

/** A room on a local dev server (one process: the default endpoint), or null when it is gone or full. */
export const locateLocalRoom = async (serverUrl: string, roomId: string): Promise<RoomLocation | null> => {
  try {
    const base = serverUrl.replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/+$/, '');
    const body = (await fetchJson(`${base}${ALL_ROOMS_PATH}?mode=0`)) as { rooms?: { id?: unknown; locked?: unknown }[] };
    const row = (body.rooms ?? []).find((r) => r.id === roomId);
    if (!row || row.locked === true) return null;
    return { roomId, endpoint: null };
  } catch {
    return { roomId, endpoint: null };
  }
};
