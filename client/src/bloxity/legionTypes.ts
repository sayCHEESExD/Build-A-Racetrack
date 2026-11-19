/**
 * The Bloxity SDK's shape, as this game uses it.
 *
 * The SDK ships as a plain script that installs `window.Legion`, with no types
 * of its own. These declarations are the CONTRACT this game codes against -
 * deliberately narrow: only what is actually called, so a change on their side
 * shows up as a type error here rather than as a runtime surprise in a
 * deployed build.
 *
 * Every member is optional at the call site through `sdk()` in `Bloxity.ts`,
 * because the script is loaded from a third-party CDN and may simply not be
 * there - offline, blocked, or an older build that predates a namespace.
 */

export interface LegionUser {
  readonly _id: string;
  readonly username: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly pfp?: string;
  readonly avatar?: string;
}

/**
 * A friend's presence.
 *
 * The status strings are spelled both ways in the wild - the docs say
 * `in-game`, the reference implementation emits `in_game` - so anything
 * reading this must accept both. `presenceLabel` in `BloxityPanel` is the one
 * place that decides.
 */
export interface LegionPresence {
  readonly status: 'online' | 'in-game' | 'in_game' | 'away' | 'offline';
  readonly currentGame?: string;
  readonly currentRoom?: string;
  readonly currentParty?: string;
  readonly gameSlug?: string;
  readonly gameName?: string;
  readonly lastSeen?: string;
}

export interface LegionFriend {
  readonly _id: string;
  readonly username: string;
  readonly displayName?: string;
  readonly pfp?: string;
  readonly presence?: LegionPresence;
}

/** Equipped cosmetic ids. `'-1'`, `''`, `'undefined'` and null all mean NONE. */
export interface LegionEquipped {
  readonly hatId?: string | null;
  readonly backId?: string | null;
  /** Worn with a hat, loaded like one. */
  readonly hairId?: string | null;
  readonly maskId?: string | null;
  /** Composited into the skin texture, not meshes. */
  readonly faceId?: string | null;
  readonly shirtId?: string | null;
  readonly pantsId?: string | null;
  /** Rest-pose accessories; hand and shoes are mirrored pairs. */
  readonly neckId?: string | null;
  readonly chestId?: string | null;
  readonly waistId?: string | null;
  readonly handId?: string | null;
  readonly shoesId?: string | null;
  readonly skinId?: string | null;
  readonly headId?: string | null;
  readonly armLId?: string | null;
  readonly armRId?: string | null;
  readonly legLId?: string | null;
  readonly legRId?: string | null;
  readonly torsoId?: string | null;
}

/** Avatar proportions. Every value is a multiplier defaulting to 1. */
export interface LegionProportions {
  readonly height: number;
  readonly shoulderWidth: number;
  readonly armLength: number;
  readonly legOffsetX: number;
  readonly torsoScaleX: number;
  readonly neckHeight: number;
  readonly headScale: number;
}

export interface LegionPurchaseResult {
  readonly success: boolean;
  readonly transactionId?: string;
  readonly error?: string;
}

export interface LegionFriendRequestResult {
  readonly success: boolean;
  readonly status?: 'accepted' | 'pending';
  readonly error?: string;
}

/**
 * What a player event carries. `respawn_request` carries nothing;
 * `play_emote` carries the chosen emote's catalogue id (a 24-character string).
 */
export type LegionPlayerEvent =
  | 'respawn_request'
  | 'chat_message_sent'
  | 'pointer_lock_changed'
  | 'play_emote';

export interface LegionSdk {
  init(options: { gameSlug: string; portalUrl?: string; apiUrl?: string }): void;

  auth?: {
    getUser(): LegionUser | null;
    /**
     * The portal's GUEST identity, and null once somebody is signed in.
     *
     * The portal gives every unauthenticated visitor a real name and a real
     * portrait - "Chicken 877" and a rendered thumbnail - rather than leaving
     * them anonymous. `getUser` returns null for those visitors, so a game
     * that only asked for the user showed a room full of people called
     * nothing. It is the exact mirror of `getUser`: exactly one of the two is
     * ever non-null.
     */
    getGuest?(): LegionUser | null;
    getToken(): string | null;
    isLoggedIn(): boolean;
    showAuthPopup(): Promise<LegionUser | null>;
    logout(): void;
    onUserChanged(callback: (user: LegionUser | null) => void): () => void;
    authenticateWithServer(url: string): Promise<unknown | null>;
  };

  avatar?: {
    getEquipped(): LegionEquipped;
    getProportions(): LegionProportions;
    setProportions(partial: Partial<LegionProportions>): Promise<unknown>;
    resetProportions(): Promise<unknown>;
    onAvatarChanged(callback: (equipped: LegionEquipped) => void): () => void;
    onProportionsChanged(
      callback: (proportions: LegionProportions) => void,
    ): () => void;
    showCustomizer(): void;
    hideCustomizer(): void;
    toggleCustomizer(): void;
    isCustomizerOpen(): boolean;
  };

  social?: {
    getFriends(): Promise<LegionFriend[]>;
    inviteFriend(userId: string): Promise<boolean>;
    getInviteFriendsLink(options?: {
      gameSlug?: string;
      roomId?: string;
      partyId?: string;
      baseUrl?: string;
      ref?: string;
    }): string;
    sendFriendRequest(userId: string): Promise<LegionFriendRequestResult>;
  };

  settings?: {
    listen(key: string, callback: (value: string) => void): () => void;
    get(key: string): string;
    getAll(): Record<string, string>;
    onChanged(callback: (settings: Record<string, string>) => void): () => void;
    triggerAll(): void;
    refresh(): void;
  };

  game?: {
    loadingStep(text: string): void;
    loadingEnd(): void;
    gameplayStart(): void;
    gameplayEnd(): void;
    updateRoom(roomId: string, partyId?: string): void;
    playerJoined(username: string): void;
    playerInRoom(username: string): void;
    /**
     * Tell the portal this game supports a feature. `'emotes'` is what makes
     * the portal draw its emote button (and send `play_emote`) at all.
     * Optional: older SDK builds predate it.
     */
    registerFeature?(name: string, version?: number): void;
  };

  player?: {
    onEvent(
      callback: (event: LegionPlayerEvent, data?: unknown) => void,
    ): () => void;
  };

  /** The platform environment Boxity told this page (prod, stage or local). */
  environment?(): { env: string; apiUrl: string; playUrl: string; portalUrl: string; staticUrl: string };
  onEnvironmentChanged?(callback: (env: { env: string; apiUrl: string; playUrl: string; portalUrl: string; staticUrl: string }) => void): () => void;

  /** Boxity chat: every message in this room (the sender's own too), verified and filtered. */
  chat?: {
    bubbleSeconds: number;
    onMessage(callback: (message: LegionChatMessage) => void): () => void;
    bubbleText(message: LegionChatMessage): string;
    attachBubble(THREE: unknown, target: unknown, text: string, options?: { height?: number; scale?: number }): unknown;
  };

  /** Where Boxity draws over the game (its toolbar, its chat feed), in CSS px. */
  ui?: {
    reservedAreas(): { id: string; left: number; top: number; width: number; height: number }[];
    onReservedAreasChange(callback: (areas: { id: string; left: number; top: number; width: number; height: number }[]) => void): () => void;
  };

  /** The death screen: Boxity's ads and countdown while the local player is dead. */
  deathScreen?: {
    show(): LegionDeathScreen;
    hide(): void;
    isActive(): boolean;
  };

  /** Ads: Boxity runs every ad itself, over the game. */
  ads?: {
    onBreakStart(callback: () => void): () => void;
    onBreakEnd(callback: () => void): () => void;
    isAvailable(): boolean;
    showRewarded(placement: string): Promise<LegionRewardedResult>;
    screen(type: LegionAdScreen, options?: { skip?: string[]; sizes?: Record<string, string> }): { hide(): void } | undefined;
    hideScreen(): void;
  };

  leaderboard?: {
    define(boards: LegionBoard[]): void;
    submit(board: string, score: number): Promise<unknown>;
    getTop(board: string, options?: { period?: 'current' | 'all'; limit?: number }): Promise<unknown>;
    open(board?: string): boolean;
    isSupported(): boolean;
  };

  /** Gems (in-game currency); bux is the deprecated alias. */
  gems?: {
    requestPurchase(sku: string, metadata?: Record<string, unknown>): Promise<LegionPurchaseResult>;
    getBalance(): Promise<number>;
  };

  bux?: {
    requestPurchase(
      sku: string,
      metadata?: Record<string, unknown>,
    ): Promise<LegionPurchaseResult>;
    getBalance(): Promise<number>;
  };

  portal?: {
    isInIframe(): boolean;
    isEmbeddedInLegion(): boolean;
    requestFullscreen(): void;
    exitFullscreen(): void;
    showMenu(lockCursorOnResume?: boolean): void;
  };

  /** The matchmaker helper: `POST <matchmakerUrl>/v1/play/<gameId>` -> a relay endpoint. */
  net?: {
    resolveEndpoint(
      gameId: string,
      options?: { matchmakerUrl?: string; version?: string; userId?: string },
    ): Promise<{ endpoint: string; roomId: string; cold: boolean }>;
  };

  api?: {
    get(path: string): Promise<unknown>;
    post(path: string, body?: unknown): Promise<unknown>;
    patch(path: string, body?: unknown): Promise<unknown>;
    delete(path: string): Promise<unknown>;
  };
}

export interface LegionChatMessage {
  userId: string;
  username: string;
  text: string;
  isGif: boolean;
  at: number;
  isLocalPlayer: boolean;
}

export interface LegionDeathScreen {
  /** n = seconds left (4, 3, 2, 1), then 0 when the player may respawn. Returns an unsubscribe. */
  onCountdown(callback: (n: number) => void): () => void;
  readonly ready: Promise<void>;
  /** True (and closes the screen) only once the countdown has reached 0. */
  respawn(): boolean;
  hide(): void;
}

export interface LegionBoard {
  id: string;
  label: string;
  order?: 'desc' | 'asc';
  mode?: 'best' | 'sum' | 'latest';
  format?: 'number' | 'compact' | 'time';
  reset?: 'none' | 'daily' | 'weekly' | 'monthly';
}

declare global {
  interface Window {
    Legion?: { SDK?: LegionSdk };
  }
}

/** An id is only equipped if it is a real one. */
export const isEquippedId = (id: string | null | undefined): id is string =>
  id != null && id !== '' && id !== '-1' && id !== 'undefined';

/** What a rewarded ad came to: grant only on 'completed' (the server verifies `rewardToken`). */
export interface LegionRewardedResult {
  status: 'completed' | 'skipped' | 'failed' | 'disabled' | string;
  rewardToken?: string;
  /** Why it was denied, when status is 'denied'. */
  reason?: string;
}

/** The screens a game reports for screen ads. */
export type LegionAdScreen = 'menu' | 'lobby' | 'results' | 'panel' | 'gameplay';
