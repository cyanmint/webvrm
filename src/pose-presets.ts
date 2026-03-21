import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export interface PosePreset {
  name: string;
  apply: (vrm: VRM) => void;
}

/**
 * Restore the model's authored rest pose.
 */
function applyDefault(vrm: VRM): void {
  vrm.humanoid?.resetNormalizedPose();
}

/**
 * T-Pose: all normalized bones set to identity (arms straight out, legs down).
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
 * A-Pose: arms angled ~30° down from horizontal.
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
    leftArm.quaternion.setFromAxisAngle(Z_AXIS, Math.PI / 6);
  }
  if (rightArm) {
    rightArm.quaternion.setFromAxisAngle(Z_AXIS, -Math.PI / 6);
  }
}

export const POSE_PRESETS: PosePreset[] = [
  { name: 'Default', apply: applyDefault },
  { name: 'T-Pose', apply: applyTPose },
  { name: 'A-Pose', apply: applyAPose },
];
