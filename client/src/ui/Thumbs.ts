import { crateDef, decorDef, type ShapeKey } from '@race/shared';
import { AmbientLight, Box3, DirectionalLight, DoubleSide, Group, HemisphereLight, Mesh, PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Object3D } from 'three';
import { MeshBuilder } from '../render/MeshBuilder.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { studPlastic } from '../render/Studs.js';
import { buildCar } from '../world/CarModel.js';
import { drawDecor } from '../world/DecorModels.js';
import { drawPiece } from '../world/TrackMesh.js';

/**
 * THUMBNAILS: every card in the shops shows the real thing - the car, the
 * track piece, the decoration, the crate - rendered once from a three-quarter
 * view on a small offscreen renderer and kept as an image.
 */

const W = 256;
const H = 176;
const pieceMaterial = studPlastic({ vertexColors: true, side: DoubleSide }, 0.6);

class Thumbs {
  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, W / H, 0.1, 200);
  private readonly cache = new Map<string, string>();

  private ready(): WebGLRenderer | null {
    if (this.renderer) return this.renderer;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      this.renderer.setSize(W, H, false);
      this.renderer.setClearColor(0x000000, 0);
      this.scene.add(new HemisphereLight(0xffffff, 0x8a9ab8, 1.6));
      this.scene.add(new AmbientLight(0xffffff, 0.35));
      const sun = new DirectionalLight(0xffffff, 1.6);
      sun.position.set(4, 8, 6);
      this.scene.add(sun);
    } catch {
      this.renderer = null;
    }
    return this.renderer;
  }

  private shoot(key: string, make: () => Object3D, yaw = 0.7, pitch = 0.42, zoom = 1): string {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const renderer = this.ready();
    if (!renderer) return '';
    const obj = make();
    const holder = new Group();
    holder.add(obj);
    this.scene.add(holder);
    const box = new Box3().setFromObject(holder);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3()).length();
    const dist = (size / 2 / Math.tan((this.camera.fov * Math.PI) / 360)) * 0.95 * zoom;
    this.camera.position.set(center.x + Math.sin(yaw) * Math.cos(pitch) * dist, center.y + Math.sin(pitch) * dist, center.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    this.camera.lookAt(center);
    renderer.render(this.scene, this.camera);
    const url = renderer.domElement.toDataURL('image/png');
    this.scene.remove(holder);
    holder.traverse((c) => {
      if (c instanceof Mesh && c.geometry && !key.startsWith('car:')) c.geometry.dispose();
    });
    this.cache.set(key, url);
    return url;
  }

  car(key: string): string {
    return this.shoot(`car:${key}`, () => buildCar(key).root, 0.85, 0.32, 0.9);
  }

  piece(k: ShapeKey): string {
    return this.shoot(`piece:${k}`, () => {
      const b = new MeshBuilder();
      drawPiece(b, { minX: 0, minZ: 0, rot: 0 }, { k, x: 0, z: 0, y: 0, r: 0 });
      return new Mesh(b.build(), pieceMaterial);
    }, 0.95, 0.6, 0.85);
  }

  decor(key: string): string {
    const def = decorDef(key);
    if (!def) return '';
    return this.shoot(`decor:${key}`, () => {
      const b = new PartBuilder();
      drawDecor(b, def, 0, 0, 0, 7);
      return b.build('thumb', false);
    }, 0.7, 0.45, 0.95);
  }

  crate(key: string): string {
    const def = crateDef(key);
    if (!def) return '';
    return this.shoot(`crate:${key}`, () => {
      const b = new PartBuilder();
      const [a, c] = def.colors;
      b.box(2, 1.6, 1.6, a, 'stud', { y: 0.8 });
      b.box(2.1, 0.5, 1.7, c, 'smooth', { y: 1.75 });
      for (const s of [-1, 1]) b.box(0.3, 1.62, 1.65, c, 'smooth', { x: s * 0.7, y: 0.8 });
      b.box(0.5, 0.5, 0.1, 0xffe14a, 'glow', { y: 1.2, z: 0.85 });
      b.box(0.24, 0.24, 0.12, 0x15172a, 'smooth', { y: 1.2, z: 0.9 });
      return b.build('thumb', false);
    }, 0.75, 0.42, 1.0);
  }
}

export const thumbs = new Thumbs();
