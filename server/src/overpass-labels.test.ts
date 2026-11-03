import { describe, expect, it } from "vitest";
import type { Footprint, LatLng } from "@whatisthatbuilding/shared";
import savedResponse from "./fixtures/overpass-names.json" with { type: "json" };
import { overpassLabelSource } from "./overpass-labels.ts";

const OVERPASS_URL = "https://overpass.example.org/api/interpreter";
const CENTRE: LatLng = { lat: 53.5503, lon: 9.9925 };

function respondingWith(body: unknown, status = 200) {
  const requests: { url: string; body: string; headers: Headers; signal: AbortSignal | null | undefined }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), body: String(init?.body), headers: new Headers(init?.headers), signal: init?.signal });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return { fetchFn, requests };
}

function namesIn(body: unknown, status = 200) {
  return overpassLabelSource({ url: OVERPASS_URL, fetchFn: respondingWith(body, status).fetchFn }).namesAround(CENTRE, 500);
}

/** A rectangular LoD2 Footprint between the given corners, centred in the middle. */
function footprint(id: string, south: number, west: number, north: number, east: number): Footprint {
  return {
    id,
    rings: [
      [
        { lat: south, lon: west },
        { lat: south, lon: east },
        { lat: north, lon: east },
        { lat: north, lon: west },
      ],
    ],
    centre: { lat: (south + north) / 2, lon: (west + east) / 2 },
  };
}

// The LoD2 Footprints of the buildings in overpass-names.json.
const CONCERT_HALL = footprint("DEHH-hall", 53.552, 9.99, 53.5522, 9.9904);
const KIOSK = footprint("DEHH-kiosk", 53.551, 9.991, 53.5512, 9.9912);
const KONTORHAUS = footprint("DEHH-kontor", 53.554, 9.993, 53.5542, 9.9934);
const ARCADE = footprint("DEHH-arcade", 53.555, 9.994, 53.5552, 9.9942);
const SHED = footprint("DEHH-shed", 53.556, 9.995, 53.5562, 9.9952);

describe("overpassLabelSource", () => {
  it("asks Overpass for named buildings and named points within the radius", async () => {
    const { fetchFn, requests } = respondingWith({ elements: [] });

    await overpassLabelSource({ url: OVERPASS_URL, fetchFn }).namesAround(CENTRE, 500);

    expect(requests.map((r) => r.url)).toEqual([OVERPASS_URL]);
    const query = new URLSearchParams(requests[0]!.body).get("data");
    expect(query).toContain('way["building"]["name"](around:500,53.5503,9.9925)');
    expect(query).toContain('relation["building"]["name"](around:500,53.5503,9.9925)');
    expect(query).toContain('node["name"]');
    // Not names of other things that sit on or against a building: a suburb's name put on some
    // point in it, a stop at the kerb, a Stolperstein at the door.
    expect(query).toContain('[!"place"][!"highway"][!"public_transport"][!"memorial"]');
    expect(requests[0]!.headers.get("User-Agent")).toMatch(/^whatisthatbuilding\/.+ \(\+https:\/\/github\.com\//);
    // A hung Overpass server mustn't hold the Snapshot up for good.
    expect(requests[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  it("names an unnamed building after the one named point inside it", async () => {
    const names = await namesIn(savedResponse);

    expect(names.nameOf(KIOSK)).toBe("Kiosk am Markt");
  });

  it("names a Footprint after the OSM building it is, not a named point inside it", async () => {
    // The Laeiszhalle has the Café im Foyer inside it.
    const names = await namesIn(savedResponse);

    expect(names.nameOf(CONCERT_HALL)).toBe("Laeiszhalle");
  });

  it("names a Footprint after an OSM multipolygon building whose outline is split over several ways", async () => {
    // Its centre lies in the courtyard, which the Footprint's outer ring covers.
    const names = await namesIn(savedResponse);

    expect(names.nameOf(KONTORHAUS)).toBe("Kontorhaus am Hof");
  });

  it("names no building after one of several different named points inside it", async () => {
    // A bakery and a pharmacy in one building: neither names the whole building.
    const names = await namesIn(savedResponse);

    expect(names.nameOf(ARCADE)).toBeUndefined();
  });

  it("knows no name for a building with nothing named on or in it", async () => {
    const names = await namesIn(savedResponse);

    expect(names.nameOf(SHED)).toBeUndefined();
  });

  it("names each of several LoD2 Footprints that one named OSM building covers", async () => {
    // OSM maps the terrace as one building; LoD2 has a Footprint per house.
    const terrace = {
      elements: [
        {
          type: "way",
          id: 2002,
          geometry: [
            { lat: 53.557, lon: 9.996 },
            { lat: 53.557, lon: 9.9968 },
            { lat: 53.5572, lon: 9.9968 },
            { lat: 53.5572, lon: 9.996 },
            { lat: 53.557, lon: 9.996 },
          ],
          tags: { building: "terrace", name: "Krameramtsstuben" },
        },
      ],
    };
    const houses = [0, 1, 2, 3].map((n) => footprint(`house-${n}`, 53.557, 9.996 + n * 0.0002, 53.5572, 9.9962 + n * 0.0002));

    const names = await namesIn(terrace);

    expect(houses.map((house) => names.nameOf(house))).toEqual(Array(4).fill("Krameramtsstuben"));
  });

  it("fails when Overpass answers with an error status", async () => {
    await expect(namesIn({ elements: [] }, 504)).rejects.toThrow(/504/);
  });

  it("fails when Overpass answers with something other than JSON", async () => {
    await expect(namesIn("rate_limited")).rejects.toThrow();
  });

  it("fails when the Overpass query ran out of time, though it answered 200", async () => {
    const timedOut = {
      elements: [],
      remark: 'runtime error: Query timed out in "query" at line 3 after 6 seconds.',
    };

    await expect(namesIn(timedOut)).rejects.toThrow(/timed out/);
  });
});
