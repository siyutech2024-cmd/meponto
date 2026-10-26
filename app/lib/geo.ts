/**
 * Tiny planar geometry for city-scale zones (a few km) — no dependencies.
 * Rings are [lng, lat] pairs (KML order, as in app/rider-monitor/hot-zones.ts).
 */

export type LngLat = [number, number];

/** Ray-casting point-in-polygon. */
export function insideRing(lat: number, lng: number, ring: readonly LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shortest distance (km) from a point to the ring's edges — equirectangular,
 *  accurate to a few metres at this scale. */
export function distanceToRingKm(lat: number, lng: number, ring: readonly LngLat[]): number {
  const kmPerLat = 111.32;
  const kmPerLng = 111.32 * Math.cos((lat * Math.PI) / 180);
  const px = lng * kmPerLng, py = lat * kmPerLat;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0] * kmPerLng, ay = ring[j][1] * kmPerLat;
    const bx = ring[i][0] * kmPerLng, by = ring[i][1] * kmPerLat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

/** Inside the ring, or within `marginKm` of its edge (traced zones are approximate). */
export function withinZone(lat: number | null | undefined, lng: number | null | undefined, ring: readonly LngLat[], marginKm = 0): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return insideRing(lat, lng, ring) || (marginKm > 0 && distanceToRingKm(lat, lng, ring) <= marginKm);
}
