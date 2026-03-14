import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { SceneContext } from './scene';

let currentVRM: VRM | null = null;

export function getCurrentVRM(): VRM | null {
  return currentVRM;
}

export async function loadVRM(file: File, ctx: SceneContext): Promise<VRM> {
  // Dispose previous VRM
  if (currentVRM) {
    VRMUtils.deepDispose(currentVRM.scene);
    ctx.scene.remove(currentVRM.scene);
    currentVRM = null;
  }

  const url = URL.createObjectURL(file);

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

    return vrm;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function updateVRM(delta: number): void {
  if (currentVRM) {
    currentVRM.update(delta);
  }
}
