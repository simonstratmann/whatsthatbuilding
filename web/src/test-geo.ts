// Metre offsets around a test origin, for building test positions. Deliberately its own
// arithmetic rather than shared/geo.ts, so tests don't check the app against the geometry it uses.
import type { LatLng } from "@whatisthatbuilding/shared";

const METRES_PER_DEGREE_LAT = 111_320;

/** The position `east` / `north` metres from `origin`. */
export function offsetFrom(origin: LatLng, east: number, north: number): LatLng {
  const metresPerDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return { lat: origin.lat + north / METRES_PER_DEGREE_LAT, lon: origin.lon + east / metresPerDegreeLon };
}
