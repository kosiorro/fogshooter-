import * as THREE from 'three';

export function makePoznanSkylineTexture() {
  const W = 2048, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  const sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#9fb4c8');
  sky.addColorStop(0.55, '#b9c3cc');
  sky.addColorStop(1, '#c9d2da');
  x.fillStyle = sky;
  x.fillRect(0, 0, W, H);

  const rand = mulberry(2023);

  const silhouette = (baseY, color, maxH, alpha) => {
    x.globalAlpha = alpha;
    x.fillStyle = color;
    let px = -50;
    while (px < W + 50) {
      const w = 30 + rand() * 120;
      const h = 20 + rand() * maxH;
      x.fillRect(px, baseY - h, w, h + 4);
      if (rand() > 0.7) {
        x.fillRect(px + w * 0.3, baseY - h - 14, 8, 14);
      }
      px += w + rand() * 18;
    }
    x.globalAlpha = 1;
  };

  silhouette(360, '#8296ab', 60, 0.55);
  silhouette(400, '#6a7f94', 110, 0.7);

  x.fillStyle = '#4d5f70';
  let px = 40;
  while (px < W) {
    const w = 40 + rand() * 90;
    const h = 30 + rand() * 130;
    x.fillRect(px, 440 - h, w, h + 20);
    if (rand() > 0.6) {
      const rows = 2 + Math.floor(rand() * 6);
      for (let r = 0; r < rows; r++) {
        x.fillStyle = 'rgba(255,214,150,0.65)';
        x.fillRect(px + 8, 448 - h + 10 + r * 12, w - 16, 5);
        x.fillStyle = '#4d5f70';
      }
    }
    px += w + 20 + rand() * 40;
  }

  drawCathedral(x, 420, 452);
  drawTownHall(x, 1250, 452);
  drawTower(x, 1650, 452, 62);
  drawTower(x, 1800, 452, 78);

  const haze = x.createLinearGradient(0, 200, 0, H);
  haze.addColorStop(0, 'rgba(185,195,204,0)');
  haze.addColorStop(1, 'rgba(185,195,204,0.9)');
  x.fillStyle = haze;
  x.fillRect(0, 200, W, H - 200);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function drawCathedral(x, cx, baseY) {
  x.fillStyle = '#3d4e5f';
  x.fillRect(cx - 70, baseY - 150, 140, 150);
  x.beginPath();
  x.moveTo(cx, baseY - 150);
  x.lineTo(cx - 70, baseY - 150);
  x.lineTo(cx - 78, baseY - 96);
  x.lineTo(cx + 78, baseY - 96);
  x.lineTo(cx + 70, baseY - 150);
  x.closePath();
  x.fill();
  const towers = [[-58, 200], [58, 200], [-28, 172], [28, 172]];
  for (const [dx, h] of towers) {
    x.fillRect(cx + dx - 12, baseY - h, 24, h);
    x.beginPath();
    x.moveTo(cx + dx - 14, baseY - h);
    x.lineTo(cx + dx, baseY - h - 26);
    x.lineTo(cx + dx + 14, baseY - h);
    x.fill();
  }
}

function drawTownHall(x, cx, baseY) {
  x.fillStyle = '#46586a';
  x.fillRect(cx - 55, baseY - 85, 110, 85);
  x.fillRect(cx - 20, baseY - 108, 40, 24);
  x.fillRect(cx - 8, baseY - 150, 16, 44);
  x.beginPath();
  x.moveTo(cx - 10, baseY - 150);
  x.lineTo(cx, baseY - 172);
  x.lineTo(cx + 10, baseY - 150);
  x.fill();
  x.fillStyle = '#d8c48a';
  x.fillRect(cx - 2, baseY - 148, 4, 4);
  x.fillStyle = 'rgba(255,220,150,0.8)';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      x.fillRect(cx - 44 + i * 24, baseY - 70 + j * 28, 12, 14);
    }
  }
}

function drawTower(x, cx, baseY, h) {
  x.fillStyle = '#42525f';
  x.fillRect(cx - 16, baseY - h, 32, h);
  x.fillStyle = 'rgba(180,215,235,0.85)';
  for (let r = 0; r < Math.floor(h / 14); r++) {
    x.fillRect(cx - 13, baseY - h + 8 + r * 13, 26, 7);
  }
  x.fillStyle = '#42525f';
  x.fillRect(cx - 18, baseY - h - 6, 36, 6);
}

export function addSkyline(scene, fogColor) {
  const tex = makePoznanSkylineTexture();
  const geo = new THREE.CylinderGeometry(340, 340, 190, 48, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    fog: false,
    transparent: true,
    opacity: 0.92,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 60;
  scene.add(mesh);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(340, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: fogColor, fog: false })
  );
  dome.position.y = 60;
  scene.add(dome);
  return mesh;
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
