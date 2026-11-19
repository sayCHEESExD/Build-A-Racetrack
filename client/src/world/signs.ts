import { BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

/** Pixels per world unit on painted signs. */
const SIGN_PPU = 96;

export const FONT = 'Fredoka, Rubik, "Segoe UI", sans-serif';

/** Set the largest font up to `size` px at which `text` fits `width` px; returns the size used. */
export const fitText = (c: CanvasRenderingContext2D, text: string, size: number, width: number, weight = 800): number => {
  let px = size;
  c.font = `${weight} ${px}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > width) px = Math.max(6, Math.floor((px * width) / w));
  c.font = `${weight} ${px}px ${FONT}`;
  return px;
};

/** Outlined cartoon text (the Roblox sign look). */
export const strokeText = (c: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, px: number, outline = 'rgba(0,0,0,0.6)'): void => {
  c.lineJoin = 'round';
  c.lineWidth = Math.max(3, px / 6);
  c.strokeStyle = outline;
  c.strokeText(text, x, y);
  c.fillStyle = fill;
  c.fillText(text, x, y);
};

export const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/**
 * A FRAMED SIGN: a coloured board with its painted face just in front (4 cm
 * proud: no z-fighting). The face's canvas has the face's own proportions,
 * text shrinks to fit. Local +Z is the front.
 */
export const signBoard = (text: string, sub: string, bg: string, fg: string, w: number, h: number, border = 0xffffff): Group => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * SIGN_PPU);
  canvas.height = Math.round(h * SIGN_PPU);
  const W = canvas.width;
  const H = canvas.height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(0,0,0,0.16)';
  c.fillRect(0, H * 0.84, W, H * 0.16);
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.fillRect(0, 0, W, H * 0.12);
  const pad = Math.round(H * 0.1);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const main = fitText(c, text, Math.round(H * (sub ? 0.46 : 0.62)), W - pad * 2);
  strokeText(c, text, W / 2, sub ? H * 0.38 : H / 2, fg, main);
  if (sub) {
    const s = fitText(c, sub, Math.round(H * 0.22), W - pad * 2, 700);
    strokeText(c, sub, W / 2, H * 0.76, '#ffffff', s);
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  const group = new Group();
  const frame = new Mesh(new BoxGeometry(w + 0.3, h + 0.3, 0.24), new MeshLambertMaterial({ color: border }));
  frame.position.z = -0.12;
  frame.castShadow = true;
  const face = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: t }));
  face.position.z = 0.04;
  group.add(frame, face);
  return group;
};

/** A painted panel whose canvas can be redrawn (owner names, counts, boards). */
export class LivePanel {
  readonly mesh: Mesh;
  readonly canvas = document.createElement('canvas');
  readonly texture: CanvasTexture;
  private key = '';

  constructor(
    readonly w: number,
    readonly h: number,
    ppu = 64,
  ) {
    this.canvas.width = Math.round(w * ppu);
    this.canvas.height = Math.round(h * ppu);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: this.texture, transparent: true }));
  }

  /** Redraw only when the key changes. */
  draw(key: string, paint: (c: CanvasRenderingContext2D, W: number, H: number) => void): void {
    if (key === this.key) return;
    this.key = key;
    const c = this.canvas.getContext('2d')!;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    paint(c, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }
}
