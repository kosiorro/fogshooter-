import { bboxAround } from './geo.js';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=';

export async function geocode(query) {
  const r = await fetch(NOMINATIM + encodeURIComponent(query), { headers: { 'Accept-Language': 'pl,en' } });
  if (!r.ok) throw new Error('Nominatim: HTTP ' + r.status);
  const j = await r.json();
  if (!j.length) throw new Error('Nie znaleziono lokacji: ' + query);
  return { lat: +j[0].lat, lon: +j[0].lon, name: j[0].display_name.split(',')[0] };
}

function buildQuery(bbox, wayLimit) {
  const [s, w, n, e] = bbox;
  return `[out:json][timeout:25];
way(${s},${w},${n},${e})["building"];
out geom ${wayLimit};
way(${s},${w},${n},${e})["highway"];
out geom ${wayLimit};
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
out 150;`;
}

export async function fetchOSM(lat, lon, wayLimit = 400) {
  const bbox = bboxAround(lat, lon, 260);
  const q = buildQuery(bbox, wayLimit);
  let lastErr = null;
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!r.ok) { lastErr = new Error('Overpass: HTTP ' + r.status); continue; }
      const j = await r.json();
      return { elements: j.elements || [], bbox };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Overpass nieosiągalny');
}

export function classify(elements) {
  const groups = { buildings: [], highways: [], water: [], rail: [], green: [], trees: [] };
  for (const el of elements) {
    const t = el.tags || {};
    if (el.type === 'node' && t.natural === 'tree') { groups.trees.push(el); continue; }
    if (el.type !== 'way' || !el.geometry) continue;
    const pts = el.geometry.filter(p => p).map(p => [p.lat, p.lon]);
    if (pts.length < 2) continue;
    if (t.building !== undefined) groups.buildings.push({ pts, tags: t, closed: pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] });
    else if (t.highway !== undefined) groups.highways.push({ pts, tags: t });
    else if (t.natural === 'water' || t.waterway) groups.water.push({ pts, tags: t, closed: pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] });
    else if (t.railway) groups.rail.push({ pts, tags: t });
    else if (t.natural === 'wood' || t.natural === 'scrub' || t.landuse === 'forest' || t.landuse === 'grass' || t.landuse === 'meadow' || t.landuse === 'park') groups.green.push({ pts, tags: t });
  }
  return groups;
}
