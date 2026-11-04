import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dopProxy, HAMBURG_DOP_URL, NIEDERSACHSEN_DOP_URL, type DopProxyOptions, type TileKey } from "./dop-proxy.ts";

/** Zoom 17 tiles: Hamburg's Rathausmarkt, Hannover's Kröpcke, and one on Hamburg's southernmost border. */
const RATHAUSMARKT: TileKey = { z: 17, x: 69174, y: 42361 };
const KROEPCKE: TileKey = { z: 17, x: 69081, y: 43072 };
const ACROSS_THE_BORDER: TileKey = { z: 17, x: 69261, y: 42456 };

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

/**
 * Both WMS: each answer is a JPEG of `tileBytes` bytes, unless `answer` says otherwise
 * (a WMS reports errors as XML with status 200).
 */
function fakeWms(answer: (url: URL) => Response | undefined = () => undefined, tileBytes = JPEG.length) {
  const requested: URL[] = [];
  const fetchFn = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requested.push(url);
    return answer(url) ?? new Response(new Uint8Array(tileBytes).fill(7), { headers: { "Content-Type": "image/jpeg" } });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, requested };
}

let cacheDir: string;
beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "dop-cache-"));
});
afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

function proxy(options: Partial<DopProxyOptions> & Pick<DopProxyOptions, "fetchFn">) {
  return dopProxy({ cacheDir, maxCacheBytes: 1_000_000, logError: () => {}, ...options });
}

async function cachedFiles(): Promise<string[]> {
  const entries = await readdir(cacheDir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(cacheDir.length + 1)).sort();
}

describe("the DOP proxy", () => {
  it("asks the Hamburg WMS for a tile inside Hamburg", async () => {
    const wms = fakeWms();

    const tile = await proxy(wms).tile(RATHAUSMARKT);

    expect(tile.contentType).toBe("image/jpeg");
    expect(wms.requested).toHaveLength(1);
    const [url] = wms.requested;
    expect(`${url!.origin}${url!.pathname}`).toBe(HAMBURG_DOP_URL);
    expect(url!.searchParams.get("LAYERS")).toBe("dop_zeitreihe_unbelaubt");
  });

  it("asks LGLN for a tile in Niedersachsen", async () => {
    const wms = fakeWms();

    await proxy(wms).tile(KROEPCKE);

    const [url] = wms.requested;
    expect(`${url!.origin}${url!.pathname}`).toBe(NIEDERSACHSEN_DOP_URL);
    expect(url!.searchParams.get("LAYERS")).toBe("ni_dop20");
  });

  it("asks LGLN for a tile that crosses Hamburg's border", async () => {
    const wms = fakeWms();

    await proxy(wms).tile(ACROSS_THE_BORDER);

    expect(`${wms.requested[0]!.origin}${wms.requested[0]!.pathname}`).toBe(NIEDERSACHSEN_DOP_URL);
  });

  it("asks for the tile's area as 256 px in Web Mercator", async () => {
    const wms = fakeWms();

    await proxy(wms).tile(KROEPCKE);

    const params = wms.requested[0]!.searchParams;
    expect(params.get("REQUEST")).toBe("GetMap");
    expect(params.get("CRS")).toBe("EPSG:3857");
    expect([params.get("WIDTH"), params.get("HEIGHT")]).toEqual(["256", "256"]);
    const bbox = params.get("BBOX")!.split(",").map(Number);
    expect(bbox[0]).toBeCloseTo(1083877.061, 2);
    expect(bbox[1]).toBeCloseTo(6868019.865, 2);
    expect(bbox[2]).toBeCloseTo(1084182.809, 2);
    expect(bbox[3]).toBeCloseTo(6868325.614, 2);
  });

  it("serves a second request for the same tile from the cache, also after a restart", async () => {
    const wms = fakeWms();
    const first = await proxy(wms).tile(KROEPCKE);

    const again = await proxy(wms).tile(KROEPCKE);

    expect(wms.fetchFn).toHaveBeenCalledTimes(1);
    expect(again.bytes).toEqual(first.bytes);
  });

  it("asks the WMS once for a tile requested twice at the same time", async () => {
    const wms = fakeWms();
    const dop = proxy(wms);

    await Promise.all([dop.tile(KROEPCKE), dop.tile(KROEPCKE)]);

    expect(wms.fetchFn).toHaveBeenCalledTimes(1);
  });

  it("stays under its size limit by evicting the oldest tiles first", async () => {
    const wms = fakeWms(undefined, 400);
    const dop = proxy({ ...wms, maxCacheBytes: 1000 });

    for (const x of [1, 2, 3, 4]) await dop.tile({ z: 17, x: KROEPCKE.x + x, y: KROEPCKE.y });

    expect(await cachedFiles()).toEqual([`17/${KROEPCKE.x + 3}/${KROEPCKE.y}.jpg`, `17/${KROEPCKE.x + 4}/${KROEPCKE.y}.jpg`]);
  });

  it("counts the tiles cached before a restart towards the limit", async () => {
    const wms = fakeWms(undefined, 400);
    await proxy({ ...wms, maxCacheBytes: 1000 }).tile({ z: 17, x: KROEPCKE.x + 1, y: KROEPCKE.y });
    await proxy({ ...wms, maxCacheBytes: 1000 }).tile({ z: 17, x: KROEPCKE.x + 2, y: KROEPCKE.y });

    await proxy({ ...wms, maxCacheBytes: 1000 }).tile({ z: 17, x: KROEPCKE.x + 3, y: KROEPCKE.y });

    expect(await cachedFiles()).toEqual([`17/${KROEPCKE.x + 2}/${KROEPCKE.y}.jpg`, `17/${KROEPCKE.x + 3}/${KROEPCKE.y}.jpg`]);
  });

  it("counts the tiles cached before a restart under a relative cache folder", async () => {
    const wms = fakeWms(undefined, 400);
    const relativeDir = `./${relative(process.cwd(), cacheDir)}/`;
    await proxy({ ...wms, cacheDir: relativeDir, maxCacheBytes: 1000 }).tile({ z: 17, x: KROEPCKE.x + 1, y: KROEPCKE.y });
    await proxy({ ...wms, cacheDir: relativeDir, maxCacheBytes: 1000 }).tile({ z: 17, x: KROEPCKE.x + 2, y: KROEPCKE.y });

    await proxy({ ...wms, cacheDir: relativeDir, maxCacheBytes: 1000 }).tile({ z: 17, x: KROEPCKE.x + 3, y: KROEPCKE.y });

    expect(await cachedFiles()).toEqual([`17/${KROEPCKE.x + 2}/${KROEPCKE.y}.jpg`, `17/${KROEPCKE.x + 3}/${KROEPCKE.y}.jpg`]);
  });

  it("logs a failing WMS, fails the tile and caches nothing", async () => {
    const wms = fakeWms(() => new Response("busy", { status: 503 }));
    const logError = vi.fn();

    await expect(proxy({ ...wms, logError }).tile(KROEPCKE)).rejects.toThrow(/503/);

    expect(logError).toHaveBeenCalledWith(expect.stringContaining("17/69081/43072"), expect.anything());
    expect(await cachedFiles()).toEqual([]);
  });

  it("takes a WMS error report sent as status 200 for a failure, not a tile", async () => {
    const report = `<?xml version="1.0"?><ServiceExceptionReport><ServiceException>Layer nope</ServiceException></ServiceExceptionReport>`;
    const wms = fakeWms(() => new Response(report, { headers: { "Content-Type": "text/xml;charset=UTF-8" } }));
    const logError = vi.fn();

    await expect(proxy({ ...wms, logError }).tile(KROEPCKE)).rejects.toThrow(/text\/xml/);

    expect(logError).toHaveBeenCalled();
    expect(await cachedFiles()).toEqual([]);
  });

  it("asks again after a failure", async () => {
    let fail = true;
    const wms = fakeWms(() => (fail ? new Response("busy", { status: 503 }) : undefined));
    const dop = proxy(wms);
    await dop.tile(KROEPCKE).catch(() => {});
    fail = false;

    await dop.tile(KROEPCKE);

    expect(wms.fetchFn).toHaveBeenCalledTimes(2);
    expect(await cachedFiles()).toEqual(["17/69081/43072.jpg"]);
  });
});
