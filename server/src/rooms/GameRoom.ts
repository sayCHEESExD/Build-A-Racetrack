import { Client, Room, ServerError, matchMaker } from '@colyseus/core';
import {
  MAX_PLAYERS_PER_ROOM,
  MessageType,
  ROOM_NAME,
  ACCOUNT_KEY_PREFIX,
  accountKeyFor,
  isAccountKey,
  isEmoteId,
  isValidGuestId,
  sanitizeAppearance,
  sanitizeIdentity,
  sanitizeProportions,
  type AuthStateMessage,
  type AuthStatus,
  AD_MONEY_BOOST,
  type AdRewardMessage,
  type BuyMessage,
  type DriveAirMessage,
  type DriveCollectMessage,
  type DriveEndMessage,
  type DrivePoseMessage,
  type PlaceDecorMessage,
  type RemoveDecorMessage,
  type TeleportMessage,
  type ChatMessage,
  type EmoteMessage,
  type KeyMessage,
  type MoveMessage,
  type NoticeKind,
  type NoticeMessage,
  type PlaceMessage,
  type SetAuthMessage,
  type SetAvatarMessage,
  type SetIdentityMessage,
} from '@race/shared';
import { tokenHash, verifyGameToken } from '../auth/BloxityAuth.js';
import { verifyAdReward } from '../bloxity/adRewards.js';
import { bloxityServerEnv } from '../bloxity/environment.js';
import { reportIdentityOf, statRegistry, statValuesOf, type StatRow } from '../bloxity/statReporter.js';
import { serverConfig } from '../config/serverConfig.js';
import { activeKeys } from '../game/ActiveKeys.js';
import { RaceGame } from '../game/RaceGame.js';
import { buxGrants } from '../progression/BuxGrants.js';
import type { Player, PlayerSave, TrackSave } from '../game/Player.js';
import { hasProgress, progressOf, storage, type ProfileFields, type StoredProfile } from '../persistence/index.js';
import { profileStore } from '../progression/ProfileStore.js';
import { logger } from '../util/logger.js';
import { GameState } from './state/GameState.js';
import { PlayerState } from './state/PlayerState.js';

const SCOPE = 'GameRoom';

/** Seconds between autosaves of every connected player. */
const AUTOSAVE_SECONDS = 20;
const REVERIFY_FIRST_MS = 15_000;
const REVERIFY_MAX_MS = 120_000;
const SWITCH_SAVE_TIMEOUT_MS = 8000;
const LEAVE_SAVE_TIMEOUT_MS = 5000;
const MAX_TOKEN_LENGTH = 4096;
const NOTICE_GAP_MS = 700;
/** How long an empty room stays open. */
const EMPTY_ROOM_MS = 10 * 60_000;
/** Close code for a session replaced by a newer one on the same profile (the client does not reconnect). */
export const REPLACED_CODE = 4201;

/** The dev-only test message (see `onDev`). */
interface DevMessage {
  tp?: [number, number, number];
  cash?: number;
  tier?: number;
  /** Fill every cash pile. */
  piles?: boolean;
  /** Give this many of every track item. */
  items?: number;
  cond?: number;
  cars?: boolean;
  /** Max tier, every car, and the full end-game test track on their plot. */
  endgame?: boolean;
}

/** Join refusals. The client's retry/backoff recognises STORAGE_UNAVAILABLE. */
export const JOIN_ERROR = {
  ROOM_FULL: 4103,
  BAD_PLAYER_ID: 4104,
  STORAGE_UNAVAILABLE: 4105,
} as const;

interface JoinOptions {
  /** The browser's own guest id. NEVER an account id; the prefix is refused. */
  playerId?: string;
  /** The portal's game token, or nothing. Verified with Bloxity, never trusted. */
  token?: string | null;
  avatar?: SetAvatarMessage;
  identity?: SetIdentityMessage;
}

/** What `onAuth` resolves and hands to `onJoin`. */
interface ResolvedProfile {
  readonly key: string;
  readonly guestKey: string;
  readonly accountKey: string | null;
  readonly token: string | null;
  readonly tokenHash: string;
  readonly status: AuthStatus;
  readonly profile: StoredProfile | null;
  readonly migrated: boolean;
  readonly username: string;
  /** Their game save and their racetrack, read from storage now. */
  readonly save: Partial<PlayerSave> | null;
  readonly track: Record<string, unknown> | null;
}

/** Per-session bookkeeping the replicated state must not carry. */
interface Session {
  key: string;
  guestKey: string;
  accountKey: string | null;
  token: string | null;
  tokenHash: string;
  status: AuthStatus;
  switching: boolean;
  queued: SetAuthMessage | null;
  reverifyAt: number;
  reverifyDelay: number;
  lastNotice: string;
  lastNoticeAt: number;
  /** Gives the profile key back (see ActiveKeys). */
  release: (() => void) | null;
}


/**
 * ONE ROOM ("Build A Racetrack | Lobby N"): up to 6 players, a plot and a
 * racetrack each. Composition only: the rules live in `RaceGame`. Nothing a
 * client sends is copied into state; a Move is simulated, a piece, a
 * purchase, a run are REQUESTS the server checks.
 *
 * WHOSE PROGRESS a session plays on is decided as in every game of this
 * series: the browser id and the portal TOKEN, verified with Bloxity; the
 * profile and the player's save are READ FROM STORAGE in `onAuth` - a
 * failed read refuses the join rather than seating someone on an empty
 * profile that would autosave over their real one.
 */
export class GameRoom extends Room<GameState> {
  override maxClients = MAX_PLAYERS_PER_ROOM;
  /** An empty room stays a while (a reload finds the same lobby). */
  override autoDispose = false;
  private emptyTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly sessions = new Map<string, Session>();
  private removeStatSource: (() => void) | null = null;
  private game!: RaceGame;
  private grantClock = 0;
  private autosaveTimer = 0;
  /** Sessions being evicted: resolved once their leave-saves have landed. */
  private readonly leftWaiters = new Map<string, () => void>();

  override async onCreate(): Promise<void> {
    this.state = new GameState();
    this.setPatchRate(serverConfig.patchRateMs);
    // Lobby number: the lowest one no live room on this server is using.
    const live = await matchMaker.query({ name: ROOM_NAME });
    const taken = new Set(live.map((r) => (r.metadata as { lobby?: number } | undefined)?.lobby).filter((n): n is number => typeof n === 'number'));
    let lobby = 1;
    while (taken.has(lobby)) lobby += 1;
    this.state.lobby = lobby;
    await this.setMetadata({ lobby });

    this.game = new RaceGame(this.state, {
      now: () => this.state.elapsed,
      send: (sessionId, type, message) => this.clientOf(sessionId)?.send(type, message),
      broadcast: (type, message) => this.broadcast(type, message),
      notify: (sessionId, kind, text) => this.notify(sessionId, kind, text),
      save: (sessionId) => {
        const p = this.game.players.get(sessionId);
        if (p) this.persist(sessionId, p);
      },
    });

    const who = (client: Client): Player | undefined => this.game.players.get(client.sessionId);
    const on = <T>(type: string, handler: (p: Player, m: T) => void): void => {
      this.onMessage(type, (client, m: T) => {
        const p = who(client);
        if (p) handler(p, (m ?? {}) as T);
      });
    };
    this.onMessage(MessageType.Move, (client, m: MoveMessage) => this.game.move(client.sessionId, m));
    on<PlaceMessage>(MessageType.Place, (p, m) => this.game.place(p, m));
    on<{ i?: unknown }>(MessageType.Remove, (p, m) => this.game.remove(p, m));
    on<PlaceDecorMessage>(MessageType.PlaceDecor, (p, m) => this.game.placeDecor(p, m));
    on<RemoveDecorMessage>(MessageType.RemoveDecor, (p, m) => this.game.removeDecor(p, m));
    on(MessageType.ClearTrack, (p) => this.game.clearTrack(p));
    on<BuyMessage>(MessageType.Buy, (p, m) => this.game.buy(p, m));
    on<KeyMessage>(MessageType.Equip, (p, m) => this.game.equip(p, m.key));
    on<KeyMessage>(MessageType.Repair, (p, m) => this.game.repair(p, m.key));
    on<{ plot?: unknown }>(MessageType.Drive, (p, m) => this.game.startDrive(p, m.plot));
    on<DrivePoseMessage>(MessageType.DrivePose, (p, m) => this.game.drivePose(p, m));
    on<DriveCollectMessage>(MessageType.DriveCollect, (p, m) => this.game.driveCollect(p, m));
    on<DriveAirMessage>(MessageType.DriveAir, (p, m) => this.game.driveAir(p, m));
    on<DriveEndMessage>(MessageType.DriveEnd, (p, m) => this.game.driveEnd(p, m));
    on(MessageType.Rebirth, (p) => this.game.rebirth(p));
    on<{ on?: boolean }>(MessageType.Building, (p, m) => {
      p.state.building = m.on === true && !p.run && p.plot >= 0;
    });
    on<AdRewardMessage>(MessageType.AdReward, (p, m) => void this.onAdReward(p, m));
    on(MessageType.FreeGift, (p) => this.game.freeGift(p));
    on<{ plot?: unknown; code?: unknown }>(MessageType.Like, (p, m) => this.game.like(p, m));
    on<{ name?: unknown; desc?: unknown }>(MessageType.Publish, (p, m) => this.game.publish(p, m));
    on<{ tab?: unknown }>(MessageType.Browse, (p, m) => this.game.browse(p, m));
    on<{ code?: unknown }>(MessageType.Visit, (p, m) => this.game.visit(p, m));
    on<{ slot?: unknown; action?: unknown }>(MessageType.Slot, (p, m) => this.game.slot(p, m));
    on<TeleportMessage>(MessageType.Teleport, (p, m) => this.game.teleport(p, m.to));
    on(MessageType.Base, (p) => this.game.base(p));
    on(MessageType.Respawn, (p) => this.game.base(p));
    on<ChatMessage>(MessageType.Chat, (p, m) => this.game.chat.say(p, m.text));
    this.onMessage(MessageType.Emote, (client, message: EmoteMessage) => this.onEmote(client.sessionId, message));
    this.onMessage(MessageType.SetIdentity, (client, message: SetIdentityMessage) => this.onSetIdentity(client, message));
    this.onMessage(MessageType.SetAvatar, (client, message: SetAvatarMessage) => this.onSetAvatar(client, message));
    this.onMessage(MessageType.SetAuth, (client, message: SetAuthMessage) => {
      void this.switchAuth(client, message, false);
    });
    if (serverConfig.devCheats) this.onMessage('dev', (client, message: DevMessage) => this.onDev(client.sessionId, message));

    this.removeStatSource = statRegistry.addSource(() => this.statRows());
    this.setSimulationInterval((deltaMs) => this.tick(deltaMs / 1000), serverConfig.patchRateMs);
    logger.info(SCOPE, `room ${this.roomId} created: Lobby ${lobby} (capacity ${MAX_PLAYERS_PER_ROOM})`);
  }

  override async onAuth(client: Client, options: JoinOptions = {}): Promise<ResolvedProfile> {
    if (this.clients.length >= MAX_PLAYERS_PER_ROOM) {
      logger.warn(SCOPE, `refused a join: room ${this.roomId} is full (${this.clients.length}/${MAX_PLAYERS_PER_ROOM})`);
      throw new ServerError(JOIN_ERROR.ROOM_FULL, 'room is full');
    }
    const guestKey = readGuestKey(options.playerId);
    const token = readToken(options.token);
    try {
      const resolved = await this.resolveProfile(guestKey, token, null);
      // The same profile already playing (another tab): it goes first, and its saves land before we read.
      if (resolved.key && (await activeKeys.evict(resolved.key))) {
        logger.info(SCOPE, `${resolved.key} joined again: the older session was replaced`);
        const [profile, docs] = await Promise.all([profileStore.load(resolved.key), this.loadDocs(resolved.key)]);
        return { ...resolved, profile, ...docs };
      }
      return resolved;
    } catch (error) {
      logger.error(SCOPE, `refused a join: storage unreachable for ${client.sessionId}:`, error);
      throw new ServerError(JOIN_ERROR.STORAGE_UNAVAILABLE, 'storage unavailable, try again shortly');
    }
  }

  override onJoin(client: Client, options: JoinOptions = {}, auth?: ResolvedProfile): void {
    if (this.emptyTimer) {
      clearTimeout(this.emptyTimer);
      this.emptyTimer = null;
    }
    const resolved: ResolvedProfile = auth ?? { key: '', guestKey: '', accountKey: null, token: null, tokenHash: '', status: 'guest', profile: null, migrated: false, username: '', save: null, track: null };
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    this.sessions.set(client.sessionId, {
      key: resolved.key,
      guestKey: resolved.guestKey,
      accountKey: resolved.accountKey,
      token: resolved.token,
      tokenHash: resolved.tokenHash,
      status: resolved.status,
      switching: false,
      queued: null,
      reverifyAt: Date.now() + REVERIFY_FIRST_MS,
      reverifyDelay: REVERIFY_FIRST_MS,
      lastNotice: '',
      lastNoticeAt: 0,
      release: resolved.key ? this.claimKey(resolved.key, client) : null,
    });
    profileStore.applyTo(player, resolved.profile);
    player.username = resolved.username;
    player.bloxityId = boxityIdOf(resolved.accountKey);
    if (options.avatar) this.writeAvatar(player, options.avatar);
    if (options.identity) {
      const identity = sanitizeIdentity(options.identity, bloxityServerEnv().staticUrl);
      if (identity.displayName) {
        player.displayName = identity.displayName;
        player.avatarUrl = identity.avatarUrl;
      }
    }
    if (!player.displayName) player.displayName = `Player${client.sessionId.slice(0, 4)}`;
    this.state.players.set(client.sessionId, player);
    const p = this.game.addPlayer(client.sessionId, player, resolved.key, resolved.save, resolved.track);
    this.sendAuthState(client, resolved.status);
    // A migrated guest's save is now the account's: write it under it at once.
    if (resolved.migrated && resolved.key) this.persist(client.sessionId, p);
    if (resolved.accountKey) void this.claimGrants(client.sessionId);
    logger.info(SCOPE, `join ${client.sessionId} as ${describe(resolved)} plot=${player.plot} earned=${Math.floor(player.earned)}`);
  }

  override async onLeave(client: Client): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (player) statRegistry.depart(reportIdentityOf(session?.accountKey), statValuesOf(player));
    const left = this.game.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
    logger.info(SCOPE, `leave ${client.sessionId}`);
    if (player && session?.key && left) {
      const landed = await withTimeout(Promise.all([this.saveQuietly(session.key, player), this.saveSave(session.key, left.save), this.saveTrack(session.key, left.track)]), LEAVE_SAVE_TIMEOUT_MS);
      if (!landed) logger.warn(SCOPE, `saves of ${session.key} are queued; they land when storage is back`);
    }
    // The last one out: the room closes a little later (every racetrack went home with its owner).
    if (this.clients.length === 0 && !this.emptyTimer) this.emptyTimer = setTimeout(() => void this.disconnect(), EMPTY_ROOM_MS);
    // Only now may the same profile be read again (a reconnect, another tab).
    session?.release?.();
    this.leftWaiters.get(client.sessionId)?.();
    this.leftWaiters.delete(client.sessionId);
  }

  /** Hold a profile key for this session; a newer join on it evicts this one. */
  private claimKey(key: string, client: Client): () => void {
    return activeKeys.claim(key, {
      evict: () =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, LEAVE_SAVE_TIMEOUT_MS + 1000);
          this.leftWaiters.set(client.sessionId, () => {
            clearTimeout(timer);
            resolve();
          });
          this.notify(client.sessionId, 'bad', 'You opened Build A Racetrack somewhere else');
          client.leave(REPLACED_CODE);
        }),
    });
  }

  override async onDispose(): Promise<void> {
    this.removeStatSource?.();
    this.removeStatSource = null;
    const saves: Promise<unknown>[] = [];
    for (const [sessionId, player] of this.state.players) {
      const session = this.sessions.get(sessionId);
      statRegistry.depart(reportIdentityOf(session?.accountKey), statValuesOf(player));
      const p = this.game.players.get(sessionId);
      if (session?.key && p) {
        saves.push(this.saveQuietly(session.key, player), this.saveSave(session.key, p.toSave()), this.saveTrack(session.key, p.toTrack()));
      }
    }
    await Promise.all(saves);
    logger.info(SCOPE, `room ${this.roomId} disposed (Lobby ${this.state.lobby})`);
  }

  // ---------------------------------------------------------------- saves

  private saveSave(key: string, save: PlayerSave): Promise<void> {
    return storage.putDoc('players', key, { ...save }).catch((error: unknown) => logger.error(SCOPE, `player save of ${key} failed:`, error));
  }

  private saveTrack(key: string, track: TrackSave): Promise<void> {
    return storage.putDoc('tracks', key, { ...track }).catch((error: unknown) => logger.error(SCOPE, `track save of ${key} failed:`, error));
  }

  /** A routine save of everything a session owns. Held while it is changing login. */
  private persist(sessionId: string, p: Player): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.key || session.switching) return;
    void this.saveQuietly(session.key, p.state);
    void this.saveSave(session.key, p.toSave());
    void this.saveTrack(session.key, p.toTrack());
  }

  private async saveQuietly(key: string, player: PlayerState): Promise<void> {
    try {
      await profileStore.save(key, player);
    } catch (error) {
      logger.error(SCOPE, `save of ${key} failed:`, error);
    }
  }

  // ---------------------------------------------------------------- dev hooks

  private onDev(sessionId: string, message: DevMessage): void {
    const p = this.game.players.get(sessionId);
    if (!p || !message) return;
    if (Array.isArray(message.tp) && message.tp.length >= 3) {
      const [x, y, z] = message.tp.map(Number) as [number, number, number];
      if ([x, y, z].every(Number.isFinite)) this.game.placeAt(p, x, y, z, p.motion.yaw, 'base');
    }
    this.game.dev(p, message);
  }

  // ---------------------------------------------------------------- rewarded ads

  /** A rewarded ad finished: pay only what Boxity confirms (each token once). */
  private async onAdReward(p: Player, m: AdRewardMessage): Promise<void> {
    if (m.placement !== AD_MONEY_BOOST) return;
    if (!(await verifyAdReward(m.token))) {
      this.notify(p.sessionId, 'bad', 'That ad could not be verified - no reward this time');
      return;
    }
    // They may have left while Boxity answered.
    if (this.game.players.get(p.sessionId) !== p) return;
    this.game.grantAdBoost(p);
    this.persist(p.sessionId, p);
  }

  // ---------------------------------------------------------------- Gems purchases

  /** Pay out Gems purchases waiting for this account (recorded by the webhook), then save and settle them. */
  private async claimGrants(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.accountKey || session.switching) return;
    try {
      const grants = await buxGrants.claim(session.accountKey);
      if (!grants.length) return;
      const p = this.game.players.get(sessionId);
      if (!p) return;
      for (const g of grants) this.game.grantSku(p, g.sku, g.money);
      const player = this.state.players.get(sessionId);
      if (player && session.key) await Promise.all([this.saveQuietly(session.key, player), this.saveSave(session.key, p.toSave())]);
      await buxGrants.settle(grants.map((g) => g.transactionId));
    } catch (error) {
      logger.warn(SCOPE, `grant claim for ${sessionId} failed:`, error);
    }
  }

  // ---------------------------------------------------------------- identity / avatar / emotes

  private onSetAvatar(client: Client, message: SetAvatarMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (player) this.writeAvatar(player, message);
  }

  private onSetIdentity(client: Client, message: SetIdentityMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const identity = sanitizeIdentity(message, bloxityServerEnv().staticUrl);
    if (!identity.displayName || (player.displayName === identity.displayName && player.avatarUrl === identity.avatarUrl)) return;
    player.displayName = identity.displayName;
    player.avatarUrl = identity.avatarUrl;
    const p = this.game.players.get(client.sessionId);
    if (p) this.persist(client.sessionId, p);
  }

  private writeAvatar(player: PlayerState, message: SetAvatarMessage): void {
    player.avatar.apply(sanitizeAppearance(message?.appearance), sanitizeProportions(message?.proportions));
  }

  private onEmote(sessionId: string, message: EmoteMessage): void {
    const player = this.state.players.get(sessionId);
    if (!player || !isEmoteId(message?.id) || !player.grounded || player.driving) return;
    player.emote = message.id.toLowerCase();
    player.emoteCount = (player.emoteCount + 1) % 65536;
  }

  private clientOf(sessionId: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === sessionId);
  }

  private notify(sessionId: string, kind: NoticeKind, text: string): void {
    const client = this.clientOf(sessionId);
    if (!client) return;
    const session = this.sessions.get(sessionId);
    const now = Date.now();
    if (session) {
      if (session.lastNotice === text && now - session.lastNoticeAt < NOTICE_GAP_MS) return;
      session.lastNotice = text;
      session.lastNoticeAt = now;
    }
    const message: NoticeMessage = { kind, text };
    client.send(MessageType.Notice, message);
  }

  private *statRows(): Iterable<StatRow> {
    for (const [sessionId, player] of this.state.players) {
      const userId = reportIdentityOf(this.sessions.get(sessionId)?.accountKey);
      if (userId) yield { userId, values: statValuesOf(player) };
    }
  }

  // ---------------------------------------------------------------- clock

  private tick(delta: number): void {
    this.state.elapsed += delta;
    this.game.tick(delta);
    for (const player of this.state.players.values()) {
      if (player.ready) player.playSeconds += delta;
      if (player.emote && !player.grounded) player.emote = '';
    }
    this.tickSessions();
    this.grantClock += delta;
    if (this.grantClock >= 60) {
      this.grantClock = 0;
      for (const [sessionId, session] of this.sessions) if (session.accountKey) void this.claimGrants(sessionId);
    }
    this.autosaveTimer += delta;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      for (const [sessionId, p] of this.game.players) this.persist(sessionId, p);
    }
  }

  // ---------------------------------------------------------------- identity

  /** A player's game save, read from storage now (throws when unreachable). */
  private async loadDocs(key: string): Promise<{ save: Partial<PlayerSave> | null; track: Record<string, unknown> | null }> {
    if (!key) return { save: null, track: null };
    const [save, track] = await Promise.all([storage.getDoc('players', key), storage.getDoc('tracks', key)]);
    return { save: save as Partial<PlayerSave> | null, track };
  }

  /**
   * WHOSE PROFILE, the profile itself and the save, read from
   * storage now. Throws when storage cannot be read. A guest signing in for
   * the first time brings their progress (and saved bases) with them.
   */
  private async resolveProfile(guestKey: string, token: string | null, live: ProfileFields | null): Promise<ResolvedProfile> {
    let status: AuthStatus = 'guest';
    let accountKey: string | null = null;
    let username = '';
    let carriedFrom: readonly string[] = [];
    const hash = token ? tokenHash(token) : '';
    if (token) {
      const outcome = await verifyGameToken(token);
      if (outcome.status === 'verified') {
        accountKey = accountKeyFor(outcome.accountId);
        username = outcome.username;
        carriedFrom = outcome.carriedFrom;
        status = 'account';
      } else if (outcome.status === 'unavailable') status = 'unavailable';
    }
    if (accountKey) {
      let profile = await profileStore.load(accountKey);
      let migrated = false;
      let docs = await this.loadDocs(accountKey);
      if (!profile && guestKey) {
        const guest = await profileStore.load(guestKey);
        const retired = Boolean(guest?.migratedTo);
        const source: ProfileFields | null =
          live ?? (guest ? { ...progressOf(guest), displayName: guest.displayName, avatarUrl: guest.avatarUrl, updatedAt: guest.updatedAt } : null);
        if (!retired && source && hasProgress(source)) {
          const created = { ...source, updatedAt: Date.now(), migratedFrom: guestKey };
          if (await profileStore.insertIfAbsent(accountKey, created)) {
            await profileStore.retireGuest(guestKey, accountKey, progressOf(source), { displayName: source.displayName, avatarUrl: source.avatarUrl });
            profile = created;
            migrated = true;
            // The guest's cash, purchases and racetrack become the account's.
            if (!docs.save) docs = await this.loadDocs(guestKey);
            logger.info(SCOPE, `migrated guest ${guestKey} into ${accountKey}`);
          } else profile = await profileStore.load(accountKey);
        }
      }
      // A Boxity GUEST (CrazyGames players start as one) signing in to an account with no
      // progress here: the first guest this browser played as brings theirs, once.
      const carried = carriedFrom[0];
      if (!profile && carried) {
        const from = accountKeyFor(carried);
        const guest = await profileStore.load(from);
        const guestDocs = guest ? await this.loadDocs(from) : null;
        // Progress is the career OR a save (Cash and purchases live in the players doc).
        if (guest && !guest.migratedTo && (hasProgress(progressOf(guest)) || guestDocs?.save)) {
          const created = { ...progressOf(guest), displayName: guest.displayName, avatarUrl: guest.avatarUrl, updatedAt: Date.now(), migratedFrom: from };
          if (await profileStore.insertIfAbsent(accountKey, created)) {
            await profileStore.retireGuest(from, accountKey, progressOf(guest), { displayName: guest.displayName, avatarUrl: guest.avatarUrl });
            profile = created;
            migrated = true;
            if (!docs.save && guestDocs) docs = guestDocs;
            logger.info(SCOPE, `carried Boxity guest ${from} into ${accountKey}`);
          } else profile = await profileStore.load(accountKey);
        }
      }
      return { key: accountKey, guestKey, accountKey, token, tokenHash: hash, status, profile, migrated, username, ...docs };
    }
    const profile = guestKey ? await profileStore.load(guestKey) : null;
    const docs = await this.loadDocs(guestKey);
    return { key: guestKey, guestKey, accountKey: null, token, tokenHash: hash, status, profile, migrated: false, username: '', ...docs };
  }

  /**
   * A LOGIN CHANGE ON THE LIVE SESSION. Save what is being left, resolve the
   * new profile, apply it. A guest signing in for the first time carries
   * their progress into the account; an account with a save of its own gets
   * that back, in place.
   */
  private async switchAuth(client: Client, message: SetAuthMessage, reverify: boolean): Promise<void> {
    const session = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    const p = this.game.players.get(client.sessionId);
    if (!session || !player || !p) return;
    const token = readToken(message?.token);
    if (session.switching) {
      session.queued = { token };
      return;
    }
    const hash = token ? tokenHash(token) : '';
    if (!reverify && hash === session.tokenHash) return;
    session.switching = true;
    try {
      const leavingKey = session.key;
      const wasGuest = session.accountKey === null;
      const live = profileStore.snapshot(player);
      if (leavingKey) {
        const landed = await withTimeout(Promise.all([profileStore.save(leavingKey, player), this.saveSave(leavingKey, p.toSave()), this.saveTrack(leavingKey, p.toTrack())]), SWITCH_SAVE_TIMEOUT_MS);
        if (!landed) {
          this.sendAuthState(client, session.status, 'storage unavailable; staying on the current profile');
          return;
        }
      }
      let target: ResolvedProfile;
      try {
        target = await this.resolveProfile(session.guestKey, token, wasGuest ? live : null);
      } catch (error) {
        logger.warn(SCOPE, `${client.sessionId}: storage unreachable during a login change; staying put:`, error);
        this.sendAuthState(client, session.status, 'storage unavailable; staying on the current profile');
        return;
      }
      session.token = target.token;
      session.tokenHash = target.tokenHash;
      if (target.status === 'unavailable') {
        session.reverifyDelay = Math.min(REVERIFY_MAX_MS, session.reverifyDelay * 2);
        session.reverifyAt = Date.now() + session.reverifyDelay;
      } else session.reverifyDelay = REVERIFY_FIRST_MS;
      if (target.key === session.key) {
        session.status = target.status;
        this.sendAuthState(client, target.status);
        return;
      }
      statRegistry.depart(reportIdentityOf(session.accountKey), statValuesOf(player));
      session.release?.();
      if (target.key) await activeKeys.evict(target.key);
      session.key = target.key;
      session.accountKey = target.accountKey;
      session.status = target.status;
      session.release = target.key ? this.claimKey(target.key, client) : null;
      p.key = target.key;
      player.username = target.username;
      player.bloxityId = boxityIdOf(target.accountKey);
      const carryOver = wasGuest && (target.migrated || !target.save);
      if (carryOver) {
        // A first sign-in: the life being played becomes the account's.
        if (target.profile) profileStore.applyTo(player, target.profile, true);
      } else {
        // The account has a life of its own: switch to it.
        profileStore.applyTo(player, target.profile, true);
        this.game.switchProfile(p, target.save, target.track);
      }
      if (target.key) this.persist(client.sessionId, p);
      this.sendAuthState(client, target.status);
      logger.info(SCOPE, `${client.sessionId} switched ${leavingKey || '(none)'} -> ${describe(target)}${carryOver ? ' [carried over]' : ''}`);
    } finally {
      session.switching = false;
      const queued = session.queued;
      session.queued = null;
      if (queued) void this.switchAuth(client, queued, false);
    }
  }

  private sendAuthState(client: Client, status: AuthStatus, note?: string): void {
    const message: AuthStateMessage = note ? { status, note } : { status };
    client.send(MessageType.AuthState, message);
  }

  private tickSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (session.switching) continue;
      if (session.status === 'unavailable' && session.token && now >= session.reverifyAt) {
        session.reverifyAt = now + session.reverifyDelay;
        const client = this.clientOf(sessionId);
        if (client) void this.switchAuth(client, { token: session.token }, true);
      }
    }
  }
}

const readGuestKey = (raw: unknown): string => {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw === 'string' && isAccountKey(raw)) throw new ServerError(JOIN_ERROR.BAD_PLAYER_ID, 'invalid player id');
  if (!isValidGuestId(raw)) throw new ServerError(JOIN_ERROR.BAD_PLAYER_ID, 'invalid player id');
  return raw;
};

/** The Boxity account id (the token's sub) of an account key; '' for a guest. Chat bubbles find players by it. */
const boxityIdOf = (accountKey: string | null): string => (accountKey && isAccountKey(accountKey) ? accountKey.slice(ACCOUNT_KEY_PREFIX.length).split('#')[0]! : '');

const readToken = (raw: unknown): string | null => (typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_TOKEN_LENGTH ? raw : null);

const describe = (resolved: ResolvedProfile): string => {
  if (resolved.accountKey) return `account ${resolved.accountKey}`;
  const key = resolved.guestKey || '(no id)';
  return resolved.status === 'unavailable' ? `guest ${key} (bloxity unavailable, will re-ask)` : `guest ${key}`;
};

/** True if the promise settled within the deadline; it keeps running either way. */
const withTimeout = (promise: Promise<unknown>, ms: number): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
