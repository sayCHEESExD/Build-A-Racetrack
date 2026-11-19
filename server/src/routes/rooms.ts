import type { IncomingMessage, ServerResponse } from 'node:http';
import { matchMaker } from '@colyseus/core';
import { MAX_PLAYERS_PER_ROOM, ROOM_NAME } from '@race/shared';
import { logger } from '../util/logger.js';

const SCOPE = 'rooms';

/**
 * THE ROOM LIST Bloxity's store page reads for its "Servers" panel:
 * `GET /api/coly-matchmaker/all-rooms?mode=<id>`, pointed at by the catalogue
 * row's `allRoomsUrl`.
 *
 * The body is the shape the portal already parses, copied from a live
 * Legion-hosted game's answer (`/v1/games/<slug>/rooms`):
 *
 *   { rooms: [{ region, id, type, players, maxPlayers, locked, metadata }],
 *     servers: ['bloxity'], onlineServers: ['bloxity'],
 *     totalPlayers, totalRooms, timestamp, version, mode }
 *
 * `region` is always "bloxity": Legion has one cluster of interchangeable
 * pods, but the portal renders the field per row, so it cannot be left out.
 *
 * WHERE THE ROOMS COME FROM MATTERS. `matchMaker.query()` sees only the pod
 * that answered this request, so on a fleet of N pods it reports about 1/N of
 * the game - and `totalPlayers` feeds the platform's health board. The list
 * must come from the matchmaker's CROSS-POD directory whenever one exists
 * (`MATCHMAKER_REPORT_URL` is set in a Legion deployment); the local process is
 * the source ONLY when it is not (local development, a single-process host).
 * A directory that cannot be read answers 502 with no online servers rather
 * than a quietly partial list.
 *
 * Only public listings are published - the same set any client reads from the
 * lobby - so the token is optional: enforced only if `LEGION_GETROOMS_API_TOKEN`
 * happens to be set.
 */
export const ALL_ROOMS_PATH = '/api/coly-matchmaker/all-rooms';

/** This game serves one catalogue row: mode 0. */
const MODES: Readonly<Record<number, string>> = { 0: 'Build A Racetrack' };

const REGION = 'bloxity';

interface RoomRow {
  region: string;
  id: string;
  type: 'public' | 'private';
  players: number;
  maxPlayers: number;
  locked: boolean;
  metadata: Record<string, unknown>;
}

/**
 * The cross-pod directory reader. The default reads the matchmaker (below);
 * `installDirectoryReader` can replace it. A directory that cannot be read
 * answers 502 - never a one-pod undercount dressed up as the whole game.
 */
export type DirectoryReader = (mode: number) => Promise<RoomRow[]>;

const DIRECTORY_TIMEOUT_MS = 4_000;

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** One directory entry, in any of the field spellings the reporter and Colyseus use. */
const rowOf = (raw: unknown, mode: number, pod?: Record<string, unknown>): RoomRow | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = [r['colyseusRoomId'], r['roomId'], r['id']].find((v): v is string => typeof v === 'string' && v.length > 0);
  if (!id || r['private'] === true || r['unlisted'] === true) return null;
  const players = num(r['clients'] ?? r['players']);
  const maxPlayers = num(r['maxClients'] ?? r['maxPlayers'], MAX_PLAYERS_PER_ROOM) || MAX_PLAYERS_PER_ROOM;
  const metadata: Record<string, unknown> = { roomId: id, region: REGION, maxPlayers, currentPlayers: players, mode, modeName: MODES[mode] };
  // Whatever the directory says about WHICH POD holds the room is passed on, so
  // the client's RoomLocator can join it there rather than wherever a bare
  // joinById happens to land.
  for (const key of ['podName', 'endpoint', 'publicAddress', 'podEndpoint'] as const) {
    const value = text(r[key]) ?? text(pod?.[key]);
    if (value) metadata[key] = value;
  }
  return {
    region: REGION,
    id,
    type: 'public',
    players,
    maxPlayers,
    locked: r['locked'] === true || players >= maxPlayers,
    metadata,
  };
};

/**
 * The matchmaker's directory: `GET ${MATCHMAKER_REPORT_URL}/${BLOXITY_GAME_ID}/rooms`,
 * the same resource every pod POSTs its snapshot to (`legion-room-reporter`),
 * authenticated with the pod's report token. Accepts `{ rooms }`,
 * `{ pods: [{ podName, rooms }] }` or a bare array; anything else throws, and
 * the caller answers 502.
 */
const matchmakerDirectory: DirectoryReader = async (mode) => {
  if (!(mode in MODES)) return [];
  const base = process.env['MATCHMAKER_REPORT_URL']?.trim() ?? '';
  const gameId = process.env['BLOXITY_GAME_ID']?.trim();
  const token = process.env['BLOXITY_REPORT_TOKEN']?.trim();
  if (!gameId) throw new Error('BLOXITY_GAME_ID is not set');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECTORY_TIMEOUT_MS);
  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/${encodeURIComponent(gameId)}/rooms`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`directory answered ${response.status}`);
    const body = (await response.json()) as unknown;
    const b = body as { rooms?: unknown; pods?: unknown };
    const rows: RoomRow[] = [];
    const add = (list: unknown, pod?: Record<string, unknown>): void => {
      if (!Array.isArray(list)) return;
      for (const entry of list) {
        const row = rowOf(entry, mode, pod);
        if (row) rows.push(row);
      }
    };
    if (Array.isArray(body)) add(body);
    else if (Array.isArray(b?.rooms)) add(b.rooms);
    else if (Array.isArray(b?.pods)) for (const pod of b.pods) add((pod as { rooms?: unknown })?.rooms, pod as Record<string, unknown>);
    else throw new Error('directory answered an unrecognised shape');
    return rows;
  } finally {
    clearTimeout(timer);
  }
};

let directoryReader: DirectoryReader | null = matchmakerDirectory;

export const installDirectoryReader = (reader: DirectoryReader): void => {
  directoryReader = reader;
};

const version = (): string => process.env['BLOXITY_VERSION']?.trim() || process.env['GIT_SHA']?.trim().slice(0, 7) || '0.1.0';

/** This process's own rooms (local development / single-process hosting only). */
const localRooms = async (mode: number): Promise<RoomRow[]> => {
  if (!(mode in MODES)) return [];
  const live = await matchMaker.query({ name: ROOM_NAME });
  return live
    .filter((room) => !room.private && !room.unlisted)
    .map((room) => {
      const maxPlayers = room.maxClients || MAX_PLAYERS_PER_ROOM;
      return {
        region: REGION,
        id: room.roomId,
        type: 'public' as const,
        players: room.clients,
        maxPlayers,
        locked: room.locked || room.clients >= maxPlayers,
        metadata: {
          roomId: room.roomId,
          region: REGION,
          maxPlayers,
          currentPlayers: room.clients,
          mode,
          modeName: MODES[mode],
        },
      };
    });
};

export const handleAllRooms = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const mode = Number.parseInt(url.searchParams.get('mode') ?? '0', 10) || 0;
  const reply = (status: number, body: Record<string, unknown>): void => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    response.end(JSON.stringify(body));
  };
  const empty = (online: boolean): Record<string, unknown> => ({
    rooms: [],
    servers: [REGION],
    onlineServers: online ? [REGION] : [],
    totalPlayers: 0,
    totalRooms: 0,
    timestamp: Date.now(),
    version: version(),
    mode,
  });

  const token = process.env['LEGION_GETROOMS_API_TOKEN']?.trim();
  if (token) {
    const supplied = (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
    if (supplied !== token) {
      reply(401, { error: 'unauthorized' });
      return;
    }
  }

  let rooms: RoomRow[];
  try {
    if (process.env['MATCHMAKER_REPORT_URL']?.trim()) {
      if (!directoryReader) throw new Error('no cross-pod directory reader is installed');
      rooms = await directoryReader(mode);
    } else {
      rooms = await localRooms(mode);
    }
  } catch (error) {
    logger.warn(SCOPE, `room directory unreadable: ${String(error)}`);
    reply(502, empty(false));
    return;
  }

  const totalPlayers = rooms.reduce((sum, room) => sum + room.players, 0);
  reply(200, { ...empty(true), rooms, totalPlayers, totalRooms: rooms.length });
};
