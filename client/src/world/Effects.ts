import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
  type Scene,
} from 'three';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  gravity: number;
  r: number;
  g: number;
  b: number;
  spin: number;
}

const MAX = 900;
const M = new Matrix4();
const Q = new Quaternion();
const S = new Vector3();
const P = new Vector3();
const AXIS = new Vector3(0.3, 1, 0.2).normalize();
const C = new Color();

interface Ring {
  mesh: Mesh;
  life: number;
  max: number;
  size: number;
}

/**
 * PARTICLES: one instanced mesh of little cubes - block debris in the
 * block's colours, red hit sparks, white crit stars, explosion fire and
 * smoke, flames, sparkles - plus expanding rings for slams and alarms.
 */
export class Effects {
  private readonly mesh: InstancedMesh;
  private readonly glow: InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly glows: Particle[] = [];
  private readonly rings: Ring[] = [];
  private readonly ringGeometry = new RingGeometry(0.8, 1, 32);

  constructor(private readonly scene: Scene) {
    const geo = new BoxGeometry(1, 1, 1);
    this.mesh = new InstancedMesh(geo, new MeshBasicMaterial({ color: 0xffffff }), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.glow = new InstancedMesh(geo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }), 400);
    this.glow.instanceMatrix.setUsage(DynamicDrawUsage);
    this.glow.count = 0;
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 5;
    scene.add(this.mesh, this.glow);
  }

  private add(list: Particle[], cap: number, p: Particle): void {
    if (list.length >= cap) list.shift();
    list.push(p);
  }

  /** A spray of cubes. */
  burst(x: number, y: number, z: number, count: number, colors: readonly number[], speed: number, size: number, life: number, gravity = 18, glow = false): void {
    for (let i = 0; i < count; i += 1) {
      const c = colors[Math.floor(Math.random() * colors.length)] ?? 0xffffff;
      C.setHex(c);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 2 - 0.6;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.add(glow ? this.glows : this.particles, glow ? 400 : MAX, {
        x: x + (Math.random() - 0.5) * 0.3,
        y: y + (Math.random() - 0.5) * 0.3,
        z: z + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(a) * s,
        vy: up * s,
        vz: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        size: size * (0.6 + Math.random() * 0.7),
        gravity,
        r: C.r,
        g: C.g,
        b: C.b,
        spin: Math.random() * 6,
      });
    }
  }

  hit(x: number, y: number, z: number, crit: boolean): void {
    this.burst(x, y, z, crit ? 14 : 8, crit ? [0xffffff, 0xd8e8ff, 0xfff2a0] : [0xc81e1e, 0x8a1010, 0xff4040], crit ? 5 : 3.2, 0.09, 0.45, 12, crit);
  }

  explosion(x: number, y: number, z: number, radius: number): void {
    this.burst(x, y, z, 40, [0xffd23a, 0xff8a1a, 0xff4a1a], 7 + radius * 2, 0.3, 0.5, 2, true);
    this.burst(x, y, z, 30, [0x5a5a5a, 0x3a3a3a, 0x8a8a8a], 4 + radius, 0.45, 1.4, -1.5);
    this.ring(x, y, z, radius * 2.2, 0xffe0a0, 0.35);
  }

  flame(x: number, y: number, z: number, dx: number, dz: number): void {
    for (let i = 0; i < 10; i += 1) {
      C.setHex([0xffd23a, 0xff8a1a, 0xff3a0a][i % 3]!);
      const s = 7 + Math.random() * 4;
      this.add(this.glows, 400, {
        x,
        y,
        z,
        vx: (dx + (Math.random() - 0.5) * 0.5) * s,
        vy: (Math.random() - 0.3) * 2,
        vz: (dz + (Math.random() - 0.5) * 0.5) * s,
        life: 0.5,
        max: 0.5,
        size: 0.25,
        gravity: -2,
        r: C.r,
        g: C.g,
        b: C.b,
        spin: 3,
      });
    }
  }

  sparkle(x: number, y: number, z: number, color: number, count = 12): void {
    this.burst(x, y, z, count, [color, 0xffffff], 2.2, 0.08, 0.9, -1.5, true);
  }

  smoke(x: number, y: number, z: number): void {
    this.burst(x, y, z, 6, [0xbdbdbd, 0x8a8a8a], 0.9, 0.25, 1, -1.2);
  }

  death(x: number, y: number, z: number, color: number): void {
    this.burst(x, y + 0.9, z, 26, [color, 0xffffff, 0xdddddd], 3.5, 0.18, 1, 4);
  }

  ring(x: number, y: number, z: number, size: number, color: number, life = 0.5): void {
    const mesh = new Mesh(this.ringGeometry, new MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: 2 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.05, z);
    this.scene.add(mesh);
    this.rings.push({ mesh, life, max: life, size });
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    this.step(this.particles, this.mesh, dt);
    this.step(this.glows, this.glow, dt);
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const r = this.rings[i]!;
      r.life -= dt;
      const t = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.2 + r.size * t);
      (r.mesh.material as MeshBasicMaterial).opacity = Math.max(0, 1 - t);
      if (r.life <= 0) {
        r.mesh.removeFromParent();
        (r.mesh.material as MeshBasicMaterial).dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  private step(list: Particle[], mesh: InstancedMesh, dt: number): void {
    let n = 0;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const p = list[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.vx *= 1 - 0.8 * dt;
      p.vz *= 1 - 0.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    for (const p of list) {
      if (n >= mesh.instanceMatrix.count) break;
      const k = Math.min(1, (p.life / p.max) * 2);
      Q.setFromAxisAngle(AXIS, p.spin * p.life);
      S.setScalar(p.size * k);
      P.set(p.x, p.y, p.z);
      M.compose(P, Q, S);
      mesh.setMatrixAt(n, M);
      C.setRGB(p.r, p.g, p.b);
      mesh.setColorAt(n, C);
      n += 1;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
