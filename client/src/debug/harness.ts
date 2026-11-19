import { FIRST_PERSON_ARM } from '../animation/PlayerAnimator.js';
import type { Game } from '../core/Game.js';

/**
 * DEV-ONLY test harness (`window.__t`), never in a production bundle.
 *
 * The in-app browser throttles requestAnimationFrame while tools run, so the
 * game is stepped by hand here and frames are captured straight off the
 * canvas: `step` runs frames, `shot` renders and returns the frame, `sheet`
 * lays captures out on one screen for a single screenshot.
 */
interface Harness {
  step(frames?: number): void;
  shot(): string;
  sheet(images?: string[], labels?: string[]): void;
  clear(): void;
  last: string[];
  /** The live first-person arm pose, for tuning. */
  fpArm: typeof FIRST_PERSON_ARM;
}

export const installHarness = (game: Game): void => {
  let overlay: HTMLDivElement | null = null;
  const harness: Harness = {
    last: [],
    fpArm: FIRST_PERSON_ARM,
    step(frames = 1) {
      for (let i = 0; i < frames; i += 1) game.update(1 / 60);
    },
    shot() {
      const image = game.capture();
      harness.last.push(image);
      return image;
    },
    sheet(images = harness.last, labels = []) {
      harness.clear();
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99;background:#111;display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:4px;padding:4px;overflow:auto';
      images.forEach((src, i) => {
        const cell = document.createElement('div');
        cell.style.cssText = 'position:relative';
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = 'width:100%;display:block';
        cell.append(img);
        if (labels[i]) {
          const tag = document.createElement('div');
          tag.textContent = labels[i] ?? '';
          tag.style.cssText = 'position:absolute;left:6px;top:4px;color:#fff;font:600 14px monospace;text-shadow:0 1px 2px #000';
          cell.append(tag);
        }
        overlay?.append(cell);
      });
      document.body.append(overlay);
    },
    clear() {
      overlay?.remove();
      overlay = null;
    },
  };
  (window as Window & { __t?: Harness }).__t = harness;
};
