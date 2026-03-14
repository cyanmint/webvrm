import * as THREE from 'three';
import { VRM, VRMExpressionPresetName } from '@pixiv/three-vrm';
import type { FaceTrackingResult } from './face-tracker';

/**
 * Maps MediaPipe ARKit-style blendshape names to VRM expression presets.
 * Uses a weighted combination approach for more natural expressions.
 */

const SMOOTHING = 0.4; // Lower = more smoothing, higher = more responsive

// Persistent smoothed values
const smoothedValues = new Map<string, number>();

function smooth(key: string, target: number): number {
  const prev = smoothedValues.get(key) ?? target;
  const result = prev + SMOOTHING * (target - prev);
  smoothedValues.set(key, result);
  return result;
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

export function applyFaceToVRM(
  vrm: VRM,
  face: FaceTrackingResult
): void {
  const bs = face.blendshapes;
  const expr = vrm.expressionManager;
  if (!expr) return;

  // Eye blink
  const blinkL = smooth('blinkL', bs.get('eyeBlinkLeft') ?? 0);
  const blinkR = smooth('blinkR', bs.get('eyeBlinkRight') ?? 0);
  expr.setValue(VRMExpressionPresetName.BlinkLeft, clamp(blinkL));
  expr.setValue(VRMExpressionPresetName.BlinkRight, clamp(blinkR));

  // Mouth - map jaw open + mouth shapes to VRM vowels
  const jawOpen = smooth('jawOpen', bs.get('jawOpen') ?? 0);
  const mouthFunnel = smooth('mouthFunnel', bs.get('mouthFunnel') ?? 0);
  const mouthPucker = smooth('mouthPucker', bs.get('mouthPucker') ?? 0);
  const mouthSmileL = smooth('mouthSmileL', bs.get('mouthSmileLeft') ?? 0);
  const mouthSmileR = smooth('mouthSmileR', bs.get('mouthSmileRight') ?? 0);
  const mouthStretchL = smooth(
    'mouthStretchL',
    bs.get('mouthStretchLeft') ?? 0
  );
  const mouthStretchR = smooth(
    'mouthStretchR',
    bs.get('mouthStretchRight') ?? 0
  );

  // "aa" - open mouth
  expr.setValue(VRMExpressionPresetName.Aa, clamp(jawOpen * 1.2));
  // "ih" - stretched mouth
  const ih = (mouthStretchL + mouthStretchR) * 0.5;
  expr.setValue(VRMExpressionPresetName.Ih, clamp(ih));
  // "ou" - pucker / funnel
  expr.setValue(VRMExpressionPresetName.Ou, clamp(mouthPucker * 1.2));
  // "ee" - funnel
  expr.setValue(VRMExpressionPresetName.Ee, clamp(mouthFunnel * 0.8));
  // "oh" - mid open + funnel
  expr.setValue(
    VRMExpressionPresetName.Oh,
    clamp(jawOpen * 0.5 + mouthFunnel * 0.3)
  );

  // Happy expression based on smile
  const smile = (mouthSmileL + mouthSmileR) * 0.5;
  expr.setValue(VRMExpressionPresetName.Happy, clamp(smile * 0.6));

  // Surprised based on eye wide + jaw open
  const eyeWideL = smooth('eyeWideL', bs.get('eyeWideLeft') ?? 0);
  const eyeWideR = smooth('eyeWideR', bs.get('eyeWideRight') ?? 0);
  const surprised = ((eyeWideL + eyeWideR) * 0.5 + jawOpen * 0.3) * 0.5;
  expr.setValue(VRMExpressionPresetName.Surprised, clamp(surprised));

  // Head rotation
  if (face.headRotation && vrm.humanoid) {
    const head = vrm.humanoid.getNormalizedBoneNode('head');
    if (head) {
      const { pitch, yaw, roll } = face.headRotation;
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          smooth('headPitch', clamp(pitch * 0.5, -0.5, 0.5)),
          smooth('headYaw', clamp(-yaw * 0.5, -0.5, 0.5)),
          smooth('headRoll', clamp(-roll * 0.3, -0.3, 0.3)),
          'YXZ'
        )
      );
      head.quaternion.slerp(q, SMOOTHING);
    }
  }

  // Eye gaze using lookAt
  if (vrm.lookAt) {
    const lookInL = smooth('lookInL', bs.get('eyeLookInLeft') ?? 0);
    const lookOutL = smooth('lookOutL', bs.get('eyeLookOutLeft') ?? 0);
    const lookUpL = smooth('lookUpL', bs.get('eyeLookUpLeft') ?? 0);
    const lookDownL = smooth('lookDownL', bs.get('eyeLookDownLeft') ?? 0);

    const lookInR = smooth('lookInR', bs.get('eyeLookInRight') ?? 0);
    const lookOutR = smooth('lookOutR', bs.get('eyeLookOutRight') ?? 0);
    const lookUpR = smooth('lookUpR', bs.get('eyeLookUpRight') ?? 0);
    const lookDownR = smooth('lookDownR', bs.get('eyeLookDownRight') ?? 0);

    // Average both eyes for yaw and pitch
    const eyeYaw = (lookInR + lookOutL - lookInL - lookOutR) * 0.5;
    const eyePitch = (lookUpL + lookUpR - lookDownL - lookDownR) * 0.5;

    vrm.lookAt.yaw = THREE.MathUtils.lerp(
      vrm.lookAt.yaw,
      clamp(eyeYaw * 30, -30, 30),
      SMOOTHING
    );
    vrm.lookAt.pitch = THREE.MathUtils.lerp(
      vrm.lookAt.pitch,
      clamp(-eyePitch * 30, -30, 30),
      SMOOTHING
    );
  }
}

export function resetVRMExpressions(vrm: VRM): void {
  if (vrm.expressionManager) {
    vrm.expressionManager.resetValues();
  }
  smoothedValues.clear();
}
