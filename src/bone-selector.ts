import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Click-to-select bone interaction with draggable rotation handles.
 * Clicking on the VRM model selects the nearest poseable bone,
 * shows draggable axis handles, and notifies a callback with the bone name.
 * Dragging a handle rotates the bone around that axis.
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
let _controls: OrbitControls | null = null;
let _onSelect: ((boneName: VRMHumanBoneName | null) => void) | null = null;
let _onRotate: ((boneName: VRMHumanBoneName) => void) | null = null;

let selectedBoneName: VRMHumanBoneName | null = null;

/** Visual indicator for selected bone */
let highlightRing: THREE.Object3D | null = null;
let axesHelper: THREE.Object3D | null = null;

/** Drag state for axis rotation */
type DragAxis = 'x' | 'y' | 'z';
let dragging = false;
let dragAxis: DragAxis | null = null;
let dragStartNDC = new THREE.Vector2();
let dragStartQuat = new THREE.Quaternion();
let dragBone: THREE.Object3D | null = null;

/** Track axis handle meshes for raycasting */
let xHandle: THREE.Mesh | null = null;
let yHandle: THREE.Mesh | null = null;
let zHandle: THREE.Mesh | null = null;

// Hover highlight: original colors for handles
const HANDLE_COLORS: Record<DragAxis, number> = { x: 0xff4444, y: 0x44ff44, z: 0x4444ff };
const HANDLE_HOVER: Record<DragAxis, number> = { x: 0xff8888, y: 0x88ff88, z: 0x8888ff };

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

/**
 * Check if the pointer hits one of the axis handles. Returns the axis or null.
 */
function hitTestHandles(ndc: THREE.Vector2): DragAxis | null {
  if (!_camera || !xHandle || !yHandle || !zHandle) return null;
  raycaster.setFromCamera(ndc, _camera);
  const handles = [xHandle, yHandle, zHandle];
  const hits = raycaster.intersectObjects(handles, false);
  if (hits.length === 0) return null;
  const hit = hits[0].object;
  if (hit === xHandle) return 'x';
  if (hit === yHandle) return 'y';
  if (hit === zHandle) return 'z';
  return null;
}

function onPointerDown(e: PointerEvent): void {
  if (!enabled || !_vrm || !_camera || !_canvas) return;
  if (e.button !== 0) return;

  const ndc = getNDC(e);

  // First check if clicking on an axis handle (only if a bone is selected)
  if (selectedBoneName && axesHelper) {
    const axis = hitTestHandles(ndc);
    if (axis) {
      // Start dragging this axis
      dragging = true;
      dragAxis = axis;
      dragStartNDC.copy(ndc);

      const bone = _vrm.humanoid?.getNormalizedBoneNode(selectedBoneName);
      if (bone) {
        dragBone = bone;
        dragStartQuat.copy(bone.quaternion);
      }

      // Disable orbit controls during axis drag
      if (_controls) _controls.enabled = false;
      _canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
  }

  // Otherwise, do normal bone selection via raycast on VRM meshes
  mouse.copy(ndc);
  raycaster.setFromCamera(mouse, _camera);

  const meshes: THREE.Mesh[] = [];
  _vrm.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });

  const intersections = raycaster.intersectObjects(meshes, false);
  if (intersections.length === 0) {
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

function onPointerMove(e: PointerEvent): void {
  if (!_canvas || !_camera) return;

  const ndc = getNDC(e);

  // Handle dragging rotation
  if (dragging && dragAxis && dragBone && selectedBoneName) {
    const dx = ndc.x - dragStartNDC.x;
    const dy = ndc.y - dragStartNDC.y;

    // Use screen-space movement to compute rotation angle
    // Horizontal drag → rotation amount, adjusted per axis orientation
    const sensitivity = 3.0; // radians per full-screen drag
    let angle: number;
    if (dragAxis === 'y') {
      angle = dx * sensitivity;
    } else {
      // For X and Z axes, use a combination of dx/dy for more intuitive feel
      angle = (dx + dy) * sensitivity;
    }

    // Apply: start from original quaternion, then rotate around the chosen local axis
    const axisVec =
      dragAxis === 'x' ? new THREE.Vector3(1, 0, 0) :
      dragAxis === 'y' ? new THREE.Vector3(0, 1, 0) :
                         new THREE.Vector3(0, 0, 1);
    const deltaQ = new THREE.Quaternion().setFromAxisAngle(axisVec, angle);
    dragBone.quaternion.copy(dragStartQuat).multiply(deltaQ);

    // Notify for slider sync
    _onRotate?.(selectedBoneName);
    return;
  }

  // Hover highlight on axis handles
  if (enabled && selectedBoneName && axesHelper && !dragging) {
    const axis = hitTestHandles(ndc);
    resetHandleColors();
    if (axis) {
      const handle =
        axis === 'x' ? xHandle :
        axis === 'y' ? yHandle : zHandle;
      if (handle) {
        (handle.material as THREE.MeshBasicMaterial).color.setHex(HANDLE_HOVER[axis]);
      }
      _canvas.style.cursor = 'grab';
    } else {
      _canvas.style.cursor = '';
    }
  }
}

function onPointerUp(e: PointerEvent): void {
  if (dragging) {
    dragging = false;
    dragAxis = null;
    dragBone = null;
    // Re-enable orbit controls
    if (_controls) _controls.enabled = true;
    if (_canvas) {
      _canvas.releasePointerCapture(e.pointerId);
      _canvas.style.cursor = '';
    }
    resetHandleColors();
  }
}

function resetHandleColors(): void {
  if (xHandle) (xHandle.material as THREE.MeshBasicMaterial).color.setHex(HANDLE_COLORS.x);
  if (yHandle) (yHandle.material as THREE.MeshBasicMaterial).color.setHex(HANDLE_COLORS.y);
  if (zHandle) (zHandle.material as THREE.MeshBasicMaterial).color.setHex(HANDLE_COLORS.z);
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

  // Draggable axes handles - larger for easier interaction
  const size = 0.1;
  const thickness = 0.008;
  const axes = new THREE.Group();
  axes.renderOrder = 999;

  // X axis (red) - draggable handle
  const xGeo = new THREE.CylinderGeometry(thickness, thickness, size, 6);
  const xMat = new THREE.MeshBasicMaterial({ color: HANDLE_COLORS.x, depthTest: false });
  xHandle = new THREE.Mesh(xGeo, xMat);
  xHandle.rotation.z = -Math.PI / 2;
  xHandle.position.x = size / 2;
  xHandle.renderOrder = 999;
  axes.add(xHandle);

  // X arrow tip
  const xTipGeo = new THREE.ConeGeometry(thickness * 2.5, 0.02, 6);
  const xTipMat = new THREE.MeshBasicMaterial({ color: HANDLE_COLORS.x, depthTest: false });
  const xTip = new THREE.Mesh(xTipGeo, xTipMat);
  xTip.rotation.z = -Math.PI / 2;
  xTip.position.x = size + 0.01;
  xTip.renderOrder = 999;
  axes.add(xTip);

  // Y axis (green) - draggable handle
  const yGeo = new THREE.CylinderGeometry(thickness, thickness, size, 6);
  const yMat = new THREE.MeshBasicMaterial({ color: HANDLE_COLORS.y, depthTest: false });
  yHandle = new THREE.Mesh(yGeo, yMat);
  yHandle.position.y = size / 2;
  yHandle.renderOrder = 999;
  axes.add(yHandle);

  // Y arrow tip
  const yTipGeo = new THREE.ConeGeometry(thickness * 2.5, 0.02, 6);
  const yTipMat = new THREE.MeshBasicMaterial({ color: HANDLE_COLORS.y, depthTest: false });
  const yTip = new THREE.Mesh(yTipGeo, yTipMat);
  yTip.position.y = size + 0.01;
  yTip.renderOrder = 999;
  axes.add(yTip);

  // Z axis (blue) - draggable handle
  const zGeo = new THREE.CylinderGeometry(thickness, thickness, size, 6);
  const zMat = new THREE.MeshBasicMaterial({ color: HANDLE_COLORS.z, depthTest: false });
  zHandle = new THREE.Mesh(zGeo, zMat);
  zHandle.rotation.x = Math.PI / 2;
  zHandle.position.z = size / 2;
  zHandle.renderOrder = 999;
  axes.add(zHandle);

  // Z arrow tip
  const zTipGeo = new THREE.ConeGeometry(thickness * 2.5, 0.02, 6);
  const zTipMat = new THREE.MeshBasicMaterial({ color: HANDLE_COLORS.z, depthTest: false });
  const zTip = new THREE.Mesh(zTipGeo, zTipMat);
  zTip.rotation.x = Math.PI / 2;
  zTip.position.z = size + 0.01;
  zTip.renderOrder = 999;
  axes.add(zTip);

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
  xHandle = null;
  yHandle = null;
  zHandle = null;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Initialize bone selector on the canvas.
 */
export function initBoneSelector(
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
 * Register a callback when a bone is rotated via handle drag.
 */
export function onBoneRotated(
  cb: (boneName: VRMHumanBoneName) => void,
): void {
  _onRotate = cb;
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
