import './style.css';
import { createScene, resizeRenderer, resetCamera, type SceneContext } from './scene';
import { loadVRM, getCurrentVRM, updateVRM } from './vrm-loader';
import { initFaceTracker, detectFace, disposeFaceTracker } from './face-tracker';
import { applyFaceToVRM, resetVRMExpressions } from './vrm-animator';
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
const fileInput = document.getElementById('vrm-file-input') as HTMLInputElement;
const toggleCameraBtn = document.getElementById(
  'toggle-camera'
) as HTMLButtonElement;
const resetCameraBtn = document.getElementById(
  'reset-camera'
) as HTMLButtonElement;
const fpsCounter = document.getElementById('fps-counter') as HTMLSpanElement;

// State
let cameraActive = false;
let mediaStream: MediaStream | null = null;
let faceTrackerReady = false;

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
    videoEl.style.display = 'block';
    await videoEl.play();

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
  videoEl.style.display = 'none';
  videoEl.srcObject = null;
  toggleCameraBtn.textContent = 'Start Camera';

  const vrm = getCurrentVRM();
  if (vrm) {
    resetVRMExpressions(vrm);
  }
}

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
