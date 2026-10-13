import * as THREE from 'three';
import { GLTFLoader } from './lib/GLTFLoader.js';

export function loadGLBMap(scene, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(arrayBuffer, '', (gltf) => {
      const root = gltf.scene;
      root.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = Math.min(220 / Math.max(size.x, size.z), 60);
      root.scale.setScalar(scale);
      const box2 = new THREE.Box3().setFromObject(root);
      const c2 = box2.getCenter(new THREE.Vector3());
      root.position.x -= c2.x;
      root.position.z -= c2.z;
      root.position.y -= box2.min.y;

      const obstacles = [];
      root.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material) {
            o.material.side = THREE.FrontSide;
            if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      });
      scene.add(root);
      root.updateMatrixWorld(true);

      const finalBox = new THREE.Box3().setFromObject(root);
      const dx = (finalBox.max.x - finalBox.min.x) / 8;
      const dz = (finalBox.max.z - finalBox.min.z) / 8;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const x = finalBox.min.x + dx * (i + 0.5);
          const z = finalBox.min.z + dz * (j + 0.5);
          const cbox = new THREE.Box3(
            new THREE.Vector3(x - dx / 2, 0, z - dz / 2),
            new THREE.Vector3(x + dx / 2, 2.5, z + dz / 2)
          );
          obstacles.push({
            minX: cbox.min.x, maxX: cbox.max.x,
            minZ: cbox.min.z, maxZ: cbox.max.z,
            h: Math.max(2.5, 10),
          });
        }
      }

      const radius = Math.max(
        Math.hypot(finalBox.min.x, finalBox.min.z),
        Math.hypot(finalBox.max.x, finalBox.max.z)
      );
      const baseScale = scale;
      const baseY = root.position.y;
      const rebuild = () => {
        obstacles.length = 0;
        const fb = new THREE.Box3().setFromObject(root);
        const dx = (fb.max.x - fb.min.x) / 8;
        const dz = (fb.max.z - fb.min.z) / 8;
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
          obstacles.push({
            minX: fb.min.x + dx * i, maxX: fb.min.x + dx * (i + 1),
            minZ: fb.min.z + dz * j, maxZ: fb.min.z + dz * (j + 1),
            h: Math.max(2.5, 10),
          });
        }
      };
      window.__fogGLBApi = { root, baseScale, baseY, rebuild, radius, obstacles };
      resolve({ obstacles, radius, center: finalBox.getCenter(new THREE.Vector3()) });
    }, reject);
  });
}
