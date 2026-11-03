import { describe, expect, it } from "vitest";
import { tileName, tilesAround, tilesInBox, type TileKey } from "./niedersachsen-tiles.ts";
import { fromUtm32 } from "./utm32.ts";

/** The position at these UTM32 metres. */
function at(east: number, north: number) {
  return fromUtm32({ east, north });
}

function sorted(tiles: TileKey[]): string[] {
  return tiles.map(tileName).sort();
}

describe("tilesAround", () => {
  it("is the one tile when the circle stays inside it", () => {
    expect(sorted(tilesAround(at(550_500, 5_803_500), 400))).toEqual(["LoD2_32_550_5803_1_ni"]);
  });

  it("names a tile by its lower-left corner in kilometres", () => {
    expect(tilesAround(at(550_000.5, 5_803_999.5), 0)).toEqual([{ east: 550, north: 5803 }]);
  });

  it("adds the tiles beside it that the circle reaches", () => {
    expect(sorted(tilesAround(at(550_700, 5_803_500), 400))).toEqual(["LoD2_32_550_5803_1_ni", "LoD2_32_551_5803_1_ni"]);
  });

  it("near a corner, leaves out the diagonal tile when the circle passes the corner by", () => {
    // 300 m from the east and north edges, but 424 m from the corner.
    expect(sorted(tilesAround(at(550_700, 5_803_700), 400))).toEqual([
      "LoD2_32_550_5803_1_ni",
      "LoD2_32_550_5804_1_ni",
      "LoD2_32_551_5803_1_ni",
    ]);
  });

  it("near a corner, takes all four tiles when the circle covers the corner", () => {
    expect(sorted(tilesAround(at(550_900, 5_803_900), 400))).toEqual([
      "LoD2_32_550_5803_1_ni",
      "LoD2_32_550_5804_1_ni",
      "LoD2_32_551_5803_1_ni",
      "LoD2_32_551_5804_1_ni",
    ]);
  });

  it("reaches across a whole tile for a large radius", () => {
    expect(tilesAround(at(550_500, 5_803_500), 1200)).toHaveLength(9);
  });
});

describe("tilesInBox", () => {
  it("is every tile the box touches", () => {
    const southWest = at(550_200, 5_803_200);
    const northEast = at(551_800, 5_804_100);

    expect(sorted(tilesInBox({ west: southWest.lon, south: southWest.lat, east: northEast.lon, north: northEast.lat }))).toEqual([
      "LoD2_32_550_5803_1_ni",
      "LoD2_32_550_5804_1_ni",
      "LoD2_32_551_5803_1_ni",
      "LoD2_32_551_5804_1_ni",
    ]);
  });
});
