import { angleBetween, bearingOf, localProjection, pointAt, type LatLng, type Point } from "./geo";

export type { LatLng } from "./geo";

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
const USER: Point = { x: 0, y: 0 };

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

/**
 * The Sight Cone, with the user at its apex. A ring overlaps it when one of the ring's
 * edges passes through the cone, or when the whole cone lies inside the ring.
 */
function sightCone(heading: number) {
  const pointInside = pointAt(heading, SIGHT_CONE_RANGE_METRES / 2);
  const withinAngle = (p: Point) =>
    Math.abs(angleBetween(bearingOf(p), heading)) <= SIGHT_CONE_HALF_ANGLE_DEGREES;

  /** Whether the bearings swept along a–b (taking the short way round) reach into the cone. */
  const sweepReachesCone = (a: Point, b: Point) => {
    const start = angleBetween(bearingOf(a), heading);
    const end = start + angleBetween(bearingOf(b), bearingOf(a));
    const [low, high] = start <= end ? [start, end] : [end, start];
    return [-360, 0, 360].some(
      (turn) => low <= turn + SIGHT_CONE_HALF_ANGLE_DEGREES && high >= turn - SIGHT_CONE_HALF_ANGLE_DEGREES,
    );
  };

  const edgeEntersCone = (a: Point, b: Point) => {
    const reachable = partWithinRange(a, b, SIGHT_CONE_RANGE_METRES);
    if (!reachable) return false;
    const [near, far] = reachable;
    // An edge running through the user is two straight rays outwards; the user's own spot doesn't count.
    if (passesThroughUser(near, far)) {
      return [near, far].some((p) => !isUser(p) && withinAngle(p));
    }
    return sweepReachesCone(near, far);
  };

  return {
    overlaps(ring: Point[]): boolean {
      for (const [a, b] of edges(ring)) if (edgeEntersCone(a, b)) return true;
      return ringContains(ring, pointInside);
    },
  };
}

/** The part of segment a–b no farther than `radius` from the user, or null if none is. */
function partWithinRange(a: Point, b: Point, radius: number): [Point, Point] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(a.x, a.y) <= radius ? [a, a] : null;

  // Solve |a + t(b − a)| = radius for t.
  const half = a.x * dx + a.y * dy;
  const discriminant = half * half - lengthSquared * (a.x * a.x + a.y * a.y - radius * radius);
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const from = Math.max(0, (-half - root) / lengthSquared);
  const to = Math.min(1, (-half + root) / lengthSquared);
  if (from > to) return null;
  const at = (t: number): Point => ({ x: a.x + t * dx, y: a.y + t * dy });
  return [at(from), at(to)];
}

function passesThroughUser(a: Point, b: Point): boolean {
  return a.x * b.y - a.y * b.x === 0 && a.x * b.x + a.y * b.y <= 0;
}

function isUser(p: Point): boolean {
  return p.x === USER.x && p.y === USER.y;
}

/** Distance from the user to the nearest point of any ring; 0 when standing inside. */
function distanceToRings(rings: Point[][]): number {
  let nearest = Infinity;
  for (const ring of rings) {
    if (ringContains(ring, USER)) return 0;
    for (const [a, b] of edges(ring)) nearest = Math.min(nearest, distanceToSegment(a, b));
  }
  return nearest;
}

function* edges(ring: Point[]): Generator<[Point, Point]> {
  for (let i = 0; i < ring.length; i++) {
    yield [ring[i]!, ring[(i + 1) % ring.length]!];
  }
}

/** Distance from the user to segment a–b. */
function distanceToSegment(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : clamp(-(a.x * dx + a.y * dy) / lengthSquared, 0, 1);
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

function ringContains(ring: Point[], p: Point): boolean {
  let inside = false;
  for (const [a, b] of edges(ring)) {
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
