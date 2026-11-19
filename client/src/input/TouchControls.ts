const ZONE_WIDTH = 0.42;
const ZONE_TOP = 0.3;
const RADIUS_VMIN = 0.12;
const RADIUS_MIN = 40;
const RADIUS_MAX = 84;
const DEADZONE = 0.16;
const LOOK_SENSITIVITY = 0.0058;

export interface LookSink {
  addLookDelta(deltaX: number, deltaY: number): void;
  readonly distance: number;
  setDistance(distance: number): void;
  /** A tap that did not drag. */
  tap(x: number, y: number): void;
  /** A finger held still on the world (dig), and let go. */
  hold?(x: number, y: number, down: boolean): void;
}

interface LookPointer {
  x: number;
  y: number;
  /** Where and when the finger came down (a tap is short and still). */
  sx: number;
  sy: number;
  at: number;
  /** A long press became a hold (digging). */
  holding: boolean;
  moved: boolean;
}

/**
 * Touch: a floating virtual stick on the left, drag-to-look everywhere else,
 * and a two-finger PINCH on the look side to zoom the camera - all the way in
 * to first person, like the wheel. The action buttons (jump, crouch, sprint,
 * E, the hotbar) are HUD elements that feed the same controls as the keys.
 */
export class TouchControls {
  private readonly root: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private canvas: HTMLElement | null = null;
  private movePointer: number | null = null;
  private readonly looks = new Map<number, LookPointer>();
  private pinchStart = 0;
  private pinchDistance = 0;
  private originX = 0;
  private originY = 0;
  /** When the stick finger went down, and whether it has moved: a second finger soon after is a pinch. */
  private stickAt = 0;
  private stickMoved = false;
  private radius = 64;
  private visible = false;
  private suppressed = false;
  moveX = 0;
  moveZ = 0;

  constructor(private readonly look: LookSink) {
    this.root = document.createElement('div');
    this.root.className = 'gm-touch';
    this.root.hidden = true;
    this.stick = document.createElement('div');
    this.stick.className = 'gm-touch__stick';
    this.knob = document.createElement('div');
    this.knob.className = 'gm-touch__knob';
    this.stick.append(this.knob);
    this.root.append(this.stick);
    injectStyles();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  attach(canvas: HTMLElement, container: HTMLElement): void {
    this.canvas = canvas;
    container.append(this.root);
    this.measure();
    canvas.addEventListener('pointerdown', this.onCanvasDown);
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('resize', this.measure);
  }

  detach(): void {
    this.canvas?.removeEventListener('pointerdown', this.onCanvasDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('resize', this.measure);
    this.root.remove();
    this.canvas = null;
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.root.hidden = false;
    this.measure();
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    this.root.classList.toggle('gm-touch--hidden', suppressed);
    if (suppressed) {
      this.releaseStick();
      this.looks.clear();
    }
  }

  private spread(): number {
    const [a, b] = [...this.looks.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private readonly onCanvasDown = (event: PointerEvent): void => {
    if (this.suppressed || !this.visible || event.pointerType === 'mouse') return;
    // A second finger right after a stick touch that has not moved yet: the player is pinching, not steering.
    if (this.movePointer !== null && !this.stickMoved && performance.now() - this.stickAt < 250 && this.looks.size === 0) {
      const first = this.movePointer;
      const x = this.originX;
      const y = this.originY;
      this.releaseStick();
      this.looks.set(first, { x, y, sx: x, sy: y, at: 0, holding: false, moved: true });
    }
    if (this.movePointer === null && this.looks.size === 0 && this.inStickZone(event.clientX, event.clientY)) {
      this.movePointer = event.pointerId;
      this.stickAt = performance.now();
      this.stickMoved = false;
      this.originX = event.clientX;
      this.originY = event.clientY;
      this.stick.style.left = `${this.originX}px`;
      this.stick.style.top = `${this.originY}px`;
      this.stick.classList.add('gm-touch__stick--active');
      this.updateStick(event.clientX, event.clientY);
      event.preventDefault();
      return;
    }
    if (this.looks.size < 2) {
      const id = event.pointerId;
      const entry: LookPointer = { x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY, at: performance.now(), holding: false, moved: false };
      this.looks.set(id, entry);
      window.setTimeout(() => {
        if (this.looks.get(id) === entry && !entry.moved && this.looks.size === 1) {
          entry.holding = true;
          this.look.hold?.(entry.x, entry.y, true);
        }
      }, 300);
      if (this.looks.size === 2) {
        this.pinchStart = this.spread();
        this.pinchDistance = this.look.distance;
      }
      event.preventDefault();
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.suppressed) return;
    if (event.pointerId === this.movePointer) {
      if (Math.hypot(event.clientX - this.originX, event.clientY - this.originY) > 12) this.stickMoved = true;
      this.updateStick(event.clientX, event.clientY);
      event.preventDefault();
      return;
    }
    const pointer = this.looks.get(event.pointerId);
    if (!pointer) return;
    if (this.looks.size === 2) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      const now = this.spread();
      if (this.pinchStart > 20 && now > 1) {
        // Fingers apart = closer (zoom in), together = further out.
        const ratio = this.pinchStart / now;
        this.look.setDistance(this.pinchDistance <= 0.2 ? (ratio > 1.15 ? 2.5 * ratio : 0) : this.pinchDistance * ratio);
      }
    } else {
      if (Math.hypot(event.clientX - pointer.sx, event.clientY - pointer.sy) > 14) pointer.moved = true;
      this.look.addLookDelta((event.clientX - pointer.x) * LOOK_SENSITIVITY, (event.clientY - pointer.y) * LOOK_SENSITIVITY);
      if (pointer.holding) this.look.hold?.(event.clientX, event.clientY, true);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }
    event.preventDefault();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.movePointer) this.releaseStick();
    const pinching = this.looks.size === 2;
    const pointer = this.looks.get(event.pointerId);
    // A quick tap that did not drag: use whatever it landed on.
    if (pointer?.holding) this.look.hold?.(event.clientX, event.clientY, false);
    if (pointer && !pointer.holding && !pinching && pointer.at > 0 && performance.now() - pointer.at < 320 && Math.hypot(event.clientX - pointer.sx, event.clientY - pointer.sy) < 14) this.look.tap(event.clientX, event.clientY);
    if (this.looks.delete(event.pointerId)) {
      // A pinch that ends right by the head finishes the job: first person, like the wheel.
      if (pinching && this.look.distance > 0 && this.look.distance < 1.4) this.look.setDistance(0);
      this.pinchStart = 0;
    }
  };

  private inStickZone(x: number, y: number): boolean {
    return x < window.innerWidth * ZONE_WIDTH && y > window.innerHeight * ZONE_TOP;
  }

  private readonly measure = (): void => {
    const vmin = Math.min(window.innerWidth, window.innerHeight);
    this.radius = Math.max(RADIUS_MIN, Math.min(vmin * RADIUS_VMIN, RADIUS_MAX));
    this.stick.style.setProperty('--gm-stick-radius', `${this.radius}px`);
    if (this.movePointer === null) {
      this.stick.style.left = '';
      this.stick.style.top = '';
    }
  };

  private updateStick(x: number, y: number): void {
    const dx = x - this.originX;
    const dy = y - this.originY;
    const distance = Math.hypot(dx, dy);
    const deflection = Math.min(distance / this.radius, 1);
    if (deflection < DEADZONE || distance < 1e-4) {
      this.moveX = 0;
      this.moveZ = 0;
      this.knob.style.transform = 'translate(-50%, -50%)';
      return;
    }
    const magnitude = (deflection - DEADZONE) / (1 - DEADZONE);
    this.moveX = (dx / distance) * magnitude;
    this.moveZ = (-dy / distance) * magnitude;
    this.knob.style.transform = `translate(calc(-50% + ${(dx / distance) * deflection * this.radius}px), calc(-50% + ${(dy / distance) * deflection * this.radius}px))`;
  }

  private releaseStick(): void {
    this.movePointer = null;
    this.moveX = 0;
    this.moveZ = 0;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.stick.classList.remove('gm-touch__stick--active');
    this.stick.style.left = '';
    this.stick.style.top = '';
  }
}

let stylesInjected = false;

const injectStyles = (): void => {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.gm-touch { position: fixed; inset: 0; z-index: 22; pointer-events: none; touch-action: none; user-select: none; }
.gm-touch[hidden] { display: none; }
.gm-touch--hidden { opacity: 0; }
.gm-touch__stick {
  --gm-stick-radius: 64px;
  position: fixed;
  left: calc(env(safe-area-inset-left, 0px) + 40px + var(--gm-stick-radius));
  top: calc(100% - env(safe-area-inset-bottom, 0px) - 70px - var(--gm-stick-radius));
  width: calc(var(--gm-stick-radius) * 2);
  height: calc(var(--gm-stick-radius) * 2);
  margin: calc(var(--gm-stick-radius) * -1) 0 0 calc(var(--gm-stick-radius) * -1);
  border: 2px solid rgba(255, 255, 255, 0.28);
  border-radius: 50%;
  background: rgba(10, 10, 14, 0.35);
  opacity: 0.75;
}
.gm-touch__stick--active { opacity: 0.95; }
.gm-touch__knob {
  position: absolute; left: 50%; top: 50%; width: 44%; height: 44%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
}
`;
  document.head.append(style);
};
