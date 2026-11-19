import type { Control } from './InputState.js';

const MOVE: Readonly<Record<string, 'forward' | 'back' | 'left' | 'right'>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** Keys that are controls (held or pressed). */
const CONTROLS: Readonly<Record<string, Control>> = {
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  ControlLeft: 'crouch',
  ControlRight: 'crouch',
  // E uses whatever the prompt offers (a shop, a Spawn Car pad, the Pit Stop). C is the Garage, not crouch.
  KeyE: 'use',
  KeyV: 'viewToggle',
  F5: 'viewToggle',
};

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

/**
 * Desktop keyboard. Movement is held; controls report DOWN and UP to the
 * shared sink, exactly as the touch buttons do. Ctrl+Q drops the whole stack.
 */
export class KeyboardSource {
  private readonly held = { forward: false, back: false, left: false, right: false };

  constructor(private readonly sink: { down(control: Control): void; up(control: Control): void; releaseAll(): void }) {}

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  get moveX(): number {
    return (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
  }

  get moveZ(): number {
    return (this.held.forward ? 1 : 0) - (this.held.back ? 1 : 0);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isTyping(event.target)) return;
    const move = MOVE[event.code];
    if (move) {
      this.held[move] = true;
      if (event.code.startsWith('Arrow')) event.preventDefault();
    }
    const control = CONTROLS[event.code];
    if (control) {
      if (event.code === 'Space' || event.code === 'F5') event.preventDefault();
      if (!event.repeat) this.sink.down(control);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const move = MOVE[event.code];
    if (move) this.held[move] = false;
    const control = CONTROLS[event.code];
    if (control) {
      this.sink.up(control);
      if (control === 'drop') this.sink.up('dropAll');
    }
  };

  /** Losing focus must not leave a key stuck down. */
  private readonly onBlur = (): void => {
    this.held.forward = false;
    this.held.back = false;
    this.held.left = false;
    this.held.right = false;
    this.sink.releaseAll();
  };
}
