import { visibleName } from '@race/shared';
import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';

const W = 256;
const H = 72;

/**
 * NAMEPLATE over a player: the name, and under it a coloured
 * square and a health bar (green, red when low). Repainted only on change.
 */
export class NameTag {
  readonly sprite: Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: CanvasTexture;
  private painted = '';

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    const material = new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, fog: false });
    this.sprite = new Sprite(material);
    this.sprite.scale.set(1.15, 0.32, 1);
    this.sprite.renderOrder = 5;
  }

  /** `health` 0..1, or < 0 for no bar (the lobby). An ENEMY's bar is red; a teammate's green (amber, then red, when low). */
  set(name: string, teamCss: string | null, health: number, color = '#ffffff', enemy = false): void {
    const text = visibleName(name);
    const hp = health < 0 ? -1 : Math.round(health * 40) / 40;
    const key = `${text}|${teamCss}|${hp}|${color}|${enemy}`;
    if (key === this.painted) return;
    this.painted = key;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    ctx.font = `600 24px "Rubik", "Segoe UI", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(text, W / 2, 16, W - 8);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, 16, W - 8);
    if (hp >= 0) {
      const x0 = 34;
      const bw = W - 68;
      const y0 = 38;
      const bh = 20;
      if (teamCss) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x0 - 26, y0 - 2, 24, bh + 4);
        ctx.fillStyle = teamCss;
        ctx.fillRect(x0 - 24, y0, 20, bh);
      }
      ctx.fillStyle = 'rgba(20,20,20,0.6)';
      ctx.fillRect(x0, y0, bw, bh);
      ctx.fillStyle = enemy ? '#ff3b3b' : hp > 0.35 ? '#5cf24a' : hp > 0.15 ? '#ffc93c' : '#ff4a3a';
      ctx.fillRect(x0 + 2, y0 + 2, Math.max(0, (bw - 4) * hp), bh - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x0 + bw / 2 - 1, y0 + 2, 2, bh - 4);
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    (this.sprite.material as SpriteMaterial).dispose();
    this.sprite.removeFromParent();
  }
}
