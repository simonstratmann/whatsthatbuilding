import {
  angleBetween,
  bearingOf,
  destination,
  edges,
  localProjection,
  pointAt,
  ringContains,
  type Footprint,
  type Identification,
  type LatLng,
  type Location,
  type Point,
  type Snapshot,
} from "@whatisthatbuilding/shared";
import { buildingTypeOf } from "./building-types.ts";

export interface FootprintSource {
  /** Whether the Coverage Area includes the position: whether there is building data for it. */
  covers(position: LatLng): Promise<boolean>;
  footprintsAround(centre: LatLng, radiusMetres: number): Promise<Footprint[]>;
}

/** Where building names come from: OpenStreetMap, or a fake in tests. */
export interface LabelSource {
  /** The names known within `radiusMetres` of the centre, ready to be matched to Footprints there. */
  namesAround(centre: LatLng, radiusMetres: number): Promise<Names>;
}

export interface Names {
  /** The Footprint's name, if one is known. */
  nameOf(footprint: Footprint): string | undefined;
}

/** Knows no names: every Candidate is labelled by its address. */
export const NO_NAMES: LabelSource = { namesAround: async () => ({ nameOf: () => undefined }) };

const SIGHT_CONE_RANGE_METRES = 500;
const SIGHT_CONE_HALF_ANGLE_DEGREES = 15;
const MAX_CANDIDATES = 8;
const USER: Point = { x: 0, y: 0 };
const SIGHT_CONE_ARC_STEPS = 12;

/**
 * The Candidates for a Snapshot. Names are a nicety: when the Label source fails, Candidates
 * are labelled by their addresses (whoever passes the source in logs the failure).
 */
export async function identify(
  snapshot: Snapshot,
  source: FootprintSource,
  labels: LabelSource = NO_NAMES,
): Promise<Identification> {
  const searched = {
    sightCone: sightConeBoundary(snapshot),
    lineOfSight: {
      from: snapshot.position,
      to: destination(snapshot.position, snapshot.heading, SIGHT_CONE_RANGE_METRES),
    },
  };
  // All at once: a source that first has to download building data can fetch it all in one go,
  // and the names come in meanwhile.
  const [covered, around, namesAround] = await Promise.allSettled([
    source.covers(snapshot.position),
    source.footprintsAround(snapshot.position, SIGHT_CONE_RANGE_METRES),
    labels.namesAround(snapshot.position, SIGHT_CONE_RANGE_METRES),
  ]);
  if (covered.status === "rejected") throw covered.reason;
  // Outside the Coverage Area the Footprints don't matter, nor does failing to get them.
  if (!covered.value) {
    return { candidates: [], warnings: ["outside-coverage-area"], ...searched };
  }
  if (around.status === "rejected") throw around.reason;
  const footprints = around.value;
  const names = namesAround.status === "fulfilled" ? namesAround.value : undefined;

  const toLocal = localProjection(snapshot.position);
  const cone = sightConeOverlapTest(snapshot.heading);

  const inCone = footprints
    .map((footprint) => ({ footprint, rings: footprint.rings.map((ring) => ring.map(toLocal)) }))
    .filter(({ rings }) => rings.some((ring) => cone.overlaps(ring)))
    .map((found) => ({ ...found, distanceMetres: distanceToRings(found.rings) }));
  const isHidden = hiddenTest(inCone, snapshot.heading);

  const candidates = inCone
    .map((found) => ({ ...found, hidden: isHidden(found) }))
    // Candidates the user can see first, then Hidden Candidates; nearest first within each.
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.distanceMetres - b.distanceMetres)
    .slice(0, MAX_CANDIDATES)
    .map(({ footprint, distanceMetres }, index) => {
      const name = names?.nameOf(footprint);
      const withName = name ? { ...footprint, name } : footprint;
      const buildingType = footprint.functionCode ? buildingTypeOf(footprint.functionCode) : undefined;
      return {
        number: index + 1,
        footprint: withName,
        distanceMetres,
        location: locationOf(withName),
        ...(buildingType ? { buildingType } : {}),
      };
    });
  return { candidates, warnings: [], ...searched };
}

const GEO_URI_DECIMAL_PLACES = 7;

function locationOf(footprint: Footprint): Location {
  const position = footprint.centre;
  const label = labelOf(footprint);
  return { position, ...(label ? { label } : {}), geoUri: geoUri(position, label) };
}

/** `geo:lat,lon?q=lat,lon(label)`, the form Android maps apps read as a labelled pin. */
function geoUri({ lat, lon }: LatLng, label: string | undefined): string {
  const coordinates = `${formatDegrees(lat)},${formatDegrees(lon)}`;
  // encodeURIComponent leaves brackets alone, but a bracket in the label would end it early.
  const labelSuffix = label ? `(${encodeURIComponent(label).replace(/\(/g, "%28").replace(/\)/g, "%29")})` : "";
  return `geo:${coordinates}?q=${coordinates}${labelSuffix}`;
}

function formatDegrees(degrees: number): string {
  return String(Number(degrees.toFixed(GEO_URI_DECIMAL_PLACES)));
}

function labelOf({ name, address }: Footprint): string | undefined {
  if (name) return name;
  // A house number alone doesn't say where the building is.
  if (address?.street) return [address.street, address.houseNumber].filter(Boolean).join(" ");
  return undefined;
}

function sightConeBoundary({ position, heading }: Snapshot): LatLng[] {
  const arc = Array.from({ length: SIGHT_CONE_ARC_STEPS + 1 }, (_, step) => {
    const offset = -SIGHT_CONE_HALF_ANGLE_DEGREES + (2 * SIGHT_CONE_HALF_ANGLE_DEGREES * step) / SIGHT_CONE_ARC_STEPS;
    return destination(position, heading + offset, SIGHT_CONE_RANGE_METRES);
  });
  return [position, ...arc];
}

/**
 * Tests rings against the Sight Cone, with the user at its apex. A ring overlaps it when one of the ring's
 * edges passes through the cone, or when the whole cone lies inside the ring.
 */
function sightConeOverlapTest(heading: number) {
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

/** A Footprint in the Sight Cone, in metres around the user. */
interface FootprintInCone {
  footprint: Footprint;
  rings: Point[][];
  distanceMetres: number;
}

/** One that can hide others and be hidden: of known height, and not where the user stands. */
type Obstacle = FootprintInCone & { footprint: { heightMetres: number } };

function isObstacle(inCone: FootprintInCone): inCone is Obstacle {
  return inCone.footprint.heightMetres !== undefined && inCone.distanceMetres > 0;
}

const EYE_HEIGHT_METRES = 1.6;
/** Looking across a Footprint's span, the bearings looked along are at most this far apart… */
const MAX_DEGREES_BETWEEN_BEARINGS = 0.5;
/** …and at least this many. */
const MIN_BEARINGS = 9;

/**
 * Tells Hidden Candidates: seen from eye height at the user's position, a Footprint is hidden when
 * along every bearing that meets it within the Sight Cone, a nearer Footprint rises to a higher
 * elevation angle than its top. Heights are above each building's own ground, so the ground counts
 * as flat. Footprints of unknown height are never hidden and hide nothing, nor does one the user
 * stands in. A gap between two nearer Footprints narrower than the spacing of the bearings can be missed.
 */
function hiddenTest(inCone: FootprintInCone[], heading: number): (target: FootprintInCone) => boolean {
  const obstacles = inCone.filter(isObstacle);

  return (target) => {
    if (!isObstacle(target)) return false;
    let metAlongAny = false;
    for (const bearing of bearingsAcross(target.rings, heading)) {
      const direction = pointAt(bearing, 1);
      const reach = entryAlong(target.rings, direction);
      if (reach === Infinity) continue;
      metAlongAny = true;
      const top = elevationAngle(target.footprint.heightMetres, reach);
      const blocked = obstacles.some((obstacle) => {
        if (obstacle === target) return false;
        const obstacleReach = entryAlong(obstacle.rings, direction);
        return obstacleReach < reach && elevationAngle(obstacle.footprint.heightMetres, obstacleReach) > top;
      });
      if (!blocked) return false;
    }
    return metAlongAny;
  };
}

/** Evenly spread bearings across the part of the Sight Cone the rings cover, from edge to edge. */
function bearingsAcross(rings: Point[][], heading: number): number[] {
  const [from, to] = spanInSightCone(rings, heading);
  const count = Math.max(MIN_BEARINGS, Math.ceil((to - from) / MAX_DEGREES_BETWEEN_BEARINGS) + 1);
  // A hair inside each edge, so the outermost bearings don't just graze a corner.
  const inset = (to - from) / 1000;
  return Array.from({ length: count }, (_, i) => heading + from + inset + ((to - from - 2 * inset) * i) / (count - 1));
}

/** Radians above the horizontal, from eye height, to a top `heightMetres` up and `distance` away. */
function elevationAngle(heightMetres: number, distance: number): number {
  return Math.atan2(heightMetres - EYE_HEIGHT_METRES, distance);
}

/**
 * The bearings the rings cover within the Sight Cone, in degrees either side of the heading.
 * Rings reaching round beside or behind the user get the whole cone; bearings that miss them are skipped.
 */
function spanInSightCone(rings: Point[][], heading: number): [number, number] {
  const offsets = rings.flat().map((p) => angleBetween(bearingOf(p), heading));
  const low = Math.min(...offsets);
  const high = Math.max(...offsets);
  if (low < -90 || high > 90) return [-SIGHT_CONE_HALF_ANGLE_DEGREES, SIGHT_CONE_HALF_ANGLE_DEGREES];
  return [Math.max(low, -SIGHT_CONE_HALF_ANGLE_DEGREES), Math.min(high, SIGHT_CONE_HALF_ANGLE_DEGREES)];
}

/** How far from the user the bearing along unit vector `direction` first meets the rings; Infinity if it never does. */
function entryAlong(rings: Point[][], direction: Point): number {
  let nearest = Infinity;
  for (const ring of rings) {
    for (const [a, b] of edges(ring)) {
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const across = direction.x * ey - direction.y * ex;
      if (across === 0) continue;
      // Solve t·direction = a + s·(b − a) for t (along the bearing) and s (along the edge).
      const t = (a.x * ey - a.y * ex) / across;
      const s = (a.x * direction.y - a.y * direction.x) / across;
      if (t > 0 && s >= 0 && s <= 1) nearest = Math.min(nearest, t);
    }
  }
  return nearest;
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

/** Distance from the user to segment a–b. */
function distanceToSegment(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : clamp(-(a.x * dx + a.y * dy) / lengthSquared, 0, 1);
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
