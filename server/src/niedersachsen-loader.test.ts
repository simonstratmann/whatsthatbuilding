import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { niedersachsenLoader, NIEDERSACHSEN_TILES_URL, type NiedersachsenLoader } from "./niedersachsen-loader.ts";
import { tileName, type TileKey } from "./niedersachsen-tiles.ts";
import { parseLod2Tile } from "./lod2-parser.ts";
import { lod2Store, type Lod2Store } from "./lod2-store.ts";
import { ageLod2Tiles, freshDatabase } from "./test-database.ts";
import { fromUtm32 } from "./utm32.ts";

/** A 1 km tile in LGLN's CityGML with one 10 m square house in its middle, named after the tile. */
function tileGml({ east, north }: TileKey): string {
  const e = east * 1000;
  const n = north * 1000;
  const square = [
    [e + 495, n + 495],
    [e + 505, n + 495],
    [e + 505, n + 505],
    [e + 495, n + 505],
    [e + 495, n + 495],
  ]
    .map(([x, y]) => `${x} ${y} 50`)
    .join(" ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<core:CityModel xmlns:core="http://www.opengis.net/citygml/1.0" xmlns:bldg="http://www.opengis.net/citygml/building/1.0"
    xmlns:gml="http://www.opengis.net/gml" xmlns:xal="urn:oasis:names:tc:ciq:xsdschema:xAL:2.0">
  <gml:name>LoD2_32_${east}_${north}_1_NI</gml:name>
  <gml:boundedBy><gml:Envelope srsDimension="3">
    <gml:lowerCorner>${e} ${n} 0</gml:lowerCorner><gml:upperCorner>${e + 1000} ${n + 1000} 100</gml:upperCorner>
  </gml:Envelope></gml:boundedBy>
  <core:cityObjectMember>
    <bldg:Building gml:id="house-${east}-${north}">
      <bldg:function>31001_1000</bldg:function>
      <bldg:measuredHeight uom="urn:adv:uom:m">9</bldg:measuredHeight>
      <bldg:boundedBy><bldg:GroundSurface><bldg:lod2MultiSurface><gml:MultiSurface><gml:surfaceMember>
        <gml:Polygon><gml:exterior><gml:LinearRing><gml:posList srsDimension="3">${square}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon>
      </gml:surfaceMember></gml:MultiSurface></bldg:lod2MultiSurface></bldg:GroundSurface></bldg:boundedBy>
    </bldg:Building>
  </core:cityObjectMember>
</core:CityModel>`;
}

/** The middle of a tile, where its house stands. */
function middleOf({ east, north }: TileKey) {
  return fromUtm32({ east: east * 1000 + 500, north: north * 1000 + 500 });
}

const HANNOVER: TileKey = { east: 550, north: 5803 };
const IN_BREMEN: TileKey = { east: 487, north: 5882 };
const IN_HAMBURG: TileKey = { east: 565, north: 5933 };

/**
 * LGLN's bucket: every tile exists except those in `missing`; tiles in `failing` answer 503.
 * Answers wait for `release` when one is given, so a test can hold downloads open.
 */
function fakeLgln({ missing = [] as TileKey[], failing = [] as TileKey[] } = {}) {
  const requested: string[] = [];
  let release: Promise<void> | undefined;
  const fetchFn = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    await release;
    const match = /LoD2_32_(\d+)_(\d+)_1_ni\.gml$/.exec(url);
    if (!url.startsWith(NIEDERSACHSEN_TILES_URL) || !match) return new Response("unexpected", { status: 400 });
    const key = { east: Number(match[1]), north: Number(match[2]) };
    const is = (list: TileKey[]) => list.some((t) => t.east === key.east && t.north === key.north);
    if (is(failing)) return new Response("busy", { status: 503 });
    if (is(missing)) return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 });
    return new Response(tileGml(key));
  }) as unknown as typeof fetch;
  return {
    fetchFn,
    requested,
    /** Holds every download until the returned function is called. */
    hold(): () => void {
      let open!: () => void;
      release = new Promise((resolve) => (open = resolve));
      return open;
    },
  };
}

let store: Lod2Store;
let databaseUrl: string;
let cacheDir: string;
const quiet = { log: () => {}, logError: () => {} };

beforeAll(async () => {
  databaseUrl = await freshDatabase();
  store = lod2Store(databaseUrl);
});
afterAll(async () => {
  await store.close();
});
beforeEach(async () => {
  await store.replaceTiles("niedersachsen", (async function* () {})());
  await store.replaceTiles("hamburg", (async function* () {})());
  cacheDir = await mkdtemp(join(tmpdir(), "lod2-cache-"));
});

function loader(lgln: ReturnType<typeof fakeLgln>, options: Partial<Parameters<typeof niedersachsenLoader>[0]> = {}): NiedersachsenLoader {
  // Tiles marked missing stay so between tests, so each test uses its own.
  return niedersachsenLoader({ store, cacheDir, fetchFn: lgln.fetchFn, ...quiet, ...options });
}

describe("the Niedersachsen Footprint source", () => {
  it("downloads the tiles around a Snapshot, stores them and answers from them", async () => {
    const lgln = fakeLgln();
    const { source } = loader(lgln);

    const [covered, footprints] = await Promise.all([source.covers(middleOf(HANNOVER)), source.footprintsAround(middleOf(HANNOVER), 500)]);

    expect(covered).toBe(true);
    expect(footprints.map((f) => f.id)).toEqual(["house-550-5803"]);
    expect(footprints[0]).toMatchObject({ heightMetres: 9, functionCode: "31001_1000" });
    // Each tile the circle reaches is asked for once.
    expect(new Set(lgln.requested).size).toBe(lgln.requested.length);
    expect(lgln.requested).toContain(`${NIEDERSACHSEN_TILES_URL}/LoD2_32_550_5803_1_ni.gml`);
  });

  it("doesn't download a tile again once it is stored", async () => {
    const lgln = fakeLgln();
    const { source } = loader(lgln);
    await source.footprintsAround(middleOf(HANNOVER), 500);
    const firstTime = lgln.requested.length;
    // Without the file cache, only the store knowing the tile can save a download.
    await rm(join(cacheDir, "niedersachsen"), { recursive: true });

    await source.covers(middleOf(HANNOVER));
    await source.footprintsAround(middleOf(HANNOVER), 500);

    expect(firstTime).toBeGreaterThan(0);
    expect(lgln.requested).toHaveLength(firstTime);
  });

  it("downloads a tile once when several Snapshots need it at the same time", async () => {
    const lgln = fakeLgln();
    const { source } = loader(lgln);
    const open = lgln.hold();

    const answers = Promise.all([
      source.footprintsAround(middleOf(HANNOVER), 500),
      source.footprintsAround(middleOf(HANNOVER), 500),
      source.covers(middleOf(HANNOVER)),
    ]);
    await vi.waitFor(() => expect(lgln.requested.length).toBeGreaterThan(0));
    open();
    const [first, second, covered] = await answers;

    expect(covered).toBe(true);
    expect(first.map((f) => f.id)).toEqual(["house-550-5803"]);
    expect(second.map((f) => f.id)).toEqual(["house-550-5803"]);
    expect(new Set(lgln.requested).size).toBe(lgln.requested.length);
  });

  it("keeps the downloaded GML in the file cache, and loads from there before downloading", async () => {
    const { source } = loader(fakeLgln());
    await source.covers(middleOf(HANNOVER));

    expect(await readdir(join(cacheDir, "niedersachsen"))).toContain("LoD2_32_550_5803_1_ni.gml");

    // The database is emptied, but the file cache still has the tile.
    await store.replaceTiles("niedersachsen", (async function* () {})());
    const offline = fakeLgln({ failing: [HANNOVER] });
    expect(await loader(offline).source.covers(middleOf(HANNOVER))).toBe(true);
    expect(offline.requested).not.toContain(`${NIEDERSACHSEN_TILES_URL}/LoD2_32_550_5803_1_ni.gml`);
  });

  it("leaves a Snapshot where LGLN has no tile outside the Coverage Area, and doesn't ask for that tile again", async () => {
    const lgln = fakeLgln({ missing: [IN_BREMEN] });
    const { source } = loader(lgln);

    expect(await source.covers(middleOf(IN_BREMEN))).toBe(false);
    expect(await source.covers(middleOf(IN_BREMEN))).toBe(false);

    expect(lgln.requested.filter((url) => url.endsWith(`${tileName(IN_BREMEN)}.gml`))).toHaveLength(1);
  });

  it("doesn't ask LGLN about a Snapshot far from Niedersachsen", async () => {
    const lgln = fakeLgln();

    expect(await loader(lgln).source.covers({ lat: 48.137, lon: 11.575 })).toBe(false);
    expect(await loader(lgln).source.footprintsAround({ lat: 48.137, lon: 11.575 }, 500)).toEqual([]);

    expect(lgln.requested).toEqual([]);
  });

  it("logs a failed download and fails, then tries again on the next Snapshot", async () => {
    const failing: TileKey = { east: 551, north: 5803 };
    const logError = vi.fn();
    const lgln = fakeLgln({ failing: [failing] });
    const { source } = loader(lgln, { logError });

    await expect(source.covers(middleOf(failing))).rejects.toThrow(/503/);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("LoD2_32_551_5803_1_ni"), expect.any(Error));

    await expect(source.covers(middleOf(failing))).rejects.toThrow(/503/);
    expect(lgln.requested.filter((url) => url.endsWith("LoD2_32_551_5803_1_ni.gml"))).toHaveLength(2);
  });

  it("answers a Snapshot in Hamburg from Hamburg's tiles while LGLN fails, and tries LGLN again next time", async () => {
    await store.addTile("hamburg", { ...parseLod2Tile(tileGml(IN_HAMBURG)), name: "LoD2_32_565_5933_1_HH" });
    const logError = vi.fn();
    const lgln = fakeLgln({ failing: [IN_HAMBURG] });
    const { source } = loader(lgln, { logError });

    expect(await source.covers(middleOf(IN_HAMBURG))).toBe(true);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(tileName(IN_HAMBURG)), expect.any(Error));

    const footprints = await source.footprintsAround(middleOf(IN_HAMBURG), 0);
    expect(footprints.map((f) => f.id)).toEqual(["house-565-5933"]);
    expect(lgln.requested.filter((url) => url.endsWith(`${tileName(IN_HAMBURG)}.gml`))).toHaveLength(2);
  });

  it("leaves no partial file in the cache when a download breaks off", async () => {
    const brokenOff = vi.fn(async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("<?xml"));
          controller.error(new Error("connection reset"));
        },
      });
      return new Response(body);
    }) as unknown as typeof fetch;
    const { source } = niedersachsenLoader({ store, cacheDir, fetchFn: brokenOff, ...quiet });

    await expect(source.covers(middleOf({ east: 552, north: 5803 }))).rejects.toThrow(/connection reset/);

    await mkdir(join(cacheDir, "niedersachsen"), { recursive: true });
    expect(await readdir(join(cacheDir, "niedersachsen"))).toEqual([]);
  });
});

describe("tiles stored before Building Shells", () => {
  it("reads a Niedersachsen tile again from the file cache the first time a Snapshot needs it, without a download", async () => {
    const { source } = loader(fakeLgln());
    await source.footprintsAround(middleOf(HANNOVER), 500);
    await ageLod2Tiles(databaseUrl);
    const offline = fakeLgln({ failing: [HANNOVER] });
    const upgraded = loader(offline);

    const footprints = await upgraded.source.footprintsAround(middleOf(HANNOVER), 500);
    const shells = await upgraded.source.shellsOf(footprints.map((f) => f.id));

    expect(shells.get("house-550-5803")?.map((s) => s.kind)).toEqual(["ground"]);
    expect(offline.requested).toEqual([]);
    expect(await store.outdatedTiles(middleOf(HANNOVER), 500)).toEqual([]);
  });

  it("reads a Hamburg tile again from the release in the file cache", async () => {
    await store.addTile("hamburg", { ...parseLod2Tile(tileGml(IN_HAMBURG)), name: "LoD2_32_565_5933_1_HH" });
    await ageLod2Tiles(databaseUrl);
    const releaseDir = join(cacheDir, "hamburg", "LoD2-DE_HH_2026-04-28");
    await mkdir(releaseDir, { recursive: true });
    await writeFile(join(releaseDir, "LoD2_32_565_5933_1_HH.gml"), tileGml(IN_HAMBURG));
    // LGLN has only Niedersachsen's side of the border, and is down besides.
    const lgln = fakeLgln({ failing: [IN_HAMBURG] });
    const { source } = loader(lgln);

    await source.footprintsAround(middleOf(IN_HAMBURG), 0);

    expect((await source.shellsOf(["house-565-5933"])).has("house-565-5933")).toBe(true);
    expect(await store.outdatedTiles(middleOf(IN_HAMBURG), 0)).toEqual([]);
  });

  it("answers from the old tile, without Shells, when its GML isn't in the file cache", async () => {
    const first = loader(fakeLgln()).source;
    await first.footprintsAround(middleOf(HANNOVER), 500);
    await ageLod2Tiles(databaseUrl);
    await rm(join(cacheDir, "niedersachsen"), { recursive: true });
    const logError = vi.fn();

    const { source } = loader(fakeLgln(), { logError });
    const footprints = await source.footprintsAround(middleOf(HANNOVER), 500);
    const failuresLogged = logError.mock.calls.length;
    await source.footprintsAround(middleOf(HANNOVER), 500);

    expect(footprints.map((f) => f.id)).toEqual(["house-550-5803"]);
    // The next Snapshot doesn't try those tiles again.
    expect(logError).toHaveBeenCalledTimes(failuresLogged);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("LoD2_32_550_5803_1_ni"), expect.any(Error));
  });
});

describe("preloading", () => {
  it("downloads no more than four tiles at a time", async () => {
    let downloading = 0;
    let most = 0;
    const lgln = fakeLgln();
    const counting = (async (input: string | URL | Request) => {
      most = Math.max(most, ++downloading);
      await new Promise((resolve) => setTimeout(resolve, 5));
      downloading -= 1;
      return lgln.fetchFn(input);
    }) as typeof fetch;
    const tiles = Array.from({ length: 10 }, (_, i) => ({ east: 580 + i, north: 5830 }));

    const result = await niedersachsenLoader({ store, cacheDir, fetchFn: counting, ...quiet }).load(tiles);

    expect(result.loaded).toBe(10);
    expect(most).toBe(4);
  });

  it("loads every tile in the box, and skips the tiles already loaded or missing", async () => {
    const box = { west: middleOf({ east: 560, north: 5810 }).lon, south: middleOf({ east: 560, north: 5810 }).lat };
    const corner = middleOf({ east: 561, north: 5811 });
    const missing: TileKey = { east: 561, north: 5811 };
    const first = fakeLgln({ missing: [missing] });
    await loader(first).load([{ east: 560, north: 5810 }]);

    const lgln = fakeLgln({ missing: [missing] });
    const result = await loader(lgln).preload({ ...box, east: corner.lon, north: corner.lat });

    expect(result).toEqual({ loaded: 2, missing: 1, skipped: 1, failed: 0 });
    expect(lgln.requested.map((url) => url.slice(NIEDERSACHSEN_TILES_URL.length + 1)).sort()).toEqual([
      "LoD2_32_560_5811_1_ni.gml",
      "LoD2_32_561_5810_1_ni.gml",
      "LoD2_32_561_5811_1_ni.gml",
    ]);
    expect((await loader(lgln).preload({ ...box, east: corner.lon, north: corner.lat })).skipped).toBe(4);
  });

  it("carries on past a failed tile, and counts it", async () => {
    const logError = vi.fn();
    const lgln = fakeLgln({ failing: [{ east: 570, north: 5820 }] });

    const result = await loader(lgln, { logError }).load([
      { east: 570, north: 5820 },
      { east: 571, north: 5820 },
    ]);

    expect(result).toEqual({ loaded: 1, missing: 0, skipped: 0, failed: 1 });
    expect(logError).toHaveBeenCalledOnce();
  });
});
