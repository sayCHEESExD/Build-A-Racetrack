type AdPosition = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
type AdSize = '300x250' | '728x90' | '300x600' | '160x600' | '320x50' | '320x100';
export interface AdScreenOptions {
  skip?: AdPosition[];
  sizes?: Partial<Record<AdPosition, AdSize>>;
}
type AdScreenType = 'panel';

/** What the portal draws for a reported screen; the game just asks for one. */
export interface AdScreenPort {
  adScreen(type: AdScreenType, options: AdScreenOptions): void;
  hideAdScreen(): void;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The only screen this game reports: a full-screen panel (a shop, the garage, the gallery...). */
type GameScreen = 'panel';

const POSITIONS: readonly AdPosition[] = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];

/**
 * The portal's banner SLOTS per screen (its ad-config defaults): it only ever
 * fills these positions, trying each slot's sizes in this order. Any other
 * position is never drawn, whatever the game asks for.
 */
const SLOTS: Record<GameScreen, readonly { position: AdPosition; sizes: readonly AdSize[] }[]> = {
  panel: [
    { position: 'middle-left', sizes: ['300x600', '160x600', '300x250'] },
    { position: 'middle-right', sizes: ['300x600', '160x600', '300x250'] },
    { position: 'bottom-center', sizes: ['728x90', '320x100', '320x50'] },
  ],
};

/** The sizes the portal allows, chosen as it chooses them: a phone or tablet user agent gets the mobile list. */
const DESKTOP_SIZES: readonly AdSize[] = ['300x250', '728x90', '300x600', '160x600'];
const MOBILE_SIZES: readonly AdSize[] = ['300x250', '320x50', '320x100'];
const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

/** The portal's banner geometry: an 8 px margin, a 19 px "Ad" label, and scaling with the window. */
const MARGIN = 8;
const LABEL = 19;
const TALL_BOOST = [[1, 1.9], [1.62, 1.15], [1.78, 1]] as const;
const SCALING: Record<AdSize, { factor: number; boost: readonly (readonly [number, number])[]; fitWidthOnly?: true }> = {
  '300x250': { factor: 1.3, boost: [[1, 1.8], [1.62, 1.2], [1.78, 1.1]] },
  '728x90': { factor: 1.3, boost: [] },
  '300x600': { factor: 1.06, boost: TALL_BOOST },
  '160x600': { factor: 1.06, boost: TALL_BOOST },
  '320x50': { factor: 1, boost: [], fitWidthOnly: true },
  '320x100': { factor: 1, boost: [], fitWidthOnly: true },
};

/** Gap kept between a banner and the game's UI. */
const CLEARANCE = 8;
/** How often the layout is re-measured while a screen is up (and on resize). */
const RECHECK_SECONDS = 1;

/**
 * Things that come and go in a second or two (the E prompt, "+4.5" pops,
 * toasts, the zone name, the green message line): never a reason to move a
 * banner, or it would flicker on and off.
 */
const TRANSIENT = '.rt-notices, .rt-prompt, .rt-plus, .rt-banner, .rt-air, .rt-run, .rt-hint, .rt-feed, .rt-conn';

/**
 * SCREEN ADS that stay OFF the game's UI, at any window size.
 *
 * The portal draws banners only in its SLOTS for each screen (panel: both sides
 * and the bottom centre), scaled with
 * the window. The game's say is which slots to SKIP and which size it wants in
 * each - so this works out, with the portal's own geometry, where each of a
 * slot's sizes would land and asks for the first that touches none of the
 * game's visible UI (the HUD, an open menu, the touch controls). A slot where
 * nothing fits is skipped. Re-measured on resize, on rotation and whenever the
 * screen changes. While a window is open the HUD steps aside (`panel-open` in rtStyles).
 */
export class AdScreens {
  private type: GameScreen | null = null;
  private key = '';
  private timer = 0;
  private dirty = true;

  constructor(
    private readonly port: AdScreenPort,
    private readonly root: HTMLElement,
  ) {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  private readonly onResize = (): void => {
    this.dirty = true;
  };

  /**
   * Call every frame with the screen now showing (null = none). Cheap: it
   * measures about once a second, and only SENDS when the layout changed.
   * `paused` while a rewarded ad is pending: nothing is sent then (the SDK
   * forbids it), and the current screen is re-sent as soon as it resolves.
   */
  update(delta: number, type: GameScreen | null, paused = false): void {
    if (paused) {
      this.dirty = true;
      this.key = this.key ? 'resend' : '';
      return;
    }
    if (type !== this.type) {
      this.type = type;
      this.dirty = true;
    }
    this.timer -= delta;
    if (!this.dirty && this.timer > 0) return;
    this.timer = RECHECK_SECONDS;
    this.dirty = false;
    if (!type) {
      if (this.key) this.port.hideAdScreen();
      this.key = '';
      return;
    }
    const options = this.layout(type);
    const key = `${type}|${JSON.stringify(options)}`;
    if (key === this.key) return;
    this.key = key;
    this.port.adScreen(type, options);
  }

  /** The slots and sizes that keep every banner clear of the game's UI right now. */
  private layout(type: GameScreen): AdScreenOptions {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ui = this.uiRects(w, h);
    const allowed = MOBILE_UA.test(navigator.userAgent) ? MOBILE_SIZES : DESKTOP_SIZES;
    const centre = centreZone(w, h);
    const sizes: Partial<Record<AdPosition, AdSize>> = {};
    const placed: Rect[] = [];
    for (const slot of SLOTS[type]) {
      for (const size of slot.sizes) {
        if (!allowed.includes(size)) continue;
        const banner = bannerRect(slot.position, size, w, h);
        // The portal's own rules (on screen, off the centre, off other banners), then ours: off the game's UI.
        if (banner.left < 0 || banner.top < 0 || banner.right > w || banner.bottom > h) continue;
        if (overlaps(centre, banner, 0) || placed.some((r) => overlaps(r, banner, 0))) continue;
        if (ui.some((r) => overlaps(r, banner, CLEARANCE))) continue;
        sizes[slot.position] = size;
        placed.push(banner);
        break;
      }
    }
    const skip = POSITIONS.filter((p) => !sizes[p]);
    return skip.length > 0 ? { skip, sizes } : { sizes };
  }

  /** Boxes of everything the player can see or press, except whole-screen layers and passing effects. */
  private uiRects(w: number, h: number): Rect[] {
    const out: Rect[] = [];
    const screen = w * h;
    for (const el of this.root.querySelectorAll<HTMLElement>('*')) {
      if (el.tagName === 'CANVAS' || el.closest(TRANSIENT)) continue;
      const box = el.getBoundingClientRect();
      // Content scrolled out of a window's list is not on screen: clip to every scrolling ancestor.
      const r = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
      for (let p = el.parentElement; p && p !== this.root; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (o.overflowY === 'visible' && o.overflowX === 'visible') continue;
        const c = p.getBoundingClientRect();
        r.left = Math.max(r.left, c.left);
        r.top = Math.max(r.top, c.top);
        r.right = Math.min(r.right, c.right);
        r.bottom = Math.min(r.bottom, c.bottom);
      }
      const area = Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
      if (area < 16 || area > screen * 0.85) continue;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= w || r.top >= h) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) < 0.05) continue;
      out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    return out;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    if (this.key) this.port.hideAdScreen();
  }
}

const parse = (size: AdSize): [number, number] => size.split('x').map(Number) as [number, number];

/** Piecewise-linear boost by aspect ratio, as the portal applies it. */
const boostAt = (boost: readonly (readonly [number, number])[], ratio: number): number => {
  const first = boost[0];
  const last = boost[boost.length - 1];
  if (!first || !last) return 1;
  if (ratio <= first[0]) return first[1];
  if (ratio >= last[0]) return last[1];
  for (let i = 0; i < boost.length - 1; i++) {
    const [a, va] = boost[i]!;
    const [b, vb] = boost[i + 1]!;
    if (ratio >= a && ratio <= b) return va + ((vb - va) * (ratio - a)) / (b - a);
  }
  return 1;
};

/** How much the portal shrinks a banner of this size in a w x h window. */
const bannerScale = (size: AdSize, w: number, h: number): number => {
  const s = SCALING[size];
  if (s.fitWidthOnly) return Math.min(1, Math.max(0, w - 16) / parse(size)[0]);
  return Math.min(1, Math.min(w / 1920, h / 960) * s.factor * boostAt(s.boost, w / Math.max(1, h)));
};

/** Where the portal puts a banner of this size at this position, label included. */
const bannerRect = (position: AdPosition, size: AdSize, w: number, h: number): Rect => {
  const k = bannerScale(size, w, h);
  const [bw, bh] = parse(size);
  const width = bw * k;
  const height = (bh + LABEL) * k;
  const [row, col] = position.split('-') as ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right'];
  const left = col === 'left' ? MARGIN : col === 'right' ? w - width - MARGIN : (w - width) / 2;
  const top = row === 'top' ? MARGIN : row === 'bottom' ? h - height - MARGIN : (h - height) / 2;
  return { left, top, right: left + width, bottom: top + height };
};

/** The middle of the screen, which the portal never covers. */
const centreZone = (w: number, h: number): Rect => {
  const r = Math.min(1, w / 1280, h / 720);
  const width = Math.min(w, Math.max(320 * r, 0.36 * w));
  const height = Math.min(h, Math.max(160 * r, 0.4 * h));
  const left = (w - width) / 2;
  const top = (h - height) / 2;
  return { left, top, right: left + width, bottom: top + height };
};

const overlaps = (a: Rect, b: Rect, pad: number): boolean =>
  a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
