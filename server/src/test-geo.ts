// Metre offsets around a test origin, for building test Footprints. Deliberately its own
// arithmetic rather than shared/geo.ts, so tests don't check identify against the geometry it uses.
import type { LatLng } from "@whatisthatbuilding/shared";

const METRES_PER_DEGREE_LAT = 111_320;

function metresPerDegreeLon(origin: LatLng): number {
  return METRES_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
}

/** The position `east` / `north` metres from `origin`. */
export function offsetFrom(origin: LatLng, east: number, north: number): LatLng {
  return { lat: origin.lat + north / METRES_PER_DEGREE_LAT, lon: origin.lon + east / metresPerDegreeLon(origin) };
}

/** How far east and north of `origin` a position lies, in metres. */
export function metresFrom(origin: LatLng, p: LatLng): { east: number; north: number } {
  return { east: (p.lon - origin.lon) * metresPerDegreeLon(origin), north: (p.lat - origin.lat) * METRES_PER_DEGREE_LAT };
}
