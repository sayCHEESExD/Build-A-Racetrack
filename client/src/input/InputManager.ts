import { hasTouchSupport, isTouchPrimary, onFirstTouch } from '../config/device.js';
import { createInputState, type Control, type InputState } from './InputState.js';
import { KeyboardSource } from './KeyboardSource.js';
import { MouseLook } from './MouseLook.js';
import { TouchControls } from './TouchControls.js';

const SLOTS: readonly Control[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8', 'slot9'];

/**
 * Aggregates every input source into one normalised InputState per frame.
 *
 * Every CONTROL goes through `down`/`up` - from a key, a mouse button or a
 * tapped HUD button alike - and comes out as held flags and pressed-this-frame
 * edges. Nothing downstream can tell which device it came from.
 */
export class InputManager {
  private readonly state: InputState = createInputState();
  private readonly keyboard: KeyboardSource;
  readonly look = new MouseLook();
  readonly touch = new TouchControls(this.look);
  private cancelTouchWatch: (() => void) | null = null;
  private suppressed = false;
  private readonly held = new Set<Control>();
  private readonly pressed = new Set<Control>();
  private readonly released = new Set<Control>();
  private scroll = 0;
  /** R / the RUN button: sprint stays on until pressed again. */
  private sprintToggle = false;
  /** Touch sneak toggle. */
  private crouchToggle = false;
  onTouchMode: (() => void) | null = null;

  constructor() {
    this.keyboard = new KeyboardSource({
      down: (control) => this.down(control),
      up: (control) => this.up(control),
      releaseAll: () => this.releaseAll(),
    });
    this.look.onButton = (button, down) => {
      const control: Control = button === 0 ? 'attack' : button === 1 ? 'pick' : 'use';
      if (down) this.down(control);
      else this.up(control);
    };
    this.look.onWheel = (notches) => {
      if (!this.suppressed) this.scroll += notches;
    };
  }

  get touchActive(): boolean {
    return this.touch.isVisible;
  }

  get sprintToggled(): boolean {
    return this.sprintToggle;
  }

  get crouchToggled(): boolean {
    return this.crouchToggle;
  }

  setSprintToggle(on: boolean): void {
    this.sprintToggle = on;
  }

  toggleCrouch(): void {
    this.crouchToggle = !this.crouchToggle;
  }

  setCrouchToggle(on: boolean): void {
    this.crouchToggle = on;
  }

  /** Menus (inventory, scoreboard) may still be toggled while suppressed. */
  down(control: Control): void {
    if (this.suppressed && control !== 'inventory' && control !== 'scoreboard') return;
    if (control === 'sprintToggle' && !this.held.has(control)) this.sprintToggle = !this.sprintToggle;
    if (!this.held.has(control)) this.pressed.add(control);
    this.held.add(control);
  }

  up(control: Control): void {
    if (this.held.delete(control)) this.released.add(control);
  }

  private releaseAll(): void {
    for (const c of this.held) this.released.add(c);
    this.held.clear();
  }

  setSuppressed(suppressed: boolean): void {
    if (suppressed === this.suppressed) return;
    this.suppressed = suppressed;
    this.look.setSuppressed(suppressed);
    this.touch.setSuppressed(suppressed);
    if (suppressed) this.releaseAll();
  }

  attach(canvas: HTMLElement): void {
    this.keyboard.attach();
    this.look.attach(canvas);
    this.touch.attach(canvas, canvas.parentElement ?? document.body);
    if (isTouchPrimary()) this.showTouchControls();
    else if (hasTouchSupport()) this.cancelTouchWatch = onFirstTouch(() => this.showTouchControls());
  }

  detach(): void {
    this.keyboard.detach();
    this.look.detach();
    this.touch.detach();
    this.cancelTouchWatch?.();
    this.cancelTouchWatch = null;
  }

  /** Recompute the snapshot for this frame. */
  sample(): Readonly<InputState> {
    const s = this.state;
    s.moveX = this.keyboard.moveX + this.touch.moveX;
    s.moveZ = this.keyboard.moveZ + this.touch.moveZ;
    const magnitude = Math.hypot(s.moveX, s.moveZ);
    if (magnitude > 1) {
      s.moveX /= magnitude;
      s.moveZ /= magnitude;
    }
    s.sprint = this.held.has('sprint') || this.sprintToggle;
    s.crouch = this.held.has('crouch') || this.crouchToggle;
    s.jumpHeld = this.held.has('jump');
    s.attack = this.held.has('attack');
    s.use = this.held.has('use');
    s.scoreboard = this.held.has('scoreboard');
    s.jump = this.pressed.has('jump');
    s.attackPressed = this.pressed.has('attack');
    s.usePressed = this.pressed.has('use');
    s.useReleased = this.released.has('use');
    s.attackReleased = this.released.has('attack');
    s.pickPressed = this.pressed.has('pick');
    s.drop = this.pressed.has('drop');
    s.dropAll = this.pressed.has('dropAll');
    s.inventory = this.pressed.has('inventory');
    s.recall = this.pressed.has('recall');
    s.ability = this.pressed.has('ability');
    s.viewToggle = this.pressed.has('viewToggle');
    s.slot = 0;
    for (let i = 0; i < SLOTS.length; i += 1) if (this.pressed.has(SLOTS[i]!)) s.slot = i + 1;
    s.scroll = this.scroll;
    this.scroll = 0;
    this.pressed.clear();
    this.released.clear();
    if (this.suppressed) {
      s.moveX = 0;
      s.moveZ = 0;
      s.sprint = false;
      s.jumpHeld = false;
      s.attack = false;
      s.use = false;
      s.jump = false;
      s.attackPressed = false;
      s.usePressed = false;
      s.pickPressed = false;
      s.drop = false;
      s.dropAll = false;
      s.recall = false;
      s.ability = false;
      s.slot = 0;
      s.scroll = 0;
    }
    return s;
  }

  private showTouchControls(): void {
    this.cancelTouchWatch?.();
    this.cancelTouchWatch = null;
    this.touch.show();
    document.body.classList.add('gm-touch-mode');
    this.onTouchMode?.();
  }
}
