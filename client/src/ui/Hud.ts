import { fmtMoney, type BannerMessage, type ChatLineMessage, type NoticeKind } from '@race/shared';
import { el, escapeHtml } from './dom.js';
import { ICONS, UI_IMAGES, img } from './icons.js';
import { applyScale, injectRtStyles } from './rtStyles.js';
import { injectStyles } from './styles.js';

/** The top-left corner, kept clear on every screen (Boxity's toolbar lives there). */
const TOP_LEFT = { left: 0, top: 0, width: 340, height: 64 } as const;

export type MenuKind = 'shop' | 'upgrade' | 'racetracks' | 'save' | 'garage' | 'rebirth' | 'free';

/** PC shortcuts for the HUD buttons (the mouse is locked to the camera during play); Game binds the same. Never P. */
export const MENU_KEYS: Readonly<Record<MenuKind, string>> = { shop: 'O', upgrade: 'U', racetracks: 'K', save: 'Z', garage: 'X', rebirth: 'N', free: 'Y' };
/** The pack and pass buttons on the right, by key. */
export const PACK_KEYS: Readonly<Record<string, string>> = { '4': 'first_lap_pack', '5': 'stunt_pack', '6': 'pass_money2', '7': 'boost_pack' };
export type TabTarget = 'track' | 'base' | 'crate';
export type HudMode = 'walk' | 'build' | 'drive';
export type BuildTab = 'track' | 'decor';

export interface HudActions {
  tab(to: TabTarget): void;
  menu(which: MenuKind): void;
  slot(i: number): void;
  buildTab(tab: BuildTab): void;
  pick(key: string): void;
  rotate(): void;
  place(): void;
  exitBuild(): void;
  exitDrive(): void;
  pedal(which: 'gas' | 'brake' | 'left' | 'right', down: boolean): void;
  prompt(): void;
  chat(text: string): void;
  mute(): void;
  login(): void;
  pack(sku: string): void;
}

export interface BuildCard {
  key: string;
  name: string;
  count: number;
  thumb: string;
  rate: string;
  rarity: string;
  rarityColor: string;
}

export interface ReservedArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

const button = (cls: string, html: string, onClick: () => void): HTMLButtonElement => {
  const b = el('button', `rt-btn ${cls}`, html);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  return b;
};

/** Name an element for the tutorial's highlights. */
const tag = <T extends HTMLElement>(e: T, name: string): T => {
  e.dataset['tut'] = name;
  return e;
};

const ic = (src: string): string => `<span class="ic">${img(src)}</span>`;
/** A keycap in the button's corner: the PC shortcut (hidden on touch screens). */
const kc = (key: string): string => `<span class="rt-kc">${key}</span>`;

/**
 * THE HUD, laid out like the reference: Tracks / Base / Crates on top with
 * the hint under them; Shop, Upgrade, RaceTracks and the small Save / Cars /
 * Rebirth / Free buttons down the left; cash, boost and income bottom left;
 * the Build / Delete / Drive hotbar bottom middle; packs and the 2x Money
 * pass on the right. Build mode adds the Build Menu and its tools; driving,
 * the air-time readout, the speedometer and (on phones) the pedals.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly top: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly left: HTMLDivElement;
  private readonly money: HTMLDivElement;
  private readonly cash: HTMLDivElement;
  private readonly boost: HTMLSpanElement;
  private readonly rate: HTMLSpanElement;
  private readonly hotbar: HTMLDivElement;
  private readonly slots: HTMLButtonElement[] = [];
  private readonly right: HTMLDivElement;
  private readonly boostPack: HTMLDivElement;
  private readonly promptBox: HTMLDivElement;
  private readonly notices: HTMLDivElement;
  private readonly bannerBox: HTMLDivElement;
  private readonly air: HTMLDivElement;
  private readonly run: HTMLDivElement;
  private readonly speed: HTMLDivElement;
  private readonly driveBar: HTMLDivElement;
  private readonly pedals: HTMLDivElement;
  private readonly steerPad: HTMLDivElement;
  private readonly build: HTMLDivElement;
  private readonly btabs: HTMLButtonElement[] = [];
  private readonly bgrid: HTMLDivElement;
  private readonly btools: HTMLDivElement;
  private readonly bLabel: HTMLDivElement;
  private readonly placeBtn: HTMLButtonElement;
  private readonly feed: HTMLDivElement;
  private readonly chatInput: HTMLInputElement;
  private readonly conn: HTMLDivElement;
  private readonly tr: HTMLDivElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly chatBtn: HTMLButtonElement;
  private readonly loginBtn: HTMLButtonElement;
  private readonly badges = new Map<string, HTMLElement>();
  private reserved: () => readonly ReservedArea[] = () => [];
  private ownChat = true;
  private chatEnabled = true;
  private chatting = false;
  private touchMode = false;
  private mode: HudMode = 'walk';
  private lastCash = -1;
  private cardsKey = '';
  private layoutClock = 0;
  private airTimer = 0;
  private runTimer = 0;

  constructor(container: HTMLElement, private readonly actions: HudActions) {
    injectStyles();
    injectRtStyles();
    this.root = el('div', 'rt-root');

    // ---- top: Tracks / Base / Crates and the hint
    this.top = el('div', 'rt-top');
    const tabs = el('div', 'rt-tabs');
    tabs.append(
      tag(button('rt-tab', `${ic(UI_IMAGES.map)}<span class="rt-ol">Tracks</span>${kc('T')}`, () => actions.tab('track')), 'tab-track'),
      tag(button('rt-tab', `${ic(UI_IMAGES.home)}<span class="rt-ol">Base</span>${kc('B')}`, () => actions.tab('base')), 'tab-base'),
      tag(button('rt-tab', `${ic(UI_IMAGES.car)}<span class="rt-ol">Crates</span>${kc('C')}`, () => actions.tab('crate')), 'tab-crate'),
    );
    this.hint = el('div', 'rt-hint rt-ol');
    this.top.append(tabs, this.hint);

    // ---- left: the menu
    this.left = el('div', 'rt-left');
    const mb = (cls: string, icon: string, label: string, which: MenuKind): HTMLButtonElement => {
      const b = tag(button(`rt-mbtn ${cls}`, `${ic(icon)}<span class="rt-ol">${label}</span>${kc(MENU_KEYS[which])}`, () => actions.menu(which)), `menu-${which}`);
      return b;
    };
    const small = el('div', 'rt-small');
    const sb = (icon: string, label: string, which: MenuKind): HTMLButtonElement => {
      const b = tag(button('rt-sbtn', `${ic(icon)}<span class="rt-ol">${label}</span>${kc(MENU_KEYS[which])}`, () => actions.menu(which)), `menu-${which}`);
      const badge = el('span', 'badge rt-hidden', '!');
      b.append(badge);
      this.badges.set(which, badge);
      return b;
    };
    small.append(sb(UI_IMAGES.inventory, 'Save', 'save'), sb(UI_IMAGES.car, 'Cars', 'garage'), sb(UI_IMAGES.rebirth, 'Rebirth', 'rebirth'), sb(UI_IMAGES.gift, 'Free', 'free'));
    this.left.append(mb('pink', UI_IMAGES.shop, 'Shop', 'shop'), mb('green', UI_IMAGES.upgrade, 'Upgrade', 'upgrade'), mb('blue', UI_IMAGES.map, 'RaceTracks', 'racetracks'), small);

    // ---- bottom left: money
    this.money = el('div', 'rt-money');
    this.cash = el('div', 'rt-cash rt-ol', '$0');
    const sub = el('div', 'rt-sub');
    this.boost = el('span', 'boost rt-ol', '1x Boost');
    this.rate = el('span', 'rate rt-ol', '[$ 0/s]');
    sub.append(this.boost, this.rate);
    this.money.append(this.cash, sub);

    // ---- bottom middle: hotbar
    this.hotbar = el('div', 'rt-hotbar');
    const slot = (i: number, icon: string, label: string): HTMLButtonElement => {
      const b = tag(button('rt-slot', `<span class="rt-key">${i + 1}</span>${ic(icon)}<span class="rt-ol">${label}</span>`, () => actions.slot(i)), `slot-${i}`);
      this.slots.push(b);
      return b;
    };
    this.hotbar.append(slot(0, UI_IMAGES.build, 'Build'), slot(1, UI_IMAGES.equipment, 'Delete'), slot(2, UI_IMAGES.car, 'Drive'));

    // ---- right: packs and the pass
    this.right = el('div', 'rt-right');
    const pack = (name: string, sku: string, gems: number, art: string, key: string): HTMLButtonElement =>
      button('rt-pack', `<span class="rt-ol" style="color:#ff8a2a">${name}</span><span class="art">${art}${kc(key)}</span><span class="gems rt-ol"><i class="rt-gem"></i>${gems}</span>`, () => actions.pack(sku));
    const pass = button('rt-pass', `<span class="gems rt-ol" style="position:absolute;left:4px;top:-18px"><i class="rt-gem"></i>2</span><span class="rt-ol">2x Money</span><small class="rt-ol">[Permanent]</small>${kc('6')}`, () => actions.pack('pass_money2'));
    this.right.append(pack('First Lap Pack', 'first_lap_pack', 6, '🎁', '4'), pack('Stunt Pack', 'stunt_pack', 129, '🏁', '5'), pass);
    this.boostPack = el('div', 'rt-boostpack', `<b class="rt-ol">Boost Pack</b><small class="rt-ol">Go WAY too fast!</small><div class="gems rt-ol" style="color:#7dff6a"><i class="rt-gem"></i> 109</div>${kc('7')}`);
    this.boostPack.addEventListener('click', () => actions.pack('boost_pack'));

    // ---- prompt, notices, banner
    this.promptBox = el('div', 'rt-prompt rt-hidden');
    this.promptBox.addEventListener('click', (e) => {
      e.stopPropagation();
      actions.prompt();
    });
    this.notices = el('div', 'rt-notices');
    this.bannerBox = el('div', '');

    // ---- driving
    this.air = el('div', 'rt-air');
    this.run = el('div', 'rt-run rt-ol rt-hidden');
    this.speed = el('div', 'rt-speed rt-hidden', '<div><b class="rt-ol">0</b><span>studs/s</span><div class="cond rt-ol"></div></div>');
    this.driveBar = el('div', 'rt-drivebar rt-hidden');
    this.driveBar.append(el('div', 'hint rt-ol', 'Hold <b>W</b> to drive over your track and grab the <b>cash</b>!'), button('red', `<span class="rt-ol" style="font-size:calc(var(--u)*20);padding:0 calc(var(--u)*24)">Exit</span>${kc('Space')}`, () => actions.exitDrive()));
    (this.driveBar.lastElementChild as HTMLElement).style.height = 'calc(var(--u) * 44)';
    this.pedals = el('div', 'rt-pedals rt-hidden');
    this.steerPad = el('div', 'rt-steer rt-hidden');
    const hold = (cls: string, label: string, which: 'gas' | 'brake' | 'left' | 'right'): HTMLButtonElement => {
      const b = el('button', `rt-btn rt-pedal ${cls}`, `<span class="rt-ol">${label}</span>`);
      const down = (e: Event): void => {
        e.preventDefault();
        e.stopPropagation();
        actions.pedal(which, true);
      };
      const up = (e: Event): void => {
        e.preventDefault();
        e.stopPropagation();
        actions.pedal(which, false);
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      return b;
    };
    this.pedals.append(hold('red', 'BRAKE', 'brake'), hold('lime', 'GAS', 'gas'));
    this.steerPad.append(hold('dark', '◀', 'left'), hold('dark', '▶', 'right'));

    // ---- build mode
    this.build = el('div', 'rt-build rt-hidden');
    this.build.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.build.addEventListener('wheel', (e) => e.stopPropagation());
    const btabs = el('div', 'rt-btabs');
    const bt = (label: string, cls: string, tab: BuildTab): HTMLButtonElement => {
      const b = button(cls, `<span class="rt-ol">${label}</span>`, () => actions.buildTab(tab));
      b.dataset['tab'] = tab;
      this.btabs.push(b);
      return tag(b, `btab-${tab}`);
    };
    btabs.append(bt('Tracks', 'red', 'track'), bt('Decors', 'green', 'decor'), el('span', 'rt-kc rt-kc-inline', 'G'));
    this.bgrid = el('div', 'rt-bgrid');
    this.build.append(el('h3', 'rt-ol', 'Build Menu'), btabs, this.bgrid);
    this.btools = el('div', 'rt-btools rt-hidden');
    this.bLabel = el('div', 'lbl rt-ol', '');
    const row = el('div', 'row');
    this.placeBtn = tag(button('green big', `<span class="rt-ol">Place</span>${kc('F')}`, () => actions.place()), 'place');
    row.append(button('blue', `<span class="rt-ol">Rotate</span>${kc('R')}`, () => actions.rotate()), this.placeBtn, button('red', `<span class="rt-ol">Exit</span>${kc('Esc')}`, () => actions.exitBuild()));
    this.btools.append(this.bLabel, row);

    // ---- chat feed, top right, connection
    this.feed = el('div', 'rt-feed');
    this.chatInput = el('input', 'rt-input rt-hidden') as HTMLInputElement;
    this.chatInput.maxLength = 120;
    this.chatInput.placeholder = 'Say something...';
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chatInput.value.trim();
        if (text) actions.chat(text);
        this.closeChat();
      } else if (e.key === 'Escape') this.closeChat();
    });
    this.feed.append(this.chatInput);
    this.tr = el('div', 'rt-tr');
    this.loginBtn = button('gold rt-hidden', `<span class="rt-ol" style="font-size:calc(var(--u)*16);padding:0 calc(var(--u)*10)">Log In</span>${kc('L')}`, () => actions.login());
    this.loginBtn.style.height = 'calc(var(--u) * 40)';
    this.chatBtn = button('rt-icbtn', `${ICONS.chat}${kc('↵')}`, () => this.openChat());
    this.muteBtn = button('rt-icbtn', `${img(UI_IMAGES.sound)}${kc('M')}`, () => actions.mute());
    this.tr.append(this.loginBtn, this.chatBtn, this.muteBtn);
    this.conn = el('div', 'rt-conn rt-ol rt-hidden');

    this.root.append(this.top, this.left, this.money, this.hotbar, this.right, this.boostPack, this.promptBox, this.notices, this.bannerBox, this.air, this.run, this.speed, this.driveBar, this.pedals, this.steerPad, this.build, this.btools, this.feed, this.tr, this.conn);
    container.append(this.root);
    window.addEventListener('resize', () => this.layout());
    this.setMode('walk');
  }

  // ---------------------------------------------------------------- state

  setCash(n: number): void {
    const v = Math.floor(n);
    if (v === this.lastCash) return;
    if (this.lastCash >= 0 && v > this.lastCash) {
      this.cash.classList.remove('bump');
      void this.cash.offsetWidth;
      this.cash.classList.add('bump');
    }
    this.lastCash = v;
    this.cash.textContent = fmtMoney(v);
  }

  setRate(rate: number, boost: number): void {
    this.rate.textContent = `[${fmtMoney(rate).replace('$', '$ ')}/s]`;
    this.boost.textContent = `${boost % 1 === 0 ? boost : boost.toFixed(1)}x Boost`;
    this.boost.style.color = boost > 1 ? '#7dff6a' : '#ffffff';
  }

  /** A floating "+$35" (or "-$25") by the cash. */
  reward(amount: number): void {
    if (amount === 0) return;
    const n = el('div', `rt-plus rt-ol${amount < 0 ? ' minus' : ''}`, `${amount < 0 ? '-' : '+'}${fmtMoney(Math.abs(amount))}`);
    this.money.append(n);
    window.setTimeout(() => n.remove(), 1200);
  }

  setHint(html: string): void {
    if (this.hint.innerHTML !== html) this.hint.innerHTML = html;
  }

  setBadge(which: MenuKind, on: boolean): void {
    this.badges.get(which)?.classList.toggle('rt-hidden', !on);
  }

  setMode(mode: HudMode): void {
    this.mode = mode;
    this.root.classList.toggle('mode-build', mode === 'build');
    this.root.classList.toggle('mode-drive', mode === 'drive');
    const walk = mode === 'walk';
    const drive = mode === 'drive';
    this.left.classList.toggle('rt-hidden', !walk);
    this.right.classList.toggle('rt-hidden', !walk);
    this.boostPack.classList.toggle('rt-hidden', !walk);
    this.hotbar.classList.toggle('rt-hidden', drive);
    this.build.classList.toggle('rt-hidden', mode !== 'build');
    this.btools.classList.toggle('rt-hidden', mode !== 'build');
    this.speed.classList.toggle('rt-hidden', !drive);
    this.driveBar.classList.toggle('rt-hidden', !drive);
    this.pedals.classList.toggle('rt-hidden', !drive || !this.touchMode);
    this.steerPad.classList.toggle('rt-hidden', !drive || !this.touchMode);
    this.top.classList.toggle('rt-hidden', drive);
    this.money.classList.toggle('rt-hidden', drive && this.touchMode);
    if (!drive) {
      this.air.innerHTML = '';
      this.run.classList.add('rt-hidden');
    }
    this.layout();
  }

  /** A window is open over the game (the HUD steps aside for it and for screen-ad banners). */
  setPanelOpen(on: boolean): void {
    if (this.root.classList.contains('panel-open') !== on) this.root.classList.toggle('panel-open', on);
  }

  setSlot(i: number): void {
    this.slots.forEach((s, k) => s.classList.toggle('on', k === i));
  }

  // ---------------------------------------------------------------- build

  setBuildTab(tab: BuildTab): void {
    for (const b of this.btabs) b.classList.toggle('on', b.dataset['tab'] === tab);
  }

  setBuildCards(cards: readonly BuildCard[], selected: string): void {
    const key = JSON.stringify(cards.map((c) => [c.key, c.count])) + selected;
    if (key === this.cardsKey) return;
    this.cardsKey = key;
    this.bgrid.innerHTML = '';
    if (!cards.length) {
      this.bgrid.append(el('div', 'rt-muted', 'Nothing here yet - buy some at the shop!'));
      return;
    }
    for (const c of cards) {
      const card = tag(el('div', `rt-bcard${c.key === selected ? ' on' : ''}${c.count <= 0 ? ' empty' : ''}`), `card-${c.key}`);
      card.innerHTML = `<span class="nm rt-ol">${escapeHtml(c.name)}</span><span class="th" style="background-image:url(${c.thumb})"></span><span class="rar rt-ol" style="color:${c.rarityColor}">${escapeHtml(c.rarity)}</span><span class="rate rt-ol">${escapeHtml(c.rate)}</span><span class="cnt rt-ol">${c.count}x</span>`;
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.actions.pick(c.key);
      });
      this.bgrid.append(card);
    }
  }

  setBuildLabel(text: string, canPlace: boolean): void {
    if (this.bLabel.innerHTML !== text) this.bLabel.innerHTML = text;
    this.placeBtn.disabled = !canPlace;
  }

  setPlaceVisible(on: boolean): void {
    this.placeBtn.classList.toggle('rt-hidden', !on);
  }

  // ---------------------------------------------------------------- driving

  setSpeed(speed: number, condition: number): void {
    const b = this.speed.querySelector('b');
    if (b) b.textContent = `${Math.round(Math.abs(speed))}`;
    const c = this.speed.querySelector('.cond') as HTMLElement | null;
    if (c) {
      c.textContent = `Car ${condition}%`;
      c.style.color = condition < 25 ? '#ff6a6a' : condition < 50 ? '#ffb23a' : '#7dff6a';
    }
  }

  /** The air readout while flying; after landing it lingers a moment. */
  showAir(air: number, studs: number, best: boolean): void {
    this.air.innerHTML = `<div class="a rt-ol">AIR <i>${air.toFixed(1)}s</i></div><div class="s rt-ol">${Math.round(studs)} studs</div>${best ? '<div class="best rt-ol">NEW BEST!</div>' : ''}`;
    this.airTimer = 1.6;
  }

  crash(): void {
    this.air.insertAdjacentHTML('beforeend', '<div class="crash rt-ol">CRASH!</div>');
    this.airTimer = 2;
  }

  /** "+$8 this run" over the screen. */
  setRun(amount: number): void {
    this.run.textContent = `+${fmtMoney(amount)} this run`;
    this.run.classList.toggle('rt-hidden', amount <= 0);
    this.runTimer = 0;
  }

  // ---------------------------------------------------------------- misc

  setLogin(name: string | null, avatar: string): void {
    const label = this.loginBtn.querySelector('span');
    if (!label) return;
    label.innerHTML = name ? `${avatar ? `<img src="${escapeHtml(avatar)}" style="width:calc(var(--u)*24);height:calc(var(--u)*24);border-radius:50%;vertical-align:middle;margin-right:4px">` : ''}${escapeHtml(name)}` : 'Log In';
  }

  setLoginShown(on: boolean): void {
    this.loginBtn.classList.toggle('rt-hidden', !on);
  }

  get loginShown(): boolean {
    return !this.loginBtn.classList.contains('rt-hidden');
  }

  glow(names: readonly string[]): void {
    for (const e of this.root.querySelectorAll<HTMLElement>('[data-tut]')) e.classList.toggle('rt-glow', names.includes(e.dataset['tut'] ?? ''));
  }

  setMuted(muted: boolean): void {
    this.muteBtn.style.opacity = muted ? '0.45' : '1';
  }

  setConnection(text: string | null): void {
    this.conn.classList.toggle('rt-hidden', !text);
    if (text) this.conn.textContent = text;
  }

  get touchActive(): boolean {
    return this.touchMode;
  }

  setTouch(on: boolean): void {
    document.body.classList.toggle('rt-touch', on);
    document.body.classList.toggle('bv-touchmode', on);
    this.touchMode = on;
    applyScale();
    this.setMode(this.mode);
  }

  setPrompt(p: { key: string; action: string; object: string } | null): void {
    if (!p) {
      this.promptBox.classList.add('rt-hidden');
      return;
    }
    this.promptBox.classList.remove('rt-hidden');
    const key = this.touchMode ? 'TAP' : p.key;
    const html = `<span class="k">${escapeHtml(key)}</span><span class="t"><span>${escapeHtml(p.object)}</span><b class="rt-ol">${escapeHtml(p.action)}</b></span>`;
    if (this.promptBox.innerHTML !== html) this.promptBox.innerHTML = html;
  }

  notice(kind: NoticeKind, text: string): void {
    const n = el('div', `rt-notice rt-ol ${kind}`, escapeHtml(text));
    this.notices.prepend(n);
    while (this.notices.childElementCount > 3) this.notices.lastElementChild?.remove();
    window.setTimeout(() => n.remove(), 2600);
  }

  banner(m: BannerMessage): void {
    this.bannerBox.innerHTML = '';
    const b = el('div', `rt-banner ${m.tone}`, `<h1 class="rt-ol">${escapeHtml(m.title)}</h1>${m.sub ? `<p class="rt-ol">${escapeHtml(m.sub)}</p>` : ''}`);
    this.bannerBox.append(b);
    window.setTimeout(() => b.remove(), (m.seconds ?? 3) * 1000);
  }

  // ---------------------------------------------------------------- chat

  setOwnChat(on: boolean): void {
    this.ownChat = on;
    this.chatBtn.classList.toggle('rt-hidden', !on);
    this.feed.classList.toggle('rt-hidden', !on);
    if (!on) this.closeChat();
  }

  setChatEnabled(on: boolean): void {
    this.chatEnabled = on;
    if (!on) this.closeChat();
  }

  line(m: ChatLineMessage): void {
    if (!this.chatEnabled && m.kind === 'chat') return;
    const text = m.kind === 'chat' && m.name ? `<b>${escapeHtml(m.name)}:</b> ${escapeHtml(m.text)}` : escapeHtml(m.text);
    const node = el('div', `ln rt-ol ${m.kind}`, text);
    this.feed.insertBefore(node, this.chatInput);
    while (this.feed.childElementCount > 6) this.feed.firstElementChild?.remove();
    window.setTimeout(() => node.remove(), 25000);
  }

  get chatOpen(): boolean {
    return this.chatting;
  }

  openChat(): void {
    if (!this.chatEnabled || !this.ownChat) return;
    this.chatting = true;
    this.chatInput.classList.remove('rt-hidden');
    window.setTimeout(() => this.chatInput.focus(), 0);
  }

  closeChat(): void {
    this.chatting = false;
    this.chatInput.value = '';
    this.chatInput.blur();
    this.chatInput.classList.add('rt-hidden');
  }

  // ---------------------------------------------------------------- layout

  setReservedAreas(provider: () => readonly ReservedArea[]): void {
    this.reserved = provider;
    this.layout();
  }

  /** Keep clear of Boxity's toolbar and chat feed (top-left): the left menu and the build menu drop below them. */
  layout(): void {
    try {
      const areas = [...this.reserved().filter((a) => a.width > 0 && a.height > 0), TOP_LEFT];
      const hits = (r: DOMRect, a: ReservedArea): boolean => a.left < r.right && a.left + a.width > r.left && a.top < r.bottom && a.top + a.height > r.top;
      const H = window.innerHeight;
      const asArea = (r: DOMRect): ReservedArea => ({ left: r.left, top: r.top, width: r.width, height: r.height });
      /** Push a block straight down until it touches none of these areas. */
      const dropBelow = (e: HTMLElement, others: readonly ReservedArea[]): void => {
        for (let pass = 0; pass < 4; pass += 1) {
          const r = e.getBoundingClientRect();
          const under = others.filter((a) => hits(r, a)).reduce((m, a) => Math.max(m, a.top + a.height), 0);
          if (under === 0) break;
          e.style.top = `${under + 6}px`;
        }
      };
      this.tr.style.top = '';
      dropBelow(this.tr, areas);
      this.boostPack.style.top = '';
      const tr = this.tr.getBoundingClientRect();
      if (!this.boostPack.classList.contains('rt-hidden')) dropBelow(this.boostPack, [...areas, asArea(tr)]);
      // The left menu: centred unless something of Boxity's is in the way; shrunk to fit.
      this.left.style.top = '';
      this.left.style.transform = '';
      const r = this.left.getBoundingClientRect();
      const blocker = areas.filter((a) => hits(r, a)).reduce((m, a) => Math.max(m, a.top + a.height), 0);
      const floor = this.money.getBoundingClientRect().top - 8;
      const roof = Math.max(blocker > 0 ? blocker + 8 : 0, 8);
      const k = Math.min(1, Math.max(80, floor - roof) / r.height);
      const top = blocker > 0 || k < 1 ? roof : (H - r.height) / 2;
      this.left.style.top = `${top}px`;
      this.left.style.transform = k < 1 ? `scale(${k.toFixed(3)})` : 'none';
      // The top tabs: below anything of Boxity's they would touch.
      // Centred if clear; else slid right past them when it fits before the top-right buttons; else
      // dropped below every area it would still touch (a narrow window: toolbar AND chat feed).
      this.top.style.top = '';
      this.top.style.left = '';
      this.top.style.transform = '';
      const t = this.top.getBoundingClientRect();
      // The top-right buttons count too once they have been dropped onto the tabs' row.
      const topAreas = [...areas, asArea(this.tr.getBoundingClientRect())];
      const blockers = areas.filter((a) => hits(t, a));
      if (blockers.length === 0 && hits(t, asArea(this.tr.getBoundingClientRect()))) dropBelow(this.top, topAreas);
      if (blockers.length > 0) {
        const tr = this.tr.getBoundingClientRect();
        const reach = blockers.reduce((x, a) => Math.max(x, a.left + a.width), 0) + 8;
        if (reach + t.width <= tr.left - 8) {
          this.top.style.left = `${reach}px`;
          this.top.style.transform = 'none';
        } else {
          for (let pass = 0; pass < 4; pass += 1) {
            const r = this.top.getBoundingClientRect();
            const under = topAreas.filter((a) => hits(r, a)).reduce((m, a) => Math.max(m, a.top + a.height), 0);
            if (under === 0) break;
            this.top.style.top = `${under + 6}px`;
          }
        }
      }
      // The build tools: above the cash and the hotbar when they would touch.
      this.btools.style.bottom = '';
      if (!this.btools.classList.contains('rt-hidden')) {
        const t = this.btools.getBoundingClientRect();
        const below = [this.money, this.hotbar].filter((e) => !e.classList.contains('rt-hidden')).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top);
        if (below.length) this.btools.style.bottom = `${H - Math.min(...below.map((r) => r.top)) + 6}px`;
      }
      // The drive bar (Exit): above the pedals or the speedometer when they would touch.
      this.driveBar.style.bottom = '';
      if (!this.driveBar.classList.contains('rt-hidden')) {
        const d = this.driveBar.getBoundingClientRect();
        const below = [this.pedals, this.steerPad, this.speed].filter((e) => !e.classList.contains('rt-hidden')).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.left < d.right && r.right > d.left && r.top < d.bottom && r.bottom > d.top);
        if (below.length) this.driveBar.style.bottom = `${H - Math.min(...below.map((r) => r.top)) + 6}px`;
      }
      // The build menu: below Boxity's corner.
      // Left side, under Boxity's areas, scaled to end above the cash and the build tools. When that
      // leaves too little room (a phone on its side), it moves to the right, which is empty in build mode.
      this.build.style.top = '';
      this.build.style.left = '';
      this.build.style.right = '';
      this.build.style.transform = '';
      this.build.style.transformOrigin = '';
      const b = this.build.getBoundingClientRect();
      const tabs = this.top.classList.contains('rt-hidden') ? [] : [asArea(this.top.getBoundingClientRect())];
      dropBelow(this.build, [...areas, ...tabs]);
      const bb = this.build.getBoundingClientRect();
      const tools = this.btools.getBoundingClientRect();
      const bFloor = Math.min(this.money.getBoundingClientRect().top, tools.height > 0 ? tools.top : H) - 8;
      const bk = Math.min(1, (bFloor - bb.top) / b.height);
      if (bk >= 0.6) this.build.style.transform = bk < 1 ? `scale(${bk.toFixed(3)})` : '';
      else {
        const W = window.innerWidth;
        const roof = Math.max(this.tr.getBoundingClientRect().bottom, this.top.classList.contains('rt-hidden') ? 0 : this.top.getBoundingClientRect().bottom) + 8;
        const toolsRight = tools.height > 0 && tools.bottom > roof ? tools.right + 8 : 0;
        const kr = Math.min(1, (H - 8 - roof) / b.height, toolsRight ? (W - 8 - toolsRight) / b.width : 1);
        this.build.style.left = 'auto';
        this.build.style.right = `calc(var(--u) * 10 + env(safe-area-inset-right, 0px))`;
        this.build.style.top = `${roof}px`;
        this.build.style.transformOrigin = 'top right';
        this.build.style.transform = kr < 1 ? `scale(${Math.max(0.4, kr).toFixed(3)})` : '';
      }
    } catch {
      /* layout is cosmetic: never break a frame */
    }
  }

  update(delta: number): void {
    this.layoutClock += delta;
    if (this.layoutClock > 0.5) {
      this.layoutClock = 0;
      this.layout();
    }
    if (this.airTimer > 0) {
      this.airTimer -= delta;
      if (this.airTimer <= 0) this.air.innerHTML = '';
    }
    this.runTimer += delta;
    if (this.runTimer > 4 && this.mode !== 'drive') this.run.classList.add('rt-hidden');
  }

  /** Keep the air readout up while airborne (called every frame in the air). */
  holdAir(): void {
    this.airTimer = Math.max(this.airTimer, 0.3);
  }
}
