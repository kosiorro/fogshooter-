export function lonToTileX(lon, z) {
  return ((lon + 180) / 360) * Math.pow(2, z);
}

export function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
}

export function mercatorScale(lat) {
  return 1 / Math.cos((lat * Math.PI) / 180);
}
