import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * Click-to-select bone interaction.
 * Clicking on the VRM model selects the nearest poseable bone,
 * shows a visual indicator, and notifies a callback with the bone name.
 */

/** Bones that can be selected for posing */
export const POSEABLE_BONES: VRMHumanBoneName[] = [
  'hips' as VRMHumanBoneName,
  'spine' as VRMHumanBoneName,
  'chest' as VRMHumanBoneName,
  'upperChest' as VRMHumanBoneName,
  'neck' as VRMHumanBoneName,
  'head' as VRMHumanBoneName,
  'leftShoulder' as VRMHumanBoneName,
  'leftUpperArm' as VRMHumanBoneName,
  'leftLowerArm' as VRMHumanBoneName,
  'leftHand' as VRMHumanBoneName,
  'rightShoulder' as VRMHumanBoneName,
  'rightUpperArm' as VRMHumanBoneName,
  'rightLowerArm' as VRMHumanBoneName,
  'rightHand' as VRMHumanBoneName,
  'leftUpperLeg' as VRMHumanBoneName,
  'leftLowerLeg' as VRMHumanBoneName,
  'leftFoot' as VRMHumanBoneName,
  'rightUpperLeg' as VRMHumanBoneName,
  'rightLowerLeg' as VRMHumanBoneName,
  'rightFoot' as VRMHumanBoneName,
];

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let enabled = false;
let _vrm: VRM | null = null;
let _camera: THREE.PerspectiveCamera | null = null;
let _canvas: HTMLCanvasElement | null = null;
let _onSelect: ((boneName: VRMHumanBoneName | null) => void) | null = null;

let selectedBoneName: VRMHumanBoneName | null = null;

/** Visual indicator for selected bone */
let highlightRing: THREE.Object3D | null = null;
let axesHelper: THREE.Object3D | null = null;

/**
 * Find the nearest poseable bone to the given world-space point.
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

function onClick(e: PointerEvent): void {
  if (!enabled || !_vrm || !_camera || !_canvas) return;
  if (e.button !== 0) return;

  mouse.copy(getNDC(e));
  raycaster.setFromCamera(mouse, _camera);

  const meshes: THREE.Mesh[] = [];
  _vrm.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });

  const intersections = raycaster.intersectObjects(meshes, false);
  if (intersections.length === 0) {
    // Clicked empty space → deselect
    clearSelection();
    return;
  }

  const hit = intersections[0];
  const result = findNearestBone(_vrm, hit.point);
  if (!result) {
    clearSelection();
    return;
  }

  selectBone(result.name, result.bone);
}

function selectBone(name: VRMHumanBoneName, bone: THREE.Object3D): void {
  removeHighlight();
  selectedBoneName = name;
  showHighlight(bone);
  _onSelect?.(name);
}

function clearSelection(): void {
  removeHighlight();
  selectedBoneName = null;
  _onSelect?.(null);
}

function showHighlight(bone: THREE.Object3D): void {
  removeHighlight();

  // Ring indicator
  const ringGeo = new THREE.TorusGeometry(0.04, 0.005, 8, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xe94560,
    transparent: true,
    opacity: 0.8,
    depthTest: false,
  });
  highlightRing = new THREE.Mesh(ringGeo, ringMat);
  highlightRing.renderOrder = 999;
  bone.add(highlightRing);

  // Small axes helper to show orientation
  const size = 0.08;
  const axes = new THREE.Group();
  axes.renderOrder = 999;

  // X axis (red)
  const xGeo = new THREE.CylinderGeometry(0.003, 0.003, size, 4);
  const xMat = new THREE.MeshBasicMaterial({ color: 0xff4444, depthTest: false });
  const xMesh = new THREE.Mesh(xGeo, xMat);
  xMesh.rotation.z = -Math.PI / 2;
  xMesh.position.x = size / 2;
  xMesh.renderOrder = 999;
  axes.add(xMesh);

  // Y axis (green)
  const yGeo = new THREE.CylinderGeometry(0.003, 0.003, size, 4);
  const yMat = new THREE.MeshBasicMaterial({ color: 0x44ff44, depthTest: false });
  const yMesh = new THREE.Mesh(yGeo, yMat);
  yMesh.position.y = size / 2;
  yMesh.renderOrder = 999;
  axes.add(yMesh);

  // Z axis (blue)
  const zGeo = new THREE.CylinderGeometry(0.003, 0.003, size, 4);
  const zMat = new THREE.MeshBasicMaterial({ color: 0x4444ff, depthTest: false });
  const zMesh = new THREE.Mesh(zGeo, zMat);
  zMesh.rotation.x = Math.PI / 2;
  zMesh.position.z = size / 2;
  zMesh.renderOrder = 999;
  axes.add(zMesh);

  bone.add(axes);
  axesHelper = axes;
}

function removeHighlight(): void {
  if (highlightRing && highlightRing.parent) {
    highlightRing.parent.remove(highlightRing);
    if (highlightRing instanceof THREE.Mesh) {
      highlightRing.geometry.dispose();
      (highlightRing.material as THREE.Material).dispose();
    }
  }
  highlightRing = null;

  if (axesHelper && axesHelper.parent) {
    axesHelper.parent.remove(axesHelper);
    axesHelper.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
  axesHelper = null;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Initialize bone selector on the canvas.
 */
export function initBoneSelector(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
): void {
  _canvas = canvas;
  _camera = camera;

  canvas.addEventListener('pointerdown', onClick);
}

/**
 * Set the VRM model to select bones from.
 */
export function setBoneSelectorVRM(vrm: VRM | null): void {
  _vrm = vrm;
  clearSelection();
}

/**
 * Enable or disable bone selection.
 */
export function setBoneSelectorEnabled(on: boolean): void {
  enabled = on;
  if (!on) clearSelection();
}

/**
 * Register a callback when a bone is selected or deselected.
 */
export function onBoneSelected(
  cb: (boneName: VRMHumanBoneName | null) => void,
): void {
  _onSelect = cb;
}

/**
 * Get the currently selected bone name.
 */
export function getSelectedBoneName(): VRMHumanBoneName | null {
  return selectedBoneName;
}

/**
 * Programmatically select a bone by name.
 */
export function selectBoneByName(name: VRMHumanBoneName | null): void {
  if (!_vrm) return;
  if (!name) {
    clearSelection();
    return;
  }
  const bone = _vrm.humanoid?.getNormalizedBoneNode(name);
  if (bone) {
    selectBone(name, bone);
  }
}
