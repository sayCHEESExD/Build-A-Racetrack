import {
  ARENA,
  ARENA_INDEX,
  AD_MONEY_BOOST,
  DECORS,
  DEFAULT_APPEARANCE,
  DEFAULT_PROPORTIONS,
  GROUND_Y,
  LEVEL_H,
  PLOTS,
  RARITIES,
  SHOPS,
  SPAWN_POINT,
  TILE,
  TRACK_ITEMS,
  TRACK_Y0,
  TrackPath,
  carDef,
  cellOf,
  checkDecor,
  checkPlace,
  decorAtCell,
  decorDef,
  decorRefusalText,
  fmtMoney,
  isEmoteId,
  mapBase,
  pitPad,
  plotDef,
  refusalText,
  repairCost,
  spawnPad,
  toWorld,
  LIKES_BOARD_C,
  trackItem,
  unpackDecor,
  unpackPieces,
  type ArenaMessage,
  type BannerMessage,
  type CarEvent,
  type CarSim,
  type CoinsMessage,
  type CrateMessage,
  type Decor,
  type DriveStartMessage,
  type FxMessage,
  type NoticeMessage,
  type Piece,
  type PlacedMessage,
  type ProfileMessage,
  type TrackMessage,
} from '@race/shared';
import { CanvasTexture, Euler, Quaternion, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three';
import { loadEmotes } from '../animation/Emotes.js';
import { Sfx, hearing, type SoundName } from '../audio/Sfx.js';
import { AvatarDresser } from '../bloxity/AvatarDresser.js';
import { Bloxity } from '../bloxity/Bloxity.js';
import { lookFromLegion } from '../bloxity/avatarLook.js';
import { identityFromLegion } from '../bloxity/identity.js';
import { CharacterCamera } from '../camera/CharacterCamera.js';
import { clientConfig } from '../config/clientConfig.js';
import { Driver } from '../drive/Driver.js';
import { InputManager } from '../input/InputManager.js';
import type { InputState } from '../input/InputState.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { ConnectionStatus, NetGameState, NetPlayerState } from '../net/netTypes.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { playerModelLoader } from '../player/PlayerModelLoader.js';
import { RemoteView } from '../player/RemoteView.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { FriendsUI } from '../ui/FriendsUI.js';
import { Hud, MENU_KEYS, PACK_KEYS, type BuildCard, type BuildTab, type MenuKind, type TabTarget } from '../ui/Hud.js';
import { thumbs } from '../ui/Thumbs.js';
import { Windows, type WindowKind, type WindowView } from '../ui/Windows.js';
import { AdScreens } from '../ui/AdScreens.js';
import { logger } from '../util/logger.js';
import { TrackView } from '../world/TrackView.js';
import { Tutorial } from './Tutorial.js';

const TUTORIAL_DONE_KEY = 'racetrack.tutorialDone';
const SCOPE = 'Game';

const WALK_DISTANCE = 12;
const BUILD_DISTANCE = 26;
const DRIVE_DISTANCE = 9.5;

const P = new Vector3();
const DIR = new Vector3();
const SEAT = new Vector3();
const CAMT = new Vector3();
const Q = new Quaternion();
const FLAT = new Euler(0, 0, 0, 'YXZ');

type Prompt =
  | { kind: 'shop'; shop: 'track' | 'decor' | 'crate'; name: string }
  | { kind: 'drive'; plot: number; name: string }
  | { kind: 'pit' }
  | { kind: 'like'; plot: number; name: string }
  | { kind: 'arena' };

/**
 * COMPOSITION ROOT. Owns every subsystem and the per-frame order - input,
 * prediction, building, driving, camera, world, HUD, audio, render - and no
 * game rules: every rule is the server's (the ghost is checked with the same
 * shared rules the server places with; the car is checked as it reports).
 *
 * MODES: WALK the raceway (shops, pads, prompts), BUILD (1: the camera pulls
 * back over your plot, the Build Menu lists your pieces, the next one shows at
 * the glowing end of your track; 2: delete), and DRIVE (your car on a track;
 * W / S, A / D, Space or Exit to leave).
 */
export class Game {
  private readonly renderer: RendererManager;
  private readonly sceneManager = new SceneManager();
  private readonly camera = new CharacterCamera();
  private readonly input = new InputManager();
  private readonly sfx = new Sfx();
  private readonly bloxity: Bloxity;
  private readonly network: NetworkClient;
  private readonly hud: Hud;
  private readonly windows: Windows;
  private readonly friends: FriendsUI;
  private readonly fpsReadout: HTMLDivElement;
  private readonly driver: Driver;

  private view: TrackView | null = null;
  private tutorial: Tutorial | null = null;
  private tutorialChecked = false;
  private player: LocalPlayer | null = null;
  private dresser: AvatarDresser | null = null;
  private pendingAvatar: (() => void) | null = null;
  private localId: string | null = null;
  private local: NetPlayerState | null = null;
  private readonly views = new Map<string, RemoteView>();
  private readonly reported = new Map<string, string>();
  private joinedAt = 0;
  private clock = 0;
  private reconnecting = false;

  // ---- building
  private building = false;
  private deleting = false;
  private buildTab: BuildTab = 'track';
  private selected = 'straight';
  private selectedDecor = 'cone';
  private flip = false;
  /** The player pressed R for this piece: no automatic flipping until they place or pick again. */
  private flipManual = false;
  private decorRot = 0;
  private ghostOk = false;
  private ghostWhy = '';
  private tapAt: { x: number; y: number } | null = null;
  private profile: ProfileMessage = {
    inventory: {},
    decor: {},
    cars: { kart: { lv: {}, cond: 100 } },
    stock: { track: {}, decor: {}, crate: {} },
    restockAt: 0,
    pass2x: false,
    boostUntil: 0,
    giftIn: 600,
    slots: [0, 0, 0],
    code: '',
    liked: [],
  };
  private profileAt = 0;
  private arena: ArenaMessage | null = null;

  // ---- driving
  private readonly pedals = { gas: false, brake: false, left: false, right: false };
  private runCash = 0;
  private wasDriving = false;
  private shake = 0;

  // ---- ads
  private adBreak = false;
  private adBusy = false;
  private adScreens: AdScreens | null = null;

  private prompt: Prompt | null = null;
  private stepDistance = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private boardsAt = 0;
  private readonly listener = { x: 0, y: 0, z: 0, yaw: 0 };
  /** Where the build camera looks (eases toward the glowing end). */
  private readonly buildFocus = new Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new RendererManager(container);
    this.sceneManager.scene.add(this.camera.camera);
    this.hud = new Hud(container, {
      tab: (to) => this.tab(to),
      menu: (which) => this.menu(which),
      slot: (i) => this.slot(i),
      buildTab: (tab) => this.setBuildTab(tab),
      pick: (key) => this.pick(key),
      rotate: () => this.rotate(),
      place: () => this.placeNow(),
      exitBuild: () => this.setBuilding(false),
      exitDrive: () => this.driver.exit(),
      pedal: (which, down) => {
        this.pedals[which] = down;
      },
      prompt: () => this.usePrompt(),
      chat: (text) => this.network.chat(text),
      mute: () => this.hud.setMuted(this.sfx.toggleMuted()),
      login: () => {
        if (!this.bloxity.isLoggedIn()) void this.bloxity.showAuthPopup();
      },
      pack: (sku) => void this.buyGems(sku),
    });
    const ui = this.hud.root;
    this.windows = new Windows(ui, {
      buy: (kind, key, count, car) => {
        this.network.buy(kind, key, count ?? 1, car);
        this.sfx.play('click', 0.4);
      },
      equip: (key) => this.network.equip(key),
      repair: (key) => this.network.repair(key),
      rebirth: () => this.network.rebirth(),
      freeGift: () => this.network.freeGift(),
      watchAd: () => void this.watchAd(),
      gems: (sku) => void this.buyGems(sku),
      browse: (tab) => this.network.browse(tab),
      visit: (code) => {
        this.network.visit(code);
        this.closePanels();
      },
      like: (code) => this.network.like({ code }),
      publish: (name, desc) => this.network.publish(name, desc),
      slot: (i, action) => this.network.slot(i, action),
      close: () => this.closePanels(),
    });
    this.friends = new FriendsUI(ui, {
      load: () => this.bloxity.getFriends(),
      invite: (userId) => this.bloxity.inviteFriend(userId, this.network.roomId),
      link: () => (this.network.roomId ? this.bloxity.getInviteLink(this.network.roomId) : ''),
      login: () => {
        if (this.bloxity.embedded) this.hud.notice('info', 'Sign in with the Boxity toolbar');
        else void this.bloxity.showAuthPopup();
      },
      signedIn: () => this.bloxity.isLoggedIn(),
      close: () => this.closePanels(),
    });
    this.driver = new Driver({
      collect: (run, i, lap) => this.network.driveCollect(run, i, lap),
      air: (run, air, dist) => this.network.driveAir(run, air, dist),
      end: (run, reason, impact) => this.network.driveEnd(run, reason, impact),
      pose: (run, pos, yaw, pitch, roll, v) => this.network.drivePose({ run, x: pos.x, y: pos.y, z: pos.z, yaw, pitch, roll, v }),
      event: (e, sim) => this.onCarEvent(e, sim),
    });

    this.input.onTouchMode = () => this.hud.setTouch(true);
    this.input.look.onLockChange = (locked) => {
      if (locked) return;
      window.setTimeout(() => {
        if (!this.panelOpen && !this.hud.chatOpen && !this.building && !this.adBreak && !this.input.look.locked && this.bloxity.embedded) this.bloxity.showPortalMenu(true);
      }, 0);
    };
    this.input.look.onTap = (x, y) => {
      this.tapAt = { x, y };
    };
    this.input.look.onWheel = (notches) => {
      if (this.panelOpen) return;
      const d = this.input.look.distance + notches * 2;
      this.input.look.setDistance(Math.max(4, Math.min(this.building ? 70 : 32, d)));
    };

    this.bloxity = new Bloxity({
      setMasterVolume: (level) => this.sfx.setMasterVolume(level),
      setMusicVolume: (level) => this.sfx.music.setVolume(level),
      setChatEnabled: (on) => this.hud.setChatEnabled(on),
      setPanelOpacity: (opacity) => document.documentElement.style.setProperty('--panel-alpha', opacity.toFixed(2)),
      portalChat: (text) => this.network.chat(text),
      setGraphicsQuality: (level) => this.renderer.setQuality(level),
      setShowFps: (show) => {
        this.fpsReadout.hidden = !show;
      },
      setCameraSensitivity: (scale) => this.input.look.setSensitivityScale(scale),
      respawn: () => this.network.respawn(),
      pointerLockChanged: () => undefined,
      avatarChanged: (equipped, proportions) => {
        const look = lookFromLegion(equipped, proportions);
        this.network.sendAvatar(look);
        const apply = (): void => this.dresser?.setLook(look.appearance, look.proportions);
        if (this.dresser) apply();
        else this.pendingAvatar = apply;
      },
      playEmote: (id) => this.playEmote(id),
      chatMessage: (m, text) => this.showChatBubble(m.isLocalPlayer, m.userId, text),
      environmentChanged: () => this.network.environmentChanged(),
      adBreak: (on) => {
        this.adBreak = on;
        this.sfx.setAdBreak(on);
        if (on) this.input.look.releaseLock();
      },
    });
    void loadEmotes();

    this.fpsReadout = document.createElement('div');
    this.fpsReadout.style.cssText = 'position:fixed;right:8px;top:62px;z-index:30;color:#fff;font:600 12px monospace;text-shadow:0 1px 2px #000';
    this.fpsReadout.hidden = true;
    container.appendChild(this.fpsReadout);

    window.addEventListener('keydown', this.onHotkey);
    window.addEventListener('keydown', this.onGesture);
    window.addEventListener('mousedown', this.onGesture);
    window.addEventListener('touchstart', this.onGesture, { passive: true });
    this.renderer.onResize((width, height) => this.camera.setViewport(width, height));

    this.network = new NetworkClient({
      onStatusChange: (status, detail) => this.onStatusChange(status, detail),
      onSelfJoined: (sessionId) => {
        this.localId = sessionId;
        this.joinedAt = this.clock;
        this.bloxity.updateRoom(this.network.roomId);
      },
      onPlayerAdded: (id, p) => this.onPlayer(id, p, true),
      onPlayerChanged: (id, p) => this.onPlayer(id, p, false),
      onPlayerRemoved: (id) => this.removeView(id),
      onPlaced: (m) => this.onPlaced(m),
      onNotice: (m) => this.onNotice(m),
      onTrack: (m) => this.onTrack(m),
      onCoins: (m) => this.onCoins(m),
      onProfile: (m) => this.onProfile(m),
      onReward: (m) => {
        if (m.why === 'this run') {
          this.hud.setRun(m.amount);
          return;
        }
        this.hud.reward(m.amount);
        if (m.why) this.hud.notice('good', `+${fmtMoney(m.amount)}  ${m.why}`);
      },
      onFx: (m) => this.onFx(m),
      onChatLine: (m) => this.hud.line(m),
      onBanner: (m) => this.onBanner(m),
      onDriveStart: (m) => this.onDriveStart(m),
      onCrate: (m) => this.onCrate(m),
      onGallery: (m) => this.windows.setGallery(m.tab, m.items, m.mine),
      onArena: (m) => this.onArena(m),
      onOffline: (m) => this.windows.showOffline(m.amount, m.seconds, this.windowView()),
      onSessionReset: () => this.onSessionReset(),
    });
    this.network.setTokenProvider(() => this.bloxity.getToken());
    this.network.setLookProvider(() => lookFromLegion(this.bloxity.getEquipped(), this.bloxity.getProportions()));
    this.network.setDisplayProvider(() => identityFromLegion(this.bloxity.getUser(), this.bloxity.getGuest()));
    this.bloxity.onUserChanged((user) => {
      this.network.sendAuth(this.bloxity.getToken());
      this.network.sendIdentity(identityFromLegion(user, this.bloxity.getGuest()));
      this.hud.setOwnChat(!this.bloxity.boxityChat);
      this.hud.setLogin(user ? user.displayName || user.username || 'Player' : null, user?.pfp ?? '');
      if (this.friends.open) void this.friends.refresh();
    });
  }

  // ---------------------------------------------------------------- setup

  startBloxity(): void {
    this.bloxity.start();
    this.hud.setOwnChat(!this.bloxity.boxityChat);
    this.hud.setLoginShown(this.bloxity.available && !this.bloxity.embedded);
    this.hud.setReservedAreas(() => this.bloxity.reservedAreas());
    this.bloxity.onReservedAreasChange(() => this.hud.layout());
    document.body.classList.toggle('gm-portal-embedded', this.bloxity.embedded);
  }

  loadingStep(text: string): void {
    this.bloxity.loadingStep(text);
  }

  async initialise(): Promise<void> {
    await playerModelLoader.load();
    this.view = new TrackView(this.sceneManager);
    this.tutorial = new Tutorial(this.sceneManager.scene, {
      hint: (html) => this.hud.setHint(html),
      glow: (names) => {
        this.hud.glow(names);
        for (const e of this.windows.root.querySelectorAll<HTMLElement>('[data-tut]')) e.classList.toggle('rt-glow', names.includes(e.dataset['tut'] ?? ''));
      },
      finished: () => {
        this.markTutorial();
        this.hud.banner({ title: 'TUTORIAL COMPLETE!', sub: 'Keep building to earn more!', tone: 'gold', seconds: 4 });
        this.sfx.play('levelup', 0.6);
        const pos = this.player!.position;
        this.view?.effects.burst(pos.x, pos.y + 3, pos.z, 60, [0xff4fb8, 0xffd23f, 0x3fa2ff, 0x58d36a, 0xffffff], 9, 0.2, 1.6, 8, true);
        this.hud.setHint('');
      },
    });
    const world = mapBase();
    this.player = new LocalPlayer(world);
    this.dresser = new AvatarDresser(this.player.avatar.character);
    this.dresser.setLook(DEFAULT_APPEARANCE, DEFAULT_PROPORTIONS);
    this.pendingAvatar?.();
    this.pendingAvatar = null;
    this.player.avatar.showName = false;
    this.sceneManager.scene.add(this.player.avatar.root);
    this.player.teleport(SPAWN_POINT.x, SPAWN_POINT.y, SPAWN_POINT.z, SPAWN_POINT.yaw);
    this.input.look.setYaw(SPAWN_POINT.yaw);
    this.input.look.setPitch(0.36);
    this.input.look.setDistance(WALK_DISTANCE);
    this.camera.setCollision(world);
    this.camera.snapZoom(WALK_DISTANCE);
    this.sceneManager.setAtmosphere(0x8fd0ff, 0xbfe6ff, 160, 420);
    this.renderer.setShadows(true);
    logger.info(SCOPE, 'world ready');
  }

  async connect(): Promise<void> {
    await this.network.connect();
  }

  start(): void {
    this.input.attach(this.renderer.renderer.domElement);
    this.sfx.music.setMood('lobby');
    this.hud.setTouch(this.input.touchActive);
    this.bloxity.loadingEnd();
    this.bloxity.gameplayStart();
  }

  stop(): void {
    this.input.detach();
    this.bloxity.gameplayEnd();
    this.bloxity.updateRoom('');
    void this.network.disconnect();
  }

  // ---------------------------------------------------------------- queries

  private get state(): NetGameState | null {
    return this.network.state;
  }

  private get panelOpen(): boolean {
    return this.windows.open || this.friends.open;
  }

  private get driving(): boolean {
    return this.driver.active || (this.local?.driving ?? false);
  }

  private get myPlot(): number {
    return this.local?.plot ?? -1;
  }

  private get tier(): number {
    return this.local?.tier ?? 0;
  }

  private windowView(): WindowView {
    const l = this.local;
    const track = this.view?.plot(this.myPlot);
    return {
      now: Date.now(),
      cash: Math.floor(l?.cash ?? 0),
      tier: l?.tier ?? 0,
      rebirths: l?.rebirths ?? 0,
      car: l?.car ?? 'kart',
      inventory: this.profile.inventory,
      decorInv: this.profile.decor,
      cars: this.profile.cars,
      stock: this.profile.stock,
      restockAt: this.profile.restockAt,
      pass2x: this.profile.pass2x,
      boostUntil: this.profile.boostUntil,
      giftIn: Math.max(0, Math.ceil(this.profile.giftIn - (performance.now() - this.profileAt) / 1000)),
      slots: this.profile.slots,
      code: this.profile.code,
      adReady: this.bloxity.adsAvailable(),
      adBusy: this.adBusy,
      rate: l?.rate ?? 0,
      length: Math.max(0, (track?.pieces.length ?? 1) - 1),
      likes: l?.likes ?? 0,
      visits: l?.visits ?? 0,
      bestAir: l?.bestAir ?? 0,
    };
  }

  // ---------------------------------------------------------------- monetisation

  private async watchAd(): Promise<void> {
    if (this.adBusy || !this.bloxity.adsAvailable()) return;
    this.adBusy = true;
    try {
      const r = await this.bloxity.showRewarded(AD_MONEY_BOOST);
      if (r.status !== 'completed') logger.info(SCOPE, `rewarded ad: ${JSON.stringify(r)}`);
      if (r.status === 'completed' && r.rewardToken) this.network.adReward(AD_MONEY_BOOST, r.rewardToken);
      else if (r.status === 'completed') this.hud.notice('bad', 'The ad finished but sent no reward token');
      else this.hud.notice('info', r.status === 'denied' && r.reason ? `Ad not allowed right now (${r.reason})` : REWARDED_MESSAGES[r.status] ?? `No ad this time (${r.status})`);
    } finally {
      this.adBusy = false;
    }
  }

  private async buyGems(sku: string): Promise<void> {
    this.sfx.play('click', 0.4);
    if (!this.bloxity.available) {
      this.hud.notice('info', 'Gem purchases are available when playing on Bloxity');
      return;
    }
    if (!this.bloxity.isLoggedIn()) {
      // Inside Boxity its toolbar signs players in (never our own popup there).
      if (this.bloxity.embedded) this.hud.notice('info', 'Sign in with the Boxity toolbar to buy with Gems');
      else void this.bloxity.showAuthPopup();
      return;
    }
    const r = await this.bloxity.requestPurchase(sku);
    if (r.success) this.hud.notice('good', 'Purchase complete! It arrives in a moment.');
    else if (r.error) this.hud.notice('bad', r.error);
  }

  /**
   * Screen ads: only behind a window or the friends list ('panel'); none during play. The banners
   * are fitted around whatever of the UI is showing at this window size (`AdScreens`), re-sent
   * only when that layout changes, and never while a rewarded ad is pending.
   */
  private updateAdScreen(delta: number): void {
    if (!this.adScreens) {
      this.adScreens = new AdScreens(
        {
          adScreen: (type, options) => this.bloxity.adScreen(type, options as Record<string, never>),
          hideAdScreen: () => this.bloxity.adScreen(null),
        },
        this.hud.root,
      );
    }
    this.adScreens.update(delta, this.panelOpen ? 'panel' : null, this.adBusy);
  }

  // ---------------------------------------------------------------- actions

  private closePanels(): void {
    this.windows.hide();
    this.friends.hide();
  }

  private openWindow(which: WindowKind): void {
    if (this.windows.which === which) {
      this.closePanels();
      return;
    }
    this.closePanels();
    if (this.driver.active) return;
    this.windows.show(which, this.windowView());
    this.input.look.releaseLock();
    this.sfx.play('click', 0.5);
  }

  private tab(to: TabTarget): void {
    if (this.driver.active) this.driver.exit();
    if (this.building) this.setBuilding(false);
    this.closePanels();
    this.network.teleport(to);
  }

  private menu(which: MenuKind): void {
    const map: Record<MenuKind, WindowKind> = { shop: 'shop', upgrade: 'upgrade', racetracks: 'racetracks', save: 'save', garage: 'garage', rebirth: 'rebirth', free: 'free' };
    this.openWindow(map[which]);
  }

  private slot(i: number): void {
    if (i === 0) {
      if (this.building && !this.deleting) this.setBuilding(false);
      else {
        this.deleting = false;
        this.setBuilding(true);
      }
    } else if (i === 1) {
      if (this.building && this.deleting) this.setBuilding(false);
      else {
        this.setBuilding(true);
        this.deleting = this.building;
      }
    } else if (i === 2) this.driveHome();
    this.sfx.play('click', 0.4);
  }

  private setBuilding(on: boolean): void {
    if (on && this.driving) return;
    if (on && this.myPlot < 0) {
      this.hud.notice('bad', 'No plot free in this lobby');
      return;
    }
    if (on === this.building) return;
    this.building = on;
    if (!on) this.deleting = false;
    this.network.building(on);
    this.closePanels();
    if (on) {
      this.input.look.setDistance(BUILD_DISTANCE);
      this.input.look.setPitch(0.82);
      const plot = PLOTS[this.myPlot];
      if (plot) this.input.look.setYaw(plot.side > 0 ? -Math.PI / 2 + 0.5 : Math.PI / 2 + 0.5);
      if ((this.profile.inventory[this.selected] ?? 0) <= 0) {
        const have = TRACK_ITEMS.find((i) => (this.profile.inventory[i.key] ?? 0) > 0);
        if (have) this.selected = have.key;
      }
    } else this.input.look.setDistance(WALK_DISTANCE);
    this.sfx.play('click', 0.5);
  }

  private setBuildTab(tab: BuildTab): void {
    this.buildTab = tab;
    this.deleting = false;
    if (tab === 'decor' && (this.profile.decor[this.selectedDecor] ?? 0) <= 0) {
      const have = DECORS.find((d) => (this.profile.decor[d.key] ?? 0) > 0);
      if (have) this.selectedDecor = have.key;
    }
    this.sfx.play('click', 0.35);
  }

  private pick(key: string): void {
    this.deleting = false;
    if (this.buildTab === 'track') {
      this.selected = key;
      this.flip = false;
      this.flipManual = false;
    } else this.selectedDecor = key;
    this.sfx.play('click', 0.35);
  }

  private rotate(): void {
    if (this.buildTab === 'decor') this.decorRot = (this.decorRot + 1) & 3;
    else {
      const item = trackItem(this.selected);
      if (item && item.shapes.length > 1) {
        this.flip = !this.flip;
        this.flipManual = true;
      }
      else this.hud.notice('info', 'This piece always follows your track - turns, U-turns and swerves can flip');
    }
    this.sfx.play('click', 0.35);
  }

  /** The next piece as it would go onto the glowing end. */
  private nextPiece(): Piece | null {
    const track = this.view?.plot(this.myPlot);
    const end = track?.chain.end;
    const item = trackItem(this.selected);
    if (!end || !item) return null;
    return { k: item.shapes[this.flip && item.shapes.length > 1 ? 1 : 0]!, x: end.x, z: end.z, y: end.y, r: end.r };
  }

  private placeNow(): void {
    if (!this.building || this.deleting || this.buildTab === 'decor') return;
    const piece = this.nextPiece();
    if (!piece) {
      this.hud.notice('info', refusalText.closed);
      return;
    }
    if ((this.profile.inventory[this.selected] ?? 0) <= 0) {
      this.hud.notice('bad', `No ${trackItem(this.selected)?.name ?? 'pieces'} left - buy more at the Track Shop`);
      this.sfx.play('denied', 0.3);
      return;
    }
    const track = this.view!.plot(this.myPlot)!;
    const why = checkPlace(track.pieces, track.decor, piece, this.tier);
    if (why) {
      this.hud.notice('bad', refusalText[why]);
      this.sfx.play('denied', 0.3);
      return;
    }
    this.network.place(this.selected, this.flip);
  }

  private driveHome(): void {
    if (this.driving || this.myPlot < 0) return;
    if (this.building) this.setBuilding(false);
    this.closePanels();
    this.network.drive(this.myPlot);
  }

  private playEmote(id: string): void {
    try {
      if (!isEmoteId(id) || this.driving) return;
      const key = id.toLowerCase();
      if (this.player?.avatar.character.playEmote(key)) this.network.emote(key);
    } catch (error) {
      logger.warn(SCOPE, `emote ${id} failed: ${String(error)}`);
    }
  }

  private markTutorial(): void {
    try {
      window.localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    } catch {
      /* private mode */
    }
  }

  // ---------------------------------------------------------------- the frame

  update(delta: number): void {
    const state = this.state;
    this.clock = this.tickClock(delta, state?.elapsed ?? 0);
    const panel = this.panelOpen;
    const chatting = this.hud.chatOpen;
    this.input.setSuppressed(panel || chatting || this.reconnecting || this.adBreak);
    this.hud.setPanelOpen(panel);
    this.updateAdScreen(delta);
    const touch = this.input.touchActive || this.hud.touchActive;
    this.input.look.setCursorMode(this.building || touch);
    this.input.look.setCaptureOnClick(!panel && !chatting && !touch && !this.adBreak);
    if ((panel || chatting) && this.input.look.locked) this.input.look.releaseLock();
    const input = this.input.sample();
    const player = this.player;
    const view = this.view;
    if (!player || !view) return;

    // ---- the body (frozen while driving)
    const driving = this.driving;
    if (driving && this.building) this.setBuilding(false);
    player.avatar.setHand(this.building ? 'wrench' : '', 0);
    player.params.frozen = !this.local || driving;
    player.faceCamera = false;
    this.input.look.setPitchLimits(this.camera.pitchLimits().min, this.camera.pitchLimits().max);
    player.pitch = this.input.look.pitch;
    player.update(delta, driving ? { ...input, moveX: 0, moveZ: 0, jump: false } : input, this.input.look.yaw);
    for (const message of player.drainOutgoing()) this.network.sendInput(message);
    if (player.jumpedEdge && !driving) this.sfx.play('jump', 0.18);
    if (!driving) this.footsteps(delta, player);

    // ---- building
    if (this.building && !panel && !chatting && this.local) this.updateBuild(input);
    else {
      view.setGhost(-1, null, false);
      view.setEnd(-1, null);
      view.setDeleteMark(-1, -1);
      view.setDecorGhost(-1, null, false);
    }
    this.tapAt = null;

    // ---- driving
    this.updateDrive(delta, input);
    this.updateViews(delta);
    this.updateCars(delta);
    this.updatePrompt(input);

    // ---- camera, world, HUD
    this.updateCamera(delta);
    this.sceneManager.followSun(this.camera.camera.position.x, this.camera.camera.position.z);
    view.update(delta, this.camera.camera, player.position.x, player.position.z);
    this.updateHud(delta);
    this.updateTutorial(delta);
    this.tickFps(delta);
    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);
  }

  private tickClock(delta: number, server: number): number {
    if (Math.abs(server - this.clock) > 1) return server;
    return this.clock + delta + (server - this.clock) * Math.min(1, delta * 2);
  }

  /** Where the cursor (or a tap) meets the horizontal plane at height y. */
  private pickPlane(screen: { x: number; y: number } | null, y: number): Vector3 | null {
    const look = this.input.look;
    let at = screen;
    if (!at) {
      if (this.hud.touchActive || !look.pointerOver || look.pointerX < 0 || look.rightDragging) return null;
      at = { x: look.pointerX, y: look.pointerY };
    }
    const cam = this.camera.camera;
    P.set((at.x / this.renderer.width) * 2 - 1, -(at.y / this.renderer.height) * 2 + 1, 0.5).unproject(cam);
    DIR.copy(P).sub(cam.position).normalize();
    if (Math.abs(DIR.y) < 1e-4) return null;
    const t = (y - cam.position.y) / DIR.y;
    if (t <= 0) return null;
    return new Vector3(cam.position.x + DIR.x * t, y, cam.position.z + DIR.z * t);
  }

  private updateBuild(input: Readonly<InputState>): void {
    const view = this.view!;
    const track = view.plot(this.myPlot);
    const plot = PLOTS[this.myPlot];
    if (!track || !plot) return;
    const tap = this.tapAt;
    const click = input.attackPressed || tap !== null;
    const end = track.chain.end;
    view.setEnd(this.myPlot, this.deleting || this.buildTab === 'decor' ? null : end);

    if (this.deleting) {
      view.setGhost(-1, null, false);
      view.setDecorGhost(-1, null, false);
      this.hud.setPlaceVisible(false);
      const hit = this.pickPlane(tap, TRACK_Y0);
      const i = hit ? track.pieceNear(hit.x, hit.y, hit.z) : -1;
      view.setDeleteMark(this.myPlot, i);
      let decorAt = -1;
      if (i < 0 && hit) {
        const [cx, cz] = cellOf(plot, hit.x, hit.z);
        decorAt = decorAtCell(track.decor, cx, cz);
      }
      const n = i >= 0 ? track.pieces.length - i : 0;
      this.hud.setBuildLabel(i >= 0 ? `Delete <b style="color:#ff6a6a">${n} piece${n > 1 ? 's' : ''}</b> (back to your inventory)` : decorAt >= 0 ? 'Click to pick up this decoration' : 'Click a piece to take it (and every piece after it) back', i >= 0 || decorAt >= 0);
      if (click && i >= 0) {
        this.network.remove(i);
        this.sfx.play('break', 0.5);
      } else if (click && decorAt >= 0) {
        this.network.removeDecor(track.decor[decorAt]!.x, track.decor[decorAt]!.z);
        this.sfx.play('break', 0.5);
      }
      return;
    }
    view.setDeleteMark(-1, -1);

    if (this.buildTab === 'decor') {
      view.setGhost(-1, null, false);
      this.hud.setPlaceVisible(false);
      const def = decorDef(this.selectedDecor);
      const hit = this.pickPlane(tap, GROUND_Y);
      if (!def || !hit) {
        view.setDecorGhost(-1, null, false);
        this.hud.setBuildLabel(def ? `${def.name} <small>x${this.profile.decor[def.key] ?? 0}</small> - point at your plot` : 'Pick a decoration', false);
        return;
      }
      const [cx, cz] = cellOf(plot, hit.x, hit.z);
      const d: Decor = { d: def.code, x: cx, z: cz, r: this.decorRot };
      const why = checkDecor(track.pieces, track.decor, d, this.tier);
      const have = (this.profile.decor[def.key] ?? 0) > 0;
      const ok = why === null && have;
      view.setDecorGhost(this.myPlot, d, ok);
      this.hud.setBuildLabel(`${def.name} <small>x${this.profile.decor[def.key] ?? 0}</small>${!ok ? ` <small style="color:#ff8a8a">- ${why ? decorRefusalText[why] : 'none left - buy more at Decors'}</small>` : ''}`, ok);
      if (click && ok) this.network.placeDecor(def.key, cx, cz, this.decorRot);
      else if (click) this.sfx.play('denied', 0.3);
      return;
    }

    // Track: the ghost on the glowing end. A turn that would not fit flips itself (until R is pressed).
    view.setDecorGhost(-1, null, false);
    this.hud.setPlaceVisible(true);
    const flipItem = trackItem(this.selected);
    if (!this.flipManual && flipItem && flipItem.shapes.length > 1 && end) {
      const fits = (k: Piece['k']): boolean => checkPlace(track.pieces, track.decor, { k, x: end.x, z: end.z, y: end.y, r: end.r }, this.tier) === null;
      const want = !fits(flipItem.shapes[0]) && fits(flipItem.shapes[1]!);
      if (want !== this.flip) this.flip = want;
    }
    const piece = this.nextPiece();
    const item = trackItem(this.selected);
    if (!piece || !item) {
      view.setGhost(-1, null, false);
      this.hud.setBuildLabel(end ? 'Pick a track piece from the Build Menu' : 'Your track is a full circuit!', false);
      return;
    }
    const why = checkPlace(track.pieces, track.decor, piece, this.tier);
    const have = (this.profile.inventory[item.key] ?? 0) > 0;
    this.ghostOk = why === null && have;
    this.ghostWhy = why ? refusalText[why] : have ? '' : 'none left - buy more at the Track Shop';
    view.setGhost(this.myPlot, piece, this.ghostOk);
    this.hud.setBuildLabel(`${item.name} <small>x${this.profile.inventory[item.key] ?? 0}</small>${this.ghostWhy ? ` <small style="color:#ff8a8a">- ${this.ghostWhy}</small>` : ''}`, this.ghostOk);
    // A click on (or near) the glowing end places it.
    if (click && end) {
      const y = TRACK_Y0 + end.y * LEVEL_H;
      const hit = this.pickPlane(tap, y);
      const [ex, ez] = toWorld(plot.frame, end.x * TILE + TILE / 2, end.z * TILE + TILE / 2);
      if (hit && Math.hypot(hit.x - ex, hit.z - ez) < TILE * 1.4) this.placeNow();
    }
  }

  // ---------------------------------------------------------------- driving

  private onDriveStart(m: DriveStartMessage): void {
    const plot = plotDef(m.plot);
    const track = this.view?.plot(m.plot);
    if (!plot || !track || track.chain.order.length < 2) return;
    const path = new TrackPath(plot.frame, track.pieces, track.chain.order);
    this.closePanels();
    if (this.building) this.setBuilding(false);
    this.driver.start(m, path, track.chain.closed);
    this.runCash = 0;
    this.hud.setRun(0);
    this.input.look.setDistance(DRIVE_DISTANCE);
    this.input.look.setPitch(0.22);
    this.sfx.play('go', 0.5);
  }

  private onCarEvent(e: CarEvent, sim: CarSim): void {
    const pos = sim.pos;
    switch (e.t) {
      case 'air': {
        const best = e.dist > (this.local?.bestAir ?? 0) + 0.05;
        this.hud.showAir(e.air, e.dist, best);
        if (best) this.sfx.play('ding', 0.6);
        break;
      }
      case 'land':
        if (e.impact > 6) {
          this.shake = Math.min(1, e.impact / 24);
          this.sfx.play('fall', Math.min(0.5, e.impact / 40));
          this.view?.effects.burst(pos.x, pos.y + 0.2, pos.z, 10, [0xd8d8e0, 0xb8b8c8], 3, 0.18, 0.6, 12);
        }
        break;
      case 'crash':
        this.hud.crash();
        this.sfx.play('crash', 0.7);
        this.shake = 1;
        this.view?.effects.burst(pos.x, pos.y + 0.6, pos.z, 40, [0xff7a1a, 0xffd23f, 0x5a6070, 0xffffff], 9, 0.24, 1.0, 16);
        this.view?.effects.smoke(pos.x, pos.y + 0.5, pos.z);
        break;
      case 'finish':
        this.hud.banner({ title: 'FINISH!', sub: '+25% run bonus', tone: 'ride', seconds: 2 });
        this.sfx.play('victory', 0.55);
        this.view?.effects.burst(pos.x, pos.y + 2, pos.z, 50, [0xffffff, 0x1f2230, 0xffd23f], 7, 0.2, 1.2, 8, true);
        break;
      case 'lap':
        this.hud.notice('gold', `Lap ${e.lap}! The cash keeps piling up`);
        this.sfx.play('ding', 0.5);
        break;
      case 'boost':
        this.sfx.play('whoosh', 0.5);
        break;
      case 'scrape':
        this.sfx.play('squeak', 0.25);
        this.view?.effects.burst(pos.x, pos.y + 0.3, pos.z, 6, [0xffd23f, 0xffffff], 4, 0.1, 0.3, 14, true);
        break;
      default:
        break;
    }
  }

  private updateDrive(delta: number, input: Readonly<InputState>): void {
    const d = this.driver;
    if (!d.sim) {
      this.sfx.setEngine(0, 0);
      return;
    }
    const throttle = this.pedals.gas ? 1 : this.pedals.brake ? -1 : input.moveZ;
    const steer = this.pedals.right ? 1 : this.pedals.left ? -1 : input.moveX;
    const idle = this.panelOpen || this.hud.chatOpen;
    d.update(delta, idle ? 0 : throttle, idle ? 0 : steer);
    const sim = d.sim;
    if (sim) {
      if (sim.mode === 'air' && sim.airTime > 0.25) {
        this.hud.showAir(sim.airTime, sim.airDistance, false);
        this.hud.holdAir();
      }
      const speed = sim.mode === 'road' || sim.mode === 'done' ? sim.v : Math.hypot(sim.vel.x, sim.vel.z);
      this.sfx.setEngine(sim.mode === 'crashed' ? 0 : 0.3, Math.abs(speed) / Math.max(10, sim.params.speed));
    }
    if (input.jump && d.active) d.exit();
  }

  /** Every driver's car: the local one from the sim, remote ones from the state. */
  private updateCars(delta: number): void {
    const view = this.view!;
    const state = this.state;
    if (!state) return;
    const alive = new Set<string>();
    for (const [id, p] of state.players.entries()) {
      const local = id === this.localId;
      const sim = local ? this.driver.sim : null;
      const isDriving = local ? sim !== null : p.driving;
      const rider = local ? this.player?.avatar : this.views.get(id)?.avatar;
      if (!isDriving) {
        if (rider) {
          FLAT.setFromQuaternion(rider.root.quaternion, 'YXZ');
          if (Math.abs(FLAT.x) > 1e-3 || Math.abs(FLAT.z) > 1e-3) rider.root.rotation.set(0, FLAT.y, 0, 'YXZ');
          if (local) rider.setPose('');
        }
        continue;
      }
      alive.add(id);
      const car = view.car(id, p.car || 'kart', p.runId);
      if (local && sim) {
        const speed = sim.mode === 'road' || sim.mode === 'done' ? sim.v : Math.hypot(sim.vel.x, sim.vel.z);
        view.poseCar(car, sim.pos, sim.fwd, sim.upv, speed, delta);
      } else view.poseCarEuler(car, p.x, p.y, p.z, p.rotationY, p.carPitch, p.carRoll, p.carSpeed, delta, false);
      if (rider && view.seatOf(id, SEAT)) {
        const root = view.carRoot(id)!;
        root.getWorldQuaternion(Q);
        rider.root.position.copy(SEAT);
        rider.root.quaternion.copy(Q);
        rider.setPose('sit');
      }
    }
    view.pruneCars(alive);
  }

  private updateViews(delta: number): void {
    for (const view of this.views.values()) {
      view.show(this.sceneManager.scene);
      view.update(delta, this.clock, '#ffffff', view.state.driving ? 'sit' : '', 1);
    }
  }

  private updateCamera(delta: number): void {
    const player = this.player!;
    const cam = this.camera;
    const placement = player.consumePlacement();
    if (placement !== 'none') cam.snapTo(player.position, false);
    const look = this.input.look;
    const sim = this.driver.sim;
    if (sim) {
      // A chase camera that swings round behind the car unless the player is looking around.
      const yaw = Math.atan2(sim.fwd.x, sim.fwd.z);
      if (!look.rightDragging && sim.mode !== 'crashed') {
        let d = yaw - look.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        look.setYaw(look.yaw + d * Math.min(1, delta * (look.locked ? 2.5 : 4)));
      }
      const shake = this.shake > 0.01 ? this.shake * 0.25 : 0;
      this.shake *= Math.max(0, 1 - delta * 4);
      CAMT.set(sim.pos.x + (Math.random() - 0.5) * shake, sim.pos.y + 1.4 + (Math.random() - 0.5) * shake, sim.pos.z);
      cam.setTarget(CAMT, false);
    } else if (this.building) {
      // Building: look at where the next piece goes (the glowing end), or the plot's middle.
      const plot = PLOTS[this.myPlot];
      const end = this.view?.plot(this.myPlot)?.chain.end;
      if (plot) {
        const [x, z] = end ? toWorld(plot.frame, end.x * TILE + TILE / 2, end.z * TILE + TILE / 2) : [plot.cx, plot.cz];
        const y = end ? TRACK_Y0 + end.y * LEVEL_H : GROUND_Y;
        const k = Math.min(1, delta * 3);
        CAMT.set(this.buildFocus.x + (x - this.buildFocus.x) * k, this.buildFocus.y + (y - this.buildFocus.y) * k, this.buildFocus.z + (z - this.buildFocus.z) * k);
        this.buildFocus.copy(CAMT);
        cam.setTarget(CAMT, false);
      } else cam.setTarget(player.position, false);
    } else cam.setTarget(player.position, false);
    if (!this.building) this.buildFocus.copy(player.position);
    cam.setOrbit(look.yaw, look.pitch);
    cam.setZoom(look.distance);
    cam.update(delta);
    player.avatar.setFirstPerson(false, look.pitch);
    const c = cam.camera.position;
    this.listener.x = c.x;
    this.listener.y = c.y;
    this.listener.z = c.z;
    this.listener.yaw = cam.yaw;
  }

  private footsteps(delta: number, player: LocalPlayer): void {
    if (!player.isGrounded) return;
    this.stepDistance += player.horizontalSpeed * delta;
    if (this.stepDistance > (player.sprinting ? 2.2 : 1.8)) {
      this.stepDistance = 0;
      this.sfx.play('step', 0.2, 0, 0.8 + Math.random() * 0.4);
    }
  }

  // ---------------------------------------------------------------- prompts

  private updatePrompt(input: Readonly<InputState>): void {
    const pos = this.player!.position;
    this.prompt = null;
    const state = this.state;
    if (!this.driving && !this.building && !this.panelOpen && state) {
      for (const s of SHOPS) {
        if (Math.hypot(pos.x - s.x, pos.z - (s.z + 3)) < s.reach) {
          this.prompt = { kind: 'shop', shop: s.kind, name: s.name };
          break;
        }
      }
      if (!this.prompt) {
        const players = [...state.players.values()];
        for (const plot of PLOTS) {
          const owner = players.find((p) => p.plot === plot.index);
          const sp = spawnPad(plot);
          if (owner && Math.hypot(pos.x - sp.x, pos.z - sp.z) < 2.6) {
            this.prompt = { kind: 'drive', plot: plot.index, name: owner.sessionId === this.localId ? 'Your Track' : `${owner.displayName || 'Player'}'s Track` };
            break;
          }
          const pit = pitPad(plot);
          if (plot.index === this.myPlot && Math.hypot(pos.x - pit.x, pos.z - pit.z) < 2.6) {
            this.prompt = { kind: 'pit' };
            break;
          }
          if (owner && owner.sessionId !== this.localId) {
            const [lx, lz] = toWorld(plot.frame, LIKES_BOARD_C[0], LIKES_BOARD_C[1]);
            if (Math.hypot(pos.x - lx, pos.z - lz) < 4) {
              this.prompt = { kind: 'like', plot: plot.index, name: owner.displayName || 'Player' };
              break;
            }
          }
        }
      }
      if (!this.prompt) {
        const sp = spawnPad(ARENA);
        if (Math.hypot(pos.x - sp.x, pos.z - sp.z) < 3) this.prompt = { kind: 'arena' };
      }
    }
    const p = this.prompt;
    let show: { key: string; action: string; object: string } | null = null;
    if (p?.kind === 'shop') show = { key: 'E', action: 'Interact', object: p.name };
    else if (p?.kind === 'drive') show = { key: 'E', action: 'Spawn Car', object: p.name };
    else if (p?.kind === 'pit') {
      const car = carDef(this.local?.car ?? 'kart');
      const cond = this.local?.condition ?? 100;
      show = { key: 'E', action: cond < 100 ? `Repair ${fmtMoney(repairCost(car, cond))}` : 'Open Garage', object: `Pit Stop - ${car.name} ${cond}%` };
    } else if (p?.kind === 'like') show = { key: 'E', action: `Like ${p.name}'s Track`, object: 'Likes' };
    else if (p?.kind === 'arena') show = { key: 'E', action: this.arena ? `Drive "${this.arena.name}"` : 'Browse RaceTracks', object: 'Showcase' };
    this.hud.setPrompt(show);
    if (p && input.usePressed && !this.panelOpen) this.usePrompt();
  }

  private usePrompt(): void {
    const p = this.prompt;
    if (!p) return;
    if (p.kind === 'shop') this.openWindow(p.shop);
    else if (p.kind === 'drive') this.network.drive(p.plot);
    else if (p.kind === 'pit') {
      if ((this.local?.condition ?? 100) < 100) this.network.repair(this.local?.car ?? 'kart');
      else this.openWindow('garage');
    } else if (p.kind === 'like') this.network.like({ plot: p.plot });
    else if (p.kind === 'arena') {
      if (this.arena) this.network.drive(ARENA_INDEX);
      else this.openWindow('racetracks');
    }
  }

  // ---------------------------------------------------------------- HUD

  private updateHud(delta: number): void {
    const l = this.local;
    const hud = this.hud;
    hud.update(delta);
    const driving = this.driver.active;
    hud.setMode(driving ? 'drive' : this.building ? 'build' : 'walk');
    hud.setSlot(this.building ? (this.deleting ? 1 : 0) : driving ? 2 : -1);
    if (l) {
      hud.setCash(l.cash);
      hud.setRate(l.rate, l.boost || 1);
      hud.setBadge('free', this.windowView().giftIn <= 0);
      hud.setBadge('garage', l.condition < 50);
      const sim = this.driver.sim;
      if (sim) hud.setSpeed(sim.mode === 'road' || sim.mode === 'done' ? sim.v : Math.hypot(sim.vel.x, sim.vel.z), l.condition);
    }
    if (driving !== this.wasDriving) {
      this.wasDriving = driving;
      if (!driving) {
        this.input.look.setDistance(WALK_DISTANCE);
        this.input.look.setPitch(0.36);
      }
    }
    if (this.building) {
      hud.setBuildTab(this.buildTab);
      hud.setBuildCards(this.buildCards(), this.deleting ? '' : this.buildTab === 'track' ? this.selected : this.selectedDecor);
    }
    if (this.windows.open) this.windows.render(this.windowView());
    const state = this.state;
    if (state && this.clock - this.boardsAt > 1.5) {
      this.boardsAt = this.clock;
      const players = [...state.players.values()];
      for (const plot of PLOTS) {
        const o = players.find((p) => p.plot === plot.index);
        this.view?.world.setOwner(plot.index, o ? o.displayName || 'Player' : null);
      }
      const rows = (f: (p: NetPlayerState) => number): { name: string; value: number }[] =>
        players
          .map((p) => ({ name: p.displayName || 'Player', value: f(p) }))
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value);
      this.view?.world.setBoard('money', rows((p) => p.earned));
      this.view?.world.setBoard('playtime', rows((p) => p.playSeconds));
      this.view?.world.setBoard('air', rows((p) => p.bestAir));
    }
  }

  private buildCards(): BuildCard[] {
    const color = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
    if (this.buildTab === 'track') {
      return TRACK_ITEMS.filter((i) => (this.profile.inventory[i.key] ?? 0) > 0 || i.key === this.selected).map((i) => ({
        key: i.key,
        name: i.name,
        count: this.profile.inventory[i.key] ?? 0,
        thumb: thumbs.piece(i.shapes[0]),
        rate: `${fmtMoney(i.rate)}/s`,
        rarity: RARITIES[i.rarity].name,
        rarityColor: color(RARITIES[i.rarity].color),
      }));
    }
    return DECORS.filter((d) => (this.profile.decor[d.key] ?? 0) > 0 || d.key === this.selectedDecor).map((d) => ({
      key: d.key,
      name: d.name,
      count: this.profile.decor[d.key] ?? 0,
      thumb: thumbs.decor(d.key),
      rate: '+1% income',
      rarity: RARITIES[d.rarity].name,
      rarityColor: color(RARITIES[d.rarity].color),
    }));
  }

  private updateTutorial(delta: number): void {
    const t = this.tutorial;
    const l = this.local;
    const track = this.view?.plot(this.myPlot);
    if (!t || !l || !track || !this.player) return;
    if (!this.tutorialChecked && l.ready) {
      this.tutorialChecked = true;
      let done = false;
      try {
        done = window.localStorage.getItem(TUTORIAL_DONE_KEY) === '1';
      } catch {
        /* no storage */
      }
      if (!done && l.rides === 0 && l.careerPlaced === 0) t.begin();
      else this.hud.setHint('');
    }
    if (!t.active) return;
    t.update(delta, {
      plot: l.plot,
      x: this.player.position.x,
      z: this.player.position.z,
      pieces: track.pieces.length,
      straights: this.profile.inventory['straight'] ?? 0,
      building: this.building,
      selected: this.buildTab === 'track' ? this.selected : '',
      window: this.windows.which,
      driving: this.driving,
      runs: l.rides,
    });
  }

  // ---------------------------------------------------------------- keys

  private readonly onHotkey = (e: KeyboardEvent): void => {
    if (this.hud.chatOpen || e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (this.panelOpen) this.closePanels();
      else if (this.building) this.setBuilding(false);
      return;
    }
    if (k === 'enter') {
      if (this.building) {
        this.placeNow();
        return;
      }
      e.preventDefault();
      this.hud.openChat();
      return;
    }
    if (k === 'tab') {
      e.preventDefault();
      const wasOpen = this.friends.open;
      this.closePanels();
      if (!wasOpen) {
        this.friends.show();
        this.input.look.releaseLock();
      }
      return;
    }
    if (k === 'm') {
      this.hud.setMuted(this.sfx.toggleMuted());
      return;
    }
    if (k === 'l' && this.hud.loginShown) {
      if (!this.bloxity.isLoggedIn()) void this.bloxity.showAuthPopup();
      return;
    }
    if (this.driver.active) return;
    // The HUD's buttons, by key (the mouse is locked to the camera during play). Never P.
    if (k === 't') return this.tab('track');
    if (k === 'b' || k === 'h') return this.tab('base');
    if (k === 'c') return this.tab('crate');
    const menu = (Object.keys(MENU_KEYS) as MenuKind[]).find((m) => MENU_KEYS[m].toLowerCase() === k);
    if (menu) return this.menu(menu);
    const sku = PACK_KEYS[k];
    if (sku) {
      this.input.look.releaseLock();
      void this.buyGems(sku);
      return;
    }
    if (this.panelOpen) return;
    if (k === '1') return this.slot(0);
    if (k === '2') return this.slot(1);
    if (k === '3') return this.slot(2);
    if (this.building) {
      if (k === 'r') return this.rotate();
      if (k === 'f') return this.placeNow();
      if (k === 'q') {
        this.deleting = !this.deleting;
        return;
      }
      if (k === 'g') return this.setBuildTab(this.buildTab === 'track' ? 'decor' : 'track');
      if (k === 'delete') {
        if (window.confirm('Take every piece of your track back into your inventory?')) this.network.clearTrack();
        return;
      }
    }
  };

  private readonly onGesture = (): void => {
    this.sfx.resume();
  };

  // ---------------------------------------------------------------- network events

  private removeView(id: string): void {
    this.reported.delete(id);
    this.view?.dropCar(id);
    const view = this.views.get(id);
    if (!view) return;
    view.dispose();
    this.views.delete(id);
  }

  private onPlayer(id: string, p: NetPlayerState, added: boolean): void {
    if (id === this.localId) {
      this.local = p;
      this.applyLocal(p);
      return;
    }
    if (p.username && this.reported.get(id) !== p.username) {
      this.reported.set(id, p.username);
      if (added && this.clock - this.joinedAt > 2) this.bloxity.playerJoined(p.username);
      else this.bloxity.playerInRoom(p.username);
    }
    const known = this.views.get(id);
    if (known) known.apply(p);
    else this.views.set(id, new RemoteView(id, p));
  }

  private applyLocal(p: NetPlayerState): void {
    const player = this.player;
    if (!player || !p.ready || p.driving || this.driver.active) return;
    player.reconcile({
      x: p.x,
      y: p.y,
      z: p.z,
      rotationY: p.rotationY,
      velocityX: p.velocityX,
      velocityY: p.velocityY,
      velocityZ: p.velocityZ,
      grounded: p.grounded,
      sprinting: p.sprinting,
      crouched: p.crouched,
      fallStart: p.fallStart,
      lastInputSeq: p.lastInputSeq,
    });
  }

  private showChatBubble(local: boolean, userId: string, text: string): void {
    try {
      let root = local ? this.player?.avatar.root : undefined;
      if (!root) {
        const id = userId.replace(/^legion_/, '');
        for (const v of this.views.values()) if (v.state.bloxityId && v.state.bloxityId === id) root = v.avatar.root;
      }
      if (!root) return;
      window.Legion?.SDK?.chat?.attachBubble(BUBBLE_THREE, root, text, { height: 2.75 });
    } catch (error) {
      logger.warn(SCOPE, `chat bubble failed: ${String(error)}`);
    }
  }

  private onTrack(m: TrackMessage): void {
    const view = this.view;
    if (!view) return;
    const pieces = unpackPieces(m.p);
    const before = view.plot(m.plot)?.pieces.length ?? 0;
    view.setTrack(m.plot, pieces, unpackDecor(m.d), m.tier, m.likes, m.visits);
    if (m.by && m.by === this.localId && pieces.length > before) {
      this.sfx.play('place', 0.6);
      this.flipManual = false;
    }
  }

  private onArena(m: ArenaMessage): void {
    this.arena = m;
    this.view?.setTrack(ARENA_INDEX, unpackPieces(m.p), unpackDecor(m.d), 5);
    this.hud.banner({ title: m.name, sub: `by @${m.owner} - drive it from the Showcase pad`, tone: 'ride', seconds: 3.5 });
  }

  private onCoins(m: CoinsMessage): void {
    for (const p of m.plots) this.view?.setFills(p.plot, p.f, p.sc);
  }

  private onProfile(m: ProfileMessage): void {
    this.profile = m;
    this.profileAt = performance.now();
    if (this.windows.open) this.windows.render(this.windowView());
  }

  private onCrate(m: CrateMessage): void {
    this.windows.showReveal(m, this.windowView());
    this.sfx.play('buy', 0.5);
    window.setTimeout(() => {
      const r = carDef(m.car).rarity;
      this.sfx.play(r === 'legendary' || r === 'mythic' || r === 'epic' ? 'levelup' : 'ding', 0.6);
      if (this.windows.which === 'reveal') this.windows.render(this.windowView());
    }, 1350);
  }

  private onPlaced(m: PlacedMessage): void {
    const player = this.player;
    if (!player) return;
    if (m.reason === 'drive' && this.driver.active) this.driver.stop();
    player.teleport(m.x, m.y, m.z, m.rotationY);
    if (m.reason === 'join' || m.reason === 'base' || m.reason === 'drive' || m.reason === 'teleport') {
      this.input.look.setYaw(m.rotationY);
      this.input.look.setPitch(0.36);
      if (m.reason === 'base' || m.reason === 'teleport') this.sfx.play('teleport', 0.6);
    }
  }

  private play(name: SoundName, x: number, y: number, z: number, base = 1, range = 40): void {
    const l = this.listener;
    const { volume, pan } = hearing(l.x, l.y, l.z, l.yaw, x, y, z, range);
    this.sfx.play(name, volume * base, pan);
  }

  private onFx(m: FxMessage): void {
    const view = this.view;
    if (!view) return;
    const fx = view.effects;
    const mine = m.by === this.localId;
    switch (m.k) {
      case 'place':
        fx.burst(m.x, m.y, m.z, 14, [0xffffff, 0xfff04a, m.v ?? 0xffffff], 4, 0.14, 0.6, 12);
        if (!mine) this.play('place', m.x, m.y, m.z, 0.5, 30);
        break;
      case 'remove':
        fx.smoke(m.x, m.y, m.z);
        if (!mine) this.play('break', m.x, m.y, m.z, 0.5, 30);
        break;
      case 'collect':
        view.cashBurst(m.x, m.y, m.z, (m.v ?? 0) > 500);
        if (mine) {
          this.runCash += m.v ?? 0;
          this.hud.setRun(this.runCash);
          this.sfx.play('cash', 0.35, 0, 0.95 + Math.random() * 0.2);
          this.hud.reward(m.v ?? 0);
        }
        break;
      case 'crash':
        if (!mine) {
          fx.burst(m.x, m.y + 0.6, m.z, 30, [0xff7a1a, 0xffd23f, 0x5a6070], 8, 0.22, 0.9, 16);
          this.play('crash', m.x, m.y, m.z, 0.6, 50);
        } else if ((m.v ?? 0) > 0) this.hud.notice('bad', `Crash! Car -${m.v}% condition`);
        break;
      case 'finish':
        fx.burst(m.x, m.y + 2, m.z, 30, [0xffd23f, 0x7dff6a, 0xffffff], 5, 0.14, 0.9, 8, true);
        break;
      case 'buy':
        fx.burst(m.x, m.y, m.z, 24, [0x5be36b, 0xffd23a, 0xffffff], 4, 0.1, 0.9, 6, true);
        if (mine) this.sfx.play('cash', 0.5);
        break;
      case 'upgrade':
        fx.burst(m.x, m.y + 1, m.z, 50, [0x7dff6a, 0xffd23f, 0xffffff, 0x3fa2ff], 7, 0.18, 1.2, 6, true);
        fx.ring(m.x, m.y, m.z, 6, 0x7dff6a, 0.8);
        if (mine) this.sfx.play('levelup', 0.6);
        break;
      case 'repair':
        fx.burst(m.x, m.y + 1, m.z, 20, [0xffd23f, 0xffffff], 4, 0.12, 0.7, 6, true);
        if (mine) this.sfx.play('upgrade', 0.5);
        break;
      case 'like':
        fx.burst(m.x, m.y, m.z, 20, [0xff4fb8, 0xff8ad8, 0xffffff], 4, 0.14, 0.9, 4, true);
        if (mine) this.sfx.play('ding', 0.5);
        break;
      case 'rebirth':
        fx.burst(m.x, m.y + 1, m.z, 80, [0xc79cff, 0xffd23f, 0xffffff], 9, 0.22, 1.5, 4, true);
        fx.ring(m.x, m.y, m.z, 9, 0xb26bff, 0.9);
        if (mine) this.sfx.play('boom', 0.6);
        break;
      case 'denied':
        if (mine) this.sfx.play('denied', 0.35);
        break;
      default:
        break;
    }
  }

  private onBanner(m: BannerMessage): void {
    this.hud.banner(m);
    if (m.tone === 'gold' || m.tone === 'level') this.sfx.play('levelup', 0.5);
  }

  private onNotice(m: NoticeMessage): void {
    this.hud.notice(m.kind, m.text);
    if (m.kind === 'bad') this.sfx.play('denied', 0.3);
  }

  private onStatusChange(status: ConnectionStatus, detail?: string): void {
    if (clientConfig.debug) logger.info(SCOPE, `connection: ${status}`);
    if (status === 'reconnecting') {
      this.reconnecting = true;
      this.driver.stop();
      this.hud.setConnection('Connection lost - reconnecting...');
      return;
    }
    if (status === 'connected' && this.reconnecting) {
      this.reconnecting = false;
      this.hud.setConnection(null);
      this.hud.notice('good', 'Reconnected!');
      return;
    }
    if (status === 'error') this.hud.notice('bad', 'Could not reach the server. Reload to try again.');
    if (status === 'disconnected' && detail === 'replaced') this.hud.setConnection('You opened Build A Racetrack in another window. Reload to play here.');
  }

  private onSessionReset(): void {
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
    this.reported.clear();
    this.localId = null;
    this.local = null;
    this.building = false;
    this.driver.stop();
    this.player?.resetSession();
    for (const plot of PLOTS) this.view?.setTrack(plot.index, [], [], 0);
  }

  private tickFps(delta: number): void {
    if (this.fpsReadout.hidden) return;
    this.fpsAccum += delta;
    this.fpsFrames += 1;
    if (this.fpsAccum < 0.5) return;
    this.fpsReadout.textContent = `${Math.round(this.fpsFrames / this.fpsAccum)} FPS`;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
  }

  // ---------------------------------------------------------------- dev / test hooks

  debugSnapshot(): Record<string, unknown> {
    const p = this.player;
    const l = this.local;
    const track = this.view?.plot(this.myPlot);
    const sim = this.driver.sim;
    return {
      session: this.localId,
      cash: l?.cash,
      tier: l?.tier,
      plot: l?.plot,
      driving: this.driving,
      building: this.building,
      pieces: track?.pieces.length,
      connected: track?.chain.order.length,
      closed: track?.chain.closed,
      end: track?.chain.end,
      ghostOk: this.ghostOk,
      ghostWhy: this.ghostWhy,
      inventory: this.profile.inventory,
      car: l?.car,
      condition: l?.condition,
      sim: sim ? { mode: sim.mode, s: +sim.s.toFixed(2), v: +sim.v.toFixed(2), d: +sim.d.toFixed(2), lap: sim.lap, air: +sim.airTime.toFixed(2) } : null,
      players: this.state?.players.size,
      position: p ? { x: +p.position.x.toFixed(2), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(2) } : null,
      prompt: this.prompt?.kind ?? null,
      window: this.windows.which,
    };
  }

  clickAt(x: number, y: number): void {
    this.tapAt = { x, y };
    if (this.building) this.updateBuild(this.input.sample());
    this.tapAt = null;
  }

  build(on = true): void {
    this.setBuilding(on);
  }

  pickItem(key: string): void {
    this.buildTab = 'track';
    this.pick(key);
  }

  appendEnd(key: string, flip = false): void {
    this.pickItem(key);
    this.flip = flip;
    this.placeNow();
  }

  forceTouch(on = true): void {
    this.hud.setTouch(on);
  }

  driveNow(plot = this.myPlot): void {
    this.network.drive(plot);
  }

  /** Tests: hold the pedals (throttle -1..1, steer -1..1). */
  setPedals(throttle: number, steer: number): void {
    this.pedals.gas = throttle > 0.5;
    this.pedals.brake = throttle < -0.5;
    this.pedals.right = steer > 0.5;
    this.pedals.left = steer < -0.5;
  }

  get net(): NetworkClient {
    return this.network;
  }

  get look(): InputManager['look'] {
    return this.input.look;
  }

  get size(): { width: number; height: number } {
    return { width: this.renderer.width, height: this.renderer.height };
  }

  dev(message: Record<string, unknown>): void {
    this.network.sendDev(message);
  }

  openWindowByName(which: WindowKind | 'close'): void {
    if (which === 'close') this.closePanels();
    else this.openWindow(which);
  }

  capture(): string {
    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);
    return this.renderer.renderer.domElement.toDataURL('image/jpeg', 0.8);
  }

  freeCam(eye: [number, number, number] | null, target: [number, number, number] = [0, 0, 0]): void {
    this.camera.setOverride(
      eye
        ? {
            update: (camera) => {
              camera.position.set(...eye);
              camera.lookAt(...target);
              return true;
            },
          }
        : null,
    );
  }

  setCamera(yaw: number, pitch: number, distance?: number): void {
    this.input.look.setYaw(yaw);
    this.input.look.setPitch(pitch);
    if (distance !== undefined) this.input.look.setDistance(distance);
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('keydown', this.onHotkey);
    window.removeEventListener('keydown', this.onGesture);
    window.removeEventListener('mousedown', this.onGesture);
    window.removeEventListener('touchstart', this.onGesture);
    this.bloxity.dispose();
    this.dresser?.dispose();
    this.fpsReadout.remove();
  }
}

/** What to tell the player when a rewarded ad did not complete (the actual status, never "it did not finish"). */
const REWARDED_MESSAGES: Readonly<Record<string, string>> = {
  skipped: 'Ad skipped - no boost this time',
  'no-fill': 'No ad available right now - try again soon',
  blocked: 'Ads are blocked in this browser',
  denied: 'Ads are not allowed right now',
  disabled: 'Ads are not available here',
  error: 'The ad could not play - try again soon',
  failed: 'The ad could not play - try again soon',
};

/** What Boxity's chat bubbles need of three. */
const BUBBLE_THREE = { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial };
