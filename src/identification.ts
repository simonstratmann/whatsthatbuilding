export interface LatLng {
  lat: number;
  lon: number;
}

/** The moment the user presses the shutter: where they stand and which way they face. */
export interface Snapshot {
  position: LatLng;
  /** Degrees clockwise from true north. */
  heading: number;
}

/** A building's outline on the ground. */
export interface Footprint {
  id: string;
  /** Outer rings; a building made of several parts has several. */
  rings: LatLng[][];
}

export interface FootprintSource {
  footprintsAround(centre: LatLng, radiusMetres: number): Promise<Footprint[]>;
}

export interface Candidate {
  /** 1-based, nearest first. */
  number: number;
  footprint: Footprint;
  distanceMetres: number;
}

export interface Identification {
  candidates: Candidate[];
}

const SIGHT_CONE_RANGE_METRES = 500;
const SIGHT_CONE_HALF_ANGLE_DEGREES = 15;
const MAX_CANDIDATES = 8;
const METRES_PER_DEGREE_LAT = 111_320;

/** Planar point in metres, east (x) and north (y) of the user. */
interface Point {
  x: number;
  y: number;
}

export async function identify(snapshot: Snapshot, source: FootprintSource): Promise<Identification> {
  const footprints = await source.footprintsAround(snapshot.position, SIGHT_CONE_RANGE_METRES);
  const toLocal = localProjection(snapshot.position);
  const cone = sightCone(snapshot.heading);

  const candidates = footprints
    .map((footprint) => ({ footprint, rings: footprint.rings.map((ring) => ring.map(toLocal)) }))
    .filter(({ rings }) => rings.some((ring) => cone.overlaps(ring)))
    .map(({ footprint, rings }) => ({ footprint, distanceMetres: distanceToRings(rings) }))
    .sort((a, b) => a.distanceMetres - b.distanceMetres)
    .slice(0, MAX_CANDIDATES)
    .map((candidate, index) => ({ number: index + 1, ...candidate }));
  return { candidates };
}

/** The Sight Cone, with the user at its apex (the origin). */
function sightCone(heading: number) {
  const leftEdge = pointAt(heading - SIGHT_CONE_HALF_ANGLE_DEGREES, SIGHT_CONE_RANGE_METRES);
  const rightEdge = pointAt(heading + SIGHT_CONE_HALF_ANGLE_DEGREES, SIGHT_CONE_RANGE_METRES);
  const apex: Point = { x: 0, y: 0 };

  const withinAngle = (p: Point) =>
    Math.abs(angleBetween(bearingOf(p), heading)) <= SIGHT_CONE_HALF_ANGLE_DEGREES;
  const contains = (p: Point) => Math.hypot(p.x, p.y) <= SIGHT_CONE_RANGE_METRES && withinAngle(p);
  const crossesFarArc = (a: Point, b: Point) =>
    circleCrossings(a, b, SIGHT_CONE_RANGE_METRES).some(withinAngle);

  return {
    overlaps(ring: Point[]): boolean {
      if (ring.some(contains)) return true;
      if (containsOrigin(ring)) return true;
      for (const [a, b] of edges(ring)) {
        if (segmentsCross(a, b, apex, leftEdge) || segmentsCross(a, b, apex, rightEdge)) return true;
        if (crossesFarArc(a, b)) return true;
      }
      return false;
    },
  };
}

function pointAt(bearing: number, distance: number): Point {
  const radians = (bearing * Math.PI) / 180;
  return { x: distance * Math.sin(radians), y: distance * Math.cos(radians) };
}

/** Degrees clockwise from north, as seen from the user. */
function bearingOf(p: Point): number {
  return (Math.atan2(p.x, p.y) * 180) / Math.PI;
}

/** Signed difference a − b, normalised to (−180, 180]. */
function angleBetween(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/** Points where segment a–b crosses the circle of the given radius around the user. */
function circleCrossings(a: Point, b: Point, radius: number): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const qa = dx * dx + dy * dy;
  const qb = 2 * (a.x * dx + a.y * dy);
  const qc = a.x * a.x + a.y * a.y - radius * radius;
  const discriminant = qb * qb - 4 * qa * qc;
  if (qa === 0 || discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]
    .filter((t) => t >= 0 && t <= 1)
    .map((t) => ({ x: a.x + t * dx, y: a.y + t * dy }));
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function localProjection(origin: LatLng): (p: LatLng) => Point {
  const metresPerDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return (p) => ({
    x: (p.lon - origin.lon) * metresPerDegreeLon,
    y: (p.lat - origin.lat) * METRES_PER_DEGREE_LAT,
  });
}

/** Distance from the user (the origin) to the nearest point of any ring; 0 when standing inside. */
function distanceToRings(rings: Point[][]): number {
  let nearest = Infinity;
  for (const ring of rings) {
    if (containsOrigin(ring)) return 0;
    for (const [a, b] of edges(ring)) nearest = Math.min(nearest, distanceToSegment(a, b));
  }
  return nearest;
}

function* edges(ring: Point[]): Generator<[Point, Point]> {
  for (let i = 0; i < ring.length; i++) {
    yield [ring[i]!, ring[(i + 1) % ring.length]!];
  }
}

function distanceToSegment(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : clamp(-(a.x * dx + a.y * dy) / lengthSquared, 0, 1);
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

function containsOrigin(ring: Point[]): boolean {
  let inside = false;
  for (const [a, b] of edges(ring)) {
    if (a.y > 0 !== b.y > 0 && 0 < a.x + ((0 - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
