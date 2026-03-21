import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { getCurrentVRM } from './vrm-loader';
import { POSE_PRESETS } from './pose-presets';

/**
 * Pose Manager: save, load, import, and export VRM poses.
 * Poses include bone rotations and expression values.
 * Stored in localStorage for persistence across sessions.
 */

const STORAGE_KEY = 'webvrm-saved-poses';

export interface SavedPose {
  name: string;
  bones: Record<string, [number, number, number, number]>; // quaternion xyzw
  expressions: Record<string, number>;
}

/** Bones we capture/restore */
const CAPTURABLE_BONES: VRMHumanBoneName[] = [
  'hips' as VRMHumanBoneName,
  'spine' as VRMHumanBoneName,
  'chest' as VRMHumanBoneName,
  'upperChest' as VRMHumanBoneName,
  'neck' as VRMHumanBoneName,
  'head' as VRMHumanBoneName,
  'leftUpperArm' as VRMHumanBoneName,
  'leftLowerArm' as VRMHumanBoneName,
  'leftHand' as VRMHumanBoneName,
  'rightUpperArm' as VRMHumanBoneName,
  'rightLowerArm' as VRMHumanBoneName,
  'rightHand' as VRMHumanBoneName,
  'leftUpperLeg' as VRMHumanBoneName,
  'leftLowerLeg' as VRMHumanBoneName,
  'leftFoot' as VRMHumanBoneName,
  'rightUpperLeg' as VRMHumanBoneName,
  'rightLowerLeg' as VRMHumanBoneName,
  'rightFoot' as VRMHumanBoneName,
  'leftShoulder' as VRMHumanBoneName,
  'rightShoulder' as VRMHumanBoneName,
];

/** Capture current pose from the VRM model */
export function capturePose(vrm: VRM, name: string): SavedPose {
  const bones: Record<string, [number, number, number, number]> = {};

  for (const boneName of CAPTURABLE_BONES) {
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
  // Reset to default first
  vrm.humanoid?.resetNormalizedPose();

  // Apply bone rotations
  for (const [boneName, quat] of Object.entries(pose.bones)) {
    const bone = vrm.humanoid?.getNormalizedBoneNode(
      boneName as VRMHumanBoneName,
    );
    if (bone) {
      bone.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
    }
  }

  // Apply expressions
  if (vrm.expressionManager) {
    vrm.expressionManager.resetValues();
    for (const [name, val] of Object.entries(pose.expressions)) {
      vrm.expressionManager.setValue(name, val);
    }
  }
}

// --- localStorage persistence ---

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

// --- UI ---

let poseListEl: HTMLElement | null = null;
let savedPoses: SavedPose[] = [];

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

  for (let i = 0; i < savedPoses.length; i++) {
    const pose = savedPoses[i];
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
      if (vrm) applyPose(vrm, pose);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-small btn-danger';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
      savedPoses.splice(i, 1);
      savePosesToStorage(savedPoses);
      renderPoseList();
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
        // Validate structure
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
      if (vrm) preset.apply(vrm);
    });
    presetGrid.appendChild(btn);
  }
  container.appendChild(presetGrid);

  // Saved poses section
  const savedHeading = document.createElement('h3');
  savedHeading.textContent = 'Saved Poses';
  container.appendChild(savedHeading);

  // Action buttons
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

  // Pose list
  poseListEl = document.createElement('div');
  poseListEl.className = 'pose-list';
  container.appendChild(poseListEl);

  // Load from storage
  savedPoses = loadSavedPoses();
  renderPoseList();
}
