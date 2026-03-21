import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { SceneContext } from './scene';

export interface VRMLoadResult {
  vrm: VRM;
  animations: THREE.AnimationClip[];
}

let currentVRM: VRM | null = null;
let currentAnimations: THREE.AnimationClip[] = [];
let currentMixer: THREE.AnimationMixer | null = null;

export function getCurrentVRM(): VRM | null {
  return currentVRM;
}

export function getCurrentAnimations(): THREE.AnimationClip[] {
  return currentAnimations;
}

export function getCurrentMixer(): THREE.AnimationMixer | null {
  return currentMixer;
}

/**
 * Core VRM loading logic shared by file and URL loaders.
 */
async function loadVRMFromSource(
  url: string,
  ctx: SceneContext,
  revokeUrl: boolean,
): Promise<VRMLoadResult> {
  // Dispose previous VRM
  if (currentVRM) {
    currentMixer?.stopAllAction();
    currentMixer = null;
    VRMUtils.deepDispose(currentVRM.scene);
    ctx.scene.remove(currentVRM.scene);
    currentVRM = null;
    currentAnimations = [];
  }

  try {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm as VRM;

    if (!vrm) {
      throw new Error('Failed to load VRM data from file');
    }

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);

    // Rotate VRM0 models to face forward
    VRMUtils.rotateVRM0(vrm);

    vrm.scene.traverse((obj: THREE.Object3D) => {
      obj.frustumCulled = false;
    });

    ctx.scene.add(vrm.scene);
    currentVRM = vrm;
    currentAnimations = gltf.animations ?? [];
    currentMixer = new THREE.AnimationMixer(vrm.scene);

    return { vrm, animations: currentAnimations };
  } finally {
    if (revokeUrl) {
      URL.revokeObjectURL(url);
    }
  }
}

export async function loadVRM(file: File, ctx: SceneContext): Promise<VRMLoadResult> {
  const url = URL.createObjectURL(file);
  return loadVRMFromSource(url, ctx, true);
}

export async function loadVRMFromUrl(
  url: string,
  ctx: SceneContext,
): Promise<VRMLoadResult> {
  return loadVRMFromSource(url, ctx, false);
}

export function updateVRM(delta: number): void {
  if (currentVRM) {
    currentVRM.update(delta);
  }
  if (currentMixer) {
    currentMixer.update(delta);
  }
}
