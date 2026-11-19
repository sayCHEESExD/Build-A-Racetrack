import {
  BackSide,
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  type Scene,
} from 'three';

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 top;
uniform vec3 bottom;
uniform vec3 below;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 c = h > 0.0 ? mix(bottom, top, pow(min(1.0, h * 1.6), 0.7)) : mix(bottom, below, min(1.0, -h * 2.5));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const CLOUD_CELL = 12;
const CLOUD_GRID = 34;

/**
 * THE SKY: a gradient dome that follows the camera, a square Minecraft sun,
 * and a layer of chunky 3D clouds drifting slowly east.
 */
export class Sky {
  readonly group = new Group();
  private readonly dome: Mesh;
  private readonly material: ShaderMaterial;
  private readonly sun: Mesh;
  private readonly clouds: InstancedMesh;
  private readonly cloudGroup = new Group();
  private drift = 0;
  private cloudY = 70;

  constructor(scene: Scene) {
    this.material = new ShaderMaterial({
      uniforms: { top: { value: new Color(0x6fa8ff) }, bottom: { value: new Color(0xc4dcff) }, below: { value: new Color(0x9cbce8) } },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: BackSide,
      depthWrite: false,
    });
    this.dome = new Mesh(new SphereGeometry(380, 24, 16), this.material);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this.sun = new Mesh(new PlaneGeometry(36, 36), new MeshBasicMaterial({ color: 0xfffbe0, fog: false, depthWrite: false }));
    this.sun.position.set(-160, 230, -140);
    this.sun.lookAt(0, 0, 0);
    this.sun.renderOrder = -9;
    this.group.add(this.sun);

    // Clouds: boxes on a grid wherever a seeded noise is high.
    const cells: [number, number][] = [];
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const field: number[] = [];
    for (let i = 0; i < CLOUD_GRID * CLOUD_GRID; i += 1) field.push(rand());
    const at = (x: number, z: number): number => field[((z + CLOUD_GRID) % CLOUD_GRID) * CLOUD_GRID + ((x + CLOUD_GRID) % CLOUD_GRID)]!;
    for (let z = 0; z < CLOUD_GRID; z += 1)
      for (let x = 0; x < CLOUD_GRID; x += 1) {
        const v = (at(x, z) * 2 + at(x + 1, z) + at(x, z + 1) + at(x - 1, z) + at(x, z - 1)) / 6;
        if (v > 0.56) cells.push([x, z]);
      }
    this.clouds = new InstancedMesh(
      new BoxGeometry(CLOUD_CELL, 4, CLOUD_CELL),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false }),
      cells.length,
    );
    const m = new Matrix4();
    const half = (CLOUD_GRID * CLOUD_CELL) / 2;
    cells.forEach(([x, z], i) => {
      m.makeTranslation(x * CLOUD_CELL - half, 0, z * CLOUD_CELL - half);
      this.clouds.setMatrixAt(i, m);
    });
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = 3;
    this.cloudGroup.add(this.clouds);
    this.group.add(this.cloudGroup);
    scene.add(this.group);
  }

  setColors(top: number, bottom: number, below: number): void {
    (this.material.uniforms.top!.value as Color).setHex(top);
    (this.material.uniforms.bottom!.value as Color).setHex(bottom);
    (this.material.uniforms.below!.value as Color).setHex(below);
  }

  setClouds(visible: boolean, y: number): void {
    this.cloudGroup.visible = visible;
    this.cloudY = y;
  }

  /** Follow the camera (the dome and sun never get closer). */
  update(delta: number, cx: number, cy: number, cz: number): void {
    this.dome.position.set(cx, cy, cz);
    this.sun.position.set(cx - 160, cy + 230, cz - 140);
    this.drift = (this.drift + delta * 1.4) % (CLOUD_GRID * CLOUD_CELL);
    const span = CLOUD_GRID * CLOUD_CELL;
    const ox = Math.round((cx - this.drift) / span) * span + this.drift;
    const oz = Math.round(cz / span) * span;
    this.cloudGroup.position.set(ox, this.cloudY, oz);
  }
}
