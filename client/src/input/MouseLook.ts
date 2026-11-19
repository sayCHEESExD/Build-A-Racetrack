import { CAMERA } from '@race/shared';

/** Radians per pixel while the pointer is captured. */
const LOCKED_SENSITIVITY = 0.0024;
/** Radians per pixel of a free-cursor drag (right button). */
const DRAG_SENSITIVITY = 0.006;
/** A right press that moves this far is a camera drag, not a tap. */
const RIGHT_DRAG_PX = 6;
const NOTCH_PER_DELTA = [1 / 100, 1 / 3, 1] as const;

/**
 * THE MOUSE, two ways (as the reference's Roblox camera and Minecraft's):
 *
 *  - CURSOR mode (third person, the default): the pointer stays free and
 *    points at what you build on. Left button uses the tool where it points,
 *    a right DRAG turns the camera, a right TAP removes, the middle button
 *    picks the block. The wheel zooms.
 *  - CAPTURED mode (first person): a click captures the pointer, the mouse
 *    looks around and the buttons act at the crosshair.
 *
 * Touch look (drag) goes through the same accumulators (`addLookDelta`).
 */
export class MouseLook {
  private canvas: HTMLElement | null = null;
  private yawValue = 0;
  private pitchValue = 0.35;
  private distanceValue = 9;
  private suppressed = false;
  private sensitivityScale = 1;
  private minPitch = CAMERA.minPitch;
  private maxPitch = CAMERA.maxPitch;
  private captureOnClick = false;
  private cursor = true;
  private lockFailed = false;
  /** When the last lock was refused (browsers refuse a re-lock for ~1 s after Esc). */
  private lockFailedAt = 0;
  private rightDown: { x: number; y: number; dragging: boolean } | null = null;
  private lastX = 0;
  private lastY = 0;
  /** Where the free pointer is, in canvas pixels. */
  pointerX = -1;
  pointerY = -1;
  /** The pointer is over the canvas (not a panel). */
  pointerOver = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  /** A mouse button went down/up as a game action (0 left, 1 middle, 2 right). */
  onButton: ((button: number, down: boolean) => void) | null = null;
  /** Wheel notches (+ = down/next). */
  onWheel: ((notches: number) => void) | null = null;
  onTap: ((x: number, y: number) => void) | null = null;
  onHold: ((x: number, y: number, down: boolean) => void) | null = null;
  private wheelAccum = 0;

  get yaw(): number {
    return this.yawValue;
  }

  get pitch(): number {
    return this.pitchValue;
  }

  get distance(): number {
    return this.distanceValue;
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas && this.canvas !== null;
  }

  /** Is the free cursor what aims (third person, or capture refused)? */
  get aimsWithCursor(): boolean {
    return !this.locked && (this.cursor || this.lockFailed);
  }

  get freeCursor(): boolean {
    return this.lockFailed && !this.locked;
  }

  get rightDragging(): boolean {
    return this.rightDown?.dragging ?? false;
  }

  setYaw(yaw: number): void {
    if (Number.isFinite(yaw)) this.yawValue = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  }

  setPitch(pitch: number): void {
    if (Number.isFinite(pitch)) this.pitchValue = Math.min(this.maxPitch, Math.max(this.minPitch, pitch));
  }

  setSensitivityScale(scale: number): void {
    this.sensitivityScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  setPitchLimits(min: number, max: number): void {
    this.minPitch = min;
    this.maxPitch = max;
    this.pitchValue = Math.min(max, Math.max(min, this.pitchValue));
  }

  setDistance(distance: number): void {
    if (Number.isFinite(distance)) this.distanceValue = Math.min(CAMERA.zoomMaxDistance, Math.max(CAMERA.zoomMinDistance, distance));
  }

  /** Third person aims with the free cursor; first person captures. */
  setCursorMode(on: boolean): void {
    if (on === this.cursor) return;
    this.cursor = on;
    if (on && this.locked) document.exitPointerLock();
  }

  setCaptureOnClick(on: boolean): void {
    this.captureOnClick = on;
    if (!on && this.locked) document.exitPointerLock();
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (suppressed) {
      this.rightDown = null;
      if (this.locked) document.exitPointerLock();
    }
  }

  requestLock(): void {
    if (!this.canvas) return;
    try {
      const request = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (request && typeof request.catch === 'function')
        request.catch(() => {
          this.failLock();
        });
    } catch {
      this.failLock();
    }
    window.setTimeout(() => {
      if (!this.locked) this.failLock();
    }, 600);
  }

  private failLock(): void {
    this.lockFailed = true;
    this.lockFailedAt = performance.now();
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  attach(canvas: HTMLElement): void {
    this.canvas = canvas;
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('wheel', this.onWheelEvent, { passive: false });
    canvas.addEventListener('mouseenter', this.onEnter);
    canvas.addEventListener('mouseleave', this.onLeave);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
  }

  detach(): void {
    this.canvas?.removeEventListener('mousedown', this.onMouseDown);
    this.canvas?.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas?.removeEventListener('wheel', this.onWheelEvent);
    this.canvas?.removeEventListener('mouseenter', this.onEnter);
    this.canvas?.removeEventListener('mouseleave', this.onLeave);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    this.canvas = null;
  }

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();
  private readonly onEnter = (): void => {
    this.pointerOver = true;
  };
  private readonly onLeave = (): void => {
    this.pointerOver = false;
  };

  private readonly onPointerLockError = (): void => {
    this.failLock();
  };

  private readonly onPointerLockChange = (): void => {
    if (this.locked) this.lockFailed = false;
    this.onLockChange?.(this.locked);
    if (!this.locked) {
      this.onButton?.(0, false);
      this.onButton?.(2, false);
    }
  };

  private track(event: MouseEvent): void {
    const rect = this.canvas?.getBoundingClientRect();
    if (!rect) return;
    this.pointerX = event.clientX - rect.left;
    this.pointerY = event.clientY - rect.top;
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (this.suppressed) return;
    this.track(event);
    this.pointerOver = true;
    if (this.locked) {
      this.onButton?.(event.button, true);
      return;
    }
    if (event.button === 2) {
      this.rightDown = { x: event.clientX, y: event.clientY, dragging: false };
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      return;
    }
    if (!this.captureOnClick) return;
    // A refused lock is not for ever: a later click (past the browser's re-lock cooldown) tries again.
    if (!this.cursor && this.lockFailed && event.button === 0 && performance.now() - this.lockFailedAt > 1500) {
      this.requestLock();
      return;
    }
    if (this.aimsWithCursor) {
      event.preventDefault();
      this.onButton?.(event.button, true);
      return;
    }
    // First person: the click captures (and, if capture is refused, acts on the cursor).
    if (event.button === 0) this.requestLock();
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button === 2) {
      const press = this.rightDown;
      this.rightDown = null;
      // A right TAP removes; a right drag only looked.
      if (press && !press.dragging && !this.locked && this.captureOnClick && !this.suppressed) {
        this.onButton?.(2, true);
        this.onButton?.(2, false);
      }
      if (this.locked) this.onButton?.(2, false);
      return;
    }
    this.onButton?.(event.button, false);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (this.suppressed) return;
    if (this.locked) {
      const s = LOCKED_SENSITIVITY * this.sensitivityScale;
      this.addLookDelta(event.movementX * s, event.movementY * s);
      return;
    }
    this.track(event);
    const press = this.rightDown;
    if (!press) return;
    if (!press.dragging && Math.hypot(event.clientX - press.x, event.clientY - press.y) > RIGHT_DRAG_PX) press.dragging = true;
    if (!press.dragging) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    const s = DRAG_SENSITIVITY * this.sensitivityScale;
    this.addLookDelta(dx * s, dy * s);
  };

  tap(x: number, y: number): void {
    if (!this.suppressed) this.onTap?.(x, y);
  }

  hold(x: number, y: number, down: boolean): void {
    if (!this.suppressed || !down) this.onHold?.(x, y, down);
  }

  /** The one place yaw and pitch are written: mouse and touch both land here. */
  addLookDelta(deltaYaw: number, deltaPitch: number): void {
    if (this.suppressed) return;
    if (!Number.isFinite(deltaYaw) || !Number.isFinite(deltaPitch)) return;
    this.yawValue -= deltaYaw;
    this.pitchValue += deltaPitch;
    if (this.yawValue > Math.PI) this.yawValue -= Math.PI * 2;
    else if (this.yawValue < -Math.PI) this.yawValue += Math.PI * 2;
    this.pitchValue = Math.min(this.maxPitch, Math.max(this.minPitch, this.pitchValue));
  }

  private readonly onWheelEvent = (event: WheelEvent): void => {
    if (this.suppressed) return;
    event.preventDefault();
    this.wheelAccum += event.deltaY * (NOTCH_PER_DELTA[event.deltaMode] ?? NOTCH_PER_DELTA[0]);
    const notches = Math.trunc(this.wheelAccum);
    if (notches !== 0) {
      this.wheelAccum -= notches;
      this.onWheel?.(Math.sign(notches));
    }
  };

  private readonly onBlur = (): void => {
    this.rightDown = null;
  };
}
