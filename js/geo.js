export function project(lat, lon, lat0, lon0, scale) {
  const x = (lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180) * scale;
  const z = -(lat - lat0) * 111320 * scale;
  return [x, z];
}

export function unproject(x, z, lat0, lon0, scale) {
  const lon = x / (111320 * Math.cos((lat0 * Math.PI) / 180) * scale) + lon0;
  const lat = -z / (111320 * scale) + lat0;
  return [lat, lon];
}

export function bboxAround(lat, lon, halfMeters = 260) {
  const dLat = halfMeters / 111320;
  const dLon = halfMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}

export function centerOf(geoms) {
  let lat = 0, lon = 0, n = 0;
  for (const g of geoms) for (const p of g) { lat += p[0]; lon += p[1]; n++; }
  return n ? [lat / n, lon / n] : [0, 0];
}

export function ringArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) s += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  return Math.abs(s) / 2;
}

export function bbox(pts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [, x, z] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}
