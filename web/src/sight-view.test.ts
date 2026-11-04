import { describe, expect, it } from "vitest";
import type { BuildingShell, Candidate, Identification, LatLng, ShellPoint } from "@whatisthatbuilding/shared";
import { sightView, type SightView } from "./sight-view.ts";
import { offsetFrom } from "./test-geo.ts";

// The user stands here in every scenario.
const USER: LatLng = { lat: 53.55, lon: 10 };

function offset(east: number, north: number): LatLng {
  return offsetFrom(USER, east, north);
}

const degrees = (d: number) => (d * Math.PI) / 180;

/** A box `width` × `depth` × `height` metres whose middle is `distance` metres away along `bearing`. */
function box(bearing: number, distance: number, { width = 10, depth = 10, height = 10 } = {}): BuildingShell {
  const centre = { x: distance * Math.sin(degrees(bearing)), y: distance * Math.cos(degrees(bearing)) };
  const corners: [number, number][] = [
    [centre.x - width / 2, centre.y - depth / 2],
    [centre.x + width / 2, centre.y - depth / 2],
    [centre.x + width / 2, centre.y + depth / 2],
    [centre.x - width / 2, centre.y + depth / 2],
  ];
  const at = ([e, n]: [number, number], up: number): ShellPoint => [e, n, up];
  return [
    { kind: "ground", ring: corners.map((c) => at(c, 0)) },
    { kind: "roof", ring: corners.map((c) => at(c, height)) },
    ...corners.map((c, i) => {
      const next = corners[(i + 1) % corners.length]!;
      return { kind: "wall" as const, ring: [at(c, 0), at(next, 0), at(next, height), at(c, height)] };
    }),
  ];
}

function candidate(number: number, shell: BuildingShell): Candidate {
  const centre = USER;
  return {
    number,
    footprint: { id: `b${number}`, rings: [], centre },
    shell,
    distanceMetres: 0,
    location: { position: centre, geoUri: "geo:0,0" },
  };
}

/** The Identification of a Snapshot facing `heading`, with these Candidates. */
function identification(heading: number, ...candidates: Candidate[]): Identification {
  const ahead = offset(500 * Math.sin(degrees(heading)), 500 * Math.cos(degrees(heading)));
  return { candidates, warnings: [], sightCone: [USER], lineOfSight: { from: USER, to: ahead } };
}

function polygonsOf(view: SightView, number: number) {
  return view.polygons.filter((p) => p.role === "candidate" && p.number === number);
}

function xs(view: SightView, number: number): number[] {
  return polygonsOf(view, number).flatMap((p) => p.points.map(([x]) => x));
}

describe("sightView", () => {
  it("puts a building straight ahead in the middle of the view", () => {
    const view = sightView(identification(0, candidate(1, box(0, 100))));

    const across = xs(view, 1);
    expect(across.length).toBeGreaterThan(0);
    expect((Math.min(...across) + Math.max(...across)) / 2).toBeCloseTo(view.width / 2, 6);
  });

  it("looks the way the user faced", () => {
    // A slim mast, so that seen at a slant it still looks about as wide on either side of its middle.
    const view = sightView(identification(250, candidate(1, box(250, 100, { width: 1, depth: 1 }))));

    const across = xs(view, 1);
    expect(Math.abs((Math.min(...across) + Math.max(...across)) / 2 - view.width / 2)).toBeLessThan(1);
  });

  it("puts a building 30° to the right at the right edge, cut off there", () => {
    const view = sightView(identification(0, candidate(1, box(30, 100))));

    const across = xs(view, 1);
    expect(Math.max(...across)).toBeCloseTo(view.width, 6);
    expect(Math.min(...across)).toBeGreaterThan(view.width * 0.9);
  });

  it("puts a building 30° to the left at the left edge", () => {
    const view = sightView(identification(0, candidate(1, box(-30, 100))));

    const across = xs(view, 1);
    expect(Math.min(...across)).toBeCloseTo(0, 6);
    expect(Math.max(...across)).toBeLessThan(view.width * 0.1);
  });

  it("doesn't draw a building behind the user, nor one beside them outside the view", () => {
    const view = sightView(identification(0, candidate(1, box(180, 50)), candidate(2, box(60, 50))));

    expect(view.polygons).toEqual([]);
    expect(view.numbers).toEqual([]);
  });

  it("draws walls and roofs, not the ground under the building", () => {
    const view = sightView(identification(0, candidate(1, box(0, 100))));

    const kinds = new Set(view.polygons.map((p) => p.surface));
    expect(kinds).toEqual(new Set(["wall", "roof"]));
  });

  it("draws the bottom of a building's walls lower the nearer it is, and its top higher the taller it is", () => {
    const near = sightView(identification(0, candidate(1, box(0, 50))));
    const far = sightView(identification(0, candidate(1, box(0, 200))));
    const tall = sightView(identification(0, candidate(1, box(0, 50, { height: 30 }))));

    const ys = (view: SightView) => view.polygons.flatMap((p) => p.points.map(([, y]) => y));
    // The frame runs from the ground of the drawing to above its highest point.
    expect(Math.max(...ys(near))).toBeCloseTo(near.height, 6);
    expect(Math.max(...ys(far))).toBeCloseTo(far.height, 6);
    // Walls 10 m high, from 1.6 m below the eye: their span is the same in metres either way.
    const span = (view: SightView) => Math.max(...ys(view)) - Math.min(...ys(view));
    expect(span(near)).toBeGreaterThan(span(far) * 3);
    expect(span(tall)).toBeGreaterThan(span(near) * 2);
  });

  it("draws a nearer building after a farther one", () => {
    const view = sightView(identification(0, candidate(1, box(0, 50)), candidate(2, box(2, 150))));

    const order = view.polygons.map((p) => p.number);
    const lastOfFarther = order.lastIndexOf(2);
    const firstOfNearer = order.indexOf(1);
    expect(lastOfFarther).toBeGreaterThanOrEqual(0);
    expect(firstOfNearer).toBeGreaterThan(lastOfFarther);
  });

  it("draws a building's far walls before its near wall", () => {
    const view = sightView(identification(0, candidate(1, box(0, 100))));

    // Seen head on, the near wall is the widest.
    const widthOf = (points: [number, number][]) =>
      Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x));
    const walls = view.polygons.filter((p) => p.surface === "wall");
    const nearWall = walls.reduce((a, b) => (widthOf(b.points) > widthOf(a.points) ? b : a));
    expect(view.polygons.at(-1)).toBe(nearWall);
  });

  it("flags the chosen Candidate's polygons and number, and no others", () => {
    const view = sightView(identification(0, candidate(1, box(0, 50)), candidate(2, box(10, 150))), 2);

    expect(polygonsOf(view, 2).every((p) => p.chosen)).toBe(true);
    expect(polygonsOf(view, 1).some((p) => p.chosen)).toBe(false);
    expect(view.numbers.map(({ number, chosen }) => [number, chosen])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it("puts each Candidate's number above its highest point", () => {
    // A tower with a slim spire off to its right: the number goes over the spire.
    const spire = box(4, 100, { width: 1, depth: 1, height: 50 });
    const view = sightView(identification(0, candidate(1, [...box(0, 100, { height: 20 }), ...spire])));

    const points = polygonsOf(view, 1).flatMap((p) => p.points);
    const top = Math.min(...points.map(([, y]) => y));
    const [number] = view.numbers;
    expect(number?.number).toBe(1);
    expect(number!.y).toBeLessThan(top);
    expect(number!.y).toBeGreaterThan(0);
    const spireXs = points.filter(([, y]) => y === top).map(([x]) => x);
    expect(number!.x).toBeGreaterThanOrEqual(Math.min(...spireXs) - 1e-6);
    expect(number!.x).toBeLessThanOrEqual(Math.max(...spireXs) + 1e-6);
  });

  it("keeps a number inside the view when its building's highest point is at the edge", () => {
    // A roof sloping up to the left, cut off by the left edge of the view.
    const view = sightView(identification(0, candidate(1, box(-30, 60, { width: 40, height: 15 }))));

    const [number] = view.numbers;
    expect(number!.x).toBeGreaterThan(20);
  });

  it("gives the Line of Sight in the middle and the Sight Cone's edges at ±15°", () => {
    const view = sightView(identification(0, candidate(1, box(0, 100))));

    expect(view.lineOfSightX).toBeCloseTo(view.width / 2, 6);
    // In perspective, 15° out is tan 15° / tan 30° of the way from the middle to the edge.
    const fromMiddle = (view.width / 2) * (Math.tan(degrees(15)) / Math.tan(degrees(30)));
    expect(view.sightConeEdgesX[0]).toBeCloseTo(view.width / 2 - fromMiddle, 6);
    expect(view.sightConeEdgesX[1]).toBeCloseTo(view.width / 2 + fromMiddle, 6);
  });

  it("draws a building the user stands right in front of, cut at the eye", () => {
    // Its near wall is 0.5 m away and runs out past both edges of the view.
    const view = sightView(identification(0, candidate(1, box(0, 5.5, { width: 40, height: 6 }))));

    expect(view.polygons.length).toBeGreaterThan(0);
    for (const { points } of view.polygons) {
      for (const [x, y] of points) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(view.width);
      }
    }
  });
});
