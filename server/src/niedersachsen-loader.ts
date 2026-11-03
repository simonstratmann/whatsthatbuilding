import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists, saveBody } from "./file-cache.ts";
import type { FootprintSource } from "./identification.ts";
import { parseLod2Tile } from "./lod2-parser.ts";
import type { Lod2Store } from "./lod2-store.ts";
import { tileName, tilesAround, tilesInBox, type Box, type TileKey } from "./niedersachsen-tiles.ts";

/** LGLN's bucket of Niedersachsen's LoD2 tiles, one GML file per 1 km tile. */
export const NIEDERSACHSEN_TILES_URL = "https://lod2.s3.eu-de.cloud-object-storage.appdomain.cloud";

/**
 * How much farther than asked to look for tiles. A building belongs to one tile but may reach
 * into the next, so a building within the radius can sit in a tile just outside it.
 */
const TILE_MARGIN_METRES = 100;

/**
 * Tiles loaded at once, across all Snapshots and preloading: a tile is up to about 50 MB of
 * GML and takes about 200 MB to parse.
 */
const CONCURRENT_DOWNLOADS = 4;

/**
 * A box around Niedersachsen (with Bremen and Hamburg inside it), in UTM32 kilometres. LGLN is
 * only asked for tiles in it, so a Snapshot elsewhere never waits on LGLN, nor fails with it.
 * Inside the box, a tile LGLN doesn't have is outside Niedersachsen.
 */
const NIEDERSACHSEN_BOX = { west: 280, south: 5650, east: 700, north: 6000 };

function nearNiedersachsen({ east, north }: TileKey): boolean {
  const box = NIEDERSACHSEN_BOX;
  return east >= box.west && east < box.east && north >= box.south && north < box.north;
}

/** Runs at most `slots` tasks at a time; the rest wait their turn. */
function limiter(slots: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    // A finishing task hands its slot straight to the next in line, so nobody can slip in between.
    if (running >= slots) await new Promise<void>((resolve) => waiting.push(resolve));
    else running += 1;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running -= 1;
    }
  };
}

export interface NiedersachsenLoaderOptions {
  store: Pick<Lod2Store, "covers" | "footprintsAround" | "addTile" | "markMissing" | "knownTiles">;
  /** The GML file cache; tiles go in `<cacheDir>/niedersachsen/`. */
  cacheDir: string;
  fetchFn?: typeof fetch;
  log?: (line: string) => void;
  logError?: (line: string, error: unknown) => void;
}

/** What loading a list of tiles came to. */
export interface LoadResult {
  loaded: number;
  /** Tiles LGLN doesn't have: outside Niedersachsen. */
  missing: number;
  /** Tiles loaded or known missing before. */
  skipped: number;
  failed: number;
}

export interface NiedersachsenLoader {
  /**
   * The LoD2 store as a Footprint source, downloading the Niedersachsen tiles a question
   * needs before answering it. A tile LGLN doesn't have is outside the Coverage Area.
   */
  source: FootprintSource;
  /** Loads the tiles not loaded yet; a tile that fails is logged and counted, and the rest go on. */
  load(tiles: TileKey[]): Promise<LoadResult>;
  /** Loads every tile in the box. */
  preload(box: Box): Promise<LoadResult>;
}

type Outcome = "loaded" | "missing";

/**
 * Loads LGLN's LoD2 tiles of Niedersachsen into the store on demand: each tile is downloaded
 * once (into the file cache), parsed and stored. Snapshots needing the same tile at the same
 * time share one download; a failed download is logged and tried again next time.
 */
export function niedersachsenLoader({
  store,
  cacheDir,
  fetchFn = fetch,
  log = console.log,
  logError = console.error,
}: NiedersachsenLoaderOptions): NiedersachsenLoader {
  const tilesDir = join(cacheDir, "niedersachsen");
  const inFlight = new Map<string, Promise<Outcome>>();
  const downloadSlot = limiter(CONCURRENT_DOWNLOADS);

  /** Starts loading the tile, or joins the load already under way. */
  const loadOnce = (key: TileKey): Promise<Outcome> => {
    const name = tileName(key);
    let promise = inFlight.get(name);
    if (!promise) {
      promise = downloadSlot(() => loadTile(name)).finally(() => inFlight.delete(name));
      inFlight.set(name, promise);
    }
    return promise;
  };

  async function loadTile(name: string): Promise<Outcome> {
    const path = join(tilesDir, `${name}.gml`);
    try {
      if (!(await exists(path))) {
        const url = `${NIEDERSACHSEN_TILES_URL}/${name}.gml`;
        const response = await fetchFn(url);
        if (response.status === 404) {
          await store.markMissing(name);
          return "missing";
        }
        if (!response.ok) throw new Error(`Downloading ${url} failed: ${response.status}`);
        await mkdir(tilesDir, { recursive: true });
        await saveBody(response, path);
      }
      // Named as LGLN's file is, whatever the file calls itself, so knownTiles finds it.
      const tile = { ...parseLod2Tile(await readFile(path, "utf8")), name };
      const buildings = await store.addTile("niedersachsen", tile);
      log(`[lod2] Loaded ${name}: ${buildings} buildings`);
      return "loaded";
    } catch (error) {
      logError(`[lod2] Loading ${name} failed:`, error);
      throw error;
    }
  }

  /** The tiles not yet loaded or known missing. Outside Niedersachsen's box, LGLN isn't asked at all. */
  async function tilesToLoad(tiles: TileKey[]): Promise<TileKey[]> {
    const candidates = tiles.filter(nearNiedersachsen);
    if (candidates.length === 0) return [];
    const known = await store.knownTiles(candidates.map(tileName));
    return candidates.filter((tile) => !known.has(tileName(tile)));
  }

  /** Loads the tiles a question needs; the first failure fails it. */
  async function ensure(tiles: TileKey[]): Promise<void> {
    await Promise.all((await tilesToLoad(tiles)).map(loadOnce));
  }

  async function load(tiles: TileKey[]): Promise<LoadResult> {
    const queue = await tilesToLoad(tiles);
    const result: LoadResult = { loaded: 0, missing: 0, skipped: tiles.length - queue.length, failed: 0 };
    await Promise.all(
      queue.map((tile) =>
        loadOnce(tile).then(
          (outcome) => void (result[outcome] += 1),
          () => void (result.failed += 1),
        ),
      ),
    );
    return result;
  }

  return {
    source: {
      async covers(position) {
        await ensure(tilesAround(position, 0));
        return store.covers(position);
      },
      async footprintsAround(centre, radiusMetres) {
        await ensure(tilesAround(centre, radiusMetres + TILE_MARGIN_METRES));
        return store.footprintsAround(centre, radiusMetres);
      },
    },
    load,
    preload: (box) => load(tilesInBox(box)),
  };
}
