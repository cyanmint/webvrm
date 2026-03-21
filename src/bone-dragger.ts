import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Interactive bone dragging: click on the VRM model's limbs and drag to pose.
 * Uses raycasting to identify the nearest poseable bone and rotates it
 * based on mouse movement.
 */

/** Bones that can be posed by dragging */
const POSEABLE_BONES: VRMHumanBoneName[] = [
  'leftUpperArm' as VRMHumanBoneName,
  'leftLowerArm' as VRMHumanBoneName,
  'rightUpperArm' as VRMHumanBoneName,
  'rightLowerArm' as VRMHumanBoneName,
  'leftUpperLeg' as VRMHumanBoneName,
  'leftLowerLeg' as VRMHumanBoneName,
  'rightUpperLeg' as VRMHumanBoneName,
  'rightLowerLeg' as VRMHumanBoneName,
  'spine' as VRMHumanBoneName,
  'head' as VRMHumanBoneName,
];

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let activeBone: THREE.Object3D | null = null;
let isDragging = false;
let prevMouse = new THREE.Vector2();
let dragStartQ = new THREE.Quaternion();
let enabled = false;

let _vrm: VRM | null = null;
let _camera: THREE.PerspectiveCamera | null = null;
let _canvas: HTMLCanvasElement | null = null;
let _controls: OrbitControls | null = null;

/** Highlighted bone overlay */
let highlightHelper: THREE.Object3D | null = null;

/**
 * Find the nearest poseable bone to the raycast intersection point.
 */
function findNearestBone(
  vrm: VRM,
  point: THREE.Vector3,
): { bone: THREE.Object3D; name: VRMHumanBoneName } | null {
  let closest: THREE.Object3D | null = null;
  let closestName: VRMHumanBoneName | null = null;
  let closestDist = Infinity;

  for (const name of POSEABLE_BONES) {
    const bone = vrm.humanoid?.getNormalizedBoneNode(name);
    if (!bone) continue;

    // Get bone's world position
    const boneWorldPos = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPos);
    const dist = boneWorldPos.distanceTo(point);

    if (dist < closestDist) {
      closestDist = dist;
      closest = bone;
      closestName = name;
    }
  }

  if (closest && closestName && closestDist < 0.5) {
    return { bone: closest, name: closestName };
  }
  return null;
}

function getNDC(e: PointerEvent): THREE.Vector2 {
  if (!_canvas) return new THREE.Vector2();
  const rect = _canvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

function onPointerDown(e: PointerEvent): void {
  if (!enabled || !_vrm || !_camera || !_canvas) return;
  if (e.button !== 0) return; // left click only

  mouse.copy(getNDC(e));
  raycaster.setFromCamera(mouse, _camera);

  const meshes: THREE.Mesh[] = [];
  _vrm.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });

  const intersections = raycaster.intersectObjects(meshes, false);
  if (intersections.length === 0) return;

  const hit = intersections[0];
  const result = findNearestBone(_vrm, hit.point);
  if (!result) return;

  isDragging = true;
  activeBone = result.bone;
  dragStartQ.copy(activeBone.quaternion);
  prevMouse.copy(mouse);

  // Disable orbit controls while dragging a bone
  if (_controls) _controls.enabled = false;

  // Show highlight
  showBoneHighlight(result.bone);

  _canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e: PointerEvent): void {
  if (!isDragging || !activeBone || !_camera || !_canvas) return;

  const current = getNDC(e);
  const dx = current.x - prevMouse.x;
  const dy = current.y - prevMouse.y;

  // Convert screen-space delta to rotation around camera-relative axes
  const sensitivity = 3.0;

  // Get camera right and up vectors for intuitive rotation
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  camRight.setFromMatrixColumn(_camera.matrixWorld, 0);
  camUp.setFromMatrixColumn(_camera.matrixWorld, 1);

  // Rotate around camera-up for horizontal drag, camera-right for vertical
  const deltaQ = new THREE.Quaternion()
    .setFromAxisAngle(camUp, dx * sensitivity)
    .multiply(
      new THREE.Quaternion().setFromAxisAngle(camRight, -dy * sensitivity),
    );

  // Convert world-space rotation to local bone space
  const parentWorldQ = new THREE.Quaternion();
  if (activeBone.parent) {
    activeBone.parent.getWorldQuaternion(parentWorldQ);
  }
  const parentInv = parentWorldQ.clone().invert();

  // localDeltaQ = parentInv * deltaQ * parentWorldQ
  const localDelta = parentInv
    .clone()
    .multiply(deltaQ)
    .multiply(parentWorldQ);

  // Apply incremental rotation
  activeBone.quaternion.premultiply(localDelta);

  prevMouse.copy(current);
}

function onPointerUp(e: PointerEvent): void {
  if (!isDragging) return;

  isDragging = false;
  activeBone = null;

  // Re-enable orbit controls
  if (_controls) _controls.enabled = true;

  // Remove highlight
  removeBoneHighlight();

  if (_canvas) _canvas.releasePointerCapture(e.pointerId);
}

function showBoneHighlight(bone: THREE.Object3D): void {
  removeBoneHighlight();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0xe94560,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
    }),
  );
  sphere.renderOrder = 999;
  bone.add(sphere);
  highlightHelper = sphere;
}

function removeBoneHighlight(): void {
  if (highlightHelper && highlightHelper.parent) {
    highlightHelper.parent.remove(highlightHelper);
    if (highlightHelper instanceof THREE.Mesh) {
      highlightHelper.geometry.dispose();
      (highlightHelper.material as THREE.Material).dispose();
    }
  }
  highlightHelper = null;
}

/**
 * Initialize the bone dragger on the given canvas.
 */
export function initBoneDragger(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
): void {
  _canvas = canvas;
  _camera = camera;
  _controls = controls;

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
}

/**
 * Update which VRM model the bone dragger targets.
 */
export function setBoneDraggerVRM(vrm: VRM | null): void {
  _vrm = vrm;
}

/**
 * Enable or disable bone dragging.
 */
export function setBoneDraggerEnabled(on: boolean): void {
  enabled = on;
  if (!on && isDragging) {
    isDragging = false;
    activeBone = null;
    removeBoneHighlight();
    if (_controls) _controls.enabled = true;
  }
}

/**
 * Whether bone dragging is currently enabled.
 */
export function isBoneDraggerEnabled(): boolean {
  return enabled;
}
