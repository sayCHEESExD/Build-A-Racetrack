import {
  BLOXITY_HOSTING_ID,
  MessageType,
  ROOM_NAME,
  type AuthStateMessage,
  type BannerMessage,
  type BuyKind,
  type ChatLineMessage,
  type CoinsMessage,
  type EmoteMessage,
  type FxMessage,
  type MoveMessage,
  type NoticeMessage,
  type PlacedMessage,
  type ProfileMessage,
  type RewardMessage,
  type SetAuthMessage,
  type SetAvatarMessage,
  type SetIdentityMessage,
  type TrackMessage,
  type ArenaMessage,
  type CrateMessage,
  type DriveEndReason,
  type DrivePoseMessage,
  type DriveStartMessage,
  type GalleryMessage,
  type GalleryTab,
  type OfflineMessage,
  type TeleportTarget,
} from '@race/shared';
import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import { clientConfig } from '../config/clientConfig.js';
import { takeDeepLinkRoom } from './deepLink.js';
import { bloxityEnv } from '../bloxity/environment.js';
import { locateHostedRoom, locateLocalRoom } from './RoomLocator.js';
import { resolveRelay } from './matchmaker.js';
import { logger } from '../util/logger.js';
import type { ConnectionStatus, NetGameState, NetPlayerState } from './netTypes.js';

const SCOPE = 'NetworkClient';

/** Key under which this browser's stable player id is kept. */
const PLAYER_ID_KEY = 'racetrack.playerId';

/** Backoff between join attempts, in milliseconds: a cold start can take ~45 s, so keep asking for about a minute. */
const JOIN_BACKOFF_MS = [1000, 2000, 4000, 6000, 8000, 10000, 12000, 15000] as const;

/**
 * Backoff between AUTOMATIC RECONNECT attempts. It never gives up: a deploy or
 * a pod waking from scale-to-zero can take a minute, and a player who left the
 * tab open should find the game back without reloading. The first wait also
 * gives the server time to land the save from the session that just dropped.
 */
const RECONNECT_BACKOFF_MS = [1000, 2000, 3000, 5000, 8000, 15000, 30000] as const;

/** The server's "storage unavailable" refusal: keep retrying, the database will be back. */
const STORAGE_UNAVAILABLE = 4105;
/** The server closed this session because the same profile joined elsewhere. */
const REPLACED_CODE = 4201;

/** A join failure, readable: a refused socket arrives as a bare browser Event, not an Error. */
const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'type' in error) return `server unreachable (${String((error as { type: unknown }).type)})`;
  return String(error);
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const resolvePlayerId = (): string => {
  // Dev builds only: ?pid=name plays as another guest, so one browser can test several players.
  const dev = clientConfig.debug ? new URLSearchParams(window.location.search).get('pid') : null;
  if (dev && /^[A-Za-z0-9_-]{2,40}$/.test(dev)) return 'p_' + dev;
  const fresh = `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    const existing = window.localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    window.localStorage.setItem(PLAYER_ID_KEY, fresh);
  } catch {
    return fresh;
  }
  return fresh;
};

/** Dev builds: ?pid=name also names the player, so test tabs are told apart. */
const devIdentity = (identity: SetIdentityMessage | undefined): SetIdentityMessage | undefined => {
  const pid = clientConfig.debug ? new URLSearchParams(window.location.search).get('pid') : null;
  return pid ? { displayName: pid.slice(0, 20), avatarUrl: '' } : identity;
};

export interface NetworkHandlers {
  onStatusChange?(status: ConnectionStatus, detail?: string): void;
  onSelfJoined?(sessionId: string): void;
  onPlayerAdded?(sessionId: string, player: NetPlayerState): void;
  onPlayerChanged?(sessionId: string, player: NetPlayerState): void;
  onPlayerRemoved?(sessionId: string): void;
  onPlaced?(message: PlacedMessage): void;
  onNotice?(message: NoticeMessage): void;
  onTrack?(message: TrackMessage): void;
  onCoins?(message: CoinsMessage): void;
  onProfile?(message: ProfileMessage): void;
  onReward?(message: RewardMessage): void;
  onFx?(message: FxMessage): void;
  onChatLine?(message: ChatLineMessage): void;
  onBanner?(message: BannerMessage): void;
  onDriveStart?(message: DriveStartMessage): void;
  onCrate?(message: CrateMessage): void;
  onGallery?(message: GalleryMessage): void;
  onArena?(message: ArenaMessage): void;
  onOffline?(message: OfflineMessage): void;
  onAuthState?(message: AuthStateMessage): void;
  /**
   * An automatic reconnect found a NEW room: forget the old one's players and
   * session (they left without a word when the connection died). Fired just
   * before the new room's state starts arriving.
   */
  onSessionReset?(): void;
}

/**
 * Thin wrapper over colyseus.js. The rest of the client never imports
 * colyseus.js directly. Every method that changes the game is a REQUEST; the
 * server decides.
 */
export class NetworkClient {
  private readonly handlers: NetworkHandlers;
  private client: Client | null = null;
  private room: Room<NetGameState> | null = null;
  /**
   * True from a successful join until the room is left. The room object is
   * KEPT after a disconnect - its last state keeps the world drawn behind the
   * "reload" notice - but nothing is sent to it any more.
   */
  private live = false;
  /** `disconnect()` was called: a leave that must NOT be reconnected. */
  private leaving = false;
  /** A reconnect loop is running. */
  private reconnecting = false;
  /** The matchmaker (told playUrl) the current room was reached through. */
  private joinedPlayUrl = '';
  /** Cuts a reconnect wait short (the browser came back online). */
  private wake: (() => void) | null = null;
  private status: ConnectionStatus = 'idle';
  private token: (() => string | null) | null = null;
  private sentToken: string | null | undefined = undefined;
  private look: (() => SetAvatarMessage | null) | null = null;
  private identityOf: (() => SetIdentityMessage) | null = null;

  constructor(handlers: NetworkHandlers = {}) {
    this.handlers = handlers;
  }

  setLookProvider(provider: () => SetAvatarMessage | null): void {
    this.look = provider;
  }

  setTokenProvider(provider: () => string | null): void {
    this.token = provider;
  }

  setDisplayProvider(provider: () => SetIdentityMessage): void {
    this.identityOf = provider;
  }

  sendAvatar(message: SetAvatarMessage): void {
    this.send(MessageType.SetAvatar, message);
  }

  sendIdentity(message: SetIdentityMessage): void {
    this.send(MessageType.SetIdentity, devIdentity(message) ?? message);
  }

  /** The login changed: the live session switches profile. Deduped - but only a token that was actually SENT counts. */
  sendAuth(token: string | null): void {
    if (token === this.sentToken) return;
    const message: SetAuthMessage = { token };
    if (this.send(MessageType.SetAuth, message)) this.sentToken = token;
  }

  /**
   * THE ONE WAY anything reaches the server, and only while the room's socket
   * is actually open.
   *
   * After a disconnect (a server restart, a deploy, Legion scaling an idle pod
   * to zero) the game keeps running its frame loop, and every frame's input -
   * plus any click - used to go to the closed socket, each one logging
   * "WebSocket is already in CLOSING or CLOSED state": hundreds a second.
   * Nothing sent then could arrive anyway; the player is told to reload.
   */
  private send(type: Parameters<Room['send']>[0], message: unknown): boolean {
    const room = this.room;
    if (!room || !this.live || !room.connection?.isOpen) return false;
    room.send(type, message);
    return true;
  }

  /** The room state, once the first full patch has arrived (null before). */
  get state(): NetGameState | null {
    const state = this.room?.state;
    return state && state.players ? state : null;
  }

  get self(): NetPlayerState | null {
    const room = this.room;
    if (!room) return null;
    return room.state?.players?.get(room.sessionId) ?? null;
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get roomId(): string {
    return this.room?.roomId ?? '';
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  /** The server's clock, in seconds. */
  get elapsed(): number {
    return this.room?.state?.elapsed ?? 0;
  }

  async connect(): Promise<void> {
    if (!clientConfig.serverUrl && !clientConfig.useMatchmaker) {
      this.setStatus('error');
      throw new Error('No game server is configured. Set VITE_SERVER_URL to the Colyseus endpoint (for example wss://your-server-host) and rebuild.');
    }
    this.leaving = false;
    this.setStatus('connecting');
    logger.info(SCOPE, `joining "${ROOM_NAME}" ${clientConfig.useMatchmaker ? `via the matchmaker at ${bloxityEnv().playUrl} (${bloxityEnv().env})` : `at ${clientConfig.serverUrl}`}`);
    window.addEventListener('online', this.onOnline);
    const attempts = JOIN_BACKOFF_MS.length + 1;

    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.joinOnce();
        return;
      } catch (error) {
        const detail = describeError(error);
        const storageDown = (error as { code?: unknown }).code === STORAGE_UNAVAILABLE;
        logger.warn(SCOPE, `join attempt ${attempt}${storageDown ? '' : `/${attempts}`} failed: ${detail}`);
        if (!storageDown && attempt >= attempts) {
          this.setStatus('error', detail);
          throw error;
        }
        const wait = JOIN_BACKOFF_MS[Math.min(attempt, JOIN_BACKOFF_MS.length) - 1] ?? 0;
        this.setStatus('connecting', storageDown ? 'the server is waiting for its database' : `attempt ${attempt + 1}/${attempts}`);
        await sleep(wait);
      }
    }
  }

  /**
   * One join, and everything a fresh session needs: the same browser id and
   * the CURRENT portal token (so a reconnect lands on the same guest or
   * account profile), the avatar and the name. Throws when refused.
   */
  private async joinOnce(): Promise<void> {
    const client = await this.clientForJoin();
    const token = this.token?.() ?? null;
    const options = {
      playerId: resolvePlayerId(),
      token,
      avatar: this.look?.() ?? undefined,
      identity: devIdentity(this.identityOf?.()),
    };
    // An invite link or the store page's Join button names a room: try THAT one
    // first (once - a reconnect later goes wherever it is placed). A room that is
    // full, gone, or on another pod falls back to the normal join.
    const wanted = takeDeepLinkRoom();
    let room: Room<NetGameState> | null = null;
    // Hosted: the room is found in Boxity's cross-pod directory and joined through
    // the relay pinned to ITS pod (a bare joinById lands on a random pod). Local:
    // the dev server's own list. Gone or full: matchmaking as normal.
    const location = !wanted
      ? null
      : clientConfig.useMatchmaker
        ? await locateHostedRoom(bloxityEnv().playUrl, BLOXITY_HOSTING_ID, wanted)
        : await locateLocalRoom(clientConfig.serverUrl, wanted);
    if (wanted && location) {
      try {
        const target = location.endpoint ? new Client(location.endpoint) : client;
        room = await target.joinById<NetGameState>(wanted, options);
        logger.info(SCOPE, `joined room ${wanted} from the link${location.endpoint ? ` at ${location.endpoint}` : ''}`);
      } catch (error) {
        logger.info(SCOPE, `room ${wanted} from the link is unavailable (${describeError(error)}); joining normally`);
      }
    }
    room ??= await client.joinOrCreate<NetGameState>(ROOM_NAME, options);
    if (this.leaving) {
      // `disconnect()` was called while this join was on its way.
      void room.leave(true);
      return;
    }
    const replacing = this.room !== null;
    this.room = room;
    this.sentToken = token;
    this.live = true;
    if (replacing) this.handlers.onSessionReset?.();
    this.bindRoom(room);
    this.setStatus('connected');
    logger.info(SCOPE, `joined roomId=${room.roomId} sessionId=${room.sessionId}`);
    this.handlers.onSelfJoined?.(room.sessionId);
    // The login may have changed since the token above was read.
    this.sendAuth(this.token?.() ?? null);
  }

  /**
   * The Colyseus client for one join. Through the matchmaker, a fresh relay
   * every time (the pod the last one pointed at may be gone: a deploy, a scale
   * to zero); otherwise the one direct client, made once.
   */
  private async clientForJoin(): Promise<Client> {
    if (clientConfig.useMatchmaker) {
      this.joinedPlayUrl = bloxityEnv().playUrl;
      const relay = await resolveRelay(BLOXITY_HOSTING_ID);
      logger.info(SCOPE, `matchmaker placed us at ${relay.endpoint}${relay.cold ? ' (booting a server)' : ''}`);
      this.client = new Client(relay.endpoint);
      return this.client;
    }
    this.client ??= new Client(clientConfig.serverUrl);
    return this.client;
  }

  /**
   * BOXITY TOLD THE PAGE ITS ENVIRONMENT AFTER WE JOINED (an embedded game hears
   * it in the portal's handshake, which can land after init). If that moved the
   * matchmaker - say the page joined prod before learning it is on stage - leave
   * and rejoin through the matchmaker it was told; the normal reconnect path
   * resolves a fresh endpoint there. Nothing happens when the matchmaker is the
   * same one.
   */
  environmentChanged(): void {
    if (!clientConfig.useMatchmaker || !this.live || this.reconnecting || this.leaving) return;
    const playUrl = bloxityEnv().playUrl;
    if (!this.joinedPlayUrl || playUrl === this.joinedPlayUrl) return;
    logger.info(SCOPE, `environment changed: matchmaker ${this.joinedPlayUrl} -> ${playUrl}; rejoining there`);
    // Leaving fires onLeave (not a replacement, not a deliberate disconnect), which reconnects.
    void this.room?.leave(true).catch(() => undefined);
  }

  /**
   * THE CONNECTION DROPPED WITHOUT US ASKING: rejoin, for as long as it takes.
   *
   * A NEW session, not a Colyseus seat-reservation reconnect: after a deploy,
   * a crash or scale-to-zero the old room no longer exists, and a rejoin
   * reads the profile the server saved when the old session left. The world
   * stays drawn meanwhile, input is paused, and the HUD says so.
   */
  private async reconnect(): Promise<void> {
    if (this.reconnecting || this.leaving) return;
    this.reconnecting = true;
    try {
      for (let attempt = 1; !this.leaving; attempt += 1) {
        const wait = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length) - 1] ?? 30000;
        this.setStatus('reconnecting', `attempt ${attempt}`);
        await this.pause(wait);
        if (this.leaving) return;
        try {
          await this.joinOnce();
          logger.info(SCOPE, `reconnected after ${attempt} attempt(s)`);
          return;
        } catch (error) {
          logger.warn(SCOPE, `reconnect attempt ${attempt} failed: ${describeError(error)}`);
        }
      }
    } finally {
      this.reconnecting = false;
    }
  }

  /** A wait that `online` cuts short. */
  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      function done(): void {
        clearTimeout(timer);
        resolve();
      }
      this.wake = () => {
        this.wake = null;
        done();
      };
    });
  }

  private readonly onOnline = (): void => {
    logger.info(SCOPE, 'browser is back online');
    this.wake?.();
  };

  // ---------------------------------------------------------------- requests

  sendInput(message: MoveMessage): void {
    this.send(MessageType.Move, message);
  }

  place(k: string, flip: boolean): void {
    this.send(MessageType.Place, { k, flip });
  }

  remove(i: number): void {
    this.send(MessageType.Remove, { i });
  }

  placeDecor(k: string, x: number, z: number, r: number): void {
    this.send(MessageType.PlaceDecor, { k, x, z, r });
  }

  removeDecor(x: number, z: number): void {
    this.send(MessageType.RemoveDecor, { x, z });
  }

  clearTrack(): void {
    this.send(MessageType.ClearTrack, {});
  }

  buy(kind: BuyKind, key: string, count = 1, car?: string): void {
    this.send(MessageType.Buy, car ? { kind, key, count, car } : { kind, key, count });
  }

  equip(key: string): void {
    this.send(MessageType.Equip, { key });
  }

  repair(key: string): void {
    this.send(MessageType.Repair, { key });
  }

  drive(plot: number): void {
    this.send(MessageType.Drive, { plot });
  }

  drivePose(message: DrivePoseMessage): void {
    this.send(MessageType.DrivePose, message);
  }

  driveCollect(run: number, i: number, lap: number): void {
    this.send(MessageType.DriveCollect, { run, i, lap });
  }

  driveAir(run: number, air: number, dist: number): void {
    this.send(MessageType.DriveAir, { run, air, dist });
  }

  driveEnd(run: number, reason: DriveEndReason, impact: number): void {
    this.send(MessageType.DriveEnd, { run, reason, impact });
  }

  freeGift(): void {
    this.send(MessageType.FreeGift, {});
  }

  like(target: { plot?: number; code?: string }): void {
    this.send(MessageType.Like, target);
  }

  publish(name: string, desc: string): void {
    this.send(MessageType.Publish, { name, desc });
  }

  browse(tab: GalleryTab): void {
    this.send(MessageType.Browse, { tab });
  }

  visit(code: string): void {
    this.send(MessageType.Visit, { code });
  }

  slot(slot: number, action: 'save' | 'load'): void {
    this.send(MessageType.Slot, { slot, action });
  }

  teleport(to: TeleportTarget): void {
    this.send(MessageType.Teleport, { to });
  }

  building(on: boolean): void {
    this.send(MessageType.Building, { on });
  }

  /** A rewarded ad completed: the server verifies the token with Boxity and pays. */
  adReward(placement: string, token: string): void {
    this.send(MessageType.AdReward, { placement, token });
  }

  rebirth(): void {
    this.send(MessageType.Rebirth, {});
  }

  base(): void {
    this.send(MessageType.Base, {});
  }

  respawn(): void {
    this.send(MessageType.Respawn, {});
  }

  chat(text: string): void {
    this.send(MessageType.Chat, { text });
  }

  /** Play a Bloxity emote (cosmetic): the server replicates it to everyone. */
  emote(id: string): void {
    const message: EmoteMessage = { id };
    this.send(MessageType.Emote, message);
  }

  /** Dev only: the server's test hooks (it ignores them unless run with --dev-cheats). */
  sendDev(message: Record<string, unknown>): void {
    this.send('dev', message);
  }

  async disconnect(): Promise<void> {
    this.leaving = true;
    this.live = false;
    this.wake?.();
    window.removeEventListener('online', this.onOnline);
    await this.room?.leave(true);
    this.room = null;
    this.sentToken = undefined;
    this.setStatus('disconnected');
  }

  private bindRoom(room: Room<NetGameState>): void {
    const $ = getStateCallbacks(room);

    $(room.state).players.onAdd((player, sessionId) => {
      const changed = (): void => this.handlers.onPlayerChanged?.(sessionId, player);
      this.handlers.onPlayerAdded?.(sessionId, player);
      $(player).onChange(changed);
      // A NESTED schema's changes do not bubble to its parent: listen to each.
      $(player.avatar).onChange(changed);
    });
    $(room.state).players.onRemove((_player, sessionId) => this.handlers.onPlayerRemoved?.(sessionId));

    room.onMessage<PlacedMessage>(MessageType.Placed, (message) => this.handlers.onPlaced?.(message));
    room.onMessage<NoticeMessage>(MessageType.Notice, (message) => this.handlers.onNotice?.(message));
    room.onMessage<TrackMessage>(MessageType.Track, (message) => this.handlers.onTrack?.(message));
    room.onMessage<CoinsMessage>(MessageType.Coins, (message) => this.handlers.onCoins?.(message));
    room.onMessage<ProfileMessage>(MessageType.Profile, (message) => this.handlers.onProfile?.(message));
    room.onMessage<RewardMessage>(MessageType.Reward, (message) => this.handlers.onReward?.(message));
    room.onMessage<FxMessage>(MessageType.Fx, (message) => this.handlers.onFx?.(message));
    room.onMessage<ChatLineMessage>(MessageType.ChatLine, (message) => this.handlers.onChatLine?.(message));
    room.onMessage<BannerMessage>(MessageType.Banner, (message) => this.handlers.onBanner?.(message));
    room.onMessage<DriveStartMessage>(MessageType.DriveStart, (message) => this.handlers.onDriveStart?.(message));
    room.onMessage<CrateMessage>(MessageType.Crate, (message) => this.handlers.onCrate?.(message));
    room.onMessage<GalleryMessage>(MessageType.Gallery, (message) => this.handlers.onGallery?.(message));
    room.onMessage<ArenaMessage>(MessageType.Arena, (message) => this.handlers.onArena?.(message));
    room.onMessage<OfflineMessage>(MessageType.Offline, (message) => this.handlers.onOffline?.(message));
    room.onMessage<AuthStateMessage>(MessageType.AuthState, (message) => {
      logger.info(SCOPE, `playing as ${message.status}${message.note ? ` (${message.note})` : ''}`);
      this.handlers.onAuthState?.(message);
    });
    room.onError((code, message) => {
      // Logged only: if the socket goes with it, onLeave reconnects.
      logger.error(SCOPE, `room error ${code}: ${message ?? ''}`);
    });
    room.onLeave((code) => {
      // Only once, and only for the CURRENT room: the socket is gone, so stop sending (see `send`).
      if (room !== this.room || !this.live) return;
      this.live = false;
      if (this.leaving) {
        this.setStatus('disconnected', `code ${code}`);
        return;
      }
      // Replaced by a newer session on the same profile (another tab): never fight it for the seat.
      if (code === REPLACED_CODE) {
        this.leaving = true;
        this.setStatus('disconnected', 'replaced');
        return;
      }
      logger.warn(SCOPE, `connection lost (code ${code}); reconnecting`);
      void this.reconnect();
    });
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    this.status = status;
    this.handlers.onStatusChange?.(status, detail);
  }
}
