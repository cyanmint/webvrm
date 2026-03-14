import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';

export interface FaceTrackingResult {
  blendshapes: Map<string, number>;
  headRotation: { pitch: number; yaw: number; roll: number } | null;
}

let faceLandmarker: FaceLandmarker | null = null;
let lastVideoTime = -1;

export async function initFaceTracker(): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
}

export function detectFace(video: HTMLVideoElement): FaceTrackingResult | null {
  if (!faceLandmarker || video.readyState < 2) return null;

  const now = performance.now();
  if (video.currentTime === lastVideoTime) return null;
  lastVideoTime = video.currentTime;

  let result: FaceLandmarkerResult;
  try {
    result = faceLandmarker.detectForVideo(video, now);
  } catch {
    return null;
  }

  if (!result.faceBlendshapes || result.faceBlendshapes.length === 0) {
    return null;
  }

  const blendshapes = new Map<string, number>();
  for (const cat of result.faceBlendshapes[0].categories) {
    blendshapes.set(cat.categoryName, cat.score);
  }

  let headRotation: FaceTrackingResult['headRotation'] = null;
  if (
    result.facialTransformationMatrixes &&
    result.facialTransformationMatrixes.length > 0
  ) {
    const matrix = result.facialTransformationMatrixes[0];
    headRotation = matrixToEuler(new Float32Array(matrix.data));
  }

  return { blendshapes, headRotation };
}

function matrixToEuler(m: Float32Array): {
  pitch: number;
  yaw: number;
  roll: number;
} {
  // Extract rotation from 4x4 column-major matrix
  const sy = Math.sqrt(m[0] * m[0] + m[4] * m[4]);
  const singular = sy < 1e-6;

  let pitch: number, yaw: number, roll: number;
  if (!singular) {
    pitch = Math.atan2(m[6], m[10]); // rotation around X
    yaw = Math.atan2(-m[2], sy); // rotation around Y
    roll = Math.atan2(m[1], m[0]); // rotation around Z
  } else {
    pitch = Math.atan2(-m[9], m[5]);
    yaw = Math.atan2(-m[2], sy);
    roll = 0;
  }

  return { pitch, yaw, roll };
}

export function disposeFaceTracker(): void {
  if (faceLandmarker) {
    faceLandmarker.close();
    faceLandmarker = null;
  }
}
