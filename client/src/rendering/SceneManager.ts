import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, Scene } from 'three';

/**
 * The scene root and Roblox's bright daylight: a sky/ground hemisphere, a
 * little ambient, and the sun - which casts the shadows (it follows the
 * player, so its shadow box only has to cover what is near).
 */
export class SceneManager {
  readonly scene = new Scene();
  readonly hemi: HemisphereLight;
  readonly ambient: AmbientLight;
  readonly sun: DirectionalLight;
  readonly fog = new Fog(0xb7d2ff, 60, 170);
  private readonly background = new Color(0xc4dcff);

  constructor() {
    this.scene.fog = this.fog;
    this.scene.background = this.background;
    this.hemi = new HemisphereLight(0xdfefff, 0x8a8478, 1.5);
    this.hemi.position.set(0, 80, 0);
    this.scene.add(this.hemi);
    this.ambient = new AmbientLight(0xffffff, 0.45);
    this.scene.add(this.ambient);
    this.sun = new DirectionalLight(0xfff4e0, 1.9);
    this.sun.position.set(-60, 120, -40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -48;
    cam.right = 48;
    cam.top = 48;
    cam.bottom = -48;
    cam.near = 1;
    cam.far = 320;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  setAtmosphere(background: number, fog: number, near: number, far: number): void {
    this.background.setHex(background);
    this.fog.color.setHex(fog);
    this.fog.near = near;
    this.fog.far = far;
  }

  followSun(x: number, z: number): void {
    // Snap to whole blocks so the shadows do not shimmer as you walk.
    x = Math.round(x);
    z = Math.round(z);
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x - 60, 120, z - 40);
    this.sun.target.updateMatrixWorld();
  }
}
