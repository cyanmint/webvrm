import './style.css';
import { createScene, resizeRenderer, resetCamera, type SceneContext } from './scene';
import { loadVRM, loadVRMFromUrl, getCurrentVRM, updateVRM } from './vrm-loader';
import { initFaceTracker, detectFace, disposeFaceTracker } from './face-tracker';
import { applyFaceToVRM, restoreModelPose, resetVRMExpressions } from './vrm-animator';
import { initPoseTracker, detectPose, disposePoseTracker } from './pose-tracker';
import { applyPoseToVRM, resetPose } from './pose-animator';
import { initSkeletonCanvas, drawFaceSkeleton, drawPoseSkeleton, clearSkeletonCanvas } from './face-skeleton';
import {
  buildExpressionEditor,
  buildMaterialEditor,
  setupSceneEditor,
  setupTabs,
} from './editor';

const DEFAULT_VRM_URL =
  'https://github.com/cyanmint/webvrm/releases/download/assets/cyanmint.vrm';

// DOM elements
const canvas = document.getElementById('three-canvas') as HTMLCanvasElement;
const viewportContainer = document.getElementById(
  'viewport-container'
) as HTMLDivElement;
const videoEl = document.getElementById('webcam-video') as HTMLVideoElement;
const skeletonCanvas = document.getElementById('skeleton-canvas') as HTMLCanvasElement;
const camPreviewPane = document.getElementById(
  'cam-preview-pane'
) as HTMLDivElement;
const fileInput = document.getElementById('vrm-file-input') as HTMLInputElement;
const toggleCameraBtn = document.getElementById(
  'toggle-camera'
) as HTMLButtonElement;
const toggleSkeletonBtn = document.getElementById(
  'toggle-skeleton'
) as HTMLButtonElement;
const closePreviewBtn = document.getElementById(
  'close-preview'
) as HTMLButtonElement;
const trackingModeSelect = document.getElementById(
  'tracking-mode'
) as HTMLSelectElement;
const resetCameraBtn = document.getElementById(
  'reset-camera'
) as HTMLButtonElement;
const fpsCounter = document.getElementById('fps-counter') as HTMLSpanElement;
const loadingStatus = document.getElementById(
  'loading-status'
) as HTMLDivElement;

// State
let cameraActive = false;
let mediaStream: MediaStream | null = null;
let faceTrackerReady = false;
let poseTrackerReady = false;
let skeletonOverlay = false;

type TrackingMode = 'faceOnly' | 'fullBody';
let trackingMode: TrackingMode = 'faceOnly';

// Initialize Three.js scene
const ctx: SceneContext = createScene(canvas);
resizeRenderer(ctx, viewportContainer);

// Setup editor
setupTabs();
setupSceneEditor(ctx);

// Handle window resize
window.addEventListener('resize', () => resizeRenderer(ctx, viewportContainer));

// Handle VRM file loading
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  toggleCameraBtn.textContent = cameraActive ? 'Stop Camera' : 'Start Camera';

  try {
    const vrm = await loadVRM(file, ctx);
    buildExpressionEditor(vrm);
    buildMaterialEditor(vrm);
  } catch (err) {
    console.error('Failed to load VRM:', err);
    alert('Failed to load VRM file. Please ensure it is a valid .vrm file.');
  }

  // Reset file input so the same file can be reloaded
  fileInput.value = '';
});

// Handle camera toggle
toggleCameraBtn.addEventListener('click', async () => {
  if (cameraActive) {
    stopCamera();
  } else {
    await startCamera();
  }
});

async function startCamera(): Promise<void> {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });
    videoEl.srcObject = mediaStream;
    await videoEl.play();

    // Set skeleton canvas dimensions to match video
    skeletonCanvas.width = videoEl.videoWidth || 640;
    skeletonCanvas.height = videoEl.videoHeight || 480;
    initSkeletonCanvas(skeletonCanvas);

    // Show the cam preview pane
    camPreviewPane.classList.add('visible');
    updateSkeletonVisibility();

    toggleCameraBtn.textContent = 'Initializing...';

    if (!faceTrackerReady) {
      await initFaceTracker();
      faceTrackerReady = true;
    }

    if (trackingMode === 'fullBody' && !poseTrackerReady) {
      await initPoseTracker();
      poseTrackerReady = true;
    }

    cameraActive = true;
    toggleCameraBtn.textContent = 'Stop Camera';
  } catch (err) {
    console.error('Failed to start camera:', err);
    alert(
      'Failed to access webcam. Please ensure camera permissions are granted.'
    );
  }
}

function stopCamera(): void {
  cameraActive = false;
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  camPreviewPane.classList.remove('visible');
  videoEl.srcObject = null;
  clearSkeletonCanvas(skeletonCanvas);
  toggleCameraBtn.textContent = 'Start Camera';

  const vrm = getCurrentVRM();
  if (vrm) {
    resetPose(vrm);
    resetVRMExpressions(vrm);
  }
}

function updateSkeletonVisibility(): void {
  if (skeletonOverlay) {
    skeletonCanvas.classList.add('visible');
  } else {
    skeletonCanvas.classList.remove('visible');
    clearSkeletonCanvas(skeletonCanvas);
  }
}

// Toggle skeleton overlay on/off
toggleSkeletonBtn.addEventListener('click', () => {
  skeletonOverlay = !skeletonOverlay;
  toggleSkeletonBtn.textContent = skeletonOverlay ? 'Hide Skeleton' : 'Skeleton';
  updateSkeletonVisibility();
});

// Close preview pane (tracking continues, just hides the preview)
closePreviewBtn.addEventListener('click', () => {
  camPreviewPane.classList.remove('visible');
});

// Tracking mode change
trackingModeSelect.addEventListener('change', async () => {
  trackingMode = trackingModeSelect.value as TrackingMode;

  if (trackingMode === 'fullBody' && cameraActive && !poseTrackerReady) {
    toggleCameraBtn.textContent = 'Initializing...';
    await initPoseTracker();
    poseTrackerReady = true;
    toggleCameraBtn.textContent = 'Stop Camera';
  }

  if (trackingMode === 'faceOnly') {
    const vrm = getCurrentVRM();
    if (vrm) {
      resetPose(vrm);
      restoreModelPose(vrm);
    }
  }
});

// Reset camera button
resetCameraBtn?.addEventListener('click', () => resetCamera(ctx));

// --- Auto-initialization ---

function setLoadingStatus(msg: string): void {
  if (loadingStatus) {
    if (msg) {
      loadingStatus.textContent = msg;
      loadingStatus.classList.add('visible');
    } else {
      loadingStatus.classList.remove('visible');
    }
  }
}

// Auto-load default VRM and pre-initialize MediaPipe in parallel
(async () => {
  setLoadingStatus('Loading model & MediaPipe...');

  const vrmPromise = loadVRMFromUrl(DEFAULT_VRM_URL, ctx)
    .then((vrm) => {
      buildExpressionEditor(vrm);
      buildMaterialEditor(vrm);
    })
    .catch((err) => console.error('Failed to auto-load default VRM:', err));

  const mediapipePromise = initFaceTracker()
    .then(() => {
      faceTrackerReady = true;
    })
    .catch((err) => console.error('Failed to pre-init face tracker:', err));

  await Promise.all([vrmPromise, mediapipePromise]);

  setLoadingStatus('');
})();

// Animation loop
let frameCount = 0;
let lastFpsTime = performance.now();

function animate(): void {
  requestAnimationFrame(animate);

  const delta = ctx.clock.getDelta();

  // Face and pose tracking
  if (cameraActive) {
    // Face detection (always active)
    const faceResult = detectFace(videoEl);

    // Pose detection (full body mode only)
    const poseResult =
      trackingMode === 'fullBody' && poseTrackerReady
        ? detectPose(videoEl)
        : null;

    // Apply to VRM
    const vrm = getCurrentVRM();
    if (vrm) {
      if (faceResult) {
        applyFaceToVRM(vrm, faceResult);
      }
      if (poseResult) {
        applyPoseToVRM(vrm, poseResult);
      }
    }

    // Skeleton overlay drawing
    if (skeletonOverlay) {
      clearSkeletonCanvas(skeletonCanvas);
      if (poseResult && poseResult.landmarks.length > 0) {
        drawPoseSkeleton(skeletonCanvas, poseResult.landmarks);
      }
      if (faceResult?.landmarks) {
        drawFaceSkeleton(skeletonCanvas, faceResult.landmarks);
      }
    }
  }

  // Update VRM (physics, spring bones, etc.)
  updateVRM(delta);

  // Update orbit controls
  ctx.controls.update();

  // Render
  ctx.renderer.render(ctx.scene, ctx.camera);

  // FPS counter
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fpsCounter.textContent = `FPS: ${frameCount}`;
    frameCount = 0;
    lastFpsTime = now;
  }
}

animate();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopCamera();
  disposeFaceTracker();
  disposePoseTracker();
});
