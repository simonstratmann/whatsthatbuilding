import { describe, expect, it } from "vitest";
import { shellCachePolicy } from "./shell-cache-policy.ts";

const scope = "https://app.example/";

/** The policy for fetching a URL, under the default scope unless one is given. */
function get(url: string, appScope = scope) {
  return shellCachePolicy({ url, method: "GET" }, appScope);
}

describe("the shell cache policy", () => {
  it("never caches the API: Candidates, Aerial Photos and choices always come from the server", () => {
    expect(shellCachePolicy({ url: `${scope}api/identify`, method: "POST" }, scope)).toBe("bypass");
    expect(get(`${scope}api/dop/17/69081/42000`)).toBe("bypass");
  });

  it("opens the app from the network when it can, so an update shows at once, and from the cache offline", () => {
    expect(get(scope)).toBe("network-first");
    expect(get(`${scope}?dev`)).toBe("network-first");
  });

  it("takes hashed assets from the cache, since their names change with their content", () => {
    expect(get(`${scope}assets/index-abc123.js`)).toBe("cache-first");
  });

  it("keeps the app's other files, like its icons, but fetches them fresh when it can", () => {
    expect(get(`${scope}icon-192.png`)).toBe("network-first");
  });

  it("leaves other origins alone, such as the street map's tiles", () => {
    expect(get("https://tile.openstreetmap.org/17/69081/42000.png")).toBe("bypass");
  });

  it("stores only what was fetched, never what was sent", () => {
    expect(shellCachePolicy({ url: `${scope}choice`, method: "POST" }, scope)).toBe("bypass");
  });

  it("leaves a page outside its scope alone when the app lives in a folder", () => {
    const folder = "https://host.example/building/";
    expect(get("https://host.example/other/", folder)).toBe("bypass");
    expect(get(`${folder}assets/index-abc123.js`, folder)).toBe("cache-first");
  });
});
