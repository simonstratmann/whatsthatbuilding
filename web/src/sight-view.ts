import {
  bearing,
  edges,
  type BuildingShell,
  type Identification,
  type ShellPoint,
  type SurfaceKind,
} from "@whatisthatbuilding/shared";

/** A point in the Sight View: x from the left edge, y down from the top, in view units. */
export type ViewPoint = [x: number, y: number];

/** One surface of a building as drawn in the Sight View, cut to the view. */
export interface SightPolygon {
  points: ViewPoint[];
  surface: SurfaceKind;
  role: "candidate";
  /** The Candidate's number, as in the list. */
  number: number;
  chosen: boolean;
}

/** Where a Candidate's number goes: above its highest point. */
export interface SightNumber {
  number: number;
  x: number;
  y: number;
  chosen: boolean;
}

/** What to draw for the Sight View, in view units: x runs from 0 to `width`, y from 0 to `height`. */
export interface SightView {
  width: number;
  height: number;
  /** Back to front: farther buildings first, and within a building its farther surfaces first. */
  polygons: SightPolygon[];
  /** In rank order; a Candidate with nothing in view has none. */
  numbers: SightNumber[];
  lineOfSightX: number;
  /** The left and right edges of the Sight Cone. */
  sightConeEdgesX: [number, number];
}

/** The view is fixed at ±30° around the heading: about what a phone camera sees. */
const HALF_VIEW_DEGREES = 30;
const SIGHT_CONE_HALF_ANGLE_DEGREES = 15;
const EYE_HEIGHT_METRES = 1.6;
/** Surfaces are cut this close in front of the eye; nearer, the perspective blows up. */
const NEAR_METRES = 0.3;
const WIDTH = 1000;
/** A very near or very tall building would make the view a tall sliver; above this, its foot is cut. */
const MAX_HEIGHT = WIDTH * 0.85;
/** Room above the highest point for the numbers. */
const HEADROOM = 110;
/** How far above a Candidate's highest point its number sits. */
const NUMBER_GAP = 44;
/** How far a number's middle stays from the edges, so it isn't cut off. */
const NUMBER_MARGIN = 40;
/** For a view with nothing in it. */
const EMPTY_HEIGHT = WIDTH * 0.4;

const TAN_HALF_VIEW = Math.tan(radians(HALF_VIEW_DEGREES));
/** View units per unit of tangent: the same horizontally and vertically, so nothing is stretched. */
const SCALE = WIDTH / 2 / TAN_HALF_VIEW;

/** In the eye's frame, in metres: right of the Line of Sight, along it (depth) and above the eye. */
type EyePoint = {
  right: number;
  depth: number;
  up: number;
};

/** A point in tangent space: right / depth and up / depth, as the eye sees it. */
type Flat = {
  x: number;
  y: number;
};

/** A surface in tangent space, cut to the view. */
interface ProjectedSurface {
  points: Flat[];
  surface: SurfaceKind;
  /** From the eye to the surface's centre, for ordering surfaces within a building. */
  distance: number;
}

/**
 * The Sight View of an Identification: its Candidates' Building Shells as seen from the user's
 * eye, facing the heading, in perspective. `chosen` is the number of the chosen Candidate.
 */
export function sightView({ candidates, lineOfSight }: Identification, chosen?: number): SightView {
  const heading = radians(bearing(lineOfSight.from, lineOfSight.to));
  const toEye = ([east, north, up]: ShellPoint): EyePoint => ({
    right: east * Math.cos(heading) - north * Math.sin(heading),
    depth: east * Math.sin(heading) + north * Math.cos(heading),
    up: up - EYE_HEIGHT_METRES,
  });

  const buildings = candidates
    .map((candidate) => ({
      number: candidate.number,
      distance: groundDistance(candidate.shell),
      surfaces: projectShell(candidate.shell, toEye),
    }))
    .filter(({ surfaces }) => surfaces.length > 0);

  const all = buildings.flatMap(({ surfaces }) => surfaces.flatMap(({ points }) => points));
  // The frame in tangent space, y upwards: from the lowest point drawn to above the highest.
  const highest = all.length > 0 ? Math.max(...all.map((p) => p.y)) : 0;
  const lowest = all.length > 0 ? Math.min(...all.map((p) => p.y)) : -EMPTY_HEIGHT / SCALE;
  const top = highest * SCALE + HEADROOM;
  const height = Math.min(top - lowest * SCALE, MAX_HEIGHT);
  const toView = ({ x, y }: Flat): ViewPoint => [WIDTH / 2 + x * SCALE, top - y * SCALE];

  const polygons: SightPolygon[] = [];
  const numbers: SightNumber[] = [];
  // Farthest building first; within one, its farthest surface first.
  for (const { number, surfaces } of [...buildings].sort((a, b) => b.distance - a.distance)) {
    for (const { points, surface } of [...surfaces].sort((a, b) => b.distance - a.distance)) {
      polygons.push({ points: points.map(toView), surface, role: "candidate", number, chosen: number === chosen });
    }
  }
  for (const { number, surfaces } of buildings) {
    const highestPoint = surfaces.flatMap(({ points }) => points).reduce((a, b) => (b.y > a.y ? b : a));
    const [x, y] = toView(highestPoint);
    numbers.push({
      number,
      x: Math.min(Math.max(x, NUMBER_MARGIN), WIDTH - NUMBER_MARGIN),
      y: Math.max(y - NUMBER_GAP, NUMBER_MARGIN),
      chosen: number === chosen,
    });
  }

  const edgeX = (WIDTH / 2) * (Math.tan(radians(SIGHT_CONE_HALF_ANGLE_DEGREES)) / TAN_HALF_VIEW);
  return {
    width: WIDTH,
    height,
    polygons,
    numbers,
    lineOfSightX: WIDTH / 2,
    sightConeEdgesX: [WIDTH / 2 - edgeX, WIDTH / 2 + edgeX],
  };
}

/**
 * The walls and roofs of a Shell, cut to the view; the ground is left out, as the building's
 * own walls always hide it from eye height.
 */
function projectShell(shell: BuildingShell, toEye: (p: ShellPoint) => EyePoint): ProjectedSurface[] {
  const projected: ProjectedSurface[] = [];
  for (const { kind, ring } of shell) {
    if (kind === "ground" || ring.length < 3) continue;
    const inEye = ring.map(toEye);
    const inFront = clipPolygon(inEye, (p) => p.depth - NEAR_METRES);
    const flat = inFront.map((p): Flat => ({ x: p.right / p.depth, y: p.up / p.depth }));
    const inView = clipPolygon(
      clipPolygon(flat, (p) => TAN_HALF_VIEW - p.x),
      (p) => p.x + TAN_HALF_VIEW,
    );
    if (inView.length < 3) continue;
    projected.push({ points: inView, surface: kind, distance: distanceToCentre(inEye) });
  }
  return projected;
}

/** From the eye to the middle of a surface's corners. */
function distanceToCentre(ring: EyePoint[]): number {
  const mean = (pick: (p: EyePoint) => number) => ring.reduce((sum, p) => sum + pick(p), 0) / ring.length;
  return Math.hypot(mean((p) => p.right), mean((p) => p.depth), mean((p) => p.up));
}

/** How far the nearest part of a Shell is from the user on the ground, in metres. */
function groundDistance(shell: BuildingShell): number {
  let nearest = Infinity;
  for (const { ring } of shell) {
    const onGround = ring.map(([x, y]) => ({ x, y }));
    for (const [a, b] of edges(onGround)) nearest = Math.min(nearest, distanceToSegment(a, b));
  }
  return nearest;
}

/** From the user to segment a–b on the ground. */
function distanceToSegment(a: Flat, b: Flat): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / lengthSquared));
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

/**
 * The part of a polygon where `inside` is at least 0, by Sutherland–Hodgman: `inside` must be
 * linear, so the cut runs straight.
 */
function clipPolygon<P extends Record<string, number>>(polygon: P[], inside: (p: P) => number): P[] {
  const result: P[] = [];
  for (const [a, b] of edges(polygon)) {
    const sideA = inside(a);
    const sideB = inside(b);
    if (sideA >= 0) result.push(a);
    if ((sideA >= 0) !== (sideB >= 0)) result.push(lerp(a, b, sideA / (sideA - sideB)));
  }
  return result;
}

/** The point a fraction `t` of the way from a to b, in every coordinate. */
function lerp<P extends Record<string, number>>(a: P, b: P, t: number): P {
  const point: Record<string, number> = {};
  for (const key of Object.keys(a)) point[key] = a[key]! + t * (b[key]! - a[key]!);
  return point as P;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
