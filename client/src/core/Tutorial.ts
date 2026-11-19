import { PLOTS, plotEntry, shopSpot, spawnPad } from '@race/shared';
import { ConeGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, type Scene } from 'three';

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
}

interface Step {
  /** The line under the tabs (HTML). */
  text: string;
  /** HUD / window elements to glow. */
  glow: string[];
  /** Where the 3D arrow points (null: none). */
  at: (s: TutorialState) => { x: number; z: number } | null;
  done: (s: TutorialState, start: TutorialState) => boolean;
}

const near = (s: TutorialState, p: { x: number; z: number } | null, r: number): boolean => !!p && Math.hypot(s.x - p.x, s.z - p.z) < r;
const track = (): { x: number; z: number } => {
  const s = shopSpot('track');
  return { x: s.x, z: s.z + 4.5 };
};
const home = (s: TutorialState): { x: number; z: number } | null => {
  const p = PLOTS[s.plot];
  return p ? plotEntry(p) : null;
};
const pad = (s: TutorialState): { x: number; z: number } | null => {
  const p = PLOTS[s.plot];
  return p ? spawnPad(p) : null;
};

/**
 * THE FIRST RUN, step for step like the reference: visit the Track Shop, buy
 * a Straight, head home, build it onto the glowing end, hop into the kart and
 * drive over the cash. Each step waits for the real action; a bouncing arrow
 * marks where to go and the button to press glows.
 */
const STEPS: Step[] = [
  { text: 'Press <b>Tracks</b> to visit the Track Shop...', glow: ['tab-track'], at: () => track(), done: (s) => near(s, track(), 14) },
  { text: 'Talk to the <b>shopkeeper</b>...', glow: [], at: () => track(), done: (s) => s.window === 'track' },
  { text: 'Buy a <b>Straight</b> track for <b>$25</b>', glow: ['shop-straight'], at: () => null, done: (s, start) => s.straights > start.straights },
  { text: 'Close the shop...', glow: [], at: () => null, done: (s) => s.window === null },
  { text: 'Press <b>Base</b> to head home', glow: ['tab-base'], at: (s) => home(s), done: (s) => near(s, home(s), 16) },
  { text: 'Equip the <b>Build</b> tool (1)', glow: ['slot-0'], at: () => null, done: (s) => s.building },
  { text: 'Pick your <b>Straight Track</b>', glow: ['card-straight'], at: () => null, done: (s) => s.selected === 'straight' },
  { text: 'Click the <b>glowing end</b> to place it...', glow: ['place'], at: () => null, done: (s, start) => s.pieces > start.pieces },
  { text: 'Exit build mode', glow: [], at: () => null, done: (s) => !s.building },
  { text: 'Hop into your <b>kart</b>... (Spawn Car pad)', glow: ['slot-2'], at: (s) => pad(s), done: (s) => s.driving },
  { text: 'Hold <b>W</b> to drive over your track and grab the <b>cash</b>!', glow: [], at: () => null, done: (s, start) => s.runs > start.runs },
];

export class Tutorial {
  active = false;
  private index = 0;
  private start: TutorialState | null = null;
  private readonly arrow = new Group();
  private time = 0;

  constructor(
    scene: Scene,
    private readonly hooks: { hint(html: string): void; glow(names: string[]): void; finished(): void },
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

  stop(): void {
    this.active = false;
    this.arrow.visible = false;
    this.hooks.glow([]);
  }

  update(delta: number, s: TutorialState): void {
    if (!this.active) return;
    this.time += delta;
    if (!this.start) this.start = { ...s };
    const step = STEPS[this.index];
    if (!step) return;
    if (step.done(s, this.start)) {
      this.index += 1;
      this.start = { ...s };
      if (this.index >= STEPS.length) {
        this.stop();
        this.hooks.finished();
        return;
      }
      return;
    }
    this.hooks.hint(step.text);
    this.hooks.glow(step.glow);
    const at = step.at(s);
    this.arrow.visible = at !== null;
    if (at) {
      this.arrow.position.set(at.x, 5 + Math.sin(this.time * 4) * 0.6, at.z);
      this.arrow.rotation.y = this.time * 2;
    }
  }
}
