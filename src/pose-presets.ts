import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export interface PosePreset {
  name: string;
  apply: (vrm: VRM) => void;
}

/**
 * Restore the model's authored rest pose (whatever the model author defined).
 */
function applyDefault(vrm: VRM): void {
  vrm.humanoid?.resetNormalizedPose();
}

/**
 * T-Pose: arms fully extended to the sides, legs straight down.
 * In VRM normalized space, identity quaternions already produce a T-pose
 * since normalized bones use T-pose as the reference.
 */
function applyTPose(vrm: VRM): void {
  vrm.humanoid?.resetNormalizedPose();

  const bones: VRMHumanBoneName[] = [
    'spine' as VRMHumanBoneName,
    'leftUpperArm' as VRMHumanBoneName,
    'leftLowerArm' as VRMHumanBoneName,
    'rightUpperArm' as VRMHumanBoneName,
    'rightLowerArm' as VRMHumanBoneName,
    'leftUpperLeg' as VRMHumanBoneName,
    'leftLowerLeg' as VRMHumanBoneName,
    'rightUpperLeg' as VRMHumanBoneName,
    'rightLowerLeg' as VRMHumanBoneName,
  ];

  for (const name of bones) {
    const bone = vrm.humanoid?.getNormalizedBoneNode(name);
    if (bone) {
      bone.quaternion.identity();
    }
  }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * A-Pose: arms angled ~30° down from horizontal (common rest pose).
 */
function applyAPose(vrm: VRM): void {
  applyTPose(vrm);

  const leftArm = vrm.humanoid?.getNormalizedBoneNode(
    'leftUpperArm' as VRMHumanBoneName
  );
  const rightArm = vrm.humanoid?.getNormalizedBoneNode(
    'rightUpperArm' as VRMHumanBoneName
  );

  if (leftArm) {
    leftArm.quaternion.setFromAxisAngle(Z_AXIS, Math.PI / 6); // +30°
  }
  if (rightArm) {
    rightArm.quaternion.setFromAxisAngle(Z_AXIS, -Math.PI / 6); // -30°
  }
}

export const POSE_PRESETS: PosePreset[] = [
  { name: 'Default', apply: applyDefault },
  { name: 'T-Pose', apply: applyTPose },
  { name: 'A-Pose', apply: applyAPose },
];
