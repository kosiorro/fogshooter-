import * as THREE from 'three';
import { CFG, STYLE } from './config.js';
import { project, ringArea, bbox } from './geo.js';
import { averageHull, dist2D } from './hull.js';
import { makeSatTexture } from './imagery.js';

const R = CFG.mapRadius;
const SCALE = 1;

function wayLevels(tags, areaM2) {
  const lv = parseFloat(tags['building:levels']);
  const h = parseFloat(tags.height) || parseFloat(tags['building:height']);
  if (h > 2) return Math.max(1, h / CFG.heightPerLevel);
  if (!isNaN(lv) && lv > 0) return lv;
  if (tags.building === 'house' || tags.building === 'detached' || tags['building:house']) return 1.5;
  if (tags.building === 'garage' || tags.building === 'shed') return 1;
  if (tags.building === 'church' || tags['building:church'] || tags.building === 'cathedral') return 4;
  return Math.max(1, Math.min(6, 1 + areaM2 / 250));
}

function levelsToHeight(lv) {
  return Math.max(2.2, lv * CFG.heightPerLevel);
}

function buildingFootprint(way) {
  const pts = way.pts.map(([lat, lon]) => {
    const [x, z] = project(lat, lon, 0, 0, SCALE);
    return { x, z };
  });
  const realArea = ringArea(way.pts);
  return { pts, realArea };
}

function clampToDisk(pts, maxR = R * 0.96) {
  const cx = 0, cz = 0;
  return pts.map(p => {
    const d = Math.hypot(p.x - cx, p.z - cz);
    if (d <= maxR) return p;
    const s = maxR / d;
    return { x: cx + (p.x - cx) * s, z: cz + (p.z - cz) * s };
  });
}

function snapLine(pts, L) {
  const out = [];
  const stride = 3.0;
  const total = pts.reduce((acc, p, i) => {
    if (i === 0) return 0;
    return acc + dist2D(p.x, p.z, pts[i - 1].x, pts[i - 1].z);
  }, 0);
  if (total < 0.05) return out;
  const n = Math.max(2, Math.min(L, Math.ceil(total / stride)));
  let seg = 0, segLen = dist2D(pts[1].x, pts[1].z, pts[0].x, pts[0].z);
  let walked = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    while (walked + segLen < target && seg < pts.length - 2) {
      walked += segLen;
      seg++;
      segLen = dist2D(pts[seg + 1].x, pts[seg + 1].z, pts[seg].x, pts[seg].z);
    }
    const t = segLen > 0 ? (target - walked) / segLen : 0;
    const a = pts[seg], b = pts[seg + 1] || pts[seg];
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  return out;
}

export async function buildMap(scene, groups, lat0, lon0, onStatus) {
  const buildings = groups.buildings;
  const roadWays = groups.highways.filter(w => w.pts.length >= 2);
  const waterWays = groups.water;
  const railWays = groups.rail;
  const greenWays = groups.green;
  const treeNodes = groups.trees;

  const projectPts = (pts) => pts.map(([lat, lon]) => {
    const [x, z] = project(lat, lon, lat0, lon0, SCALE);
    return { x, z };
  });

  const blds = [];
  for (const w of buildings) {
    const fp = buildingFootprint(w);
    if (fp.pts.length < 3 || fp.realArea < 20) continue;
    blds.push({ way: w, fp });
  }
  blds.sort((a, b) => b.fp.realArea - a.fp.realArea);
  const bldTaken = [];
  const pickBuildings = [];
  for (const b of blds) {
    const hull = averageHull(b.fp.pts);
    const c = hull.reduce((a, p) => ({ x: a.x + p.x / hull.length, z: a.z + p.z / hull.length }), { x: 0, z: 0 });
    let ok = true;
    for (const t of bldTaken) {
      if (Math.hypot(t.x - c.x, t.z - c.z) < Math.min(t.r + Math.sqrt(b.fp.realArea) * SCALE * 0.22 + 1.5, 10)) { ok = false; break; }
    }
    if (!ok) continue;
    bldTaken.push({ x: c.x, z: c.z, r: Math.sqrt(b.fp.realArea) * SCALE * 0.16 });
    pickBuildings.push(b);
    if (pickBuildings.length >= 150) break;
  }

  const geometryArrays = {
    building: { pos: [], norm: [], uv: [], idx: [] },
    roof: { pos: [], norm: [], uv: [], idx: [] },
    road: { pos: [], norm: [], uv: [], idx: [] },
    rail: { pos: [], norm: [], uv: [], idx: [] },
    water: { pos: [], norm: [], uv: [], idx: [] },
    grass: { pos: [], norm: [], uv: [], idx: [] },
  };

  const obstacles = [];
  const pushQuad = (g, a, b, c, d) => {
    const s = g.pos.length / 3;
    for (const p of [a, b, c, d]) g.pos.push(p.x, p.y, p.z);
    const n = a.n;
    for (const p of [a, b, c, d]) g.norm.push(n.x, n.y, n.z);
    g.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    g.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
  };

  const addExtrude = (ring, h, key, uvRep) => {
    const g = geometryArrays[key];
    const n = ring.length - 1;
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const nx = -dz / len, nz = dx / len;
      const s = g.pos.length / 3;
      const ua = (a.x + R) * uvRep, va = (a.z + R) * uvRep;
      const ub = (b.x + R) * uvRep, vb = (b.z + R) * uvRep;
      const uh = h * uvRep;
      g.pos.push(a.x, 0, a.z, b.x, 0, b.z, b.x, h, b.z, a.x, h, a.z);
      g.norm.push(nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz);
      g.uv.push(ua, va, ub, vb, ub, vb + uh, ua, va + uh);
      g.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
    }
  };

  const addTop = (ring, y, key, uvRep) => {
    const g = geometryArrays[key];
    const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
    const cz = ring.reduce((s, p) => s + p.z, 0) / ring.length;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      const nxz = ((b.x - a.x) * (cz - a.z) - (b.z - a.z) * (cx - a.x));
      const s = g.pos.length / 3;
      g.pos.push(a.x, y, a.z, b.x, y, b.z, cx, y, cz);
      const flip = nxz > 0 ? 1 : -1;
      for (let k = 0; k < 3; k++) g.norm.push(0, 1, 0);
      g.uv.push(a.x * uvRep, a.z * uvRep, b.x * uvRep, b.z * uvRep, cx * uvRep, cz * uvRep);
      if (flip > 0) g.idx.push(s, s + 1, s + 2);
      else g.idx.push(s, s + 2, s + 1);
    }
  };

  const ringClosed = (ring) => {
    const a = ring[0], b = ring[ring.length - 1];
    ring.push({ x: a.x, z: a.z });
  };

  // Buildings
  const buildingBoxes = [];
  for (const b of pickBuildings) {
    let ring = averageHull(b.fp.pts);
    if (ring.length < 3) continue;
    ring = clampToDisk(ring);
    ringClosed(ring);
    const lv = wayLevels(b.way.tags, b.fp.realArea);
    const h = levelsToHeight(lv);
    addExtrude(ring, h, 'building', uvRep);
    addTop(ring, h, 'roof', 0.05);
    const bb = bbox(ring);
    buildingBoxes.push(bb);
    obstacles.push(bb);
  }

  // Roads
  const addRibbon = (pts, width, key, uvRep, y = 0.012) => {
    const g = geometryArrays[key];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.02) continue;
      const nx = -dz / len * width / 2, nz = dx / len * width / 2;
      const s = g.pos.length / 3;
      g.pos.push(a.x + nx, y, a.z + nz, a.x - nx, y, a.z - nz, b.x - nx, y, b.z - nz, b.x + nx, y, b.z + nz);
      for (let k = 0; k < 4; k++) g.norm.push(0, 1, 0);
      const u = len * uvRep;
      g.uv.push(0, 0, 1, 0, 1, u, 0, u);
      g.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
    }
  };

  const highwayWidth = (t) => {
    if (t.highway === 'footway' || t.highway === 'path' || t.highway === 'pedestrian') return 2.5;
    if (t.highway === 'service' || t.highway === 'track') return 4;
    if (t.highway === 'residential' || t.highway === 'living_street') return 6.5;
    if (t.highway === 'primary' || t.highway === 'secondary' || t.highway === 'tertiary') return 10;
    if (t.highway === 'motorway' || t.highway === 'trunk') return 13;
    return 5;
  };

  for (const w of roadWays) {
    const pts = snapLine(projectPts(w.pts), 200);
    if (pts.length < 2) continue;
    addRibbon(pts, highwayWidth(w.tags), 'road', 0.1);
  }

  for (const w of railWays) {
    const pts = snapLine(projectPts(w.pts), 150);
    if (pts.length < 2) continue;
    addRibbon(pts, 3, 'rail', 0.1);
  }

  for (const w of waterWays) {
    const pts = projectPts(w.pts);
    if (w.closed && pts.length > 3) {
      let ring = averageHull(pts);
      ring = clampToDisk(ring, R);
      ringClosed(ring);
      addTop(ring, 0.05, 'water', 0.02);
    } else {
      const snapped = snapLine(pts, 150);
      addRibbon(snapped, 6, 'water', 0.02, 0.05);
    }
  }

  for (const w of greenWays) {
    const pts = projectPts(w.pts);
    if (pts.length > 3) {
      let ring = averageHull(pts);
      ring = clampToDisk(ring, R * 1.04);
      ringClosed(ring);
      addTop(ring, 0.02, 'grass', 0.03);
    }
  }

  const finalize = (key, material) => {
    const g = geometryArrays[key];
    if (!g.idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.norm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.idx);
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    if (key === 'building' || key === 'roof') mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  };

  onStatus('Pobieranie zdjęcia satelitarnego…');
  const sat = await makeSatTexture(lat0, lon0);
  const groundTexture = sat.texture;
  const uvRep = 2 * R / sat.span;
  groundTexture.repeat.set(uvRep, uvRep);
  groundTexture.offset.set(sat.u0 - uvRep / 2, sat.v0 - uvRep / 2);

  const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.95, metalness: 0 });
  const diskGeo = new THREE.CircleGeometry(R, 64);
  diskGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(diskGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: false, color: STYLE.wall, roughness: 0.9, metalness: 0.02, map: groundTexture });
  const roofMat = new THREE.MeshStandardMaterial({ color: STYLE.roofColor, roughness: 0.95, metalness: 0.05 });
  const roadMat = new THREE.MeshStandardMaterial({ color: STYLE.asphalt, roughness: 1 });
  const railMat = new THREE.MeshStandardMaterial({ color: STYLE.rail, roughness: 1 });
  const waterMat = new THREE.MeshStandardMaterial({ color: STYLE.water, roughness: 0.25, metalness: 0.15 });
  const grassMat = new THREE.MeshStandardMaterial({ color: STYLE.grass, roughness: 1 });

  finalize('building', wallMat);
  finalize('roof', roofMat);
  finalize('road', roadMat);
  finalize('rail', railMat);
  finalize('water', waterMat);
  finalize('grass', grassMat);

  // Trees
  const treeGeoms = [];
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 4, 6);
  trunkGeo.translate(0, 2, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.6, 1);
  crownGeo.translate(0, 6.2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: STYLE.trunk, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: STYLE.crown, roughness: 1, flatShading: true });
  const rand = mulberry(1234);
  const maxTrees = 160;
  let placed = 0;
  for (const node of treeNodes) {
    if (placed >= maxTrees) break;
    const [x, z] = project(node.lat, node.lon, lat0, lon0, SCALE);
    if (Math.hypot(x, z) > R * 0.97) continue;
    if (Math.hypot(x, z) < 6) continue;
    let blocked = false;
    for (const bb of buildingBoxes) {
      if (x > bb.minX - 2 && x < bb.maxX + 2 && z > bb.minZ - 2 && z < bb.maxZ + 2) { blocked = true; break; }
    }
    if (blocked) continue;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    const crown = new THREE.Mesh(crownGeo, crownMat);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const s = 0.7 + rand() * 0.9;
    g.scale.setScalar(s);
    g.rotation.y = rand() * Math.PI * 2;
    g.add(trunk, crown);
    scene.add(g);
    obstacles.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, h: 4 });
    placed++;
  }

  const edge = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.5, R + 0.5, 30, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x232a31, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  );
  edge.position.y = 15;
  scene.add(edge);

  return { obstacles, ground };
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
