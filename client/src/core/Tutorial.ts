import { PLOTS, plotEntry, shopSpot, spawnPad } from '@race/shared';
import { ConeGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, type Scene } from 'three';
import type { GuideView } from '../ui/TutorialGuide.js';

/** What the tutorial reads of the game each frame. */
export interface TutorialState {
  plot: number;
  x: number;
  z: number;
  /** Pieces on their track (Start Gate included). */
  pieces: number;
  straights: number;
  building: boolean;
  selected: string;
  window: string | null;
  driving: boolean;
  runs: number;
  /** The glowing end of their track in the world (null: none). */
  end: { x: number; y: number; z: number } | null;
  /** Phones: point at the on-screen pedals rather than a key. */
  touch: boolean;
}

type Spot = { x: number; y?: number; z: number };

interface Step {
  icon: string;
  /** A few words on the card; the pictures do the explaining. */
  caption: string | ((s: TutorialState) => string);
  /** The `data-tut` element the hand points at (null: none). */
  ui: (s: TutorialState) => string | null;
  /** A key to show pressed on PC. */
  key?: string;
  /** Where the 3D arrow points (null: none). */
  at: (s: TutorialState) => Spot | null;
  done: (s: TutorialState, start: TutorialState) => boolean;
  /** Wandered off a step that needs what came before (closed the shop, left build mode)? The step to go back to. */
  back?: (s: TutorialState) => number | null;
}

const near = (s: TutorialState, p: Spot | null, r: number): boolean => !!p && Math.hypot(s.x - p.x, s.z - p.z) < r;
const keeper = (): Spot => {
  const s = shopSpot('track');
  return { x: s.x, z: s.z + 3 };
};
const home = (s: TutorialState): Spot | null => {
  const p = PLOTS[s.plot];
  return p ? plotEntry(p) : null;
};
const pad = (s: TutorialState): Spot | null => {
  const p = PLOTS[s.plot];
  return p ? spawnPad(p) : null;
};

/** Indexes, so steps can send the player back by name. */
const GO_SHOP = 0;
const OPEN_SHOP = 1;
const BUILD = 5;
const PICK = 6;

/**
 * THE FIRST RUN, like the reference, SHOWN rather than told: go to the Track
 * Shop, open it, buy a Straight, close the shop, go home, open Build mode,
 * pick the Straight, place it on the glowing end, leave Build mode, hop into
 * the kart and drive. Every step waits for the real action, with a hand on
 * the exact button (inside the shop window too), an arrow over the place in
 * the world (and at the screen's edge when it is out of view), the key to
 * press. A step whose groundwork was undone steps back. It ENDS after that
 * first drive, however the drive ends, and never comes back.
 */
const STEPS: Step[] = [
  { icon: '🛒', caption: 'Go to the Track Shop', ui: () => 'tab-track', key: 'T', at: () => keeper(), done: (s) => near(s, keeper(), 7) },
  {
    icon: '💬',
    caption: 'Open the shop',
    ui: () => 'prompt',
    key: 'E',
    at: () => keeper(),
    done: (s) => s.window === 'track',
    back: (s) => (near(s, keeper(), 16) ? null : GO_SHOP),
  },
  {
    icon: '🛣️',
    caption: 'Buy a Straight Track',
    ui: () => 'buy-straight',
    at: () => null,
    done: (s, start) => s.straights > start.straights,
    back: (s) => (s.window === 'track' ? null : OPEN_SHOP),
  },
  { icon: '✖️', caption: 'Close the shop', ui: () => 'close', key: 'Esc', at: () => null, done: (s) => s.window === null },
  { icon: '🏠', caption: 'Go to your base', ui: () => 'tab-base', key: 'B', at: (s) => home(s), done: (s) => near(s, home(s), 14) },
  { icon: '🔨', caption: 'Open Build mode', ui: () => 'slot-0', key: '1', at: () => null, done: (s) => s.building },
  {
    icon: '🛣️',
    caption: 'Pick the Straight Track',
    ui: () => 'card-straight',
    at: () => null,
    done: (s) => s.selected === 'straight',
    back: (s) => (s.building ? null : BUILD),
  },
  {
    icon: '✨',
    caption: 'Place it on the glowing end',
    ui: () => 'place',
    key: 'F',
    at: (s) => s.end,
    done: (s, start) => s.pieces > start.pieces,
    back: (s) => (!s.building ? BUILD : s.selected !== 'straight' ? PICK : null),
  },
  { icon: '🚪', caption: 'Leave Build mode', ui: () => 'exit-build', key: 'Esc', at: () => null, done: (s) => !s.building },
  { icon: '🏎️', caption: 'Hop into your kart', ui: () => 'slot-2', key: '3', at: (s) => pad(s), done: (s) => s.driving },
  {
    icon: '💨',
    caption: (s) => (s.touch ? 'Hold GAS - grab the cash!' : 'Hold W - grab the cash!'),
    ui: (s) => (s.touch ? 'gas' : null),
    key: 'W',
    at: () => null,
    // The first drive, however it ends (Finish Line, off the end, Exit), finishes the tutorial.
    done: (s, start) => s.runs > start.runs || !s.driving,
  },
];

export class Tutorial {
  active = false;
  private index = 0;
  private start: TutorialState | null = null;
  private readonly arrow = new Group();
  private time = 0;

  constructor(
    scene: Scene,
    private readonly hooks: {
      /** Draw the guide (null: hide it). */
      view(v: GuideView | null): void;
      /** A world point on screen. */
      project(x: number, y: number, z: number): { x: number; y: number; onScreen: boolean; distance: number };
      finished(): void;
    },
  ) {
    const cone = new Mesh(new ConeGeometry(1.1, 2.4, 4), new MeshBasicMaterial({ color: 0xffe14a }));
    cone.rotation.x = Math.PI;
    const ring = new Mesh(new RingGeometry(1.6, 2.2, 32), new MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.6, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -5.4;
    this.arrow.add(cone, ring);
    this.arrow.visible = false;
    scene.add(this.arrow);
  }

  begin(): void {
    this.active = true;
    this.index = 0;
    this.start = null;
  }

  /** Stop for good (finished or skipped). */
  stop(): void {
    this.active = false;
    this.arrow.visible = false;
    this.hooks.view(null);
  }

  update(delta: number, s: TutorialState): void {
    if (!this.active) return;
    this.time += delta;
    if (!this.start) this.start = { ...s };
    let step = STEPS[this.index];
    if (!step) return;
    if (step.done(s, this.start)) {
      this.index += 1;
      this.start = { ...s };
      if (this.index >= STEPS.length) {
        this.stop();
        this.hooks.finished();
        return;
      }
      step = STEPS[this.index]!;
    } else {
      const back = step.back?.(s);
      if (back !== null && back !== undefined && back !== this.index) {
        this.index = back;
        this.start = { ...s };
        step = STEPS[this.index]!;
      }
    }
    const at = step.at(s);
    this.arrow.visible = at !== null;
    let world: GuideView['world'] = null;
    if (at) {
      const y = (at.y ?? 0) + 5 + Math.sin(this.time * 4) * 0.6;
      this.arrow.position.set(at.x, y, at.z);
      this.arrow.rotation.y = this.time * 2;
      world = this.hooks.project(at.x, y - 2, at.z);
    }
    this.hooks.view({
      icon: step.icon,
      caption: typeof step.caption === 'function' ? step.caption(s) : step.caption,
      step: this.index,
      total: STEPS.length,
      ui: step.ui(s),
      key: step.key ?? null,
      world,
    });
  }
}
