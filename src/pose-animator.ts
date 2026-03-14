import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { Landmark } from '@mediapipe/tasks-vision';
import type { PoseTrackingResult } from './pose-tracker';

const SMOOTHING = 0.3;

const smoothedQuats = new Map<string, THREE.Quaternion>();

function smoothQuat(key: string, target: THREE.Quaternion): THREE.Quaternion {
  const prev = smoothedQuats.get(key);
  if (!prev) {
    const q = target.clone();
    smoothedQuats.set(key, q);
    return q;
  }
  prev.slerp(target, SMOOTHING);
  return prev;
}

// MediaPipe Pose landmark indices
const MP_LEFT_SHOULDER = 11;
const MP_RIGHT_SHOULDER = 12;
const MP_LEFT_ELBOW = 13;
const MP_RIGHT_ELBOW = 14;
const MP_LEFT_WRIST = 15;
const MP_RIGHT_WRIST = 16;
const MP_LEFT_HIP = 23;
const MP_RIGHT_HIP = 24;
const MP_LEFT_KNEE = 25;
const MP_RIGHT_KNEE = 26;
const MP_LEFT_ANKLE = 27;
const MP_RIGHT_ANKLE = 28;

/**
 * Convert a MediaPipe world landmark to VRM coordinate space.
 * MediaPipe: x = subject's left, y = down, z = towards camera
 * VRM: x = model's right, y = up, z = model's forward
 */
function toVec3(lm: Landmark): THREE.Vector3 {
  return new THREE.Vector3(-lm.x, -lm.y, -lm.z);
}

function direction(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().subVectors(to, from).normalize();
}

function midpoint(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
}

// Rest directions in T-pose for normalized VRM bones
const REST_UP = new THREE.Vector3(0, 1, 0);
const REST_LEFT = new THREE.Vector3(-1, 0, 0);
const REST_RIGHT = new THREE.Vector3(1, 0, 0);
const REST_DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Map MediaPipe pose landmarks to VRM humanoid bone rotations.
 * Handles parent-child quaternion hierarchy for proper local rotations.
 */
export function applyPoseToVRM(vrm: VRM, pose: PoseTrackingResult): void {
  if (!vrm.humanoid) return;

  const wl = pose.worldLandmarks;
  const p = wl.map(toVec3);

  // === SPINE ===
  const hipCenter = midpoint(p[MP_LEFT_HIP], p[MP_RIGHT_HIP]);
  const shoulderCenter = midpoint(
    p[MP_LEFT_SHOULDER],
    p[MP_RIGHT_SHOULDER]
  );
  const spineDir = direction(hipCenter, shoulderCenter);
  const spineQ = new THREE.Quaternion().setFromUnitVectors(REST_UP, spineDir);
  setBone(vrm, 'spine', smoothQuat('spine', spineQ));

  // Accumulated parent rotation for arms (spine → chest → upperChest → shoulder)
  // Since we only set spine, the rest are identity, so parent = spineQ
  const armParentInvQ = spineQ.clone().invert();

  // === LEFT ARM ===
  const luaWorldDir = direction(p[MP_LEFT_SHOULDER], p[MP_LEFT_ELBOW]);
  const luaWorldQ = new THREE.Quaternion().setFromUnitVectors(
    REST_LEFT,
    luaWorldDir
  );
  const luaLocalQ = armParentInvQ.clone().multiply(luaWorldQ);
  setBone(vrm, 'leftUpperArm', smoothQuat('leftUpperArm', luaLocalQ));

  const llaWorldDir = direction(p[MP_LEFT_ELBOW], p[MP_LEFT_WRIST]);
  const llaWorldQ = new THREE.Quaternion().setFromUnitVectors(
    REST_LEFT,
    llaWorldDir
  );
  const llaLocalQ = luaWorldQ.clone().invert().multiply(llaWorldQ);
  setBone(vrm, 'leftLowerArm', smoothQuat('leftLowerArm', llaLocalQ));

  // === RIGHT ARM ===
  const ruaWorldDir = direction(p[MP_RIGHT_SHOULDER], p[MP_RIGHT_ELBOW]);
  const ruaWorldQ = new THREE.Quaternion().setFromUnitVectors(
    REST_RIGHT,
    ruaWorldDir
  );
  const ruaLocalQ = armParentInvQ.clone().multiply(ruaWorldQ);
  setBone(vrm, 'rightUpperArm', smoothQuat('rightUpperArm', ruaLocalQ));

  const rlaWorldDir = direction(p[MP_RIGHT_ELBOW], p[MP_RIGHT_WRIST]);
  const rlaWorldQ = new THREE.Quaternion().setFromUnitVectors(
    REST_RIGHT,
    rlaWorldDir
  );
  const rlaLocalQ = ruaWorldQ.clone().invert().multiply(rlaWorldQ);
  setBone(vrm, 'rightLowerArm', smoothQuat('rightLowerArm', rlaLocalQ));

  // === LEFT LEG ===
  // Hips not rotated, so upper leg parent = identity
  const lulWorldDir = direction(p[MP_LEFT_HIP], p[MP_LEFT_KNEE]);
  const lulWorldQ = new THREE.Quaternion().setFromUnitVectors(
    REST_DOWN,
    lulWorldDir
  );
  setBone(vrm, 'leftUpperLeg', smoothQuat('leftUpperLeg', lulWorldQ));

  const lllWorldDir = direction(p[MP_LEFT_KNEE], p[MP_LEFT_ANKLE]);
  const lllWorldQ = new THREE.Quaternion().setFromUnitVectors(
    REST_DOWN,
    lllWorldDir
  );
  const lllLocalQ = lulWorldQ.clone().invert().multiply(lllWorldQ);
  setBone(vrm, 'leftLowerLeg', smoothQuat('leftLowerLeg', lllLocalQ));

  // === RIGHT LEG ===
  const rulWorldDir = direction(p[MP_RIGHT_HIP], p[MP_RIGHT_KNEE]);
  const rulWorldQ = new THREE.Quaternion().setFromUnitVectors(
    REST_DOWN,
    rulWorldDir
  );
  setBone(vrm, 'rightUpperLeg', smoothQuat('rightUpperLeg', rulWorldQ));

  const rllWorldDir = direction(p[MP_RIGHT_KNEE], p[MP_RIGHT_ANKLE]);
  const rllWorldQ = new THREE.Quaternion().setFromUnitVectors(
    REST_DOWN,
    rllWorldDir
  );
  const rllLocalQ = rulWorldQ.clone().invert().multiply(rllWorldQ);
  setBone(vrm, 'rightLowerLeg', smoothQuat('rightLowerLeg', rllLocalQ));
}

function setBone(
  vrm: VRM,
  boneName: string,
  q: THREE.Quaternion
): void {
  const bone = vrm.humanoid!.getNormalizedBoneNode(
    boneName as VRMHumanBoneName
  );
  if (bone) {
    bone.quaternion.copy(q);
  }
}

/**
 * Reset body bones controlled by pose tracking back to identity,
 * and clear smoothing state.
 */
export function resetPose(vrm: VRM): void {
  smoothedQuats.clear();
  if (!vrm.humanoid) return;

  const bonesToReset: string[] = [
    'spine',
    'leftUpperArm',
    'leftLowerArm',
    'rightUpperArm',
    'rightLowerArm',
    'leftUpperLeg',
    'leftLowerLeg',
    'rightUpperLeg',
    'rightLowerLeg',
  ];
  for (const name of bonesToReset) {
    const bone = vrm.humanoid.getNormalizedBoneNode(
      name as VRMHumanBoneName
    );
    if (bone) {
      bone.quaternion.identity();
    }
  }
}
