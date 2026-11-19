import type { AvatarAppearance, AvatarProportions } from './avatar.js';

/**
 * Client -> server input (MessageType.Move). INPUT ONLY: the server simulates
 * movement from intent and owns the result. `pitch` rides along for the head.
 */
export interface MoveMessage {
  seq: number;
  dt: number;
  moveX: number;
  moveZ: number;
  cameraYaw: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  face: boolean;
  pitch?: number;
}

/** Snap a track item onto the glowing end of your track (flip: its mirrored shape). */
export interface PlaceMessage {
  k: string;
  flip?: boolean;
}

/** Take back the piece at this index of your track, and every piece after it. */
export interface RemoveMessage {
  i: number;
}

/** Put a decoration from the inventory on a cell of your plot. */
export interface PlaceDecorMessage {
  k: string;
  x: number;
  z: number;
  r: number;
}

/** Take back the decoration covering a cell. */
export interface RemoveDecorMessage {
  x: number;
  z: number;
}

export type BuyKind = 'track' | 'decor' | 'crate' | 'base' | 'carup';

export interface BuyMessage {
  kind: BuyKind;
  key: string;
  /** Track / decor: how many (1 or 5). Car upgrades: the car. */
  count?: number;
  car?: string;
}

export interface KeyMessage {
  key: string;
}

/** Start driving: on a plot (yours or a visit) or the Showcase (ARENA_INDEX). */
export interface DriveMessage {
  plot: number;
}

/** The car where the driver's client has it (about ten a second). */
export interface DrivePoseMessage {
  run: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  v: number;
}

/** The car reached a piece of the track (index into that plot's pieces). */
export interface DriveCollectMessage {
  run: number;
  i: number;
  lap: number;
}

/** A jump landed (or ended in a crash): seconds in the air, studs travelled. */
export interface DriveAirMessage {
  run: number;
  air: number;
  dist: number;
}

export type DriveEndReason = 'crash' | 'finish' | 'exit';

export interface DriveEndMessage {
  run: number;
  reason: DriveEndReason;
  /** Impact speed of a crash. */
  impact: number;
}

/** The run the server started: its id, the plot, and the car's numbers. */
export interface DriveStartMessage {
  run: number;
  plot: number;
  car: string;
  /** Effective stats (upgrades and condition applied). */
  speed: number;
  accel: number;
  handling: number;
  cash: number;
}

export interface PublishMessage {
  name: string;
  desc: string;
}

export type GalleryTab = 'hot' | 'new' | 'liked' | 'visited' | 'mine';

export interface BrowseMessage {
  tab: GalleryTab;
}

export interface GalleryEntry {
  code: string;
  name: string;
  owner: string;
  likes: number;
  visits: number;
  pieces: number;
  /** Packed pieces, for the card's little map. */
  p: number[];
}

export interface GalleryMessage {
  tab: GalleryTab;
  items: GalleryEntry[];
  /** The asking player's own stats (Profile tab). */
  mine?: { visits: number; likes: number; tracks: number };
}

export interface VisitMessage {
  code: string;
}

/** Server -> client: the published track loaded onto the Showcase for you. */
export interface ArenaMessage {
  code: string;
  name: string;
  owner: string;
  p: number[];
  d: number[];
}

export interface LikeMessage {
  /** A plot in the room, or a published code. */
  plot?: number;
  code?: string;
}

export interface SlotMessage {
  slot: number;
  action: 'save' | 'load';
}

export type TeleportTarget = 'track' | 'decor' | 'crate' | 'base' | 'spawn' | 'arena';

export interface TeleportMessage {
  to: TeleportTarget;
}

export interface ChatMessage {
  text: string;
}

/** A finished rewarded ad: what it was for and Boxity's one-use token. */
export interface AdRewardMessage {
  placement: string;
  token: string;
}

/** Why a player was placed. */
export type PlacedReason = 'join' | 'respawn' | 'base' | 'correction' | 'drive' | 'teleport';

export interface PlacedMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  reason: PlacedReason;
}

export type NoticeKind = 'good' | 'bad' | 'info' | 'gold';

export interface NoticeMessage {
  kind: NoticeKind;
  text: string;
}

/** A plot's whole track and decorations (packed), with its social numbers. */
export interface TrackMessage {
  plot: number;
  p: number[];
  d: number[];
  likes: number;
  visits: number;
  tier: number;
  by?: string;
}

/** Cash piled on each piece, per plot, once a second (whole dollars, track order), and the plot's multiplier. */
export interface CoinsMessage {
  plots: { plot: number; f: number[]; sc: number }[];
}

export type FxKind = 'place' | 'remove' | 'buy' | 'collect' | 'crash' | 'finish' | 'rebirth' | 'denied' | 'upgrade' | 'repair' | 'like';

export interface FxMessage {
  k: FxKind;
  x: number;
  y: number;
  z: number;
  v?: number;
  by?: string;
}

export interface ChatLineMessage {
  kind: 'chat' | 'join' | 'leave' | 'tip' | 'system';
  name?: string;
  text: string;
}

export interface BannerMessage {
  title: string;
  sub?: string;
  tone: 'info' | 'gold' | 'level' | 'ride';
  seconds?: number;
}

export interface RewardMessage {
  amount: number;
  why: string;
}

/** One owned car: its upgrade levels and condition. */
export interface OwnedCar {
  lv: Record<string, number>;
  cond: number;
}

/** Server -> one client: their private progress. */
export interface ProfileMessage {
  inventory: Record<string, number>;
  decor: Record<string, number>;
  cars: Record<string, OwnedCar>;
  /** Shop stock left this restock: track items, decorations, crates. */
  stock: { track: Record<string, number>; decor: Record<string, number>; crate: Record<string, number> };
  /** When the shops restock next (server epoch ms). */
  restockAt: number;
  /** Money boost: the 2x pass, and a timed boost ending at (epoch ms). */
  pass2x: boolean;
  boostUntil: number;
  /** Next free gift (epoch ms of play time reached: seconds left). */
  giftIn: number;
  /** Save slots: piece counts (0 = empty). */
  slots: number[];
  /** Published code of their track ('' none). */
  code: string;
  /** Liked plots' owners and codes this session (the Like button greys out). */
  liked: string[];
}

/** A crate was opened: the car that came out (new or a duplicate turned into cash). */
export interface CrateMessage {
  crate: string;
  car: string;
  duplicate: boolean;
  refund: number;
}

/** Welcome back: what the track earned while they were away. */
export interface OfflineMessage {
  amount: number;
  seconds: number;
}

export interface SetAvatarMessage {
  appearance: AvatarAppearance;
  proportions: AvatarProportions;
}

export interface SetIdentityMessage {
  displayName: string;
  avatarUrl: string;
}

export interface EmoteMessage {
  id: string;
}

/** A Bloxity emote catalogue id: 24 hex characters. */
export const isEmoteId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id);

export interface SetAuthMessage {
  token: string | null;
}

export type AuthStatus = 'account' | 'guest' | 'unavailable';

export interface AuthStateMessage {
  status: AuthStatus;
  note?: string;
}
