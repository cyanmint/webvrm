import './style.css';
import { createScene, resizeRenderer, resetCamera, type SceneContext } from './scene';
import { loadVRM, getCurrentVRM, updateVRM } from './vrm-loader';
import { initFaceTracker, detectFace, disposeFaceTracker } from './face-tracker';
import { applyFaceToVRM, resetVRMExpressions } from './vrm-animator';
import { initSkeletonCanvas, drawFaceSkeleton, clearSkeletonCanvas } from './face-skeleton';
import {
  buildExpressionEditor,
  buildMaterialEditor,
  setupSceneEditor,
  setupTabs,
} from './editor';

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
const resetCameraBtn = document.getElementById(
  'reset-camera'
) as HTMLButtonElement;
const fpsCounter = document.getElementById('fps-counter') as HTMLSpanElement;

// State
let cameraActive = false;
let mediaStream: MediaStream | null = null;
let faceTrackerReady = false;
let skeletonOverlay = false;
let previewVisible = true;

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
    previewVisible = true;
    camPreviewPane.classList.add('visible');
    updateSkeletonVisibility();

    toggleCameraBtn.textContent = 'Initializing...';

    if (!faceTrackerReady) {
      await initFaceTracker();
      faceTrackerReady = true;
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
  previewVisible = false;
  camPreviewPane.classList.remove('visible');
});

// Reset camera button
resetCameraBtn?.addEventListener('click', () => resetCamera(ctx));

// Animation loop
let frameCount = 0;
let lastFpsTime = performance.now();

function animate(): void {
  requestAnimationFrame(animate);

  const delta = ctx.clock.getDelta();

  // Face tracking
  if (cameraActive) {
    const vrm = getCurrentVRM();
    if (vrm) {
      const faceResult = detectFace(videoEl);
      if (faceResult) {
        applyFaceToVRM(vrm, faceResult);
        if (skeletonOverlay && faceResult.landmarks) {
          drawFaceSkeleton(skeletonCanvas, faceResult.landmarks);
        }
      }
    } else {
      // No VRM loaded, still draw skeleton if overlay is on
      const faceResult = detectFace(videoEl);
      if (faceResult && skeletonOverlay && faceResult.landmarks) {
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
});
