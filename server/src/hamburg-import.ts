import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { exists, saveBody } from "./file-cache.ts";
import { parseLod2Tile, type Lod2Tile } from "./lod2-parser.ts";
import type { Lod2Store } from "./lod2-store.ts";

/** Hamburg's transparency portal, a CKAN catalogue that lists each yearly LoD2 release. */
const CATALOGUE_SEARCH = "https://suche.transparenz.hamburg.de/api/3/action/package_search";
/** A release zip on daten-hamburg.de, e.g. …/LoD2-DE_HH_2026-04-28.zip. */
const RELEASE_ZIP = /^https:\/\/daten-hamburg\.de\/.*\/(LoD2-DE_HH_(\d{4}-\d{2}-\d{2}))\.zip$/;

interface CatalogueSearch {
  result?: { results?: { resources?: { url?: string }[] }[] };
}

/** The URL of the newest LoD2-DE_HH zip the catalogue lists. */
export async function newestHamburgRelease(fetchFn: typeof fetch = fetch): Promise<string> {
  const url = new URL(CATALOGUE_SEARCH);
  url.searchParams.set("q", 'title:"LoD2-DE Hamburg"');
  url.searchParams.set("rows", "100");
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`Hamburg's catalogue answered ${response.status}`);
  const { result } = (await response.json()) as CatalogueSearch;

  const releases = (result?.results ?? [])
    .flatMap((dataset) => dataset.resources ?? [])
    .flatMap(({ url }) => {
      const match = url ? RELEASE_ZIP.exec(url) : null;
      return match ? [{ url: url!, date: match[2]! }] : [];
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!releases[0]) throw new Error("Hamburg's catalogue lists no LoD2-DE_HH release");
  return releases[0].url;
}

export interface HamburgImportOptions {
  store: Pick<Lod2Store, "replaceTiles">;
  /** The GML file cache; the release goes in `<cacheDir>/hamburg/<release>/`. */
  cacheDir: string;
  /** The release zip; see newestHamburgRelease. */
  releaseUrl: string;
  fetchFn?: typeof fetch;
  log?: (line: string) => void;
}

/**
 * Imports a release of Hamburg's LoD2 model: downloads the zip (unless its GML is already in
 * the file cache), keeps the GML there, and replaces the previous Hamburg import with it.
 * Older releases leave the cache once the new one is in.
 */
export async function importHamburg({
  store,
  cacheDir,
  releaseUrl,
  fetchFn = fetch,
  log = console.log,
}: HamburgImportOptions): Promise<{ release: string; tiles: number; buildings: number }> {
  const release = RELEASE_ZIP.exec(releaseUrl)?.[1] ?? basename(new URL(releaseUrl).pathname, ".zip");
  const hamburgDir = join(cacheDir, "hamburg");
  const releaseDir = join(hamburgDir, release);
  await mkdir(hamburgDir, { recursive: true });

  // The release folder only appears, by renaming, once every file is in it.
  if (await exists(releaseDir)) {
    log(`${release} is in the file cache already`);
  } else {
    const zipPath = join(hamburgDir, `${release}.zip`);
    // A zip left by a run that failed while unpacking is complete; it only appears once downloaded.
    if (!(await exists(zipPath))) {
      log(`Downloading ${releaseUrl}`);
      await download(releaseUrl, zipPath, fetchFn);
    }
    const unpacking = `${releaseDir}.part`;
    await rm(unpacking, { recursive: true, force: true });
    const count = await extractGml(zipPath, unpacking);
    await rename(unpacking, releaseDir);
    await rm(zipPath);
    log(`Kept ${count} GML files in ${releaseDir}`);
  }

  const files = (await readdir(releaseDir)).filter((name) => name.endsWith(".gml")).sort();
  async function* tiles(): AsyncIterable<Lod2Tile> {
    for (const [index, file] of files.entries()) {
      // Named as its file is, whatever the file calls itself, so cachedHamburgTile finds it.
      const tile = { ...parseLod2Tile(await readFile(join(releaseDir, file), "utf8")), name: basename(file, ".gml") };
      if ((index + 1) % 50 === 0 || index + 1 === files.length) log(`Parsed ${index + 1} of ${files.length} tiles`);
      yield tile;
    }
  }
  const { tiles: tileCount, buildings } = await store.replaceTiles("hamburg", tiles());
  log(`Imported ${buildings} buildings in ${tileCount} tiles from ${release}`);

  for (const entry of await readdir(hamburgDir)) {
    if (entry !== release) await rm(join(hamburgDir, entry), { recursive: true, force: true });
  }
  return { release, tiles: tileCount, buildings };
}

/**
 * Where the file cache keeps the GML of a stored Hamburg tile: in the release folder, under the
 * tile's name. Undefined when it isn't there.
 */
export async function cachedHamburgTile(cacheDir: string, name: string): Promise<string | undefined> {
  const hamburgDir = join(cacheDir, "hamburg");
  const releases = await readdir(hamburgDir, { withFileTypes: true }).catch(() => []);
  for (const release of releases) {
    // A folder still being unpacked ends in .part.
    if (!release.isDirectory() || release.name.endsWith(".part")) continue;
    const path = join(hamburgDir, release.name, `${name}.gml`);
    if (await exists(path)) return path;
  }
  return undefined;
}

async function download(url: string, path: string, fetchFn: typeof fetch): Promise<void> {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`Downloading ${url} failed: ${response.status}`);
  await saveBody(response, path);
}

/** Unpacks the zip's .gml files, flat, into `dir`; returns how many there were. */
async function extractGml(zipPath: string, dir: string): Promise<number> {
  await mkdir(dir, { recursive: true });
  const zip = await yauzl.openPromise(zipPath, { lazyEntries: true });
  const names = new Set<string>();
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry: yauzl.Entry) => {
        // Only the file name: a path in the zip mustn't place files outside the cache.
        const name = basename(entry.fileName);
        if (entry.fileName.endsWith("/") || !name.toLowerCase().endsWith(".gml")) return zip.readEntry();
        if (names.has(name)) return reject(new Error(`${zipPath} has two tiles named ${name}`));
        names.add(name);
        zip
          .openReadStreamPromise(entry)
          .then((stream) => pipeline(stream, createWriteStream(join(dir, name))))
          .then(() => zip.readEntry(), reject);
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  return names.size;
}
