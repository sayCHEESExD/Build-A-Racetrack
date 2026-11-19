import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';

export interface LabelLine {
  text: string;
  color?: string;
  size?: number;
  pixel?: boolean;
}

export const PIXEL_FONT = '"Silkscreen", "Press Start 2P", monospace';
export const UI_FONT = '"Fredoka", "Rubik", "Segoe UI", system-ui, sans-serif';

/**
 * A floating text panel in the world (shop names, generator timers): a
 * canvas sprite that redraws only when its text changes.
 */
export class Label {
  readonly sprite: Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private key = '';

  constructor(
    private readonly worldHeight = 0.9,
    private readonly background = 'rgba(20,22,30,0.55)',
  ) {
    this.canvas.width = 512;
    this.canvas.height = 128;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, depthWrite: false, transparent: true }));
    this.sprite.renderOrder = 8;
  }

  set(lines: LabelLine[]): void {
    const key = lines.map((l) => `${l.text}|${l.color}|${l.size}`).join('\n');
    if (key === this.key) return;
    this.key = key;
    const ctx = this.canvas.getContext('2d')!;
    const sizes = lines.map((l) => l.size ?? 34);
    const height = sizes.reduce((a, b) => a + b * 1.25, 0) + 16;
    ctx.font = `700 ${sizes[0]}px ${UI_FONT}`;
    let width = 0;
    lines.forEach((l, i) => {
      ctx.font = `${l.pixel ? 400 : 700} ${sizes[i]}px ${l.pixel ? PIXEL_FONT : UI_FONT}`;
      width = Math.max(width, ctx.measureText(l.text).width);
    });
    width = Math.ceil(width + 36);
    this.canvas.width = Math.min(1024, Math.max(64, width));
    this.canvas.height = Math.ceil(height);
    const c = this.canvas.getContext('2d')!;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.background) {
      c.fillStyle = this.background;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    let y = 8;
    lines.forEach((l, i) => {
      const s = sizes[i]!;
      c.font = `${l.pixel ? 400 : 700} ${s}px ${l.pixel ? PIXEL_FONT : UI_FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.lineWidth = Math.max(3, s / 7);
      c.strokeStyle = 'rgba(0,0,0,0.75)';
      c.strokeText(l.text, this.canvas.width / 2, y);
      c.fillStyle = l.color ?? '#ffffff';
      c.fillText(l.text, this.canvas.width / 2, y);
      y += s * 1.25;
    });
    (this.sprite.material as SpriteMaterial).map?.dispose();
    (this.sprite.material as SpriteMaterial).map = new CanvasTexture(this.canvas);
    const map = (this.sprite.material as SpriteMaterial).map!;
    map.colorSpace = SRGBColorSpace;
    map.minFilter = LinearFilter;
    (this.sprite.material as SpriteMaterial).needsUpdate = true;
    const aspect = this.canvas.width / this.canvas.height;
    const h = this.worldHeight * (this.canvas.height / 64);
    this.sprite.scale.set(h * aspect * 0.5, h * 0.5, 1);
  }

  dispose(): void {
    (this.sprite.material as SpriteMaterial).map?.dispose();
    (this.sprite.material as SpriteMaterial).dispose();
    this.sprite.removeFromParent();
  }
}
