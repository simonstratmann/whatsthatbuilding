import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import yazl from "yazl";
import searchResponse from "./fixtures/hamburg-lod2-package-search.json" with { type: "json" };
import { cachedHamburgTile, importHamburg, newestHamburgRelease } from "./hamburg-import.ts";
import { lod2Store, type Lod2Store } from "./lod2-store.ts";
import { freshDatabase } from "./test-database.ts";

const excerpt = await readFile(new URL("./fixtures/LoD2_32_565_5933_1_HH-excerpt.gml", import.meta.url));
/** Every building in the excerpt is within 1 km of here. */
const RÖDINGSMARKT = { lat: 53.5463, lon: 9.9849 };
const RELEASE_2026 = "https://daten-hamburg.de/opendata/3d_stadtmodell_lod2/LoD2-DE_HH_2026-04-28.zip";
const RELEASE_2027 = "https://daten-hamburg.de/opendata/3d_stadtmodell_lod2/LoD2-DE_HH_2027-04-01.zip";

/** A release zip as daten-hamburg.de serves it: tiles at the top level, here with a note beside them. */
function releaseZip(files: Record<string, Buffer>): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) zip.addBuffer(content, name);
  zip.end();
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
  });
}

/** Serves each URL's body and remembers what was asked for. */
function serving(bodies: Record<string, Buffer | string>) {
  const requested: string[] = [];
  const fetchFn: typeof fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    const body = bodies[url];
    return body === undefined ? new Response("not found", { status: 404 }) : new Response(body);
  };
  return { fetchFn, requested };
}

describe("newestHamburgRelease", () => {
  it("picks the newest LoD2 zip from the transparency portal's catalogue", async () => {
    const requested: URL[] = [];
    const catalogue: typeof fetch = async (input) => {
      requested.push(new URL(String(input)));
      return Response.json(searchResponse);
    };

    expect(await newestHamburgRelease(catalogue)).toBe(RELEASE_2026);
    expect(requested.map((url) => url.origin + url.pathname)).toEqual([
      "https://suche.transparenz.hamburg.de/api/3/action/package_search",
    ]);
    expect(requested[0]?.searchParams.get("q")).toBe('title:"LoD2-DE Hamburg"');
  });

  it("fails when the catalogue lists no release", async () => {
    const empty: typeof fetch = async () => Response.json({ success: true, result: { results: [] } });

    await expect(newestHamburgRelease(empty)).rejects.toThrow(/no LoD2-DE_HH release/);
  });
});

describe("importHamburg", () => {
  let store: Lod2Store;
  let cacheDir: string;
  beforeAll(async () => {
    store = lod2Store(await freshDatabase());
  });
  afterAll(async () => {
    await store.close();
  });
  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "lod2-cache-"));
  });

  const quiet = () => {};

  it("downloads the release, keeps its GML in the file cache and loads every tile", async () => {
    const zip = await releaseZip({ "LoD2_32_565_5933_1_HH.gml": excerpt, "Hinweise.txt": Buffer.from("readme") });
    const { fetchFn } = serving({ [RELEASE_2026]: zip });

    const result = await importHamburg({ store, cacheDir, releaseUrl: RELEASE_2026, fetchFn, log: quiet });

    expect(result).toEqual({ release: "LoD2-DE_HH_2026-04-28", tiles: 1, buildings: 3 });
    expect(await readdir(join(cacheDir, "hamburg"))).toEqual(["LoD2-DE_HH_2026-04-28"]);
    expect(await readdir(join(cacheDir, "hamburg", "LoD2-DE_HH_2026-04-28"))).toEqual(["LoD2_32_565_5933_1_HH.gml"]);
    expect(await store.covers(RÖDINGSMARKT)).toBe(true);
    const found = await store.footprintsAround(RÖDINGSMARKT, 1000);
    expect(found.find((f) => f.id === "DEHHALKA90000Hr8")?.address).toEqual({
      street: "Rödingsmarkt",
      houseNumber: "16",
      city: "Hamburg",
    });
  });

  it("stores the tiles with their Building Shells, at the current schema version", async () => {
    const { fetchFn } = serving({ [RELEASE_2026]: await releaseZip({ "LoD2_32_565_5933_1_HH.gml": excerpt }) });

    await importHamburg({ store, cacheDir, releaseUrl: RELEASE_2026, fetchFn, log: quiet });

    expect(await store.outdatedTiles(RÖDINGSMARKT, 1000)).toEqual([]);
    const shells = await store.shellsOf(["DEHHALKA90000Hr8", "DEHHALKAJ0000pzB", "DEHHALKA4RH000OT"]);
    expect(shells.size).toBe(3);
    expect(shells.get("DEHHALKA4RH000OT")?.map((s) => s.kind).sort()).toEqual(["ground", "roof", "wall", "wall", "wall", "wall"]);
  });

  it("names each tile after its file, so the file cache can give it again", async () => {
    const { fetchFn } = serving({ [RELEASE_2026]: await releaseZip({ "LoD2_32_565_5933_1_HH_renamed.gml": excerpt }) });
    await importHamburg({ store, cacheDir, releaseUrl: RELEASE_2026, fetchFn, log: quiet });

    expect(await cachedHamburgTile(cacheDir, "LoD2_32_565_5933_1_HH_renamed")).toBe(
      join(cacheDir, "hamburg", "LoD2-DE_HH_2026-04-28", "LoD2_32_565_5933_1_HH_renamed.gml"),
    );
    expect(await store.knownTiles(["LoD2_32_565_5933_1_HH_renamed"])).toEqual(new Set(["LoD2_32_565_5933_1_HH_renamed"]));
    expect(await cachedHamburgTile(cacheDir, "LoD2_32_999_9999_1_HH")).toBeUndefined();
  });

  it("loads a release already in the file cache without downloading it again", async () => {
    const { fetchFn, requested } = serving({ [RELEASE_2026]: await releaseZip({ "LoD2_32_565_5933_1_HH.gml": excerpt }) });
    await importHamburg({ store, cacheDir, releaseUrl: RELEASE_2026, fetchFn, log: quiet });

    const again = await importHamburg({ store, cacheDir, releaseUrl: RELEASE_2026, fetchFn, log: quiet });

    expect(requested).toEqual([RELEASE_2026]);
    expect(again.buildings).toBe(3);
  });

  it("replaces the previous release, in the store and in the file cache", async () => {
    const renamed = Buffer.from(
      excerpt.toString("utf8").replaceAll("DEHHALKA", "DEHHNEW").replace(">Rödingsmarkt<", ">Neuer Wall<"),
    );
    const { fetchFn } = serving({
      [RELEASE_2026]: await releaseZip({ "LoD2_32_565_5933_1_HH.gml": excerpt }),
      [RELEASE_2027]: await releaseZip({ "LoD2_32_565_5933_1_HH.gml": renamed }),
    });
    await importHamburg({ store, cacheDir, releaseUrl: RELEASE_2026, fetchFn, log: quiet });

    await importHamburg({ store, cacheDir, releaseUrl: RELEASE_2027, fetchFn, log: quiet });

    const found = await store.footprintsAround(RÖDINGSMARKT, 1000);
    expect(found.map((f) => f.id).sort()).toEqual(["DEHHNEW4RH000OT", "DEHHNEW90000Hr8", "DEHHNEWJ0000pzB"]);
    expect(await readdir(join(cacheDir, "hamburg"))).toEqual(["LoD2-DE_HH_2027-04-01"]);
  });

  it("fails without touching the previous import when the download fails", async () => {
    const { fetchFn } = serving({ [RELEASE_2026]: await releaseZip({ "LoD2_32_565_5933_1_HH.gml": excerpt }) });
    await importHamburg({ store, cacheDir, releaseUrl: RELEASE_2026, fetchFn, log: quiet });

    await expect(importHamburg({ store, cacheDir, releaseUrl: RELEASE_2027, fetchFn, log: quiet })).rejects.toThrow(/404/);

    expect(await store.footprintsAround(RÖDINGSMARKT, 1000)).toHaveLength(3);
    expect(await readdir(join(cacheDir, "hamburg"))).toEqual(["LoD2-DE_HH_2026-04-28"]);
  });
});
