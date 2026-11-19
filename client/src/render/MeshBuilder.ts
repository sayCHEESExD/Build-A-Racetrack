import { BufferAttribute, BufferGeometry, Color } from 'three';

const C = new Color();

/**
 * Accumulates flat-shaded, vertex-coloured quads and boxes into one buffer
 * (a whole racetrack is one draw call).
 */
export class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];

  /** A quad a-b-c-d (counter-clockwise seen from outside). */
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], color: number): void {
    const ux = b[0]! - a[0]!;
    const uy = b[1]! - a[1]!;
    const uz = b[2]! - a[2]!;
    const vx = c[0]! - a[0]!;
    const vy = c[1]! - a[1]!;
    const vz = c[2]! - a[2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    C.setHex(color);
    for (const p of [a, b, c, a, c, d]) {
      this.pos.push(p[0]!, p[1]!, p[2]!);
      this.nor.push(nx, ny, nz);
      this.col.push(C.r, C.g, C.b);
    }
  }

  /** An oriented box: centre, three unit axes and half sizes. */
  box(cx: number, cy: number, cz: number, ax: readonly number[], ay: readonly number[], az: readonly number[], hx: number, hy: number, hz: number, color: number): void {
    const corner = (sx: number, sy: number, sz: number): number[] => [
      cx + ax[0]! * hx * sx + ay[0]! * hy * sy + az[0]! * hz * sz,
      cy + ax[1]! * hx * sx + ay[1]! * hy * sy + az[1]! * hz * sz,
      cz + ax[2]! * hx * sx + ay[2]! * hy * sy + az[2]! * hz * sz,
    ];
    const p = [corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1), corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)];
    const shade = (k: number): number => C.setHex(color).multiplyScalar(k).getHex();
    this.quad(p[4]!, p[5]!, p[6]!, p[7]!, color);
    this.quad(p[1]!, p[0]!, p[3]!, p[2]!, shade(0.85));
    this.quad(p[5]!, p[1]!, p[2]!, p[6]!, shade(0.92));
    this.quad(p[0]!, p[4]!, p[7]!, p[3]!, shade(0.92));
    this.quad(p[3]!, p[7]!, p[6]!, p[2]!, color);
    this.quad(p[0]!, p[1]!, p[5]!, p[4]!, shade(0.7));
  }

  /** An axis-aligned box by centre and size. */
  cube(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: number): void {
    this.box(cx, cy, cz, X, Y, Z, w / 2, h / 2, d / 2, color);
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.computeBoundingSphere();
    this.pos = [];
    this.nor = [];
    this.col = [];
    return g;
  }
}

export const X: readonly number[] = [1, 0, 0];
export const Y: readonly number[] = [0, 1, 0];
export const Z: readonly number[] = [0, 0, 1];

/** Shade a hex colour by a factor. */
export const shadeHex = (hex: number, k: number): number => C.setHex(hex).multiplyScalar(k).getHex();
