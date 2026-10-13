#!/usr/bin/env node
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=';
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const SAT = (z, ty, tx) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`;

function bboxAround(lat, lon, halfMeters = 320) {
  const dLat = halfMeters / 111320;
  const dLon = halfMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}

function buildQuery([s, w, n, e], limit = 700) {
  return `[out:json][timeout:60];
way(${s},${w},${n},${e})["building"];
out geom ${limit};
way(${s},${w},${n},${e})["highway"];
out geom ${limit};
way(${s},${w},${n},${e})["natural"="water"];
out geom 80;
way(${s},${w},${n},${e})["waterway"~"river|stream|canal"];
out geom 60;
way(${s},${w},${n},${e})["railway"~"rail|tram"];
out geom 80;
way(${s},${w},${n},${e})["natural"~"wood|scrub"];
out geom 60;
way(${s},${w},${n},${e})["landuse"~"forest|grass|meadow|park"];
out geom 60;
node(${s},${w},${n},${e})["natural"="tree"];
out 300;`;
}

const lonToTileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const latToTileY = (lat, z) =>
  ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;

function slugify(q) {
  return q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchJSON(url, opts, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      console.error(`  próba ${i + 1}/${tries} nieudana: ${e.message}`);
      if (i === tries - 1) throw e;
      await new Promise(res => setTimeout(res, 3000));
    }
  }
}

const query = process.argv.slice(2).join(' ') || 'Poznań, Poland';
if (!query) { console.error('Użycie: node tools/prepare-map.mjs "Nazwa lokacji"'); process.exit(1); }

console.log(`→ Szukam: ${query}`);
const geo = (await fetchJSON(NOMINATIM + encodeURIComponent(query), { headers: { 'Accept-Language': 'pl,en', 'User-Agent': 'FogShooter/1.0' } }))[0];
if (!geo) { console.error('Nie znaleziono lokacji'); process.exit(1); }
const lat = +geo.lat, lon = +geo.lon;
console.log(`→ Lokacja: ${geo.display_name}`);

console.log('→ Pobieram dane OSM (Overpass)…');
const q = buildQuery(bboxAround(lat, lon));
let elements = null;
for (const ep of OVERPASS) {
  try {
    const j = await fetchJSON(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'FogShooter/1.0' },
      body: 'data=' + encodeURIComponent(q),
    });
    elements = j.elements || [];
    console.log(`  OK: ${elements.length} elementów z ${new URL(ep).host}`);
    break;
  } catch (e) { console.error(`  ${new URL(ep).host} nieudany: ${e.message}`); }
}
if (!elements) { console.error('Wszystkie serwery Overpass zawiodły'); process.exit(1); }

console.log('→ Pobieram kafelki satelitarne (Esri z18, 5×5)…');
const z = 18, cols = 5, rows = 5;
const cx = lonToTileX(lon, z), cy = latToTileY(lon, z);
const tx0 = Math.floor(cx) - 2, ty0 = Math.floor(cy) - 2;
const tiles = [];
for (let i = 0; i < cols; i++) {
  for (let j = 0; j < rows; j++) {
    const tx = tx0 + i, ty = ty0 + j;
    const url = SAT(z, ty, tx);
    for (let t = 0; t < 3; t++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        tiles.push({ i, j, data: buf.toString('base64') });
        process.stdout.write(`  [${tiles.length}/25] `);
        break;
      } catch (e) {
        if (t === 2) console.error(`\n  kafelek ${tx}/${ty} nieudany: ${e.message}`);
        else await new Promise(res => setTimeout(res, 2000));
      }
    }
  }
}
console.log(`\n  OK: ${tiles.length}/25 kafelków`);

const out = { name: geo.display_name.split(',')[0], lat, lon, zoom: z, tx0, ty0, cols, rows, elements, tiles };
const dir = new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(dir, { recursive: true });
const file = join(dir, slugify(query) + '.json');
writeFileSync(file, JSON.stringify(out));
const mb = (statSync(file).size / 1048576).toFixed(1);
console.log(`✓ Zapisano: ${file} (${mb} MB)`);
console.log(`  W grze wpisz: „${query}” — wczyta się lokalnie bez sieci.`);
