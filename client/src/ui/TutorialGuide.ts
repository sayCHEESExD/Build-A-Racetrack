/**
 * THE TUTORIAL'S PICTURES: what the player should press or where to go is
 * SHOWN, not told.
 *
 *   - a pulsing ring round the exact button (HUD or inside a window) and a big
 *     bouncing hand pointing at it
 *   - an arrow at the edge of the screen toward a place in the world that is
 *     out of view (the 3D arrow over it is drawn by `Tutorial`)
 *   - a giant animated keycap for a key to press or hold
 *   - a small card: an icon, a few words, progress dots, Skip
 *
 * Elements are found by their `data-tut` name, anywhere on the page, so a
 * button inside a freshly drawn window is followed as soon as it exists.
 * Pure DOM above the HUD; nothing here takes clicks except Skip.
 */

export interface GuideView {
  icon: string;
  caption: string;
  step: number;
  total: number;
  /** The `data-tut` name of the element to point at (null: none). */
  ui: string | null;
  /** A key to show pressed (PC only), e.g. 'W'. */
  key: string | null;
  /** Where in the world the target is, on screen (null: none, or the HUD target is enough). */
  world: { x: number; y: number; onScreen: boolean; distance: number } | null;
}

const CSS = `
.tg-root { position: fixed; inset: 0; pointer-events: none; z-index: 30; font-family: "Fredoka", "Rubik", system-ui, sans-serif; }
.tg-ring { position: absolute; border: 4px solid #ffe14a; border-radius: 14px; box-shadow: 0 0 0 4px rgba(255,225,74,0.35), 0 0 26px 8px rgba(255,225,74,0.55); animation: tg-pulse 0.9s ease-in-out infinite alternate; }
@keyframes tg-pulse { from { transform: scale(1); opacity: 1; } to { transform: scale(1.08); opacity: 0.75; } }
.tg-hand { position: absolute; width: 64px; height: 64px; margin: -6px 0 0 -32px; font-size: 56px; line-height: 64px; text-align: center; filter: drop-shadow(0 3px 0 rgba(0,0,0,0.45)); animation: tg-poke 0.8s ease-in-out infinite; }
.tg-hand.up { animation-name: tg-poke-up; margin-top: -58px; }
@keyframes tg-poke { 0%, 100% { transform: translateY(14px); } 50% { transform: translateY(0); } }
@keyframes tg-poke-up { 0%, 100% { transform: translateY(-14px) rotate(180deg); } 50% { transform: translateY(0) rotate(180deg); } }
.tg-edge { position: absolute; width: 0; height: 0; border-left: 26px solid transparent; border-right: 26px solid transparent; border-bottom: 46px solid #ffe14a; filter: drop-shadow(0 0 6px rgba(0,0,0,0.6)); margin: -23px 0 0 -26px; }
.tg-far { position: absolute; transform: translate(-50%, -100%); text-align: center; color: #ffe14a; font: 800 18px "Fredoka", "Rubik", sans-serif; -webkit-text-stroke: 1px rgba(0,0,0,0.6); animation: tg-bob 0.8s ease-in-out infinite; }
.tg-far b { display: block; font-size: 40px; line-height: 34px; filter: drop-shadow(0 2px 0 rgba(0,0,0,0.5)); }
@keyframes tg-bob { 0%, 100% { margin-top: 0; } 50% { margin-top: -10px; } }
.tg-key { position: absolute; left: 50%; bottom: 26%; transform: translateX(-50%); min-width: 84px; height: 84px; padding: 0 18px; box-sizing: border-box; border-radius: 16px; background: #fff; color: #15172a; font: 800 48px/78px "Fredoka", "Rubik", sans-serif; text-align: center; box-shadow: 0 8px 0 #9aa0b8, 0 10px 18px rgba(0,0,0,0.45); animation: tg-press 0.7s ease-in-out infinite; }
@keyframes tg-press { 0%, 100% { transform: translateX(-50%) translateY(0); box-shadow: 0 8px 0 #9aa0b8, 0 10px 18px rgba(0,0,0,0.45); } 50% { transform: translateX(-50%) translateY(6px); box-shadow: 0 2px 0 #9aa0b8, 0 4px 10px rgba(0,0,0,0.45); } }
.tg-card { position: absolute; left: 50%; top: calc(var(--u, 1px) * 74 + 84px); transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 14px; border-radius: 16px; background: rgba(20,22,36,0.86); border: 3px solid #ffe14a; color: #fff; font-size: 20px; font-weight: 700; white-space: nowrap; box-shadow: 0 6px 18px rgba(0,0,0,0.4); }
.tg-card.low { top: auto; bottom: 14px; }
.tg-card .ic { font-size: 30px; line-height: 1; }
.tg-card .dots { display: flex; gap: 4px; margin-left: 4px; }
.tg-card .dots i { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.3); }
.tg-card .dots i.on { background: #ffe14a; }
.tg-card button { pointer-events: auto; margin-left: 6px; border: 0; border-radius: 10px; padding: 4px 10px; background: rgba(255,255,255,0.16); color: #fff; font: 700 14px "Fredoka", "Rubik", sans-serif; cursor: pointer; }
body.rt-touch .tg-key { display: none; }
`;

export class TutorialGuide {
  readonly root = document.createElement('div');
  private readonly ring = document.createElement('div');
  private readonly hand = document.createElement('div');
  private readonly edge = document.createElement('div');
  private readonly key = document.createElement('div');
  private readonly far = document.createElement('div');
  private readonly card = document.createElement('div');
  private cardKey = '';

  constructor(onSkip: () => void) {
    if (!document.getElementById('tg-css')) {
      const style = document.createElement('style');
      style.id = 'tg-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.root.className = 'tg-root';
    this.ring.className = 'tg-ring';
    this.hand.className = 'tg-hand';
    this.hand.textContent = '👆';
    this.edge.className = 'tg-edge';
    this.key.className = 'tg-key';
    this.far.className = 'tg-far';
    this.card.className = 'tg-card';
    this.card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) onSkip();
    });
    this.root.append(this.ring, this.hand, this.edge, this.far, this.key, this.card);
    this.root.style.display = 'none';
    document.body.append(this.root);
  }

  /** Draw a step (null: hide everything). Called every frame while the tutorial runs. */
  show(v: GuideView | null): void {
    if (!v) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = '';
    const cardKey = `${v.icon}|${v.caption}|${v.step}|${v.total}`;
    if (cardKey !== this.cardKey) {
      this.cardKey = cardKey;
      const dots = Array.from({ length: v.total }, (_, i) => `<i class="${i <= v.step ? 'on' : ''}"></i>`).join('');
      this.card.innerHTML = `<span class="ic">${v.icon}</span><span>${v.caption}</span><span class="dots">${dots}</span><button type="button">Skip</button>`;
    }
    // A window is open: the card drops to the bottom of the screen, clear of its rows.
    this.card.classList.toggle('low', !!document.querySelector('.rt-win'));
    // The button to press: ring round it, the hand poking at it (from below, or from above near the bottom).
    const target = v.ui ? this.find(v.ui) : null;
    const r = target?.getBoundingClientRect();
    const shown = !!r && r.width > 0 && r.height > 0;
    this.ring.style.display = shown ? '' : 'none';
    this.hand.style.display = shown ? '' : 'none';
    if (shown && r) {
      const pad = 6;
      Object.assign(this.ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      const fromAbove = r.bottom > window.innerHeight - 90;
      this.hand.classList.toggle('up', fromAbove);
      this.hand.style.left = `${r.left + r.width / 2}px`;
      this.hand.style.top = `${fromAbove ? r.top : r.bottom}px`;
    }
    // A place in the world that is off screen: an arrow at the edge, pointing at it.
    const w = v.world;
    const edgeOn = !!w && !w.onScreen;
    this.edge.style.display = edgeOn ? '' : 'none';
    if (w && edgeOn) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const ang = Math.atan2(w.y - cy, w.x - cx);
      const m = 60;
      const k = Math.min((cx - m) / Math.max(1e-3, Math.abs(Math.cos(ang))), (cy - m) / Math.max(1e-3, Math.abs(Math.sin(ang))));
      this.edge.style.left = `${cx + Math.cos(ang) * k}px`;
      this.edge.style.top = `${cy + Math.sin(ang) * k}px`;
      this.edge.style.transform = `rotate(${ang + Math.PI / 2}rad)`;
    }
    // In view but far off (the 3D arrow over it is a speck): a bouncing marker over it, with how far.
    const farOn = !!w && w.onScreen && w.distance > 35;
    this.far.style.display = farOn ? '' : 'none';
    if (w && farOn) {
      this.far.style.left = `${w.x}px`;
      this.far.style.top = `${Math.max(60, w.y)}px`;
      const text = `<b>▼</b>${Math.round(w.distance)}m`;
      if (this.far.innerHTML !== text) this.far.innerHTML = text;
    }
    this.key.style.display = v.key ? '' : 'none';
    if (v.key && this.key.textContent !== v.key) this.key.textContent = v.key;
  }

  /** The visible element with that tutorial name (a window's button wins over a hidden HUD copy). */
  private find(name: string): HTMLElement | null {
    const all = document.querySelectorAll<HTMLElement>(`[data-tut="${name}"]`);
    for (const e of all) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return e;
    }
    return null;
  }

  dispose(): void {
    this.root.remove();
  }
}
