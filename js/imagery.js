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

export function slugify(q) {
  return q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function loadOfflineManifest(query) {
  const slug = slugify(query);
  const base = new URL('../data/', import.meta.url);
  try {
    const r = await fetch(`${base}${slug}.json`);
    if (r.ok) return await r.json();
  } catch (e) { /* offline file absent */ }
  try {
    const idx = await fetch(`${base}index.json`);
    if (idx.ok) {
      const list = await idx.json();
      const hit = list.find(m => slugify(m.query) === slug || m.query.toLowerCase() === query.toLowerCase());
      if (hit) {
        const r2 = await fetch(`${base}${slugify(hit.query)}.json`);
        if (r2.ok) return await r2.json();
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

export function decodeSatManifest(manifest) {
  const cols = manifest.cols, rows = manifest.rows;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cols * CFG.tileSize;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3d5c3b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const put = entry => new Promise(res => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, entry.i * CFG.tileSize, entry.j * CFG.tileSize); res(); };
    img.onerror = res;
    img.src = 'data:image/png;base64,' + entry.data;
  });
  return Promise.all(manifest.tiles.map(put)).then(() => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const tileMeters = (40075016.686 * Math.cos(manifest.lat * Math.PI / 180)) / 2 ** manifest.zoom;
    const cx = lonToTileX(manifest.lon, manifest.zoom), cy = latToTileY(manifest.lat, manifest.zoom);
    return {
      texture: tex,
      span: tileMeters * cols,
      u0: (cx - manifest.tx0) / cols,
      v0: 1 - (cy - manifest.ty0) / rows,
    };
  });
}

export async function makeSatTexture(lat0, lon0, offlineManifest) {
  if (offlineManifest) return decodeSatManifest(offlineManifest);
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const z = CFG.satelliteZoom;
  const tileCanvas = CFG.tileSize;
  const cols = 5, rows = 5;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cols * tileCanvas;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3d5c3b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    const cx = lonToTileX(lon0, z), cy = latToTileY(lat0, z);
    const tx0 = Math.floor(cx) - 2, ty0 = Math.floor(cy) - 2;
    let pending = cols * rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const tx = tx0 + i, ty = ty0 + j;
      loadImg(satURL(tx, ty, z)).then(img => {
        ctx.drawImage(img, 0, 0, 256, 256, i * tileCanvas, j * tileCanvas, tileCanvas, tileCanvas);
      }).catch(() => {}).finally(() => {
        if (--pending === 0) {
          tex.image = canvas;
          tex.needsUpdate = true;
          const tileMeters = (40075016.686 * Math.cos(lat0 * Math.PI / 180)) / Math.pow(2, z);
          const span = tileMeters * cols;
          const u0 = (cx - tx0) / cols;
          const v0 = 1 - (cy - ty0) / rows;
          resolve({ texture: tex, span, u0, v0 });
        }
      });
    }
  });
}
