import * as THREE from 'three';
import { mergeGeometries } from './lib/BufferGeometryUtils.js';
import { CFG } from './config.js';

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, '#4a5d43');
  g.addColorStop(1, '#39492f');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const px = Math.random() * 512, py = Math.random() * 512;
    const v = Math.random();
    x.fillStyle = v > 0.6 ? 'rgba(90,110,70,0.5)' : v > 0.3 ? 'rgba(50,60,40,0.5)' : 'rgba(70,85,55,0.4)';
    x.fillRect(px, py, 2, 2);
  }
  for (let i = 0; i < 30; i++) {
    x.strokeStyle = 'rgba(60,75,50,0.35)';
    x.lineWidth = 1 + Math.random() * 2;
    x.beginPath();
    let px = Math.random() * 512, py = Math.random() * 512;
    x.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      px += (Math.random() - 0.5) * 90;
      py += (Math.random() - 0.5) * 90;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWallTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#9a8f7a';
  x.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 16; r++) {
    for (let col = 0; col < 8; col++) {
      const off = (r % 2) * 16;
      const h = 10 + Math.random() * 8;
      x.fillStyle = `hsl(${30 + Math.random() * 15}, ${18 + Math.random() * 14}%, ${52 + Math.random() * 18}%)`;
      x.fillRect(col * 32 + off, r * 16 + 2, 30, h);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildSimpleMap(scene) {
  const R = CFG.mapRadius;
  const obstacles = [];

  const groundTex = makeGroundTexture();
  const groundGeo = new THREE.CircleGeometry(R, 48);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
  ground.userData.repeat = 24;

  const wallTex = makeWallTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.95 });

  const rand = mulberry(42);
  const boxes = [];
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2;
    const d = 12 + rand() * (R - 25);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const w = 6 + rand() * 14;
    const dep = 6 + rand() * 14;
    const h = 4 + rand() * 12;
    boxes.push({ x, z, w, dep, h, rot: Math.round(rand() * 4) * (Math.PI / 2) });
  }

  for (const b of boxes) {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.dep);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.rotation.y = b.rot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.4, 0.3, b.dep + 0.4), roofMat);
    roof.position.set(b.x, b.h + 0.15, b.z);
    roof.rotation.y = b.rot;
    roof.castShadow = true;
    scene.add(roof);
    const pad = 0.6;
    const ext = Math.max(b.w, b.dep) / 2 + pad;
    obstacles.push({ minX: b.x - ext, maxX: b.x + ext, minZ: b.z - ext, maxZ: b.z + ext, h: b.h });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 4.5, 6);
  trunkGeo.translate(0, 2.25, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.8, 1);
  crownGeo.translate(0, 6.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4a38, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x39543a, roughness: 1, flatShading: true });
  const trunkParts = [], crownParts = [];
  let trees = 0;
  for (let i = 0; i < 300 && trees < 50; i++) {
    const a = rand() * Math.PI * 2;
    const d = 6 + rand() * (R - 10);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    let blocked = false;
    for (const o of obstacles) {
      if (x > o.minX - 3 && x < o.maxX + 3 && z > o.minZ - 3 && z < o.maxZ + 3) { blocked = true; break; }
    }
    if (blocked) continue;
    const sc = 0.7 + rand() * 0.8;
    const m4 = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2),
      new THREE.Vector3(sc, sc, sc)
    );
    trunkParts.push(trunkGeo.clone().applyMatrix4(m4));
    crownParts.push(crownGeo.clone().applyMatrix4(m4));
    obstacles.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, h: 4 });
    trees++;
  }
  const trunkMesh = new THREE.Mesh(mergeGeometries(trunkParts), trunkMat);
  const crownMesh = new THREE.Mesh(mergeGeometries(crownParts), crownMat);
  scene.add(trunkMesh, crownMesh);

  const edge = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.5, R + 0.5, 30, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x232a31, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  edge.position.y = 15;
  scene.add(edge);

  return { obstacles, ground, radius: R };
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
