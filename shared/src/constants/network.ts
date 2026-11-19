/**
 * Network-level constants. Must stay identical on client and server.
 */

/** Colyseus room registered by the server and joined by the client. */
export const ROOM_NAME = 'racetrack';

/**
 * Default server port. Override with the PORT env var on the server.
 * Not 2567 or any port another game on this machine uses (see the CLAUDE.md files under D:\).
 */
export const DEFAULT_SERVER_PORT = 3681;

/** Most players in one room: one per plot. */
export const MAX_PLAYERS_PER_ROOM = 6;

/** Server simulation / state broadcast rate, in Hz. */
export const SERVER_TICK_RATE = 20;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

/**
 * Client->server and server->client message identifiers. Every client
 * message is INPUT or a REQUEST: the server simulates the one and checks the
 * other, and says why not (`Notice`) when it refuses.
 */
export const MessageType = {
  // ---- client -> server
  Move: 'move',
  /** Snap a track item onto the glowing end of your track. */
  Place: 'place',
  /** Take a piece (and every piece after it) back into the inventory. */
  Remove: 'remove',
  PlaceDecor: 'placeDecor',
  RemoveDecor: 'removeDecor',
  /** Take every piece back (the Clear button). */
  ClearTrack: 'clearTrack',
  /** Buy track, decorations, a crate, a Base Upgrade, a car upgrade. */
  Buy: 'buy',
  /** Drive this car from now on. */
  Equip: 'equip',
  /** Repair a car at the Pit Stop. */
  Repair: 'repair',
  /** Start driving on a plot (yours, someone else's, the Showcase). */
  Drive: 'drive',
  DrivePose: 'drivePose',
  DriveCollect: 'driveCollect',
  DriveAir: 'driveAir',
  DriveEnd: 'driveEnd',
  Rebirth: 'rebirth',
  Building: 'building',
  AdReward: 'adReward',
  FreeGift: 'freeGift',
  /** Buy a pack or the 2x Money pass with cash ({ sku }). */
  BuyPack: 'buyPack',
  Like: 'like',
  Publish: 'publish',
  Browse: 'browse',
  Visit: 'visit',
  Slot: 'slot',
  Teleport: 'teleport',
  Base: 'base',
  Respawn: 'respawn',
  Chat: 'chat',
  SetAvatar: 'setAvatar',
  SetIdentity: 'setIdentity',
  SetAuth: 'setAuth',
  Emote: 'emote',
  // ---- server -> client
  Placed: 'placed',
  Notice: 'notice',
  Track: 'track',
  Coins: 'coins',
  Fx: 'fx',
  Profile: 'profile',
  DriveStart: 'driveStart',
  Crate: 'crate',
  Gallery: 'gallery',
  Arena: 'arena',
  Offline: 'offline',
  ChatLine: 'chatLine',
  Banner: 'banner',
  Reward: 'reward',
  AuthState: 'authState',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
