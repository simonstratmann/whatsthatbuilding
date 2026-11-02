import { describe, expect, it } from "vitest";
import savedResponse from "./fixtures/overpass-buildings.json";
import { overpassFootprintSource } from "./overpass";

function respondingWith(body: unknown, status = 200) {
  const requests: { url: string; body: string }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), body: String(init?.body) });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchFn, requests };
}

describe("overpassFootprintSource", () => {
  it("asks Overpass for buildings within the radius of the centre", async () => {
    const { fetchFn, requests } = respondingWith({ elements: [] });

    await overpassFootprintSource(fetchFn).footprintsAround({ lat: 52.52, lon: 13.405 }, 500);

    expect(requests).toHaveLength(1);
    const query = new URLSearchParams(requests[0]!.body).get("data");
    expect(query).toContain("around:500,52.52,13.405");
    expect(query).toContain('"building"');
  });

  it("turns a saved Overpass response into Footprints", async () => {
    const { fetchFn } = respondingWith(savedResponse);

    const footprints = await overpassFootprintSource(fetchFn).footprintsAround({ lat: 52.52, lon: 13.405 }, 500);

    expect(footprints).toEqual([
      {
        id: "way/1001",
        rings: [
          [
            { lat: 52.5201, lon: 13.4051 },
            { lat: 52.5201, lon: 13.4052 },
            { lat: 52.5202, lon: 13.4052 },
            { lat: 52.5202, lon: 13.4051 },
          ],
        ],
      },
      {
        id: "way/1002",
        rings: [
          [
            { lat: 52.5203, lon: 13.4053 },
            { lat: 52.5203, lon: 13.4054 },
            { lat: 52.5204, lon: 13.4054 },
          ],
        ],
      },
      {
        // Two outer ways joined into one ring; the inner courtyard is not part of the Footprint.
        id: "relation/2001",
        rings: [
          [
            { lat: 52.521, lon: 13.406 },
            { lat: 52.521, lon: 13.407 },
            { lat: 52.522, lon: 13.407 },
            { lat: 52.522, lon: 13.406 },
          ],
        ],
      },
    ]);
  });

  it("fails when Overpass responds with an error", async () => {
    const { fetchFn } = respondingWith({ remark: "rate limited" }, 429);

    await expect(
      overpassFootprintSource(fetchFn).footprintsAround({ lat: 52.52, lon: 13.405 }, 500),
    ).rejects.toThrow(/429/);
  });
});
