import { describe, expect, it } from "vitest";
import { OVERPASS_PATH } from "../src/overpass.ts";
import { overpassProxy } from "./overpass-proxy.ts";

describe("overpassProxy", () => {
  it("forwards the app's Overpass path to the configured interpreter", () => {
    const rule = overpassProxy("http://overpass:8080/api/interpreter")[OVERPASS_PATH]!;
    expect(rule.target).toBe("http://overpass:8080");
    expect(rule.changeOrigin).toBe(true);
    expect(rule.rewrite?.(OVERPASS_PATH)).toBe("/api/interpreter");
  });

  it("uses the public Overpass server when OVERPASS_URL is unset or empty", () => {
    for (const url of [undefined, ""]) {
      const rule = overpassProxy(url)[OVERPASS_PATH]!;
      expect(rule.target).toBe("https://overpass-api.de");
      expect(rule.rewrite?.(OVERPASS_PATH)).toBe("/api/interpreter");
    }
  });

  it("refuses anything but an http(s) URL", () => {
    expect(() => overpassProxy("overpass:8080")).toThrow(/http\(s\)/);
  });
});
