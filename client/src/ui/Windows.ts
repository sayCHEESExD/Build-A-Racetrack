import {
  BASE_TIERS,
  CAR_UPGRADES,
  CARS,
  CRATES,
  DECORS,
  DECOR_CATEGORIES,
  GEM_ITEMS,
  MAX_REBIRTHS,
  MAX_TIER,
  RARITIES,
  REBIRTH_TIER,
  SAVE_SLOTS,
  TRACK_DESC_MAX,
  TRACK_ITEMS,
  TrackPath,
  baseTier,
  carDef,
  carStats,
  carUpgradeCost,
  crateDef,
  emptyCarLevels,
  fmtMoney,
  rebirthCost,
  rebirthScale,
  repairCost,
  traceChain,
  unpackPieces,
  withStart,
  adoptLayout,
  type CarStat,
  type DecorCategory,
  type GalleryEntry,
  type GalleryTab,
  type OwnedCar,
  type Rarity,
} from '@race/shared';
import { el, escapeHtml } from './dom.js';
import { ICONS, UI_IMAGES, img } from './icons.js';
import { thumbs } from './Thumbs.js';

export type WindowKind = 'track' | 'decor' | 'crate' | 'garage' | 'upgrade' | 'rebirth' | 'racetracks' | 'save' | 'free' | 'shop' | 'reveal' | 'offline';

export interface WindowView {
  now: number;
  cash: number;
  tier: number;
  rebirths: number;
  car: string;
  inventory: Record<string, number>;
  decorInv: Record<string, number>;
  cars: Record<string, OwnedCar>;
  stock: { track: Record<string, number>; decor: Record<string, number>; crate: Record<string, number> };
  restockAt: number;
  pass2x: boolean;
  boostUntil: number;
  giftIn: number;
  slots: number[];
  code: string;
  adReady: boolean;
  adBusy: boolean;
  rate: number;
  length: number;
  likes: number;
  visits: number;
  bestAir: number;
}

export interface WindowActions {
  buy(kind: 'track' | 'decor' | 'crate' | 'base' | 'carup', key: string, count?: number, car?: string): void;
  equip(car: string): void;
  repair(car: string): void;
  rebirth(): void;
  freeGift(): void;
  watchAd(): void;
  gems(sku: string): void;
  browse(tab: GalleryTab): void;
  visit(code: string): void;
  like(code: string): void;
  publish(name: string, desc: string): void;
  slot(i: number, action: 'save' | 'load'): void;
  close(): void;
}

const rarityTag = (r: Rarity): string => `<span class="rar rt-ol" style="color:#${RARITIES[r].color.toString(16).padStart(6, '0')}">${RARITIES[r].name}</span>`;
const clock = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const hms = (s: number): string => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
const gem = '<i class="rt-gem"></i>';

/** A little top-down map of a packed track, for gallery cards. */
const drawMini = (canvas: HTMLCanvasElement, packed: number[]): void => {
  const pieces = withStart(adoptLayout(unpackPieces(packed)).pieces);
  const chain = traceChain(pieces);
  if (chain.order.length < 1) return;
  const path = new TrackPath({ minX: 0, minZ: 0, rot: 0 }, pieces, chain.order);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < path.count; i += 1) {
    minX = Math.min(minX, path.pos[i * 3]!);
    maxX = Math.max(maxX, path.pos[i * 3]!);
    minZ = Math.min(minZ, path.pos[i * 3 + 2]!);
    maxZ = Math.max(maxZ, path.pos[i * 3 + 2]!);
  }
  canvas.width = 220;
  canvas.height = 120;
  const c = canvas.getContext('2d')!;
  const k = Math.min(200 / Math.max(8, maxX - minX), 100 / Math.max(8, maxZ - minZ));
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const [w, col] of [
    [9, '#1f2440'],
    [5, '#ffffff'],
  ] as const) {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    for (let i = 0; i < path.count; i += 1) {
      const x = 110 + (path.pos[i * 3]! - (minX + maxX) / 2) * k;
      const y = 60 + (path.pos[i * 3 + 2]! - (minZ + maxZ) / 2) * k;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
};

/**
 * THE WINDOWS: every shop and menu, drawn from the server's tables and the
 * player's profile. One open at a time; a button is a request the server
 * checks.
 */
export class Windows {
  readonly root: HTMLDivElement;
  which: WindowKind | null = null;
  private view: WindowView | null = null;
  private key = '';
  private decorTab: DecorCategory = 'terrain';
  private garageCar = '';
  private galleryTab: GalleryTab = 'hot';
  private gallery: GalleryEntry[] = [];
  private galleryMine = { visits: 0, likes: 0, tracks: 0 };
  private rtPage: 'browse' | 'profile' | 'publish' = 'browse';
  private reveal: { crate: string; car: string; duplicate: boolean; refund: number; at: number } | null = null;
  private offline: { amount: number; seconds: number } | null = null;
  private infoCrate = '';

  constructor(
    parent: HTMLElement,
    private readonly actions: WindowActions,
  ) {
    this.root = el('div', 'rt-hidden');
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('wheel', (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('keydown', (e) => e.stopPropagation());
    parent.append(this.root);
  }

  get open(): boolean {
    return this.which !== null;
  }

  show(which: WindowKind, view: WindowView): void {
    this.which = which;
    this.view = view;
    this.key = '';
    this.root.classList.remove('rt-hidden');
    if (which === 'racetracks' && this.rtPage === 'browse') this.actions.browse(this.galleryTab);
    if (which === 'garage' && !this.garageCar) this.garageCar = view.car;
    this.render(view);
  }

  hide(): void {
    this.which = null;
    this.reveal = null;
    this.root.classList.add('rt-hidden');
    this.root.innerHTML = '';
  }

  showReveal(m: { crate: string; car: string; duplicate: boolean; refund: number }, view: WindowView): void {
    this.reveal = { ...m, at: performance.now() };
    this.show('reveal', view);
  }

  showOffline(amount: number, seconds: number, view: WindowView): void {
    this.offline = { amount, seconds };
    this.show('offline', view);
  }

  setGallery(tab: GalleryTab, items: GalleryEntry[], mine?: { visits: number; likes: number; tracks: number }): void {
    this.galleryTab = tab;
    this.gallery = items;
    if (mine) this.galleryMine = mine;
    this.key = '';
    if (this.view && this.which === 'racetracks') this.render(this.view);
  }

  /** Redraw if anything shown changed (called every frame while open; cheap when nothing did). */
  render(view: WindowView): void {
    this.view = view;
    if (!this.which) return;
    const tick = Math.floor(view.now / 1000);
    const revealPhase = this.reveal ? (performance.now() - this.reveal.at > 1300 ? 1 : 0) : 0;
    const quiet = this.which === 'racetracks' || this.which === 'save' || this.which === 'offline' || this.which === 'reveal';
    const key = JSON.stringify([this.which, quiet ? 0 : view.cash, view.tier, view.inventory, view.decorInv, view.cars, view.stock, view.car, view.pass2x, view.boostUntil > view.now, view.giftIn, view.slots, view.code, view.adReady, view.adBusy, this.decorTab, this.garageCar, this.galleryTab, this.rtPage, this.gallery.length, revealPhase, this.infoCrate, view.rebirths, this.which === 'free' ? view.giftIn <= 0 : 0, this.which === 'free' ? view.boostUntil > view.now : 0]);
    void tick;
    if (key === this.key) {
      this.tickClocks(view);
      return;
    }
    // Keep typed text in the publish form across redraws.
    const name = (this.root.querySelector('#rt-pub-name') as HTMLInputElement | null)?.value;
    const code = (this.root.querySelector('#rt-code') as HTMLInputElement | null)?.value;
    const desc = (this.root.querySelector('#rt-pub-desc') as HTMLTextAreaElement | null)?.value;
    const scroll = this.root.querySelector('.rt-wbody')?.scrollTop ?? 0;
    this.key = key;
    this.root.innerHTML = `<div class="rt-dim" data-act="close"></div>${this.html(view)}`;
    const body = this.root.querySelector('.rt-wbody');
    if (body) body.scrollTop = scroll;
    if (name !== undefined) {
      const n = this.root.querySelector('#rt-pub-name') as HTMLInputElement | null;
      if (n) n.value = name;
    }
    if (code !== undefined) {
      const c = this.root.querySelector('#rt-code') as HTMLInputElement | null;
      if (c) c.value = code;
    }
    if (desc !== undefined) {
      const d = this.root.querySelector('#rt-pub-desc') as HTMLTextAreaElement | null;
      if (d) d.value = desc;
    }
    this.tickClocks(view);
    for (const c of this.root.querySelectorAll<HTMLCanvasElement>('canvas[data-mini]')) {
      const g = this.gallery.find((e) => e.code === c.dataset['mini']);
      if (g) drawMini(c, g.p);
    }
  }

  /** Countdowns update their own text: the window is never rebuilt under the player's finger. */
  private tickClocks(v: WindowView): void {
    for (const e of this.root.querySelectorAll<HTMLElement>('[data-clock]')) {
      const which = e.dataset['clock'];
      const text = which === 'restock' ? clock(v.restockAt - v.now) : which === 'gift' ? clock(v.giftIn * 1000) : which === 'boost' ? clock(v.boostUntil - v.now) : '';
      if (e.textContent !== text) e.textContent = text;
    }
  }

  private head(title: string, color: string, icon: string, extra = ''): string {
    return `<div class="rt-whead ${color}"><span class="wic">${icon}</span><h2 class="rt-ol">${escapeHtml(title)}</h2>${extra}${this.view ? `<span class="cash rt-ol">${fmtMoney(this.view.cash)}</span>` : ''}<button class="rt-btn red rt-x" data-act="close"><span class="rt-ol">X</span></button></div>`;
  }

  private html(v: WindowView): string {
    switch (this.which) {
      case 'track':
        return this.trackShop(v);
      case 'decor':
        return this.decorShop(v);
      case 'crate':
        return this.crateShop(v);
      case 'garage':
        return this.garage(v);
      case 'upgrade':
        return this.upgrade(v);
      case 'rebirth':
        return this.rebirthWin(v);
      case 'racetracks':
        return this.racetracks(v);
      case 'save':
        return this.saveWin(v);
      case 'free':
        return this.freeWin(v);
      case 'shop':
        return this.gemShop(v);
      case 'reveal':
        return this.revealWin(v);
      case 'offline':
        return this.offlineWin();
      default:
        return '';
    }
  }

  // ---------------------------------------------------------------- Track Shop

  private trackShop(v: WindowView): string {
    const rows = TRACK_ITEMS.map((item) => {
      const locked = v.tier < item.tier;
      const stock = v.stock.track[item.key] ?? item.stock;
      const shape = item.shapes[0];
      const isNew = item.tier === v.tier && item.tier > 0;
      return `<div class="rt-row${locked ? ' locked' : ''}" data-tut="shop-${item.key}">${isNew ? '<span class="new rt-ol">New!</span>' : ''}
        <div class="th" style="background-image:url(${thumbs.piece(shape)})">${rarityTag(item.rarity)}</div>
        <div class="info"><b class="rt-ol">${escapeHtml(item.name)}</b><span class="r rt-ol">${fmtMoney(item.rate)}/s</span><span class="st rt-ol">${stock}x Stock</span><span class="bl">${escapeHtml(item.blurb)} · You have ${v.inventory[item.key] ?? 0}</span></div>
        <div class="buy"><button class="rt-btn lime" data-act="buy" data-kind="track" data-key="${item.key}" data-n="1" ${stock <= 0 || v.cash < item.price ? 'disabled' : ''}><span class="rt-ol">${stock <= 0 ? 'Sold Out' : fmtMoney(item.price)}</span></button>
        <button class="rt-btn green" data-act="buy" data-kind="track" data-key="${item.key}" data-n="5" ${stock < 2 || v.cash < item.price * Math.min(5, stock) ? 'disabled' : ''} style="height:calc(var(--u)*28);font-size:calc(var(--u)*14)"><span class="rt-ol">Buy ${Math.min(5, Math.max(1, stock))}</span></button></div>
        ${locked ? `<div class="lockov"><span class="ic">${ICONS.lock}</span><span class="rt-ol">Base Upgrade ${item.tier} Required</span></div>` : ''}</div>`;
    }).join('');
    return `<div class="rt-win">${this.head('Track Shop', '', img(UI_IMAGES.map))}<div class="rt-wbody">${rows}</div><div class="rt-wfoot rt-ol">Restock in <span data-clock="restock"></span></div></div>`;
  }

  // ---------------------------------------------------------------- Decorations

  private decorShop(v: WindowView): string {
    const icons: Record<DecorCategory, string> = { terrain: '⛰️', structure: '🏗️', greenery: '🌲', decoration: '⛲' };
    const side = DECOR_CATEGORIES.map((c) => `<button class="rt-btn ${c.key === this.decorTab ? 'gold' : 'dark'}" data-act="dtab" data-key="${c.key}"><span class="rt-ol">${c.name}</span><span class="ic">${icons[c.key]}</span></button>`).join('');
    const cards = DECORS.filter((d) => d.category === this.decorTab).map((d) => {
      const locked = v.tier < d.tier;
      const stock = v.stock.decor[d.key] ?? d.stock;
      return `<div class="rt-card${locked ? ' locked' : ''}"><span class="nm rt-ol">${escapeHtml(d.name)}</span><span class="st rt-ol">${stock}x Stock · have ${v.decorInv[d.key] ?? 0}</span><div class="th" style="background-image:url(${thumbs.decor(d.key)})"></div>${rarityTag(d.rarity)}
        <button class="rt-btn lime" data-act="buy" data-kind="decor" data-key="${d.key}" data-n="1" ${locked || stock <= 0 || v.cash < d.price ? 'disabled' : ''}><span class="rt-ol">${locked ? `Base ${d.tier}` : stock <= 0 ? 'Sold Out' : fmtMoney(d.price)}</span></button></div>`;
    }).join('');
    return `<div class="rt-win wide">${this.head('Decorations', 'yellow', '⛲')}<div class="rt-wbody"><div class="rt-cols"><div class="rt-side">${side}<p class="rt-muted" style="max-width:calc(var(--u)*150)">Each decoration on your plot adds +1% income (up to +30%).</p></div><div class="rt-grid">${cards}</div></div></div><div class="rt-wfoot rt-ol">Re-Stock in: <span data-clock="restock"></span></div></div>`;
  }

  // ---------------------------------------------------------------- Crates

  private crateShop(v: WindowView): string {
    const rows = CRATES.map((c) => {
      const locked = v.tier < c.tier;
      const stock = v.stock.crate[c.key] ?? c.stock;
      const best = Math.max(...c.pool.map(([k]) => carDef(k).cash));
      const info = this.infoCrate === c.key ? `<div class="bl">${c.pool.map(([k, odds]) => `${escapeHtml(carDef(k).name)} <b style="color:#${RARITIES[carDef(k).rarity].color.toString(16).padStart(6, '0')}">${odds}%</b>${v.cars[k] ? ' ✓' : ''}`).join(' · ')}</div>` : '';
      return `<div class="rt-row${locked ? ' locked' : ''}"><div class="th" style="background-image:url(${thumbs.crate(c.key)})"></div>
        <div class="info"><b class="rt-ol">${escapeHtml(c.name)} <span class="st rt-ol">${stock} left</span></b><span class="r rt-ol">Cash Mul up to x${best}</span>${info}<span class="bl">Owned: ${c.pool.filter(([k]) => v.cars[k]).length}/${c.pool.length} cars <button class="rt-btn blue" data-act="cinfo" data-key="${c.key}" style="height:calc(var(--u)*22);font-size:calc(var(--u)*12);padding:0 6px"><span class="rt-ol">i Odds</span></button></span></div>
        <div class="buy"><button class="rt-btn lime" data-act="buy" data-kind="crate" data-key="${c.key}" ${stock <= 0 || v.cash < c.price ? 'disabled' : ''}><span class="rt-ol">${stock <= 0 ? 'Sold Out' : fmtMoney(c.price)}</span></button></div>
        ${locked ? `<div class="lockov"><span class="ic">${ICONS.lock}</span><span class="rt-ol">Base Upgrade ${c.tier} Required</span></div>` : ''}</div>`;
    }).join('');
    return `<div class="rt-win">${this.head('Crates', '', img(UI_IMAGES.car), '<span class="rt-ol" style="font-size:calc(var(--u)*18)">Resets in <span data-clock="restock"></span></span>')}<div class="rt-wbody">${rows}</div></div>`;
  }

  private revealWin(v: WindowView): string {
    const r = this.reveal;
    if (!r) return '';
    const crate = crateDef(r.crate);
    const opening = performance.now() - r.at < 1300;
    if (opening) return `<div class="rt-win">${this.head(crate?.name ?? 'Crate', 'purple', '🎁')}<div class="rt-wbody"><div class="rt-reveal"><div class="crate" style="background-image:url(${thumbs.crate(r.crate)})"></div><h1 class="rt-ol">Opening...</h1></div></div></div>`;
    const car = carDef(r.car);
    const color = `#${RARITIES[car.rarity].color.toString(16).padStart(6, '0')}`;
    const btn = r.duplicate
      ? `<p class="rt-ol" style="font-size:calc(var(--u)*20);color:#ffe14a">Duplicate! +${fmtMoney(r.refund)}</p><button class="rt-btn green rt-big" data-act="close"><span class="rt-ol">Awesome!</span></button>`
      : `<div class="rt-flex"><button class="rt-btn green rt-big" data-act="equip" data-key="${car.key}"><span class="rt-ol">Drive It!</span></button><button class="rt-btn dark rt-big" data-act="close"><span class="rt-ol">Later</span></button></div>`;
    void v;
    return `<div class="rt-win">${this.head('You got...', 'purple', '🎁')}<div class="rt-wbody"><div class="rt-reveal"><div class="art" style="background-image:url(${thumbs.car(car.key)})"></div><span class="rar rt-ol" style="color:${color}">${RARITIES[car.rarity].name}</span><h1 class="rt-ol">${escapeHtml(car.name)}</h1><p class="rt-ol">Top speed ${car.speed} · Cash x${car.cash}</p>${btn}</div></div></div>`;
  }

  // ---------------------------------------------------------------- Garage

  private garage(v: WindowView): string {
    const owned = Object.keys(v.cars);
    const sel = v.cars[this.garageCar] ? this.garageCar : v.car;
    const cards = CARS.map((c) => {
      const has = !!v.cars[c.key];
      return `<div class="rt-card${has ? '' : ' locked'}${c.key === sel ? ' on' : ''}" data-act="gsel" data-key="${c.key}">${c.key === v.car ? '<span class="eq rt-ol">Driving</span>' : ''}<div class="th" style="background-image:url(${has ? thumbs.car(c.key) : ''})"></div><span class="nm rt-ol">${has ? escapeHtml(c.name) : '???'}</span>${rarityTag(c.rarity)}</div>`;
    }).join('');
    const car = carDef(sel);
    const mine = v.cars[sel] ?? { lv: emptyCarLevels(), cond: 100 };
    const lv = { ...emptyCarLevels(), ...(mine.lv as Partial<Record<CarStat, number>>) };
    const st = carStats(car, lv, mine.cond);
    const bar = (n: string, value: number, max: number, text: string): string => `<div class="rt-stat"><span class="n rt-ol">${n}</span><div class="rt-bar"><i style="width:${Math.min(100, (value / max) * 100)}%"></i></div><span class="rt-ol" style="width:calc(var(--u)*60);text-align:right">${text}</span></div>`;
    const repair = repairCost(car, mine.cond);
    const ups = CAR_UPGRADES.map((u) => {
      const level = lv[u.key];
      const cost = carUpgradeCost(car, u.key, level);
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      return `<div class="rt-stat"><span class="n rt-ol">${u.name}</span><div class="rt-pips">${pips}</div><span class="rt-muted" style="flex:1">${u.per}</span><button class="rt-btn lime" style="height:calc(var(--u)*30);min-width:calc(var(--u)*86);font-size:calc(var(--u)*14)" data-act="carup" data-key="${u.key}" data-car="${sel}" ${level >= u.max || v.cash < cost ? 'disabled' : ''}><span class="rt-ol">${level >= u.max ? 'MAX' : fmtMoney(cost)}</span></button></div>`;
    }).join('');
    const detail = `<div class="rt-panel"><div class="rt-flex"><div style="width:calc(var(--u)*170);height:calc(var(--u)*110);background:center/contain no-repeat url(${thumbs.car(sel)})"></div><div style="flex:1"><h3 class="rt-ol">${escapeHtml(car.name)}</h3>${rarityTag(car.rarity)}</div>${sel === v.car ? '<span class="rt-ol" style="color:#7dff6a">Driving</span>' : `<button class="rt-btn green" style="height:calc(var(--u)*40);padding:0 14px" data-act="equip" data-key="${sel}"><span class="rt-ol">Drive</span></button>`}</div>
      ${bar('Speed', st.speed, 70, `${st.speed.toFixed(0)}`)}${bar('Accel', st.accel, 70, `${st.accel.toFixed(0)}`)}${bar('Handling', st.handling, 2.5, `${st.handling.toFixed(2)}`)}${bar('Cash', st.cash, 120, `x${st.cash.toFixed(1)}`)}
      <div class="rt-stat"><span class="n rt-ol">Condition</span><div class="rt-bar cond${mine.cond < 30 ? ' low' : ''}"><i style="width:${mine.cond}%"></i></div><span class="rt-ol" style="width:calc(var(--u)*60);text-align:right">${Math.round(mine.cond)}%</span><button class="rt-btn orange" style="height:calc(var(--u)*30);font-size:calc(var(--u)*14);padding:0 10px" data-act="repair" data-key="${sel}" ${mine.cond >= 100 || v.cash < repair ? 'disabled' : ''}><span class="rt-ol">${mine.cond >= 100 ? 'Perfect' : `Repair ${fmtMoney(repair)}`}</span></button></div>
      <p class="rt-muted">Crashes wear your car down. Under 50% it slows; under 25% it collects less. At 0% it must be repaired.</p>
      <h3 class="rt-ol">Upgrades</h3>${ups}</div>`;
    return `<div class="rt-win wide">${this.head(`Garage (${owned.length}/${CARS.length})`, 'blue', img(UI_IMAGES.car))}<div class="rt-wbody">${detail}<div class="rt-grid">${cards}</div><p class="rt-muted">Get more cars from the Crates stall.</p></div></div>`;
  }

  // ---------------------------------------------------------------- Base Upgrade

  private upgrade(v: WindowView): string {
    const cur = baseTier(v.tier);
    if (v.tier >= MAX_TIER) return `<div class="rt-win">${this.head('Base Upgrade', 'green', img(UI_IMAGES.upgrade))}<div class="rt-wbody"><div class="rt-panel"><h3 class="rt-ol">${cur.name} (MAX)</h3><p>Your base is fully upgraded. Time to Rebirth!</p><button class="rt-btn purple rt-big" data-act="menu-rebirth"><span class="rt-ol">Go to Rebirth</span></button></div></div></div>`;
    const next = baseTier(v.tier + 1);
    const unlocks = [
      ...TRACK_ITEMS.filter((i) => i.tier === next.tier).map((i) => i.name),
      ...CRATES.filter((c) => c.tier === next.tier).map((c) => c.name),
      ...DECORS.filter((d) => d.tier === next.tier).map((d) => d.name),
    ];
    const perk = (n: string, a: string | number, b: string | number): string => `<div class="rt-perk"><span class="rt-ol">${n}</span><span class="rt-ol">${a} → <b>${b}</b></span></div>`;
    const tiers = BASE_TIERS.map((t) => `<span class="rt-ol" style="padding:2px 8px;border-radius:6px;background:${t.tier <= v.tier ? '#33b83a' : '#2a2e44'}">${t.tier}</span>`).join('');
    return `<div class="rt-win">${this.head('Base Upgrade', 'green', img(UI_IMAGES.upgrade))}<div class="rt-wbody"><div class="rt-flex">${tiers}</div>
      <div class="rt-panel"><h3 class="rt-ol">${cur.name} → <span style="color:#7dff6a">${next.name}</span></h3>
      ${perk('Track Length', cur.length, next.length)}${perk('Plot Size', `14x${cur.rows}`, `14x${next.rows}`)}${perk('Build Height', `${cur.height} levels`, `${next.height} levels`)}${perk('Cash Pile Holds', `${cur.pile}s`, `${next.pile}s`)}
      <p class="rt-ol" style="color:#ffe14a">Unlocks: ${unlocks.length ? unlocks.map(escapeHtml).join(', ') : 'more room to build'}</p>
      <button class="rt-btn lime rt-big" data-act="buy" data-kind="base" data-key="base" ${v.cash < next.cost ? 'disabled' : ''} data-tut="buy-base"><span class="rt-ol">Upgrade for ${fmtMoney(next.cost)}</span></button></div></div></div>`;
  }

  private rebirthWin(v: WindowView): string {
    const cost = rebirthCost(v.rebirths);
    const ok = v.tier >= REBIRTH_TIER && v.cash >= cost && v.rebirths < MAX_REBIRTHS;
    return `<div class="rt-win">${this.head('Rebirth', 'purple', img(UI_IMAGES.rebirth))}<div class="rt-wbody"><div class="rt-panel">
      <h3 class="rt-ol">Rebirths: ${v.rebirths}</h3>
      <div class="rt-perk"><span class="rt-ol">Income multiplier</span><span class="rt-ol">x${rebirthScale(v.rebirths).toFixed(1)} → <b>x${rebirthScale(v.rebirths + 1).toFixed(1)}</b></span></div>
      <div class="rt-perk"><span class="rt-ol">Needs</span><span class="rt-ol">Base Upgrade ${REBIRTH_TIER} and ${fmtMoney(cost)}</span></div>
      <p>Rebirthing resets your cash and Base Upgrade. Your track pieces and decorations go back to your inventory, and you keep every car and its upgrades.</p>
      <button class="rt-btn purple rt-big" data-act="rebirth" ${ok ? '' : 'disabled'}><span class="rt-ol">${v.rebirths >= MAX_REBIRTHS ? 'Max Rebirths' : `Rebirth for ${fmtMoney(cost)}`}</span></button></div></div></div>`;
  }

  // ---------------------------------------------------------------- RaceTracks

  private racetracks(v: WindowView): string {
    const side = `<div class="rt-side"><button class="rt-btn ${this.rtPage === 'browse' ? 'blue' : 'dark'}" data-act="rtpage" data-key="browse"><span class="rt-ol">Browse</span><span class="ic">🌍</span></button><button class="rt-btn ${this.rtPage === 'profile' ? 'gold' : 'dark'}" data-act="rtpage" data-key="profile"><span class="rt-ol">Profile</span><span class="ic">🏆</span></button><button class="rt-btn ${this.rtPage === 'publish' ? 'green' : 'dark'}" data-act="rtpage" data-key="publish"><span class="rt-ol">Publish</span><span class="ic">⬆️</span></button></div>`;
    let main = '';
    if (this.rtPage === 'browse' || this.rtPage === 'profile') {
      const tabs: [GalleryTab, string, string][] = this.rtPage === 'profile' ? [['mine', 'My Racetracks', 'gold']] : [
        ['hot', '⚡ Hot!', 'lime'],
        ['new', '⭐ New', 'dark'],
        ['liked', '❤️ Top Liked', 'dark'],
        ['visited', '🏆 Top Visited', 'dark'],
      ];
      const tabHtml = tabs.map(([t, label, cls]) => `<button class="rt-btn ${t === this.galleryTab ? cls === 'dark' ? 'blue' : cls : 'dark'}" data-act="gtab" data-key="${t}"><span class="rt-ol">${label}</span></button>`).join('');
      const cards = this.gallery.length
        ? this.gallery.map((g) => `<div class="rt-gcard" data-act="visit" data-key="${g.code}"><canvas data-mini="${g.code}"></canvas><span class="code rt-ol">Code: ${g.code}</span><b class="rt-ol">${escapeHtml(g.name)}</b><small class="rt-ol"><span>@${escapeHtml(g.owner)}</span><span>${g.visits} Visits · ${g.likes} ❤</span></small></div>`).join('')
        : `<p class="rt-muted">${this.rtPage === 'profile' ? 'No racetracks yet - publish yours!' : 'No racetracks published yet. Be the first!'}</p>`;
      const prof = this.rtPage === 'profile' ? `<div class="rt-panel"><div class="rt-flex" style="justify-content:space-around"><span class="rt-ol" style="font-size:calc(var(--u)*22)">${this.galleryMine.visits} Visits</span><span class="rt-ol" style="font-size:calc(var(--u)*22)">${this.galleryMine.likes} Likes</span><span class="rt-ol" style="font-size:calc(var(--u)*22)">${this.galleryMine.tracks} Racetracks</span></div>${v.code ? `<p class="rt-ol">Your track's code: <b style="color:#ffe14a">${v.code}</b> - share it!</p>` : ''}</div>` : '';
      main = `<div style="flex:1;display:flex;flex-direction:column;gap:calc(var(--u)*8)">${prof}<div class="rt-gtabs">${tabHtml}</div><div class="rt-grid">${cards}</div>
        <div class="rt-flex" style="justify-content:center"><span class="rt-muted">or</span></div>
        <div class="rt-flex"><input id="rt-code" class="rt-input" maxlength="8" placeholder="Input Racetrack Code" style="flex:1;text-transform:uppercase"><button class="rt-btn lime" style="height:calc(var(--u)*42);padding:0 14px" data-act="code"><span class="rt-ol">➜</span></button></div></div>`;
    } else {
      main = `<div class="rt-panel" style="flex:1"><h3 class="rt-ol">Publish your Racetrack</h3><p>Share your track with every player. They can drive it in the Showcase (through the tunnel) and earn you visits and likes.</p>
        <label class="rt-ol">Name (max 24)</label><input id="rt-pub-name" class="rt-input" maxlength="24" placeholder="My Awesome Track">
        <label class="rt-ol">Description (max ${TRACK_DESC_MAX})</label><textarea id="rt-pub-desc" class="rt-input" maxlength="${TRACK_DESC_MAX}" placeholder="Big jumps, bigger cash!"></textarea>
        <p class="rt-ol">Your track: ${v.length} pieces${v.code ? ` · published as <b style="color:#ffe14a">${v.code}</b> (publishing again updates it)` : ''}</p>
        <button class="rt-btn green rt-big" data-act="publish" ${v.length < 3 ? 'disabled' : ''}><span class="rt-ol">Publish</span></button></div>`;
    }
    return `<div class="rt-win wide">${this.head('Browse Racetracks', 'blue', '🌍')}<div class="rt-wbody"><div class="rt-cols">${side}${main}</div></div></div>`;
  }

  // ---------------------------------------------------------------- Save, Free, Gems

  private saveWin(v: WindowView): string {
    const slots = Array.from({ length: SAVE_SLOTS }, (_, i) => {
      const n = v.slots[i] ?? 0;
      return `<div class="rt-row"><div class="info"><b class="rt-ol">Save Slot #${i + 1}</b><span class="bl">${n ? `${n} pieces saved` : 'Empty'}</span></div><div class="rt-flex"><button class="rt-btn green" style="height:calc(var(--u)*38);padding:0 14px" data-act="slot" data-key="${i}" data-n="save"><span class="rt-ol">Save</span></button><button class="rt-btn blue" style="height:calc(var(--u)*38);padding:0 14px" data-act="slot" data-key="${i}" data-n="load" ${n ? '' : 'disabled'}><span class="rt-ol">Load</span></button></div></div>`;
    }).join('');
    return `<div class="rt-win">${this.head('Save Slots', 'dark', img(UI_IMAGES.inventory))}<div class="rt-wbody"><p class="rt-muted">Save your track layout and load it back later. Loading takes your current track back into your inventory and rebuilds the saved one from the pieces you own.</p>${slots}</div></div>`;
  }

  private freeWin(v: WindowView): string {
    const boosted = v.boostUntil > v.now;
    return `<div class="rt-win">${this.head('Free Rewards', 'green', img(UI_IMAGES.gift))}<div class="rt-wbody">
      <div class="rt-row"><div class="th" style="background-image:url(${UI_IMAGES.gift})"></div><div class="info"><b class="rt-ol">Free Gift</b><span class="bl">Cash worth 2 minutes of your track's income, every 10 minutes you play.</span></div><div class="buy"><button class="rt-btn lime" data-act="gift" ${v.giftIn > 0 ? 'disabled' : ''}><span class="rt-ol">${v.giftIn > 0 ? '<span data-clock="gift"></span>' : 'Claim!'}</span></button></div></div>
      <div class="rt-row"><div class="th" style="background-image:url(${UI_IMAGES.energy})"></div><div class="info"><b class="rt-ol">2x Money (10 min)</b><span class="bl">${boosted ? 'Active: <span data-clock="boost"></span> left' : 'Watch a short video for double money.'}</span></div><div class="buy"><button class="rt-btn gold" data-act="ad" ${v.adReady && !v.adBusy ? '' : 'disabled'}><span class="rt-ol">${v.adReady ? (v.adBusy ? '...' : '▶ Watch') : 'No ads now'}</span></button></div></div>
    </div></div>`;
  }

  private gemShop(_v: WindowView): string {
    const rows = GEM_ITEMS.map((g) => `<div class="rt-row"><div class="th" style="display:grid;place-items:center;font-size:calc(var(--u)*40)">${g.kind === 'pass' ? '💸' : g.kind === 'pack' ? '🎁' : '💰'}</div><div class="info"><b class="rt-ol">${escapeHtml(g.name)}</b><span class="bl">${escapeHtml(g.blurb)}</span></div><div class="buy"><button class="rt-btn magenta" data-act="gems" data-key="${g.sku}"><span class="rt-ol">${gem} ${g.gems}</span></button></div></div>`).join('');
    return `<div class="rt-win">${this.head('Shop', 'purple', img(UI_IMAGES.shop))}<div class="rt-wbody">${rows}</div></div>`;
  }

  private offlineWin(): string {
    const o = this.offline;
    if (!o) return '';
    return `<div class="rt-win">${this.head('Welcome Back!', 'green', img(UI_IMAGES.bills))}<div class="rt-wbody"><div class="rt-reveal"><p class="rt-ol" style="font-size:calc(var(--u)*20)">While you were away for ${hms(o.seconds)}, your racetrack earned</p><h1 class="rt-ol" style="color:#7dff6a">+${fmtMoney(o.amount)}</h1><p class="rt-muted">Your cash piles kept filling too - go drive over them!</p><button class="rt-btn lime rt-big" data-act="close"><span class="rt-ol">Collect!</span></button></div></div></div>`;
  }

  // ---------------------------------------------------------------- clicks

  private onClick(e: MouseEvent): void {
    e.stopPropagation();
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    const act = t.dataset['act'];
    const key = t.dataset['key'] ?? '';
    const a = this.actions;
    switch (act) {
      case 'close':
        a.close();
        break;
      case 'buy':
        a.buy(t.dataset['kind'] as 'track' | 'decor' | 'crate' | 'base', key, Number(t.dataset['n'] ?? 1));
        break;
      case 'carup':
        a.buy('carup', key, 1, t.dataset['car']);
        break;
      case 'dtab':
        this.decorTab = key as DecorCategory;
        break;
      case 'cinfo':
        this.infoCrate = this.infoCrate === key ? '' : key;
        break;
      case 'gsel':
        if (this.view?.cars[key]) this.garageCar = key;
        break;
      case 'equip':
        a.equip(key);
        if (this.which === 'reveal') a.close();
        break;
      case 'repair':
        a.repair(key);
        break;
      case 'rebirth':
        a.rebirth();
        break;
      case 'menu-rebirth':
        if (this.view) this.show('rebirth', this.view);
        return;
      case 'rtpage':
        this.rtPage = key as 'browse' | 'profile' | 'publish';
        if (this.rtPage === 'browse') a.browse(this.galleryTab === 'mine' ? 'hot' : this.galleryTab);
        if (this.rtPage === 'profile') a.browse('mine');
        break;
      case 'gtab':
        this.galleryTab = key as GalleryTab;
        a.browse(this.galleryTab);
        break;
      case 'visit':
        a.visit(key);
        break;
      case 'code': {
        const code = (this.root.querySelector('#rt-code') as HTMLInputElement | null)?.value.trim().toUpperCase() ?? '';
        if (code) a.visit(code);
        break;
      }
      case 'publish': {
        const name = (this.root.querySelector('#rt-pub-name') as HTMLInputElement | null)?.value ?? '';
        const desc = (this.root.querySelector('#rt-pub-desc') as HTMLTextAreaElement | null)?.value ?? '';
        a.publish(name, desc);
        break;
      }
      case 'slot':
        a.slot(Number(key), t.dataset['n'] === 'load' ? 'load' : 'save');
        break;
      case 'gift':
        a.freeGift();
        break;
      case 'ad':
        a.watchAd();
        break;
      case 'gems':
        a.gems(key);
        break;
      default:
        return;
    }
    this.key = '';
    if (this.view && this.which) this.render(this.view);
  }
}

/** A gallery tab button's label for a tab (shared with the tutorial). */
export const isWindowKind = (s: string): s is WindowKind => ['track', 'decor', 'crate', 'garage', 'upgrade', 'rebirth', 'racetracks', 'save', 'free', 'shop', 'reveal', 'offline'].includes(s);
