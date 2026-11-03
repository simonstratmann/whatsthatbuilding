import { describe, expect, it } from "vitest";
import savedResponse from "./fixtures/overpass-buildings.json" with { type: "json" };
import { overpassFootprintSource, recordingOverpassFetch } from "./overpass.ts";

/** Matches a coordinate to within about 1 cm. */
function closeTo(degrees: number) {
  return expect.closeTo(degrees, 7);
}

function respondingWith(body: unknown, status = 200) {
  const requests: { url: string; body: string; headers: Headers }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), body: String(init?.body), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchFn, requests };
}

const OVERPASS_URL = "https://overpass.example.org/api/interpreter";

function sourceUsing(fetchFn: typeof fetch) {
  return overpassFootprintSource({ url: OVERPASS_URL, fetchFn });
}

describe("overpassFootprintSource", () => {
  it("asks Overpass for buildings within the radius of the centre", async () => {
    const { fetchFn, requests } = respondingWith({ elements: [] });

    await sourceUsing(fetchFn).footprintsAround({ lat: 52.52, lon: 13.405 }, 500);

    expect(requests).toHaveLength(1);
    const query = new URLSearchParams(requests[0]!.body).get("data");
    expect(query).toContain("around:500,52.52,13.405");
    expect(query).toContain('"building"');
  });

  it("asks the Overpass server it was given", async () => {
    const { fetchFn, requests } = respondingWith({ elements: [] });

    await sourceUsing(fetchFn).footprintsAround(
      { lat: 52.3745, lon: 9.7386 },
      500,
    );

    expect(requests.map((r) => r.url)).toEqual([OVERPASS_URL]);
  });

  it("names the app in its User-Agent, as the public Overpass server requires", async () => {
    const { fetchFn, requests } = respondingWith({ elements: [] });

    await sourceUsing(fetchFn).footprintsAround(
      { lat: 52.52, lon: 13.405 },
      500,
    );

    expect(requests[0]!.headers.get("User-Agent")).toMatch(/^whatisthatbuilding\/.+ \(\+https:\/\/github\.com\//);
  });

  it("turns a saved Overpass response into Footprints", async () => {
    const { fetchFn } = respondingWith(savedResponse);

    const footprints = await sourceUsing(fetchFn).footprintsAround({ lat: 52.52, lon: 13.405 }, 500);

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
        centre: { lat: closeTo(52.52015), lon: closeTo(13.40515) },
        name: "Corner Shop",
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
        // A building with no tags at all: no name, no address.
        centre: { lat: closeTo(52.5203333), lon: closeTo(13.4053667) },
      },
      {
        id: "way/1003",
        rings: [
          [
            { lat: 52.5205, lon: 13.4055 },
            { lat: 52.5205, lon: 13.4057 },
            { lat: 52.5206, lon: 13.4057 },
            { lat: 52.5206, lon: 13.4055 },
          ],
        ],
        centre: { lat: closeTo(52.52055), lon: closeTo(13.4056) },
        address: { street: "Karl-Marx-Allee", houseNumber: "12" },
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
        centre: { lat: closeTo(52.5215), lon: closeTo(13.4065) },
      },
    ]);
  });

  it("fails when Overpass responds with an error", async () => {
    const { fetchFn } = respondingWith({ remark: "rate limited" }, 429);

    await expect(
      sourceUsing(fetchFn).footprintsAround({ lat: 52.52, lon: 13.405 }, 500),
    ).rejects.toThrow(/429/);
  });
});

describe("recordingOverpassFetch", () => {
  it("keeps each Overpass query with its answer, for the request log", async () => {
    const { fetchFn } = respondingWith({ elements: [] });
    const recorder = recordingOverpassFetch(fetchFn);

    await sourceUsing(recorder.fetch).footprintsAround(
      { lat: 52.52, lon: 13.405 },
      500,
    );

    expect(recorder.exchanges).toEqual([
      {
        url: OVERPASS_URL,
        query: expect.stringContaining("around:500,52.52,13.405"),
        status: 200,
        durationMs: expect.any(Number),
        response: { elements: [] },
      },
    ]);
  });

  it("keeps an answer that isn't JSON as text, and a request that got no answer with its error", async () => {
    let calls = 0;
    const recorder = recordingOverpassFetch(async () => {
      if (calls++ === 0) return new Response("<html>Bad Gateway</html>", { status: 502 });
      throw new TypeError("fetch failed");
    });
    const source = sourceUsing(recorder.fetch);

    await expect(source.footprintsAround({ lat: 52.52, lon: 13.405 }, 500)).rejects.toThrow(/502/);
    await expect(source.footprintsAround({ lat: 52.52, lon: 13.405 }, 500)).rejects.toThrow(/fetch failed/);

    expect(recorder.exchanges).toMatchObject([
      { status: 502, response: "<html>Bad Gateway</html>" },
      { status: null, response: null, error: "TypeError: fetch failed" },
    ]);
  });
});
