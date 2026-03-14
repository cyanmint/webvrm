import {
  DrawingUtils,
  FaceLandmarker,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';

let drawingUtils: DrawingUtils | null = null;
let canvasCtx: CanvasRenderingContext2D | null = null;

export function initSkeletonCanvas(canvas: HTMLCanvasElement): void {
  canvasCtx = canvas.getContext('2d');
  if (canvasCtx) {
    drawingUtils = new DrawingUtils(canvasCtx);
  }
}

export function drawFaceSkeleton(
  _canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[]
): void {
  if (!canvasCtx || !drawingUtils) return;

  // Draw face mesh tesselation
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_TESSELATION,
    { color: 'rgba(42, 42, 74, 0.4)', lineWidth: 0.5 }
  );

  // Draw face contours
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
    { color: '#e94560', lineWidth: 1 }
  );

  // Draw eyes
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    { color: '#ff6b81', lineWidth: 1 }
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    { color: '#ff6b81', lineWidth: 1 }
  );

  // Draw irises
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
    { color: '#4ecdc4', lineWidth: 1 }
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
    { color: '#4ecdc4', lineWidth: 1 }
  );

  // Draw eyebrows
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
    { color: '#ffd93d', lineWidth: 1 }
  );
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
    { color: '#ffd93d', lineWidth: 1 }
  );

  // Draw lips
  drawingUtils.drawConnectors(
    landmarks,
    FaceLandmarker.FACE_LANDMARKS_LIPS,
    { color: '#e94560', lineWidth: 1.5 }
  );
}

export function drawPoseSkeleton(
  _canvas: HTMLCanvasElement,
  landmarks: NormalizedLandmark[]
): void {
  if (!canvasCtx || !drawingUtils) return;

  drawingUtils.drawConnectors(
    landmarks,
    PoseLandmarker.POSE_CONNECTIONS,
    { color: '#4ecdc4', lineWidth: 2 }
  );

  drawingUtils.drawLandmarks(landmarks, {
    color: '#ff6b81',
    lineWidth: 1,
    radius: 2,
  });
}

export function clearSkeletonCanvas(canvas: HTMLCanvasElement): void {
  if (!canvasCtx) return;
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}
