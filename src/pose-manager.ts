import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { getCurrentVRM } from './vrm-loader';
import { POSE_PRESETS } from './pose-presets';
import { POSEABLE_BONES, selectBoneByName } from './bone-selector';

/**
 * Pose Manager: save, load, import, and export VRM poses.
 * Pose Detail: per-bone rotateX/Y/Z sliders.
 * Stored in localStorage for persistence across sessions.
 */

const STORAGE_KEY = 'webvrm-saved-poses';
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export interface SavedPose {
  name: string;
  bones: Record<string, [number, number, number, number]>; // quaternion xyzw
  expressions: Record<string, number>;
}

/** Capture current pose from the VRM model */
export function capturePose(vrm: VRM, name: string): SavedPose {
  const bones: Record<string, [number, number, number, number]> = {};

  for (const boneName of POSEABLE_BONES) {
    const bone = vrm.humanoid?.getNormalizedBoneNode(boneName);
    if (bone) {
      const q = bone.quaternion;
      bones[boneName] = [q.x, q.y, q.z, q.w];
    }
  }

  const expressions: Record<string, number> = {};
  if (vrm.expressionManager) {
    for (const expr of vrm.expressionManager.expressions) {
      const val = expr.weight;
      if (val > 0.001) {
        expressions[expr.expressionName] = val;
      }
    }
  }

  return { name, bones, expressions };
}

/** Apply a saved pose to the VRM model */
export function applyPose(vrm: VRM, pose: SavedPose): void {
  vrm.humanoid?.resetNormalizedPose();

  for (const [boneName, quat] of Object.entries(pose.bones)) {
    const bone = vrm.humanoid?.getNormalizedBoneNode(
      boneName as VRMHumanBoneName,
    );
    if (bone) {
      bone.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
    }
  }

  if (vrm.expressionManager) {
    vrm.expressionManager.resetValues();
    for (const [name, val] of Object.entries(pose.expressions)) {
      vrm.expressionManager.setValue(name, val);
    }
  }
}

// ─── localStorage persistence ───────────────────────────────

function loadSavedPoses(): SavedPose[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SavedPose[];
  } catch {
    // ignore parse errors
  }
  return [];
}

function savePosesToStorage(poses: SavedPose[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(poses));
}

// ─── UI State ───────────────────────────────────────────────

let poseListEl: HTMLElement | null = null;
let savedPoses: SavedPose[] = [];
let poseDetailEl: HTMLElement | null = null;

// Track per-bone slider elements
const boneSliders = new Map<
  string,
  {
    rx: HTMLInputElement;
    ry: HTMLInputElement;
    rz: HTMLInputElement;
    rxVal: HTMLElement;
    ryVal: HTMLElement;
    rzVal: HTMLElement;
    row: HTMLElement;
  }
>();

// ─── Saved Pose List UI ─────────────────────────────────────

function renderPoseList(): void {
  if (!poseListEl) return;
  poseListEl.innerHTML = '';

  if (savedPoses.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'placeholder';
    empty.textContent = 'No saved poses yet';
    poseListEl.appendChild(empty);
    return;
  }

  for (const pose of savedPoses) {
    const item = document.createElement('div');
    item.className = 'pose-item';

    const nameEl = document.createElement('span');
    nameEl.className = 'pose-item-name';
    nameEl.textContent = pose.name;

    const actions = document.createElement('div');
    actions.className = 'pose-item-actions';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-small';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', () => {
      const vrm = getCurrentVRM();
      if (vrm) {
        applyPose(vrm, pose);
        refreshAllBoneSliders();
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-small btn-danger';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
      const idx = savedPoses.indexOf(pose);
      if (idx !== -1) {
        savedPoses.splice(idx, 1);
        savePosesToStorage(savedPoses);
        renderPoseList();
      }
    });

    actions.appendChild(applyBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(nameEl);
    item.appendChild(actions);
    poseListEl.appendChild(item);
  }
}

function saveCurrent(): void {
  const vrm = getCurrentVRM();
  if (!vrm) return;

  const name = prompt('Pose name:');
  if (!name) return;

  const pose = capturePose(vrm, name.trim());
  savedPoses.push(pose);
  savePosesToStorage(savedPoses);
  renderPoseList();
}

function exportPoses(): void {
  if (savedPoses.length === 0) {
    alert('No poses to export.');
    return;
  }
  const json = JSON.stringify(savedPoses, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'webvrm-poses.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importPoses(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result as string) as SavedPose[];
        if (!Array.isArray(imported)) throw new Error('invalid');
        for (const p of imported) {
          if (typeof p.name !== 'string' || typeof p.bones !== 'object') {
            throw new Error('invalid pose format');
          }
        }
        savedPoses.push(...imported);
        savePosesToStorage(savedPoses);
        renderPoseList();
      } catch {
        alert('Failed to import poses. Ensure the file is valid JSON.');
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

// ─── Pose Detail (per-bone rotation sliders) ────────────────

function buildPoseDetail(container: HTMLElement): void {
  poseDetailEl = document.createElement('div');
  poseDetailEl.className = 'pose-detail';

  const heading = document.createElement('h3');
  heading.textContent = 'Bone Rotations';
  poseDetailEl.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'pose-detail-hint';
  hint.textContent = 'Click a bone on the model or a name below to select it.';
  poseDetailEl.appendChild(hint);

  boneSliders.clear();

  for (const boneName of POSEABLE_BONES) {
    const row = document.createElement('div');
    row.className = 'bone-row';
    row.dataset.bone = boneName;

    const nameBtn = document.createElement('button');
    nameBtn.className = 'bone-name-btn';
    nameBtn.textContent = boneName;
    nameBtn.addEventListener('click', () => {
      selectBoneByName(boneName);
      highlightBoneRow(boneName);
    });
    row.appendChild(nameBtn);

    const slidersDiv = document.createElement('div');
    slidersDiv.className = 'bone-sliders';

    const { slider: rx, valSpan: rxVal } = createRotationSlider('X', boneName);
    const { slider: ry, valSpan: ryVal } = createRotationSlider('Y', boneName);
    const { slider: rz, valSpan: rzVal } = createRotationSlider('Z', boneName);

    slidersDiv.appendChild(rx.parentElement!);
    slidersDiv.appendChild(ry.parentElement!);
    slidersDiv.appendChild(rz.parentElement!);
    row.appendChild(slidersDiv);

    poseDetailEl.appendChild(row);

    boneSliders.set(boneName, {
      rx, ry, rz, rxVal, ryVal, rzVal, row,
    });
  }

  container.appendChild(poseDetailEl);
}

function createRotationSlider(
  axis: string,
  boneName: string,
): { slider: HTMLInputElement; valSpan: HTMLElement } {
  const wrap = document.createElement('div');
  wrap.className = 'bone-slider-row';

  const label = document.createElement('label');
  const colors: Record<string, string> = { X: '#ff4444', Y: '#44ff44', Z: '#4444ff' };
  label.innerHTML = `<span style="color:${colors[axis]}">${axis}</span>`;

  const numInput = document.createElement('input');
  numInput.type = 'number';
  numInput.className = 'slider-num-input';
  numInput.min = '-180';
  numInput.max = '180';
  numInput.step = '1';
  numInput.value = '0';
  label.appendChild(numInput);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '-180';
  slider.max = '180';
  slider.step = '1';
  slider.value = '0';

  // Range slider → update number input and apply rotation
  slider.addEventListener('input', () => {
    numInput.value = slider.value;
    applyBoneRotation(boneName);
  });

  // Number input → update range slider and apply rotation
  numInput.addEventListener('input', () => {
    let val = parseInt(numInput.value, 10);
    if (isNaN(val)) return;
    val = Math.max(-180, Math.min(180, val));
    slider.value = String(val);
    applyBoneRotation(boneName);
  });

  // Also handle 'change' for when user tabs out or presses Enter
  numInput.addEventListener('change', () => {
    let val = parseInt(numInput.value, 10);
    if (isNaN(val)) val = 0;
    val = Math.max(-180, Math.min(180, val));
    numInput.value = String(val);
    slider.value = String(val);
    applyBoneRotation(boneName);
  });

  wrap.appendChild(label);
  wrap.appendChild(slider);

  // Use the numInput as the valSpan so refreshBoneSliders can update it
  return { slider, valSpan: numInput };
}

function applyBoneRotation(boneName: string): void {
  const vrm = getCurrentVRM();
  if (!vrm) return;

  const entry = boneSliders.get(boneName);
  if (!entry) return;

  const bone = vrm.humanoid?.getNormalizedBoneNode(boneName as VRMHumanBoneName);
  if (!bone) return;

  const rx = parseFloat(entry.rx.value) * DEG2RAD;
  const ry = parseFloat(entry.ry.value) * DEG2RAD;
  const rz = parseFloat(entry.rz.value) * DEG2RAD;

  const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
  bone.quaternion.setFromEuler(euler);
}

/**
 * Highlight a specific bone row in the panel.
 */
export function highlightBoneRow(boneName: string | null): void {
  for (const [name, entry] of boneSliders) {
    if (name === boneName) {
      entry.row.classList.add('bone-row-selected');
      entry.row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      entry.row.classList.remove('bone-row-selected');
    }
  }
}

/**
 * Refresh slider values to match the current bone quaternions.
 */
export function refreshBoneSliders(boneName: string): void {
  const vrm = getCurrentVRM();
  if (!vrm) return;
  const entry = boneSliders.get(boneName);
  if (!entry) return;
  const bone = vrm.humanoid?.getNormalizedBoneNode(boneName as VRMHumanBoneName);
  if (!bone) return;

  const euler = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
  const rx = Math.round(euler.x * RAD2DEG);
  const ry = Math.round(euler.y * RAD2DEG);
  const rz = Math.round(euler.z * RAD2DEG);

  entry.rx.value = String(rx);
  entry.ry.value = String(ry);
  entry.rz.value = String(rz);
  // rxVal, ryVal, rzVal are now <input> elements
  (entry.rxVal as HTMLInputElement).value = String(rx);
  (entry.ryVal as HTMLInputElement).value = String(ry);
  (entry.rzVal as HTMLInputElement).value = String(rz);
}

/**
 * Refresh all bone sliders from current model state.
 */
export function refreshAllBoneSliders(): void {
  for (const boneName of POSEABLE_BONES) {
    refreshBoneSliders(boneName);
  }
}

// ─── Main Build Function ────────────────────────────────────

/**
 * Build the Poses tab UI inside the given container element.
 */
export function buildPoseManagerPanel(container: HTMLElement): void {
  container.innerHTML = '';

  // Preset poses section
  const presetHeading = document.createElement('h3');
  presetHeading.textContent = 'Preset Poses';
  container.appendChild(presetHeading);

  const presetGrid = document.createElement('div');
  presetGrid.className = 'pose-preset-grid';

  for (const preset of POSE_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-small';
    btn.textContent = preset.name;
    btn.addEventListener('click', () => {
      const vrm = getCurrentVRM();
      if (vrm) {
        preset.apply(vrm);
        refreshAllBoneSliders();
      }
    });
    presetGrid.appendChild(btn);
  }
  container.appendChild(presetGrid);

  // Saved poses section
  const savedHeading = document.createElement('h3');
  savedHeading.textContent = 'Saved Poses';
  container.appendChild(savedHeading);

  const toolbar = document.createElement('div');
  toolbar.className = 'pose-toolbar';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-small';
  saveBtn.textContent = '💾 Save Current';
  saveBtn.addEventListener('click', saveCurrent);

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-small';
  importBtn.textContent = '📥 Import';
  importBtn.addEventListener('click', importPoses);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-small';
  exportBtn.textContent = '📤 Export';
  exportBtn.addEventListener('click', exportPoses);

  toolbar.appendChild(saveBtn);
  toolbar.appendChild(importBtn);
  toolbar.appendChild(exportBtn);
  container.appendChild(toolbar);

  poseListEl = document.createElement('div');
  poseListEl.className = 'pose-list';
  container.appendChild(poseListEl);

  savedPoses = loadSavedPoses();
  renderPoseList();

  // Pose detail (per-bone sliders)
  buildPoseDetail(container);

  // Initialize sliders from current model state
  refreshAllBoneSliders();
}
