import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
  type Landmark,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';

export interface PoseTrackingResult {
  worldLandmarks: Landmark[];
  landmarks: NormalizedLandmark[];
}

let poseLandmarker: PoseLandmarker | null = null;
let lastVideoTime = -1;

export async function initPoseTracker(): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

export function detectPose(video: HTMLVideoElement): PoseTrackingResult | null {
  if (!poseLandmarker || video.readyState < 2) return null;

  const now = performance.now();
  if (video.currentTime === lastVideoTime) return null;
  lastVideoTime = video.currentTime;

  let result: PoseLandmarkerResult;
  try {
    result = poseLandmarker.detectForVideo(video, now);
  } catch {
    return null;
  }

  if (!result.worldLandmarks || result.worldLandmarks.length === 0) {
    return null;
  }

  return {
    worldLandmarks: result.worldLandmarks[0],
    landmarks: result.landmarks?.[0] ?? [],
  };
}

export function disposePoseTracker(): void {
  if (poseLandmarker) {
    poseLandmarker.close();
    poseLandmarker = null;
  }
}
