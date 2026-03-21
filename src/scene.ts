import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  ambientLight: THREE.AmbientLight;
  directionalLight: THREE.DirectionalLight;
  grid: THREE.GridHelper;
  clock: THREE.Clock;
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 1.4, 1.2);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.update();

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(1, 2, 1);
  scene.add(directionalLight);

  // Ground grid for reference
  const grid = new THREE.GridHelper(10, 20, 0x2a2a4a, 0x2a2a4a);
  scene.add(grid);

  const clock = new THREE.Clock();

  return { scene, camera, renderer, controls, ambientLight, directionalLight, grid, clock };
}

export function resizeRenderer(ctx: SceneContext, container: HTMLElement): void {
  const w = container.clientWidth;
  const h = container.clientHeight;
  ctx.renderer.setSize(w, h);
  ctx.camera.aspect = w / h;
  ctx.camera.updateProjectionMatrix();
}

export function resetCamera(ctx: SceneContext): void {
  ctx.camera.position.set(0, 1.4, 1.2);
  ctx.controls.target.set(0, 1.2, 0);
  ctx.controls.update();
}

export type CameraMode = 'rotate' | 'pan';

/**
 * Switch between orbit-rotate and pan camera modes.
 * In 'rotate' mode (default): left-click rotates around target.
 * In 'pan' mode: left-click pans the camera.
 */
export function setCameraMode(ctx: SceneContext, mode: CameraMode): void {
  if (mode === 'pan') {
    ctx.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
  } else {
    ctx.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
  }
}
