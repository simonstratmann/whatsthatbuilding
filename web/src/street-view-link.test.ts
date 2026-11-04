import { describe, expect, it } from "vitest";
import type { LatLng } from "@whatisthatbuilding/shared";
import { streetViewUrl } from "./street-view-link.ts";
import { offsetFrom } from "./test-geo.ts";

const USER: LatLng = { lat: 53.55, lon: 10 };

function offset(east: number, north: number): LatLng {
  return offsetFrom(USER, east, north);
}

function parse(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("streetViewUrl", () => {
  it("opens Google's key-free Street View at the user's position", () => {
    const url = streetViewUrl(USER, offset(0, 100));

    expect(url.startsWith("https://www.google.com/maps/@?")).toBe(true);
    expect(parse(url).get("api")).toBe("1");
    expect(parse(url).get("map_action")).toBe("pano");
    expect(parse(url).get("viewpoint")).toBe("53.55,10");
  });

  it("faces the building's centre", () => {
    expect(parse(streetViewUrl(USER, offset(0, 100))).get("heading")).toBe("0");
    expect(parse(streetViewUrl(USER, offset(100, 0))).get("heading")).toBe("90");
    expect(parse(streetViewUrl(USER, offset(-100, -100))).get("heading")).toBe("225");
  });

  it("gives a whole number of degrees below 360 for a building to the north-west", () => {
    expect(parse(streetViewUrl(USER, offset(-100, 100))).get("heading")).toBe("315");
    // Just west of north: 359.7° rounds to 0, not 360.
    expect(parse(streetViewUrl(USER, offset(-0.5, 100))).get("heading")).toBe("0");
  });

  it("keeps the position to about a centimetre", () => {
    const url = streetViewUrl({ lat: 53.123456789, lon: 9.987654321 }, offset(0, 100));

    expect(parse(url).get("viewpoint")).toBe("53.1234568,9.9876543");
  });
});
