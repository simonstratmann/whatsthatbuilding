import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LatLng } from "@whatisthatbuilding/shared";
import type { Lod2Building, Lod2Surface, Lod2Tile, Utm32Point } from "./lod2-parser.ts";
import { lod2Store, type Lod2Store } from "./lod2-store.ts";
import { ageLod2Tiles, freshDatabase } from "./test-database.ts";
import { offsetFrom } from "./test-geo.ts";
import { fromUtm32, toUtm32 } from "./utm32.ts";

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

/** A point `east` / `north` metres from ORIGIN and `elevation` metres above sea level, in UTM32. */
function utm(east: number, north: number, elevation: number): Utm32Point {
  const { east: e, north: n } = toUtm32(offset(east, north));
  return [e, n, elevation];
}

/** A 10 m cube's Shell, ground at 20 m above sea level, from (0, 10) to (10, 20). */
const CUBE: Lod2Surface[] = [
  { kind: "ground", ring: [utm(0, 10, 20), utm(10, 10, 20), utm(10, 20, 20), utm(0, 20, 20)] },
  { kind: "roof", ring: [utm(0, 10, 30), utm(10, 10, 30), utm(10, 20, 30), utm(0, 20, 30)] },
  { kind: "wall", ring: [utm(0, 10, 20), utm(10, 10, 20), utm(10, 10, 30), utm(0, 10, 30)] },
];

let store: Lod2Store;
let databaseUrl: string;
beforeAll(async () => {
  databaseUrl = await freshDatabase();
  store = lod2Store(databaseUrl);
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

  it("fails an import that lists the same tile twice, keeping the previous one", async () => {
    await store.replaceTiles("hamburg", tiles(tile("hh-old", [building("old", 0, 10, 10, 20)])));

    await expect(store.replaceTiles("hamburg", tiles(tile("twice", []), tile("twice", [])))).rejects.toThrow(/duplicate key/);

    expect((await store.footprintsAround(ORIGIN, 500)).map((f) => f.id)).toEqual(["old"]);
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

  it("adds a single tile, and leaves it alone when it is added again", async () => {
    const added = await store.addTile("niedersachsen", tile("ni-a", [building("house", 0, 10, 10, 20)]));
    const again = await store.addTile("niedersachsen", tile("ni-a", [building("other", 0, 30, 10, 40)]));

    expect([added, again]).toEqual([1, 0]);
    expect((await store.footprintsAround(ORIGIN, 500)).map((f) => f.id)).toEqual(["house"]);
    expect(await store.covers(ORIGIN)).toBe(true);
  });

  it("knows which tiles are loaded and which the source doesn't have", async () => {
    await store.addTile("niedersachsen", tile("ni-a", []));
    await store.markMissing("ni-b");
    await store.markMissing("ni-b");

    expect(await store.knownTiles(["ni-a", "ni-b", "ni-c"])).toEqual(new Set(["ni-a", "ni-b"]));
    // A missing tile covers nothing.
    await store.replaceTiles("niedersachsen", tiles());
    expect(await store.covers(ORIGIN)).toBe(false);
  });

  it("keeps each building's Shell, in WGS84 with its elevations, and gives it back by Footprint ID", async () => {
    await store.replaceTiles("hamburg", tiles(tile("tile-a", [building("cube", 0, 10, 10, 20, { shell: CUBE }), building("shed", 30, 10, 40, 20)])));

    const shells = await store.shellsOf(["cube", "shed", "unknown"]);

    expect([...shells.keys()]).toEqual(["cube"]);
    const shell = shells.get("cube")!;
    expect(shell.map((s) => s.kind)).toEqual(["ground", "roof", "wall"]);
    for (const [i, surface] of CUBE.entries()) {
      expect(shell[i]!.ring).toEqual(
        surface.ring.map(([east, north, elevation]) => {
          const { lat, lon } = fromUtm32({ east, north });
          return { lat: closeTo(lat), lon: closeTo(lon), elevation: expect.closeTo(elevation, 3) };
        }),
      );
    }
  });

  it("stores tiles at the current schema version, so none needs reading again", async () => {
    await store.replaceTiles("hamburg", tiles(tile("hh", [building("cube", 0, 10, 10, 20, { shell: CUBE })])));
    await store.addTile("niedersachsen", tile("ni", [], [1000, 0, 2000, 1000]));

    expect(await store.outdatedTiles(ORIGIN, 5000)).toEqual([]);
  });

  it("names the tiles near a position stored before Building Shells, and replaces one in place", async () => {
    await store.replaceTiles("hamburg", tiles(tile("hh", [building("cube", 0, 10, 10, 20)])));
    await store.addTile("niedersachsen", tile("ni-far", [], [5000, 0, 6000, 1000]));
    await ageLod2Tiles(databaseUrl);

    expect(await store.outdatedTiles(ORIGIN, 500)).toEqual([{ name: "hh", dataset: "hamburg" }]);

    const buildings = await store.replaceTile("hamburg", tile("hh", [building("cube", 0, 10, 10, 20, { shell: CUBE })]));

    expect(buildings).toBe(1);
    expect(await store.outdatedTiles(ORIGIN, 500)).toEqual([]);
    expect([...(await store.shellsOf(["cube"])).keys()]).toEqual(["cube"]);
    expect(await store.covers(ORIGIN)).toBe(true);
  });
});
