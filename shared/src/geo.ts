/** Flat-earth geometry around a user's position; accurate enough over the Sight Cone's few hundred metres. */

export interface LatLng {
  lat: number;
  lon: number;
}

/** Planar point in metres east (x) and north (y) of an origin. */
export interface Point {
  x: number;
  y: number;
}

const METRES_PER_DEGREE_LAT = 111_320;

function metresPerDegreeLon(lat: number): number {
  return METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Maps positions to metre offsets from `origin`. */
export function localProjection(origin: LatLng): (p: LatLng) => Point {
  const lonScale = metresPerDegreeLon(origin.lat);
  return (p) => ({
    x: (p.lon - origin.lon) * lonScale,
    y: (p.lat - origin.lat) * METRES_PER_DEGREE_LAT,
  });
}

/** The point `distance` metres from the origin along `bearing` (degrees clockwise from north). */
export function pointAt(bearing: number, distance: number): Point {
  const radians = (bearing * Math.PI) / 180;
  return { x: distance * Math.sin(radians), y: distance * Math.cos(radians) };
}

/** Degrees clockwise from north, as seen from the origin, in [0, 360). */
export function bearingOf(p: Point): number {
  return ((Math.atan2(p.x, p.y) * 180) / Math.PI + 360) % 360;
}

/** Signed difference a − b, normalised to (−180, 180]. */
export function angleBetween(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/** The position `metres` away from `from` along `bearing`. */
export function destination(from: LatLng, bearing: number, metres: number): LatLng {
  const p = pointAt(bearing, metres);
  return {
    lat: from.lat + p.y / METRES_PER_DEGREE_LAT,
    lon: from.lon + p.x / metresPerDegreeLon(from.lat),
  };
}

/** Bearing from one position to another, in [0, 360). */
export function bearing(from: LatLng, to: LatLng): number {
  return bearingOf(localProjection(from)(to));
}

/** A ring's edges, the last one closing it; the ring needn't repeat its first point. */
export function* edges(ring: Point[]): Generator<[Point, Point]> {
  for (let i = 0; i < ring.length; i++) {
    yield [ring[i]!, ring[(i + 1) % ring.length]!];
  }
}

/** Whether the point lies inside the ring, by the even-odd rule. */
export function ringContains(ring: Point[], p: Point): boolean {
  let inside = false;
  for (const [a, b] of edges(ring)) {
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}
