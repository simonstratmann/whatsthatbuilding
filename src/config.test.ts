import { describe, expect, it } from "vitest";
import { chooseOverpassUrl } from "./config";

describe("chooseOverpassUrl", () => {
  it("prefers the address the container was started with", () => {
    expect(
      chooseOverpassUrl({ overpassUrl: "https://runtime.example.org/api/interpreter" }, "https://build.example.org/api/interpreter"),
    ).toBe("https://runtime.example.org/api/interpreter");
  });

  it("falls back to the address the app was built with", () => {
    expect(chooseOverpassUrl({}, "https://build.example.org/api/interpreter")).toBe(
      "https://build.example.org/api/interpreter",
    );
    expect(chooseOverpassUrl({ overpassUrl: "" }, "https://build.example.org/api/interpreter")).toBe(
      "https://build.example.org/api/interpreter",
    );
  });

  it("uses the public Overpass server when neither names one", () => {
    expect(chooseOverpassUrl(undefined, undefined)).toBe("https://overpass-api.de/api/interpreter");
  });
});
