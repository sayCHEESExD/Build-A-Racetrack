import { BLOXITY_PORTAL_SLUG } from '@race/shared';
import { logger } from '../util/logger.js';
import { bloxityEnv } from './environment.js';
import type {
  LegionAdScreen,
  LegionBoard,
  LegionChatMessage,
  LegionDeathScreen,
  LegionEquipped,
  LegionFriend,
  LegionPlayerEvent,
  LegionProportions,
  LegionRewardedResult,
  LegionSdk,
  LegionUser,
} from './legionTypes.js';

const SCOPE = 'bloxity';

/**
 * The slug the Bloxity PORTAL lists this game under - what login tokens are
 * minted for, and so what the SDK is initialised with and what invite links
 * and purchases name.
 *
 * Deliberately NOT `VITE_BLOXITY_GAME_ID`: the deploy workflow passes the
 * Legion HOSTING id there (`BLOXITY_HOSTING_ID`), which can be a different name for this
 * game. Initialising with it made the SDK's own token check fail and every
 * signed-in player a guest. One constant, shared with the server, which
 * verifies tokens against the same slug.
 */
export const GAME_SLUG = BLOXITY_PORTAL_SLUG;

/**
 * Every portal setting this game answers to.
 *
 * Registering a listener is also what makes the control APPEAR in the portal's
 * menu, so this list is a promise: each key here is genuinely wired to
 * something. `enable_chat` shows or hides the in-game chat (the feed and the
 * input), `background_transparency` sets the opacity of the game's panels.
 * `music_volume` sets the calm building music under everything.
 * A slider that did nothing would be a lie in the portal's menu.
 */
export const SETTING_KEYS = [
  'master_volume',
  'music_volume',
  'graphics_quality',
  'show_fps',
  'camera_sensitivity',
  'enable_chat',
  'fullscreen',
  'background_transparency',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/**
 * THE LEADERBOARDS (BLOXITY_CODE_METADATA.md: hasScore). Declared in the
 * browser so Boxity shows its trophy button; the SCORES are reported by the
 * server (`server/src/bloxity/leaderboardReporter.ts`) from state it owns,
 * with the same declarations. The first declaration creates a board; later
 * edits happen in the Boxity dashboard, so these ids are permanent.
 */
export const LEADERBOARDS: readonly LegionBoard[] = [
  { id: 'earned', label: 'Money Earned', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'rides', label: 'Runs Driven', order: 'desc', mode: 'sum', format: 'number', reset: 'weekly' },
  { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
];

/** What the game hands Bloxity so the bridge never reaches into the game. */
export interface BloxityHost {
  /** 0..1, from `master_volume`. */
  setMasterVolume(level: number): void;
  /** 0..1, from `music_volume`. */
  setMusicVolume(level: number): void;
  /** `enable_chat`: the in-game chat shown or hidden. */
  setChatEnabled(enabled: boolean): void;
  /** `background_transparency`: 0.2..1, the opacity of the game's panels. */
  setPanelOpacity(opacity: number): void;
  /** The player sent a chat line through the portal's own chat box. */
  portalChat(text: string): void;
  /** 'Low' | 'Medium' | 'High' | 'Ultra'. */
  setGraphicsQuality(level: string): void;
  setShowFps(show: boolean): void;
  /** A multiplier on the game's own tuned sensitivity. */
  setCameraSensitivity(scale: number): void;
  /** The portal asked for a respawn. */
  respawn(): void;
  /** The portal's pointer lock changed underneath us. */
  pointerLockChanged(locked: boolean): void;
  /** Cosmetics or proportions moved; re-dress the rider. */
  avatarChanged(equipped: LegionEquipped, proportions: LegionProportions): void;
  /** The portal's emote picker chose an emote (a catalogue id). */
  playEmote(id: string): void;
  /** A Boxity chat message in this room: show it over the sender's head. */
  chatMessage(message: LegionChatMessage, bubble: string): void;
  /** An ad break started (true: pause and mute) or ended (false: resume). */
  adBreak(on: boolean): void;
  /** Boxity told the page its environment after init (the embedded handshake). */
  environmentChanged(): void;
}

/**
 * The Bloxity SDK, or null.
 *
 * EVERY call in this file goes through here. The SDK is a script from a
 * third-party CDN: it can be blocked, offline, or an older build without a
 * namespace this game uses. A game that threw in that case would be a game
 * that a blocked script takes offline, so the whole integration is written to
 * degrade to "no portal" rather than to fail.
 */
const sdk = (): LegionSdk | null => window.Legion?.SDK ?? null;

/** Run `body` if the SDK is there, and never let it throw into the game. */
const guard = <T>(what: string, body: (api: LegionSdk) => T): T | undefined => {
  const api = sdk();
  if (!api) return undefined;
  try {
    return body(api);
  } catch (error) {
    logger.warn(SCOPE, `${what} failed: ${String(error)}`);
    return undefined;
  }
};

/**
 * ASK BLOXITY'S MATCHMAKER FOR A SEAT: `Legion.SDK.net.resolveEndpoint`, the
 * one documented way into a hosted game ("Use the SDK rather than your own
 * POST /v1/play": it reuses the player's seat on retries and carries the
 * party ticket that keeps parties together).
 *
 * Unlike the rest of this file it THROWS when the SDK is missing or fails:
 * there is no game to degrade to without a seat, and the caller's backoff
 * decides when to ask again.
 */
export const resolveEndpoint = async (gameId: string): Promise<{ endpoint: string; cold: boolean }> => {
  const net = sdk()?.net;
  if (!net?.resolveEndpoint) throw new Error('the Bloxity SDK is not loaded, so the matchmaker cannot be asked for a seat');
  const relay = await net.resolveEndpoint(gameId);
  if (!relay?.endpoint) throw new Error('the matchmaker answered without an endpoint');
  return { endpoint: relay.endpoint, cold: !!relay.cold };
};

const asFraction = (value: string, fallback: number): number => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed / 100, 0), 1);
};

const asNumber = (value: string, fallback: number): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asBool = (value: string): boolean => value === 'true';

/**
 * This game's whole relationship with the Bloxity portal.
 *
 * ONE module, and one subscription to `onUserChanged` inside it, which is the
 * single source of truth for who is signed in. Nothing else in the codebase
 * touches `window.Legion`: the renderer, the audio and the input layer are
 * handed values through `BloxityHost` and never learn a portal exists.
 *
 * The user object is deliberately NOT cached. `getUser()` is asked every time
 * it is needed, so a login that happens in another tab cannot leave this game
 * rendering a stale name.
 */
export class Bloxity {
  private readonly host: BloxityHost;
  private readonly unsubscribes: (() => void)[] = [];

  private started = false;
  /** Listeners for the UI layer, so the panel does not subscribe separately. */
  private readonly userListeners = new Set<(user: LegionUser | null) => void>();

  constructor(host: BloxityHost) {
    this.host = host;
  }

  /** True when the SDK script actually loaded. */
  get available(): boolean {
    return sdk() !== null;
  }

  get embedded(): boolean {
    return guard('portal.isEmbeddedInLegion', (api) =>
      api.portal?.isEmbeddedInLegion?.() ?? false,
    ) ?? false;
  }

  /**
   * Initialise ONCE, before any namespace is used.
   *
   * The slug is passed even when embedded, where the portal supplies one
   * anyway: standalone hosting and sign-in are resolved by it, and
   * a build that only worked inside the iframe would be a build that stopped
   * working the moment it was hosted on its own domain.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    const api = sdk();
    if (!api) {
      logger.warn(
        SCOPE,
        'SDK not present - running without the portal. Auth, friends, ' +
          'cosmetics are unavailable; the game itself is unaffected.',
      );
      // The auth UI still needs telling, or it would sit on "loading" for ever.
      this.emitUser(null);
      return;
    }

    // The official portal and API, always named. Left out, the SDK treats a page on
    // localhost / 127.0.0.1 as Bloxity's OWN dev portal and opens its sign-in on THIS
    // origin (`http://localhost:6181/auth?popup=1` - which is just the game again), so
    // nobody could log in to a locally run build. These are the SDK's own defaults on
    // every other host, so a deployed build behaves exactly as before.
    // The slug only: the API, portal and matchmaker come from the environment Boxity
    // tells the page (window.BLOXITY_ENV or the handshake), never from this build.
    guard('init', () => api.init({ gameSlug: GAME_SLUG }));
    // At boot, not after loading: the portal shows its emote button only for games that registered.
    guard('game.registerFeature', () => api.game?.registerFeature?.('emotes'));
    // Right after init, even though the server submits the scores: it is what shows the trophy button.
    guard('leaderboard.define', () => api.leaderboard?.define?.([...LEADERBOARDS]));
    logger.info(
      SCOPE,
      `SDK initialised as "${GAME_SLUG}" (${this.embedded ? 'embedded' : 'standalone'}, env ${bloxityEnv().env})`,
    );
    this.keep(
      guard('onEnvironmentChanged', (a) =>
        a.onEnvironmentChanged?.((env) => {
          logger.info(SCOPE, `environment told: ${env.env}`);
          this.host.environmentChanged();
        }),
      ),
    );

    // Ad breaks may start at any time: the game pauses and mutes until they end.
    this.keep(guard('ads.onBreakStart', (a) => a.ads?.onBreakStart?.(() => this.host.adBreak(true))));
    this.keep(guard('ads.onBreakEnd', (a) => a.ads?.onBreakEnd?.(() => this.host.adBreak(false))));
    this.watchUser();
    this.watchAvatar();
    this.watchSettings();
    this.watchPlayerEvents();
    this.watchChat();
  }

  // ------------------------------------------------------------------ auth

  getUser(): LegionUser | null {
    return guard('auth.getUser', (api) => api.auth?.getUser?.() ?? null) ?? null;
  }

  /**
   * Who the portal says an unauthenticated visitor is.
   *
   * Null once they sign in, when `getUser` answers instead. The portal names
   * its guests and draws them a portrait, so this is a REAL identity and not
   * a placeholder - which is why the game shows it rather than calling
   * everybody who has not logged in the same thing.
   *
   * Optional on the SDK, because older builds predate it.
   */
  getGuest(): LegionUser | null {
    return guard('auth.getGuest', (api) => api.auth?.getGuest?.() ?? null) ?? null;
  }

  getToken(): string | null {
    return guard('auth.getToken', (api) => api.auth?.getToken?.() ?? null) ?? null;
  }

  isLoggedIn(): boolean {
    return guard('auth.isLoggedIn', (api) => api.auth?.isLoggedIn?.() ?? false) ?? false;
  }

  async showAuthPopup(): Promise<LegionUser | null> {
    const result = guard('auth.showAuthPopup', (api) => api.auth?.showAuthPopup?.());
    return (await result) ?? null;
  }

  logout(): void {
    guard('auth.logout', (api) => api.auth?.logout?.());
  }

  /**
   * Subscribe to the auth state.
   *
   * Fans out from the ONE `onUserChanged` this class owns, and fires
   * immediately with the current state exactly as the SDK's own does - so a
   * subscriber written against this cannot tell the difference, and there is
   * still only one subscription to the SDK.
   */
  onUserChanged(callback: (user: LegionUser | null) => void): () => void {
    this.userListeners.add(callback);
    callback(this.getUser());
    return () => this.userListeners.delete(callback);
  }

  // ---------------------------------------------------------------- avatar

  getEquipped(): LegionEquipped {
    return guard('avatar.getEquipped', (api) => api.avatar?.getEquipped?.()) ?? {};
  }

  getProportions(): LegionProportions {
    return (
      guard('avatar.getProportions', (api) => api.avatar?.getProportions?.()) ?? {
        height: 1,
        shoulderWidth: 1,
        armLength: 1,
        legOffsetX: 1,
        torsoScaleX: 1,
        neckHeight: 1,
        headScale: 1,
      }
    );
  }

  async setProportions(partial: Partial<LegionProportions>): Promise<void> {
    await guard('avatar.setProportions', (api) => api.avatar?.setProportions?.(partial));
  }

  async resetProportions(): Promise<void> {
    await guard('avatar.resetProportions', (api) => api.avatar?.resetProportions?.());
  }

  showCustomizer(): void {
    guard('avatar.showCustomizer', (api) => api.avatar?.showCustomizer?.());
  }

  toggleCustomizer(): void {
    guard('avatar.toggleCustomizer', (api) => api.avatar?.toggleCustomizer?.());
  }

  // ---------------------------------------------------------------- social

  async getFriends(): Promise<LegionFriend[]> {
    const friends = await guard('social.getFriends', (api) => api.social?.getFriends?.());
    return friends ?? [];
  }

  /**
   * Invite a friend into THIS room.
   *
   * The room is published first, deliberately: an invite sent before the
   * portal knows which room we are in sends the friend to the game rather
   * than to the player, which is the whole point of the invite.
   */
  async inviteFriend(userId: string, roomId: string): Promise<boolean> {
    this.updateRoom(roomId);
    const sent = await guard('social.inviteFriend', (api) =>
      api.social?.inviteFriend?.(userId),
    );
    return sent ?? false;
  }

  getInviteLink(roomId: string): string {
    return (
      guard('social.getInviteFriendsLink', (api) =>
        api.social?.getInviteFriendsLink?.({ gameSlug: GAME_SLUG, roomId }),
      ) ?? ''
    );
  }

  async sendFriendRequest(userId: string): Promise<boolean> {
    const result = await guard('social.sendFriendRequest', (api) =>
      api.social?.sendFriendRequest?.(userId),
    );
    return result?.success ?? false;
  }

  // ------------------------------------------------------------- lifecycle

  loadingStep(text: string): void {
    guard('game.loadingStep', (api) => api.game?.loadingStep?.(text));
  }

  loadingEnd(): void {
    guard('game.loadingEnd', (api) => api.game?.loadingEnd?.());
  }

  gameplayStart(): void {
    guard('game.gameplayStart', (api) => api.game?.gameplayStart?.());
  }

  gameplayEnd(): void {
    guard('game.gameplayEnd', (api) => api.game?.gameplayEnd?.());
  }

  /** The Colyseus room id, or '' in a menu. */
  updateRoom(roomId: string, partyId?: string): void {
    guard('game.updateRoom', (api) => api.game?.updateRoom?.(roomId, partyId));
  }

  playerJoined(username: string): void {
    guard('game.playerJoined', (api) => api.game?.playerJoined?.(username));
  }

  playerInRoom(username: string): void {
    guard('game.playerInRoom', (api) => api.game?.playerInRoom?.(username));
  }

  /** Hand ESC to the portal's own pause menu. */
  showPortalMenu(lockCursorOnResume = true): void {
    guard('portal.showMenu', (api) => api.portal?.showMenu?.(lockCursorOnResume));
  }

  // No purchases: everything in this game is bought with in-game cash.

  // ------------------------------------------------------------ death screen

  /**
   * The local player died: Boxity shows its ads and countdown (at least 4 s).
   * Calling it again for the same death returns the same screen. Outside
   * Boxity the countdown is 0 at once and respawn() is true straight away.
   */
  showDeathScreen(): LegionDeathScreen | null {
    return guard('deathScreen.show', (api) => api.deathScreen?.show?.() ?? null) ?? null;
  }

  /** Closes a death screen without a respawn (the player left the game while dead). */
  hideDeathScreen(): void {
    guard('deathScreen.hide', (api) => api.deathScreen?.hide?.());
  }

  /** Whether Boxity's own chat is wired (it draws the chat UI, so the game hides its own). */
  get boxityChat(): boolean {
    return this.chatWired && this.embedded;
  }

  /**
   * Where Boxity draws over the game (the toolbar and chat feed, top-left; the
   * whole top strip on a narrow phone). The SDK estimates them until the portal
   * reports, and outside Boxity too. Empty without the SDK.
   */
  reservedAreas(): { left: number; top: number; width: number; height: number }[] {
    return guard('ui.reservedAreas', (api) => api.ui?.reservedAreas?.() ?? []) ?? [];
  }

  onReservedAreasChange(callback: () => void): void {
    this.keep(guard('ui.onReservedAreasChange', (api) => api.ui?.onReservedAreasChange?.(() => callback())));
  }

  /** A rewarded ad can be shown now (false outside Boxity): the "Watch ad" button shows only then. */
  adsAvailable(): boolean {
    return guard('ads.isAvailable', (api) => api.ads?.isAvailable?.() ?? false) ?? false;
  }

  /** Show a rewarded ad; resolves its status and, when completed, the reward token for the server. */
  async showRewarded(placement: string): Promise<LegionRewardedResult> {
    const result = guard('ads.showRewarded', (api) => api.ads?.showRewarded?.(placement));
    if (!result) return { status: 'disabled' };
    try {
      return await result;
    } catch (error) {
      logger.warn(SCOPE, `rewarded ad failed: ${String(error)}`);
      return { status: 'failed' };
    }
  }

  /**
   * Which screen is showing, for screen ads (one at a time; a new one replaces
   * the last). null: none - the banners go.
   */
  adScreen(type: LegionAdScreen | null, options?: { skip?: string[]; sizes?: Record<string, string> }): void {
    if (type) guard('ads.screen', (api) => api.ads?.screen?.(type, options));
    else guard('ads.hideScreen', (api) => api.ads?.hideScreen?.());
  }

  /** Boxity's leaderboard panel over the game; false outside Boxity. */
  openLeaderboard(board?: string): boolean {
    return guard('leaderboard.open', (api) => api.leaderboard?.open?.(board) ?? false) ?? false;
  }

  dispose(): void {
    for (const off of this.unsubscribes) {
      try {
        off();
      } catch {
        /* an unsubscribe that throws must not stop the others */
      }
    }
    this.unsubscribes.length = 0;
    this.userListeners.clear();
    this.gameplayEnd();
  }

  // --------------------------------------------------------- subscriptions

  private keep(off: (() => void) | undefined): void {
    if (typeof off === 'function') this.unsubscribes.push(off);
  }

  private emitUser(user: LegionUser | null): void {
    for (const listener of this.userListeners) {
      try {
        listener(user);
      } catch (error) {
        logger.warn(SCOPE, `user listener failed: ${String(error)}`);
      }
    }
  }

  /**
   * THE auth subscription. There is exactly one, and this is it.
   *
   * It fires immediately with the current state and then on every login and
   * logout, which is why nothing else in the game needs to poll `getUser()` on
   * a timer or re-check it on a frame.
   */
  private watchUser(): void {
    this.keep(
      guard('auth.onUserChanged', (api) =>
        api.auth?.onUserChanged?.((user) => {
          logger.info(
            SCOPE,
            user ? `signed in as @${user.username}` : 'signed out',
          );
          this.emitUser(user);
          // Cosmetics belong to the account, so a new account is a new rider.
          if (user) this.pushAvatar();
        }),
      ),
    );
  }

  private watchAvatar(): void {
    this.keep(
      guard('avatar.onAvatarChanged', (api) =>
        api.avatar?.onAvatarChanged?.(() => this.pushAvatar()),
      ),
    );
    this.keep(
      guard('avatar.onProportionsChanged', (api) =>
        api.avatar?.onProportionsChanged?.(() => this.pushAvatar()),
      ),
    );
  }

  private pushAvatar(): void {
    this.host.avatarChanged(this.getEquipped(), this.getProportions());
  }

  /**
   * Register every setting, and apply it.
   *
   * `listen` fires immediately with the current value, so registering IS
   * applying - there is no separate "read them all at startup" pass to fall
   * out of step with the listeners.
   */
  private watchSettings(): void {
    for (const key of SETTING_KEYS) {
      this.keep(
        guard(`settings.listen(${key})`, (api) =>
          api.settings?.listen?.(key, (value) => this.applySetting(key, value)),
        ),
      );
    }
    // A belt to the braces: some portal builds only deliver values on demand.
    guard('settings.triggerAll', (api) => api.settings?.triggerAll?.());
  }

  private applySetting(key: SettingKey, value: string): void {
    switch (key) {
      case 'music_volume':
        this.host.setMusicVolume(asFraction(value, 0.6));
        break;
      case 'master_volume':
        this.host.setMasterVolume(asFraction(value, 0.8));
        break;
      case 'graphics_quality':
        this.host.setGraphicsQuality(value);
        break;
      case 'show_fps':
        this.host.setShowFps(asBool(value));
        break;
      case 'camera_sensitivity':
        this.host.setCameraSensitivity(asNumber(value, 1));
        break;
      case 'fullscreen':
        guard('portal.fullscreen', (api) => {
          if (asBool(value)) api.portal?.requestFullscreen?.();
          else api.portal?.exitFullscreen?.();
        });
        break;
      case 'enable_chat':
        this.host.setChatEnabled(value === '' ? true : asBool(value));
        break;
      case 'background_transparency':
        this.host.setPanelOpacity(Math.max(0.2, Math.min(1, asNumber(value, 0.9))));
        break;
    }
  }

  /**
   * BOXITY CHAT: every message in this room, the sender's own included, with a
   * verified sender and filtered text. Subscribing is the opt-in. The game only
   * shows it over the sender's head (Boxity draws the chat box and feed).
   */
  private chatWired = false;

  private watchChat(): void {
    const off = guard('chat.onMessage', (api) =>
      api.chat?.onMessage?.((message) => {
        try {
          const text = api.chat?.bubbleText?.(message) ?? (message.isGif ? 'sent a GIF' : message.text);
          this.host.chatMessage(message, text);
        } catch (error) {
          logger.warn(SCOPE, `chat bubble failed: ${String(error)}`);
        }
      }),
    );
    if (off) {
      this.chatWired = true;
      this.keep(off);
    }
  }

  private watchPlayerEvents(): void {
    this.keep(
      guard('player.onEvent', (api) =>
        api.player?.onEvent?.((event: LegionPlayerEvent, data?: unknown) => {
          switch (event) {
            case 'respawn_request':
              this.host.respawn();
              break;
            case 'pointer_lock_changed':
              this.host.pointerLockChanged(data === true);
              break;
            case 'play_emote':
              // Bloxity only sends emotes the player owns: no ownership check here.
              if (typeof data === 'string') this.host.playEmote(data);
              break;
            case 'chat_message_sent':
              // Boxity's own chat already reaches everyone (chat.onMessage); only an
              // older portal without it needs the line carried through the game's chat.
              if (!this.chatWired && typeof data === 'string' && data.trim()) this.host.portalChat(data);
              break;
          }
        }),
      ),
    );
  }
}
