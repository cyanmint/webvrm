# WebVRM

A web-based VTubing application with webcam face capture and a VRM model editor, built with [Three.js](https://threejs.org/) and [@pixiv/three-vrm](https://github.com/pixiv/three-vrm).

## Features

- **VRM Model Viewer** — Load and display `.vrm` avatar models in a 3D viewport with orbit controls
- **Webcam Face Capture** — Real-time face tracking via [MediaPipe Face Landmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker) for VTubing
- **Face-to-VRM Mapping** — Automatic mapping of facial expressions (blink, mouth shapes, smile, surprise), head rotation, and eye gaze to VRM expressions and bones
- **Expression Editor** — Manual sliders for all preset and custom VRM expressions
- **Material Editor** — Edit material colors, opacity, and wireframe mode on the loaded model
- **Scene Editor** — Adjust ambient/directional lighting, background color, and camera

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser, then:

1. Click **Load VRM** to load a `.vrm` model file
2. Click **Start Camera** to enable webcam face tracking
3. Use the editor panel tabs to manually adjust expressions, materials, and scene settings

## Tech Stack

- [Vite](https://vitejs.dev/) + TypeScript
- [Three.js](https://threejs.org/) for 3D rendering
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) for VRM model support
- [@mediapipe/tasks-vision](https://developers.google.com/mediapipe/solutions/vision/face_landmarker) for face landmark detection