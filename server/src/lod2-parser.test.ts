import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { SurfaceKind } from "@whatisthatbuilding/shared";
import { parseLod2Tile, type Lod2Building } from "./lod2-parser.ts";

// Three buildings cut from Hamburg's tile LoD2_32_565_5933_1_HH (release 2026-04-28), unchanged.
// Expected positions are PostGIS's ST_Transform of the GML's EPSG:25832 coordinates.
const excerpt = await readFile(new URL("./fixtures/LoD2_32_565_5933_1_HH-excerpt.gml", import.meta.url), "utf8");
// Two buildings cut from Niedersachsen's tile LoD2_32_550_5803_1_ni (Hannover, as LGLN served it
// in 2026), unchanged.
const niedersachsenExcerpt = await readFile(new URL("./fixtures/LoD2_32_550_5803_1_ni-excerpt.gml", import.meta.url), "utf8");

/** Matches a coordinate to within about 1 cm. */
function closeTo(degrees: number) {
  return expect.closeTo(degrees, 7);
}

describe("parseLod2Tile", () => {
  const tile = parseLod2Tile(excerpt);

  it("names the tile and gives its square in WGS84", () => {
    expect(tile.name).toBe("LoD2_32_565_5933_1_HH");
    // South-west and north-east corners of the 1 km square 565000–566000 E, 5933000–5934000 N.
    expect(tile.extent[0]).toEqual({ lat: closeTo(53.5418756), lon: closeTo(9.9808925) });
    expect(tile.extent[2]).toEqual({ lat: closeTo(53.5507381), lon: closeTo(9.9961917) });
    expect(tile.extent).toHaveLength(4);
  });

  it("turns each building into a Footprint with its height, function and address", () => {
    expect(tile.buildings.map(({ rings, shell, ...rest }) => rest)).toEqual([
      {
        id: "DEHHALKA90000Hr8",
        heightMetres: 35.441,
        functionCode: "31001_2010",
        address: { street: "Rödingsmarkt", houseNumber: "16", city: "Hamburg" },
      },
      {
        // A corner building with two addresses keeps the first.
        id: "DEHHALKAJ0000pzB",
        heightMetres: 18.931,
        functionCode: "31001_2010",
        address: { street: "Große Bäckerstraße", houseNumber: "2", city: "Hamburg" },
      },
      {
        // An address with only the city filled in.
        id: "DEHHALKA4RH000OT",
        heightMetres: 3,
        functionCode: "31001_3091",
        address: { city: "Hamburg" },
      },
    ]);
  });

  it("takes the outline from the ground surface, in WGS84, without the closing point or courtyards", () => {
    const [courtyardBlock, cornerBuilding, shed] = tile.buildings;

    // Rödingsmarkt 16 has an inner courtyard; only the outer ring is kept.
    expect(courtyardBlock?.rings).toHaveLength(1);
    expect(courtyardBlock?.rings[0]?.[0]).toEqual({ lat: closeTo(53.5463355), lon: closeTo(9.9849298) });
    expect(cornerBuilding?.rings[0]?.[0]).toEqual({ lat: closeTo(53.5489391), lon: closeTo(9.9923219) });
    expect(shed?.rings).toEqual([
      [
        { lat: closeTo(53.5483213), lon: closeTo(9.9871004) },
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ],
    ]);
  });

  it("keeps each building's Shell: its wall, roof and ground surfaces in 3D, in UTM32 metres", () => {
    expect(tile.buildings.map((b) => surfaceCounts(b.shell))).toEqual([
      { wall: 12, roof: 4, ground: 1 },
      { wall: 5, roof: 1, ground: 1 },
      { wall: 4, roof: 1, ground: 1 },
    ]);
    const [courtyardBlock] = tile.buildings;
    const firstRoof = courtyardBlock?.shell?.find((s) => s.kind === "roof");
    expect(firstRoof?.ring[0]).toEqual([565238.252, 5933486.305, 29.473]);
    expect(Math.max(...heightsOf(courtyardBlock?.shell, "roof"))).toBe(39.893);
    expect(Math.min(...heightsOf(courtyardBlock?.shell, "ground"))).toBe(4.452);
  });

  it("drops a surface's closing point and its holes", () => {
    for (const { shell } of tile.buildings) {
      for (const { ring } of shell ?? []) {
        expect(ring.length).toBeGreaterThanOrEqual(3);
        expect(ring[0]).not.toEqual(ring.at(-1));
      }
    }
    // Rödingsmarkt 16's ground has a courtyard: one ring all the same.
    expect(tile.buildings[0]?.shell?.filter((s) => s.kind === "ground")).toHaveLength(1);
  });
});

function surfaceCounts(shell: Lod2Building["shell"]): Record<string, number> {
  const counts: Record<string, number> = { wall: 0, roof: 0, ground: 0 };
  for (const { kind } of shell ?? []) counts[kind] = (counts[kind] ?? 0) + 1;
  return counts;
}

function heightsOf(shell: Lod2Building["shell"], kind: SurfaceKind): number[] {
  return (shell ?? []).filter((s) => s.kind === kind).flatMap((s) => s.ring.map(([, , height]) => height));
}

describe("parseLod2Tile on Niedersachsen's data", () => {
  const tile = parseLod2Tile(niedersachsenExcerpt);

  it("names the tile and gives its square in WGS84", () => {
    expect(tile.name).toBe("LoD2_32_550_5803_1_NI");
    expect(tile.extent[0]).toEqual({ lat: closeTo(52.3749825), lon: closeTo(9.7344842) });
    expect(tile.extent[2]).toEqual({ lat: closeTo(52.3838799), lon: closeTo(9.7493247) });
  });

  it("turns each building into a Footprint with its height, function and address", () => {
    expect(tile.buildings.map(({ rings, shell, ...rest }) => rest)).toEqual([
      {
        id: "DENILD4300009SgH",
        heightMetres: 16.589,
        functionCode: "31001_1000",
        address: { street: "Eckerstraße", houseNumber: "10", city: "Hannover, Landeshauptstadt" },
      },
      {
        // Made of four building parts: the tallest part's height counts.
        id: "DENILD4300009UT4",
        heightMetres: 3.82,
        functionCode: "31001_2000",
        address: { city: "Hannover, Landeshauptstadt" },
      },
    ]);
  });

  it("takes the outline from the ground surfaces, in WGS84, one ring for each building part", () => {
    const [house, garages] = tile.buildings;

    expect(house?.rings).toHaveLength(1);
    expect(house?.rings[0]?.[0]).toEqual({ lat: closeTo(52.3825845), lon: closeTo(9.7435651) });
    expect(garages?.rings).toHaveLength(4);
    expect(garages?.rings[0]?.[0]).toEqual({ lat: closeTo(52.3830163), lon: closeTo(9.7436962) });
    expect(garages?.rings[1]?.[0]).toEqual({ lat: closeTo(52.3830846), lon: closeTo(9.7434967) });
  });

  it("keeps the Shell of a building and of each of its building parts", () => {
    expect(tile.buildings.map((b) => surfaceCounts(b.shell))).toEqual([
      { wall: 6, roof: 2, ground: 1 },
      { wall: 21, roof: 4, ground: 4 },
    ]);
    const [house, garages] = tile.buildings;
    expect(house?.shell?.find((s) => s.kind === "roof")?.ring[0]).toEqual([550607.299, 5803842.094, 65.715]);
    expect(Math.max(...heightsOf(garages?.shell, "roof"))).toBe(57.596);
  });
});
