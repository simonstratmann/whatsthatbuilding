import { describe, expect, it } from "vitest";
import { identify, type Footprint, type FootprintSource, type LatLng, type Snapshot } from "./identification";

// The user stands here in every scenario.
const ORIGIN: LatLng = { lat: 52.52, lon: 13.405 };
const METRES_PER_DEGREE_LAT = 111_320;

/** A point `east` / `north` metres from ORIGIN. */
function offset(east: number, north: number): LatLng {
  return {
    lat: ORIGIN.lat + north / METRES_PER_DEGREE_LAT,
    lon: ORIGIN.lon + east / (METRES_PER_DEGREE_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180)),
  };
}

/** A rectangular Footprint spanning the given metre offsets from ORIGIN. */
function building(id: string, west: number, south: number, east: number, north: number): Footprint {
  return {
    id,
    rings: [[offset(west, south), offset(east, south), offset(east, north), offset(west, north)]],
  };
}

function sourceOf(...footprints: Footprint[]): FootprintSource {
  return { footprintsAround: async () => footprints };
}

function facing(heading: number): Snapshot {
  return { position: ORIGIN, heading };
}

describe("identify", () => {
  it("offers a building straight ahead as a Candidate", async () => {
    const shop = building("shop", -10, 90, 10, 110);

    const { candidates } = await identify(facing(0), sourceOf(shop));

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.footprint.id).toBe("shop");
    expect(candidates[0]?.number).toBe(1);
    expect(candidates[0]?.distanceMetres).toBeCloseTo(90, 0);
  });

  it("leaves out a building just outside the edge of the Sight Cone", async () => {
    // 1 m sheds 100 m away, centred on bearings of 14° and 16° (each spans about ±0.3°); the cone ends at 15°.
    const inside = building("inside", 23.69, 96.53, 24.69, 97.53);
    const outside = building("outside", 27.06, 95.63, 28.06, 96.63);

    const { candidates } = await identify(facing(0), sourceOf(inside, outside));

    expect(candidates.map((c) => c.footprint.id)).toEqual(["inside"]);
  });

  it("leaves out a building beyond the reach of the Sight Cone", async () => {
    const near = building("near", -5, 480, 5, 490);
    const far = building("far", -5, 510, 5, 520);

    const { candidates } = await identify(facing(0), sourceOf(near, far));

    expect(candidates.map((c) => c.footprint.id)).toEqual(["near"]);
  });

  it("offers a wide building that spans the Sight Cone with all its corners outside it", async () => {
    const terrace = building("terrace", -200, 300, 200, 320);

    const { candidates } = await identify(facing(0), sourceOf(terrace));

    expect(candidates.map((c) => c.footprint.id)).toEqual(["terrace"]);
    expect(candidates[0]?.distanceMetres).toBeCloseTo(300, 0);
  });

  it("offers a large building whose near side only reaches into the far end of the Sight Cone", async () => {
    // Its near side, 490 m away, crosses the cone's sides beyond 500 m but dips inside the range straight ahead.
    const warehouse = building("warehouse", -100, 490, 100, 600);

    const { candidates } = await identify(facing(0), sourceOf(warehouse));

    expect(candidates.map((c) => c.footprint.id)).toEqual(["warehouse"]);
  });

  it("offers a tower hidden behind a shop as well as the shop, nearest first", async () => {
    const tower = building("tower", -15, 250, 15, 280);
    const shop = building("shop", -10, 40, 10, 50);

    const { candidates } = await identify(facing(0), sourceOf(tower, shop));

    expect(candidates.map((c) => [c.number, c.footprint.id])).toEqual([
      [1, "shop"],
      [2, "tower"],
    ]);
  });

  it("offers only the nearest 8 when more buildings fall in the Sight Cone", async () => {
    // A row of ten houses straight ahead, 30 m apart, listed farthest first.
    const houses = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => building(`house-${n}`, -5, n * 30, 5, n * 30 + 10));

    const { candidates } = await identify(facing(0), sourceOf(...houses));

    expect(candidates.map((c) => [c.number, c.footprint.id])).toEqual([
      [1, "house-1"],
      [2, "house-2"],
      [3, "house-3"],
      [4, "house-4"],
      [5, "house-5"],
      [6, "house-6"],
      [7, "house-7"],
      [8, "house-8"],
    ]);
  });

  it.each([
    // Facing 355°, the cone runs 340°–10°; facing 5°, it runs 350°–20°.
    { heading: 355, expected: ["15° west of north", "5° east of north", "5° west of north"] },
    { heading: 5, expected: ["15° east of north", "5° east of north", "5° west of north"] },
  ])("handles a Line of Sight close to north (heading $heading°)", async ({ heading, expected }) => {
    // Small buildings 100 m away at bearings of 5°, 15°, 345° and 355°.
    const buildings = [
      building("5° east of north", 7.7, 98.6, 9.7, 100.6),
      building("15° east of north", 24.9, 95.6, 26.9, 97.6),
      building("15° west of north", -26.9, 95.6, -24.9, 97.6),
      building("5° west of north", -9.7, 98.6, -7.7, 100.6),
    ];

    const { candidates } = await identify(facing(heading), sourceOf(...buildings));

    expect(candidates.map((c) => c.footprint.id).sort()).toEqual(expected);
  });

  it("offers the building the user is standing in, at 0 m", async () => {
    const arcade = building("arcade", -20, -20, 20, 20);

    const { candidates } = await identify(facing(90), sourceOf(arcade));

    expect(candidates.map((c) => [c.footprint.id, c.distanceMetres])).toEqual([["arcade", 0]]);
  });

  it("leaves out a building behind the user even when one of its corners is exactly where they stand", async () => {
    const behind = building("behind", 0, -20, 20, 0);

    const { candidates } = await identify(facing(0), sourceOf(behind));

    expect(candidates).toEqual([]);
  });

  it("offers a building whose wall the user stands exactly on, when it fills the Sight Cone", async () => {
    // A vast hall to the south; the user stands on its north wall, facing into it.
    const hall = building("hall", -1000, -1000, 1000, 0);

    const { candidates } = await identify(facing(180), sourceOf(hall));

    expect(candidates.map((c) => [c.footprint.id, c.distanceMetres])).toEqual([["hall", 0]]);
  });
});
