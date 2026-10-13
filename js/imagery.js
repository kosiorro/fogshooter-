import * as THREE from 'three';
import { CFG } from './config.js';
import { lonToTileX, latToTileY } from './tiles.js';

const tileCache = new Map();
let inFlight = 0;
const queue = [];

function pump() {
  while (inFlight < CFG.maxConcurrentImg && queue.length) {
    const { url, resolve, reject } = queue.shift();
    inFlight++;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { tileCache.set(url, img); inFlight--; resolve(img); pump(); };
    img.onerror = () => { inFlight--; reject(new Error('img ' + url)); pump(); };
    img.src = url;
  }
}

export function loadImg(url) {
  if (tileCache.has(url)) return Promise.resolve(tileCache.get(url));
  return new Promise((resolve, reject) => { queue.push({ url, resolve, reject }); pump(); });
}

export function satURL(tx, ty, z) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`;
}

export function makeSatTexture(lat0, lon0, scale) {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const z = CFG.satelliteZoom;
  const tileCanvas = CFG.tileSize;
  const cols = 4, rows = 4;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cols * tileCanvas;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3d5c3b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let drawn = 0, failed = 0;
  return new Promise((resolve) => {
    const cx = lonToTileX(lon0, z), cy = latToTileY(lat0, z);
    const tx0 = Math.floor(cx) - 1, ty0 = Math.floor(cy) - 1;
    let pending = cols * rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const tx = tx0 + i, ty = ty0 + j;
      loadImg(satURL(tx, ty, z)).then(img => {
        ctx.drawImage(img, 0, 0, 256, 256, i * tileCanvas, j * tileCanvas, tileCanvas, tileCanvas);
        drawn++;
      }).catch(() => { failed++; }).finally(() => {
        if (--pending === 0) { tex.image = canvas; tex.needsUpdate = true; resolve(tex); }
      });
    }
  });
}
