import * as THREE from 'three';
import { VRM, VRMExpressionPresetName } from '@pixiv/three-vrm';
import type { SceneContext } from './scene';

/**
 * Populates the editor panel with controls for the loaded VRM model.
 */

const PRESET_EXPRESSION_NAMES: string[] = [
  VRMExpressionPresetName.Happy,
  VRMExpressionPresetName.Angry,
  VRMExpressionPresetName.Sad,
  VRMExpressionPresetName.Relaxed,
  VRMExpressionPresetName.Surprised,
  VRMExpressionPresetName.Aa,
  VRMExpressionPresetName.Ih,
  VRMExpressionPresetName.Ou,
  VRMExpressionPresetName.Ee,
  VRMExpressionPresetName.Oh,
  VRMExpressionPresetName.Blink,
  VRMExpressionPresetName.BlinkLeft,
  VRMExpressionPresetName.BlinkRight,
  VRMExpressionPresetName.Neutral,
];

// Track expression slider elements so we can update them from the animation loop
const expressionSliders = new Map<string, { input: HTMLInputElement; valueSpan: HTMLElement }>();

export function buildExpressionEditor(vrm: VRM): void {
  const container = document.getElementById('tab-expressions');
  if (!container) return;

  container.innerHTML = '';
  expressionSliders.clear();

  const expr = vrm.expressionManager;
  if (!expr || expr.expressions.length === 0) {
    container.innerHTML = '<p class="placeholder">No expressions found in this model</p>';
    return;
  }

  const heading = document.createElement('h3');
  heading.textContent = 'Preset Expressions';
  container.appendChild(heading);

  for (const name of PRESET_EXPRESSION_NAMES) {
    const expression = expr.getExpression(name);
    if (!expression) continue;

    const div = document.createElement('div');
    div.className = 'expression-control';

    const label = document.createElement('label');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    const valueSpan = document.createElement('span');
    valueSpan.className = 'range-value';
    valueSpan.textContent = '0.00';
    label.appendChild(nameSpan);
    label.appendChild(valueSpan);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    input.value = '0';
    input.dataset.expressionName = name;

    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      expr.setValue(name, val);
      valueSpan.textContent = val.toFixed(2);
    });

    div.appendChild(label);
    div.appendChild(input);
    container.appendChild(div);

    expressionSliders.set(name, { input, valueSpan });
  }

  // Custom expressions
  const customNames = Object.keys(expr.customExpressionMap);
  if (customNames.length > 0) {
    const customHeading = document.createElement('h3');
    customHeading.textContent = 'Custom Expressions';
    container.appendChild(customHeading);

    for (const name of customNames) {
      const div = document.createElement('div');
      div.className = 'expression-control';

      const label = document.createElement('label');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = name;
      const valueSpan = document.createElement('span');
      valueSpan.className = 'range-value';
      valueSpan.textContent = '0.00';
      label.appendChild(nameSpan);
      label.appendChild(valueSpan);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.01';
      input.value = '0';

      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        expr.setValue(name, val);
        valueSpan.textContent = val.toFixed(2);
      });

      div.appendChild(label);
      div.appendChild(input);
      container.appendChild(div);

      expressionSliders.set(name, { input, valueSpan });
    }
  }
}

/**
 * Update expression slider positions to reflect current VRM expression values.
 * Called from the animation loop so sliders track face-tracking changes.
 */
export function updateExpressionSliders(vrm: VRM): void {
  const expr = vrm.expressionManager;
  if (!expr) return;

  for (const [name, { input, valueSpan }] of expressionSliders) {
    const val = expr.getValue(name) ?? 0;
    input.value = val.toFixed(2);
    valueSpan.textContent = val.toFixed(2);
  }
}

export function buildMaterialEditor(vrm: VRM): void {
  const container = document.getElementById('tab-materials');
  if (!container) return;

  container.innerHTML = '';

  const materials = new Set<THREE.Material>();
  vrm.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m: THREE.Material) => materials.add(m));
    }
  });

  if (materials.size === 0) {
    container.innerHTML = '<p class="placeholder">No materials found</p>';
    return;
  }

  const heading = document.createElement('h3');
  heading.textContent = 'Materials';
  container.appendChild(heading);

  let index = 0;
  materials.forEach((mat) => {
    const item = document.createElement('div');
    item.className = 'material-item';

    const title = document.createElement('h4');
    title.textContent = mat.name || `Material ${index}`;
    item.appendChild(title);

    // Color control (if material supports it)
    if ('color' in mat && (mat as THREE.MeshStandardMaterial).color) {
      const stdMat = mat as THREE.MeshStandardMaterial;
      const colorGroup = document.createElement('div');
      colorGroup.className = 'control-group';

      const colorLabel = document.createElement('label');
      colorLabel.textContent = 'Color';
      colorGroup.appendChild(colorLabel);

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = '#' + stdMat.color.getHexString();
      colorInput.addEventListener('input', () => {
        stdMat.color.set(colorInput.value);
      });
      colorGroup.appendChild(colorInput);
      item.appendChild(colorGroup);
    }

    // Opacity
    const opacityGroup = document.createElement('div');
    opacityGroup.className = 'control-group';

    const opacityLabel = document.createElement('label');
    const opacityNameSpan = document.createElement('span');
    opacityNameSpan.textContent = 'Opacity';
    const opacityValueSpan = document.createElement('span');
    opacityValueSpan.className = 'range-value';
    opacityValueSpan.textContent = mat.opacity.toFixed(2);
    opacityLabel.appendChild(opacityNameSpan);
    opacityLabel.appendChild(opacityValueSpan);
    opacityGroup.appendChild(opacityLabel);

    const opacityInput = document.createElement('input');
    opacityInput.type = 'range';
    opacityInput.min = '0';
    opacityInput.max = '1';
    opacityInput.step = '0.01';
    opacityInput.value = String(mat.opacity);
    opacityInput.addEventListener('input', () => {
      const val = parseFloat(opacityInput.value);
      mat.opacity = val;
      mat.transparent = val < 1;
      opacityValueSpan.textContent = val.toFixed(2);
    });
    opacityGroup.appendChild(opacityInput);
    item.appendChild(opacityGroup);

    // Wireframe toggle
    if ('wireframe' in mat) {
      const wireGroup = document.createElement('div');
      wireGroup.className = 'control-group';

      const wireLabel = document.createElement('label');
      wireLabel.textContent = 'Wireframe';
      wireGroup.appendChild(wireLabel);

      const wireBtn = document.createElement('button');
      wireBtn.className = 'btn btn-small';
      wireBtn.textContent = (mat as THREE.MeshStandardMaterial).wireframe
        ? 'ON'
        : 'OFF';
      wireBtn.addEventListener('click', () => {
        const m = mat as THREE.MeshStandardMaterial;
        m.wireframe = !m.wireframe;
        wireBtn.textContent = m.wireframe ? 'ON' : 'OFF';
      });
      wireGroup.appendChild(wireBtn);
      item.appendChild(wireGroup);
    }

    container.appendChild(item);
    index++;
  });
}

let camUpdateInterval: number | null = null;

export function setupSceneEditor(ctx: SceneContext): void {
  const ambientInput = document.getElementById(
    'ambient-intensity'
  ) as HTMLInputElement | null;
  const dirInput = document.getElementById(
    'dir-intensity'
  ) as HTMLInputElement | null;
  const dirColorInput = document.getElementById(
    'dir-color'
  ) as HTMLInputElement | null;
  const bgColorInput = document.getElementById(
    'bg-color'
  ) as HTMLInputElement | null;

  ambientInput?.addEventListener('input', () => {
    ctx.ambientLight.intensity = parseFloat(ambientInput.value);
  });

  dirInput?.addEventListener('input', () => {
    ctx.directionalLight.intensity = parseFloat(dirInput.value);
  });

  dirColorInput?.addEventListener('input', () => {
    ctx.directionalLight.color.set(dirColorInput.value);
  });

  bgColorInput?.addEventListener('input', () => {
    (ctx.scene.background as THREE.Color).set(bgColorInput.value);
  });

  // Camera setter controls
  const camX = document.getElementById('cam-pos-x') as HTMLInputElement | null;
  const camY = document.getElementById('cam-pos-y') as HTMLInputElement | null;
  const camZ = document.getElementById('cam-pos-z') as HTMLInputElement | null;
  const camRX = document.getElementById('cam-rot-x') as HTMLInputElement | null;
  const camRY = document.getElementById('cam-rot-y') as HTMLInputElement | null;
  const camRZ = document.getElementById('cam-rot-z') as HTMLInputElement | null;

  function updateCamInputs(): void {
    if (camX) camX.value = ctx.camera.position.x.toFixed(2);
    if (camY) camY.value = ctx.camera.position.y.toFixed(2);
    if (camZ) camZ.value = ctx.camera.position.z.toFixed(2);
    const euler = new THREE.Euler().setFromQuaternion(ctx.camera.quaternion, 'YXZ');
    const rad2deg = 180 / Math.PI;
    if (camRX) camRX.value = (euler.x * rad2deg).toFixed(1);
    if (camRY) camRY.value = (euler.y * rad2deg).toFixed(1);
    if (camRZ) camRZ.value = (euler.z * rad2deg).toFixed(1);
  }

  function applyCamPosition(): void {
    if (!camX || !camY || !camZ) return;
    ctx.camera.position.set(
      parseFloat(camX.value) || 0,
      parseFloat(camY.value) || 0,
      parseFloat(camZ.value) || 0,
    );
    ctx.controls.update();
  }

  function applyCamRotation(): void {
    if (!camRX || !camRY || !camRZ) return;
    const deg2rad = Math.PI / 180;
    const rx = (parseFloat(camRX.value) || 0) * deg2rad;
    const ry = (parseFloat(camRY.value) || 0) * deg2rad;
    const rz = (parseFloat(camRZ.value) || 0) * deg2rad;
    // Compute look target from camera rotation
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(rx, ry, rz, 'YXZ'),
    );
    ctx.controls.target.copy(ctx.camera.position).add(dir);
    ctx.controls.update();
  }

  camX?.addEventListener('change', applyCamPosition);
  camY?.addEventListener('change', applyCamPosition);
  camZ?.addEventListener('change', applyCamPosition);
  camRX?.addEventListener('change', applyCamRotation);
  camRY?.addEventListener('change', applyCamRotation);
  camRZ?.addEventListener('change', applyCamRotation);

  // Periodically update camera input fields to reflect orbit control changes
  if (camUpdateInterval !== null) clearInterval(camUpdateInterval);
  camUpdateInterval = window.setInterval(updateCamInputs, 500);
}

export function setupTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>('#editor-tabs .tab');
  const contents =
    document.querySelectorAll<HTMLElement>('#editor-content .tab-content');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.remove('active'));
      contents.forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      const section = document.getElementById(`tab-${target}`);
      section?.classList.add('active');
    });
  });
}
