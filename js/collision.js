export function circleHitsAny(x, z, r, obstacles) {
  for (const b of obstacles) {
    if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) {
      return true;
    }
  }
  return false;
}

export function spawnPoints(count, range, obstacles) {
  const pts = [];
  const rand = Math.random;
  let guard = 0;
  while (pts.length < count && guard++ < 3000) {
    const ang = rand() * Math.PI * 2;
    const d = range[0] + rand() * (range[1] - range[0]);
    const x = Math.cos(ang) * d;
    const z = Math.sin(ang) * d;
    const lim = 107;
    if (x * x + z * z > lim * lim) continue;
    let blocked = false;
    for (const b of obstacles) {
      if (x + 0.6 > b.minX && x - 0.6 < b.maxX && z + 0.6 > b.minZ && z - 0.6 < b.maxZ) { blocked = true; break; }
    }
    if (!blocked) pts.push({ x, z });
  }
  return pts;
}

export function rayHitsOBB(origin, dir, box) {
  let tmin = 0.0001, tmax = 100;
  for (const axis of ['x', 'z']) {
    const o = origin[axis], d = dir[axis];
    const lo = axis === 'x' ? box.minX : box.minZ;
    const hi = axis === 'x' ? box.maxX : box.maxZ;
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  const t = (box.h ?? 2.4);
  if (dir.y === 0) { if (origin.y < 0 || origin.y > t) return false; return tmin; }
  let ty1 = (0 - origin.y) / dir.y, ty2 = (t - origin.y) / dir.y;
  if (ty1 > ty2) [ty1, ty2] = [ty2, ty1];
  if (ty1 > tmin) tmin = ty1;
  if (ty2 < tmax) tmax = ty2;
  if (tmin > tmax) return false;
  return tmin;
}
