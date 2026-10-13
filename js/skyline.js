import * as THREE from 'three';

const PANORAMA_URL = './assets/panorama-poznan.jpg';
const REPEAT = 4;
const RADIUS = 200;
const HEIGHT = 110;

export function addSkyline(scene, fogColor) {
  const tex = loadPanorama();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    fog: false,
    transparent: true,
    opacity: 0.95,
  });
  const geo = new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 64, 1, true);
  geo.translate(0, HEIGHT / 2 - 18, 0);
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  const ground = new THREE.Mesh(
    new THREE.RingGeometry(RADIUS * 0.55, RADIUS + 2, 64),
    new THREE.MeshBasicMaterial({ color: fogColor, fog: false, transparent: true, opacity: 0.96 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  scene.add(ground);
  mesh.userData.ground = ground;

  const loader = new THREE.TextureLoader();
  window.__fogSkylineApi = {
    mesh,
    setImage(url) {
      loader.load(url, t => {
        prepTex(t);
        mat.map = t;
        mat.needsUpdate = true;
      });
    },
    reset() {
      mat.map = tex;
      mat.needsUpdate = true;
    },
  };
  return mesh;
}

function prepTex(t) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(REPEAT, 1);
  t.anisotropy = 4;
}

function loadPanorama() {
  const loader = new THREE.TextureLoader();
  const tex = loader.load(PANORAMA_URL);
  prepTex(tex);
  return tex;
}
