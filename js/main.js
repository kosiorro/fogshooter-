import * as THREE from 'three';
import { CFG } from './config.js';
import { geocode, fetchOSM, classify } from './osm.js';
import { loadOfflineManifest } from './imagery.js';
import { loadGLBMap } from './glbMap.js';
import { Editor, findFreeSpot } from './editor.js';
import { buildSimpleMap } from './simpleMap.js';
import { buildMap } from './mapBuilder.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Weapon } from './weapon.js';
import { Effects } from './effects.js';
import { circleHitsAny, spawnPoints, rayHitsOBB } from './collision.js';
import { project } from './geo.js';

const $ = id => document.getElementById(id);
const statusEl = $('status');
const loading = $('loading');
const hud = $('hud');
const endScreen = $('endScreen');

let renderer, scene, camera, player, weapon, effects, editor, groundMesh;
let enemies = [];
let obstacles = [];
let running = false, over = false;
let kills = 0, startTime = 0, clock = new THREE.Clock();
let raycaster = new THREE.Raycaster();
let pendingReloadMsg = false;

function setStatus(msg, err = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('err', err);
}

function initEditor() {
  if (editor) return;
  editor = new Editor(() => ({
    scene, player, obstacles, ground: groundMesh,
    mapRadius: window.__fogMapRadius || CFG.mapRadius,
  }));
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.inset = '0';
}

function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(CFG.fogColor);
  scene.fog = new THREE.FogExp2(CFG.fogColor, CFG.skyFog);
  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 600);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xcdd6df, 0x3a4046, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xe8e2d5, 1.4);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 260;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x8fa3b5, 0.35));
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

async function startSimple() {
  try {
    over = false;
    running = false;
    cleanupWorld();
    setupScene();
    hud.classList.add('hidden');
    if (!renderer) initRenderer();
    initEditor();

    const built = buildSimpleMap(scene);
    obstacles = built.obstacles;
    groundMesh = built.ground;
    window.__fogMapRadius = built.radius;

    player = new Player(camera, renderer.domElement);
    weapon = new Weapon(camera, scene);
    effects = new Effects(scene);

    const safe = findFreeSpot(obstacles, built.radius);
    player.pos.set(safe.x, CFG.playerHeight, safe.z);
    const sp = spawnPoints(CFG.enemyCount, CFG.spawnRange, obstacles, built.radius - 2);
    enemies = sp.map((pt, i) => new Enemy(scene, pt.x, pt.z, i));
    for (const e of enemies) e._lim = built.radius - 2;

    kills = 0;
    $('killCount').textContent = '0';
    $('healthFill').style.width = '100%';
    $('ammo').textContent = CFG.magSize;
    $('msg').style.opacity = 0;

    loading.classList.add('hidden');
    hud.classList.remove('hidden');
    $('objective').textContent = 'CEL: Eliminuj cele w mgle \u2014 MAPA TESTOWA';

    running = true;
    startTime = performance.now();
    clock.start();
    renderer.setAnimationLoop(loop);
    removeEventListener('resize', onResize);
    addEventListener('resize', onResize);
    renderer.domElement.requestPointerLock();
  } catch (e) {
    setStatus('Blad mapy testowej: ' + e.message, true);
    console.error(e);
  }
}

async function startGLB(file) {
  try {
    over = false;
    running = false;
    cleanupWorld();
    setupScene();
    hud.classList.add('hidden');
    setStatus('Wczytywanie modelu 3D\u2026');
    if (!renderer) initRenderer();

    scene.background = new THREE.Color(CFG.fogColor);
    scene.fog = new THREE.FogExp2(CFG.fogColor, CFG.skyFog * 0.55);

    const buf = await file.arrayBuffer();
    const built = await loadGLBMap(scene, buf);
    obstacles = built.obstacles;
    initEditor();
    groundMesh = built.ground;
    const mapR = Math.min(built.radius, CFG.mapRadius);
    window.__fogMapRadius = mapR;

    player = new Player(camera, renderer.domElement);
    weapon = new Weapon(camera, scene);
    effects = new Effects(scene);

    const safe = findFreeSpot(obstacles, mapR);
    player.pos.set(safe.x, CFG.playerHeight, safe.z);
    const sp = spawnPoints(CFG.enemyCount, [mapR * 0.5, mapR * 0.9], obstacles, mapR - 2);
    enemies = sp.map((pt, i) => new Enemy(scene, pt.x, pt.z, i));
    for (const e of enemies) {
      const lim = mapR - 2;
      e._lim = lim;
    }

    kills = 0;
    $('killCount').textContent = '0';
    $('healthFill').style.width = '100%';
    $('ammo').textContent = CFG.magSize;
    $('msg').style.opacity = 0;

    loading.classList.add('hidden');
    hud.classList.remove('hidden');
    $('objective').textContent = 'CEL: Eliminuj cele w mgle \u2014 MODEL 3D';

    running = true;
    startTime = performance.now();
    clock.start();
    renderer.setAnimationLoop(loop);
    removeEventListener('resize', onResize);
    addEventListener('resize', onResize);
    renderer.domElement.requestPointerLock();
  } catch (e) {
    setStatus('B\u0142\u0105d modelu: ' + e.message, true);
    console.error(e);
  }
}

function cleanupWorld() {
  if (!scene) return;
  if (camera) while (camera.children.length) camera.remove(camera.children[0]);
  const keep = new Set([camera]);
  for (const child of [...scene.children]) {
    if (!keep.has(child)) {
      scene.remove(child);
      if (child.geometry) child.geometry.dispose?.();
      if (child.material && child.material.dispose) child.material.dispose?.();
    }
  }
  scene.add(camera);
  enemies = [];
  obstacles = [];
}

async function startGame() {
  try {
    over = false;
    running = false;
    cleanupWorld();
    setupScene();
    hud.classList.add('hidden');

    setStatus('Szukanie lokacji…');
    const query = $('loc').value.trim() || 'Poznań';
    setStatus('Sprawdzam offline pakiet mapy…');
    const manifest = await loadOfflineManifest(query);
    if (manifest) setStatus('Znaleziono offline: ' + manifest.name + ' — bez pobierania z sieci');
    else setStatus('Szukanie lokacji online…');
    const loc = manifest
      ? { lat: manifest.lat, lon: manifest.lon, name: manifest.name }
      : await geocode(query);
    setStatus('Lokacja: ' + loc.name + ' — pobieram dane OSM…');
    const { elements } = await fetchOSM(loc.lat, loc.lon, CFG.minimapWays, manifest);
    const groups = classify(elements);
    const bldCount = groups.buildings.length;

    if (!renderer) initRenderer();
    initEditor();

    setStatus('Budowanie mapy 3D…');
    window.__fogMapRadius = CFG.mapRadius;
    const built = await buildMap(scene, groups, loc.lat, loc.lon, setStatus, manifest);
    obstacles = built.obstacles;
    groundMesh = built.ground;

    player = new Player(camera, renderer.domElement);
    weapon = new Weapon(camera, scene);
    effects = new Effects(scene);

    const safe = findFreeSpot(obstacles, window.__fogMapRadius || CFG.mapRadius);
    player.pos.set(safe.x, CFG.playerHeight, safe.z);
    const sp = spawnPoints(CFG.enemyCount, CFG.spawnRange, obstacles);
    enemies = sp.map((p, i) => new Enemy(scene, p.x, p.z, i));

    kills = 0;
    $('killCount').textContent = '0';
    $('healthFill').style.width = '100%';
    $('ammo').textContent = CFG.magSize;
    $('msg').style.opacity = 0;

    loading.classList.add('hidden');
    hud.classList.remove('hidden');
    $('objective').textContent = 'CEL: Eliminuj cele w mgle — ' + loc.name.toUpperCase();

    running = true;
    startTime = performance.now();
    clock.start();
    renderer.setAnimationLoop(loop);
    removeEventListener('resize', onResize);
    addEventListener('resize', onResize);
    renderer.domElement.requestPointerLock();
  } catch (e) {
    setStatus('Błąd: ' + e.message + ' — spróbuj inną lokację lub ponownie.', true);
    console.error(e);
  }
}

function shoot() {
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  const dir = player.forward();

  let best = null, bestT = 200, bestEnemy = null, bestIsHead = false;
  for (const e of enemies) {
    if (e.dead) continue;
    const hb = e.hitbox();
    const t = rayHitsOBB(origin, dir, hb);
    if (t && t < bestT) { bestT = t; bestEnemy = e; bestIsHead = false; }
    const p = e.group.position;
    const headY = 1.62 + p.y;
    const toHead = new THREE.Vector3(p.x - origin.x, headY - origin.y, p.z - origin.z);
    const proj = toHead.dot(dir);
    if (proj > 0 && proj < bestT + 0.5 && toHead.sub(dir.clone().multiplyScalar(proj)).length() < 0.2) {
      bestT = proj; bestEnemy = e; bestIsHead = true;
    }
  }

  const end = origin.clone().add(dir.clone().multiplyScalar(Math.min(bestT, 60)));
  effects.tracer(weapon.group.localToWorld(new THREE.Vector3(0, 0.01, -0.6)), end);

  if (bestEnemy) {
    const died = bestEnemy.takeDamage(CFG.gunDmg, bestIsHead);
    effects.sparkAt(end.x, end.y, end.z, 10, 0xd4442e);
    hitmarker(died);
    if (died) {
      kills++;
      $('killCount').textContent = kills;
      if (kills >= enemies.length) endGame(true);
    }
  } else {
    effects.sparkAt(end.x, Math.max(0.02, end.y), end.z, 6, 0x8f8f8f);
  }

  $('ammo').textContent = weapon.ammo;
  if (weapon.ammo === 0) showMsg('Przeładowanie... (R)');
  player.recoil = 1;
}

function enemyShoot(enemy, playerPos, dist) {
  const from = new THREE.Vector3(enemy.group.position.x, 1.4, enemy.group.position.z);
  const to = new THREE.Vector3(playerPos.x, playerPos.y - 0.25 + Math.random() * 0.4, playerPos.z);
  effects.tracer(from, to);
  const hitChance = Math.max(0.14, 0.72 - dist / 70);
  if (Math.random() < hitChance) {
    const fatal = player.takeDamage(CFG.enemyBulletDmg);
    $('healthFill').style.width = Math.max(0, player.hp) + '%';
    $('damageVignette').style.boxShadow = 'inset 0 0 140px rgba(200,30,30,.55)';
    setTimeout(() => { $('damageVignette').style.boxShadow = 'inset 0 0 140px rgba(200,30,30,0)'; }, 220);
    if (fatal) endGame(false);
  }
}

function hitmarker(kill) {
  const h = $('hitmarker');
  h.style.opacity = 1;
  setTimeout(() => { h.style.opacity = 0; }, kill ? 260 : 130);
}

function showMsg(text, ms = 1600) {
  const m = $('msg');
  m.textContent = text;
  m.style.opacity = 1;
  clearTimeout(m._t);
  m._t = setTimeout(() => { m.style.opacity = 0; }, ms);
}

function endGame(win) {
  if (over) return;
  over = true;
  running = false;
  document.exitPointerLock();
  const t = Math.round((performance.now() - startTime) / 1000);
  $('endTitle').textContent = win ? 'MISJA ZAKOŃCZONA' : 'ZGINĄŁEŚ';
  $('endTitle').style.color = win ? '#8fd0a0' : '#e08585';
  $('endStats').textContent = `Eliminacje: ${kills}/${enemies.length} · Czas: ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} · Lokacja: ${$('objective').textContent.split('— ')[1] || ''}`;
  setTimeout(() => endScreen.classList.remove('hidden'), 700);
}

function loop() {
  if (!running) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  const moving = player.keys.KeyW || player.keys.KeyA || player.keys.KeyS || player.keys.KeyD;
  player.update(dt, obstacles, circleHitsAny);
  weapon.update(dt, now, player, moving, () => {
    $('ammo').textContent = weapon.ammo;
    showMsg('Gotów!', 700);
  });

  const paused = player.isLocked();
  for (const e of enemies) {
    if (paused) e.update(dt, now, player.pos, obstacles, enemyShoot);
  }

  if (paused) {
    if (player.keys.KeyR) weapon.reload(now);
  }

  effects.update(dt);

  const t = Math.round((now - startTime) / 1000);
  $('timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

  const dirName = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((player.yaw % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 4)) % 8];
  $('compassN').textContent = dirName;

  renderer.render(scene, camera);
}

function onMouseDown(e) {
  if (e.button === 0 && running && player && weapon && player.isLocked()) {
    weapon.tryFire(performance.now(), shoot);
  }
}

document.addEventListener('mousedown', onMouseDown);

$('loadBtn').addEventListener('click', startGame);
$('glbBtn').addEventListener('click', () => $('glbFile').click());
$('simpleBtn').addEventListener('click', startSimple);
$('glbFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) startGLB(f);
});
document.addEventListener('dragover', e => { e.preventDefault(); });
document.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f && /\.(glb|gltf)$/i.test(f.name)) startGLB(f);
});
$('loc').addEventListener('keydown', e => { if (e.key === 'Enter') startGame(); });
$('againBtn').addEventListener('click', () => {
  endScreen.classList.add('hidden');
  loading.classList.remove('hidden');
  setStatus('Wybierz lokację i wczytaj mapę.');
});
