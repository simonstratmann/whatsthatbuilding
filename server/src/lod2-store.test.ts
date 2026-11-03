import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LatLng } from "@whatisthatbuilding/shared";
import type { Lod2Building, Lod2Tile } from "./lod2-parser.ts";
import { lod2Store, type Lod2Store } from "./lod2-store.ts";
import { freshDatabase } from "./test-database.ts";
import { offsetFrom } from "./test-geo.ts";

// Hamburg Rathausmarkt; the user stands here.
const ORIGIN: LatLng = { lat: 53.5503, lon: 9.9925 };

function offset(east: number, north: number): LatLng {
  return offsetFrom(ORIGIN, east, north);
}

/** A rectangular building spanning the given metre offsets from ORIGIN. */
function building(id: string, west: number, south: number, east: number, north: number, extra: Partial<Lod2Building> = {}): Lod2Building {
  return { id, rings: [[offset(west, south), offset(east, south), offset(east, north), offset(west, north)]], ...extra };
}

/** A tile spanning the given metre offsets from ORIGIN. */
function tile(name: string, buildings: Lod2Building[], [west, south, east, north] = [-1000, -1000, 1000, 1000]): Lod2Tile {
  return { name, extent: [offset(west, south), offset(east, south), offset(east, north), offset(west, north)], buildings };
}

async function* tiles(...list: Lod2Tile[]): AsyncIterable<Lod2Tile> {
  yield* list;
}

/** Matches a coordinate to within about 1 cm. */
function closeTo(degrees: number) {
  return expect.closeTo(degrees, 7);
}

let store: Lod2Store;
beforeAll(async () => {
  store = lod2Store(await freshDatabase());
});
afterAll(async () => {
  await store.close();
});

describe("lod2Store", () => {
  beforeEach(async () => {
    await store.replaceTiles("hamburg", tiles());
    await store.replaceTiles("niedersachsen", tiles());
  });

  it("finds the Footprints within the radius, with their height, function, address and centre", async () => {
    const townHall = building("town-hall", -50, 100, 50, 200, {
      heightMetres: 49.5,
      functionCode: "31001_3012",
      address: { street: "Rathausmarkt", houseNumber: "1", city: "Hamburg" },
    });
    // Its centre is 550 m away, but its near wall is within 500 m.
    const longShed = building("long-shed", -5, 490, 5, 610);
    const tooFar = building("too-far", -5, 510, 5, 520);
    await store.replaceTiles("hamburg", tiles(tile("tile-a", [townHall, longShed, tooFar])));

    const found = await store.footprintsAround(ORIGIN, 500);

    expect(found.map((f) => f.id).sort()).toEqual(["long-shed", "town-hall"]);
    const stored = found.find((f) => f.id === "town-hall")!;
    expect(stored).toEqual({
      id: "town-hall",
      rings: [townHall.rings[0]!.map(({ lat, lon }) => ({ lat: closeTo(lat), lon: closeTo(lon) }))],
      centre: { lat: closeTo(offset(0, 150).lat), lon: closeTo(offset(0, 150).lon) },
      heightMetres: 49.5,
      functionCode: "31001_3012",
      address: { street: "Rathausmarkt", houseNumber: "1", city: "Hamburg" },
    });
  });

  it("leaves out what the building model doesn't know", async () => {
    await store.replaceTiles("hamburg", tiles(tile("tile-a", [building("shed", 10, 10, 20, 20)])));

    const [shed] = await store.footprintsAround(ORIGIN, 500);

    expect(Object.keys(shed!).sort()).toEqual(["centre", "id", "rings"]);
  });

  it("keeps each part of a building made of several", async () => {
    const twoHalls = { id: "two-halls", rings: [...building("a", 0, 10, 10, 20).rings, ...building("b", 30, 10, 40, 20).rings] };
    await store.replaceTiles("hamburg", tiles(tile("tile-a", [twoHalls])));

    const [stored] = await store.footprintsAround(ORIGIN, 500);

    expect(stored?.rings).toHaveLength(2);
  });

  it("covers the positions inside the loaded tiles, and no others", async () => {
    await store.replaceTiles("hamburg", tiles(tile("tile-a", [], [-1000, -1000, 0, 1000]), tile("tile-b", [], [0, -1000, 1000, 1000])));

    expect(await store.covers(offset(-500, 0))).toBe(true);
    expect(await store.covers(offset(500, 900))).toBe(true);
    expect(await store.covers(offset(1500, 0))).toBe(false);
  });

  it("replaces the previous import from the same source, and leaves the other source's tiles alone", async () => {
    await store.replaceTiles("hamburg", tiles(tile("hh-old", [building("old", 0, 10, 10, 20)], [-1000, -1000, 0, 0])));
    await store.replaceTiles("niedersachsen", tiles(tile("ni", [building("ni-house", 0, -20, 10, -10)], [0, -1000, 1000, 0])));

    const result = await store.replaceTiles("hamburg", tiles(tile("hh-new", [building("new", 0, 30, 10, 40)], [-1000, 0, 0, 1000])));

    expect(result).toEqual({ tiles: 1, buildings: 1 });
    expect((await store.footprintsAround(ORIGIN, 500)).map((f) => f.id).sort()).toEqual(["new", "ni-house"]);
    expect(await store.covers(offset(-500, -500))).toBe(false);
    expect(await store.covers(offset(-500, 500))).toBe(true);
  });

  it("stores a building that two tiles both list once, and counts it once", async () => {
    const onTheBoundary = building("on-the-boundary", -5, 10, 5, 20);

    const result = await store.replaceTiles(
      "hamburg",
      tiles(tile("west", [onTheBoundary], [-1000, -1000, 0, 1000]), tile("east", [onTheBoundary], [0, -1000, 1000, 1000])),
    );

    expect(result).toEqual({ tiles: 2, buildings: 1 });
    expect(await store.footprintsAround(ORIGIN, 500)).toHaveLength(1);
  });

  it("keeps the previous import when the new one fails part-way", async () => {
    await store.replaceTiles("hamburg", tiles(tile("hh-old", [building("old", 0, 10, 10, 20)])));

    async function* failing(): AsyncIterable<Lod2Tile> {
      yield tile("hh-new", [building("new", 0, 30, 10, 40)]);
      throw new Error("download broke off");
    }
    await expect(store.replaceTiles("hamburg", failing())).rejects.toThrow(/broke off/);

    expect((await store.footprintsAround(ORIGIN, 500)).map((f) => f.id)).toEqual(["old"]);
  });
});
