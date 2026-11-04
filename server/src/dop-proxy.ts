// The DOP proxy: Aerial Photo tiles for the mini-map, fetched from the state imagery services
// and kept on disk.
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { writeWhole } from "./file-cache.ts";
import { BOUNDARY_TOLERANCE_METRES, HAMBURG_HOLES, HAMBURG_OUTER_RINGS, type Ring } from "./hamburg-boundary.ts";

/** Niedersachsen's DOP20 WMS (LGLN); it answers for any tile not wholly inside Hamburg. */
export const NIEDERSACHSEN_DOP_URL = "https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms";
/** Hamburg's leaf-off DOP WMS (LGV). */
export const HAMBURG_DOP_URL = "https://geodienste.hamburg.de/wms_dop_zeitreihe_unbelaubt";

const LAYERS = { [NIEDERSACHSEN_DOP_URL]: "ni_dop20", [HAMBURG_DOP_URL]: "dop_zeitreihe_unbelaubt" };

const TILE_PIXELS = 256;
/** Highest zoom served: DOP20's 20 cm pixels are about zoom 19 in northern Germany. */
export const MAX_ZOOM = 20;
const UPSTREAM_TIMEOUT_MS = 30_000;

/** A slippy-map tile in Web Mercator (EPSG:3857), as Leaflet asks for it. */
export interface TileKey {
  z: number;
  x: number;
  y: number;
}

export interface DopTile {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: "image/jpeg";
}

export interface DopProxyOptions {
  /** Where tiles are kept, as `<z>/<x>/<y>.jpg`. */
  cacheDir: string;
  /** The cache's size limit; past it the oldest tiles go first. */
  maxCacheBytes: number;
  fetchFn?: typeof fetch;
  logError?: (line: string, error: unknown) => void;
}

export interface DopProxy {
  /** The tile, from the cache or else the WMS. Fails, logging why, when the WMS gives no image. */
  tile(key: TileKey): Promise<DopTile>;
}

export function isTileKey({ z, x, y }: TileKey): boolean {
  const n = 2 ** z;
  return [z, x, y].every(Number.isInteger) && z >= 0 && z <= MAX_ZOOM && x >= 0 && x < n && y >= 0 && y < n;
}

export function dopProxy({
  cacheDir,
  maxCacheBytes,
  fetchFn = fetch,
  logError = (line, error) => console.error(line, error),
}: DopProxyOptions): DopProxy {
  const cache = tileCache(cacheDir, maxCacheBytes, logError);
  const inFlight = new Map<string, Promise<DopTile>>();

  async function cachedOrFetchedTile(key: TileKey, path: string): Promise<DopTile> {
    const cached = await cache.read(path);
    if (cached) return { bytes: cached, contentType: "image/jpeg" };

    const url = getMapUrl(key);
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      const response = await fetchFn(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      const contentType = response.headers.get("Content-Type") ?? "";
      if (!response.ok) throw new Error(`${url.origin} answered ${response.status} ${response.statusText}`);
      // A WMS reports errors as an XML document with status 200.
      if (!contentType.startsWith("image/jpeg")) {
        const text = (await response.text()).slice(0, 500);
        throw new Error(`${url.origin} answered ${contentType || "no content type"}, not a JPEG: ${text}`);
      }
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      logError(`[dop] no Aerial Photo tile ${tilePath(key)} from ${url}:`, error);
      throw error;
    }
    await cache.write(path, bytes);
    return { bytes, contentType: "image/jpeg" };
  }

  return {
    tile(key) {
      const path = tilePath(key);
      let pending = inFlight.get(path);
      if (!pending) {
        pending = cachedOrFetchedTile(key, path).finally(() => inFlight.delete(path));
        inFlight.set(path, pending);
      }
      return pending;
    },
  };
}

function tilePath({ z, x, y }: TileKey): string {
  return `${z}/${x}/${y}.jpg`;
}

/** The WMS GetMap request for the tile, from Hamburg when the tile lies wholly inside it. */
function getMapUrl(key: TileKey): URL {
  const base = isInsideHamburg(key) ? HAMBURG_DOP_URL : NIEDERSACHSEN_DOP_URL;
  const { west, south, east, north } = mercatorBounds(key);
  const url = new URL(base);
  url.search = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: LAYERS[base],
    STYLES: "",
    CRS: "EPSG:3857",
    BBOX: [west, south, east, north].join(","),
    WIDTH: String(TILE_PIXELS),
    HEIGHT: String(TILE_PIXELS),
    FORMAT: "image/jpeg",
  }).toString();
  return url;
}

const HALF_WORLD_METRES = 20037508.342789244;

/** The tile's bounds in Web Mercator metres. */
function mercatorBounds({ z, x, y }: TileKey) {
  const size = (2 * HALF_WORLD_METRES) / 2 ** z;
  return {
    west: -HALF_WORLD_METRES + x * size,
    east: -HALF_WORLD_METRES + (x + 1) * size,
    north: HALF_WORLD_METRES - y * size,
    south: HALF_WORLD_METRES - (y + 1) * size,
  };
}

/** The tile's bounds in degrees; a Mercator tile is a lon/lat rectangle too. */
function degreeBounds({ z, x, y }: TileKey) {
  const n = 2 ** z;
  const lat = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
  return { west: (x / n) * 360 - 180, east: ((x + 1) / n) * 360 - 180, north: lat(y), south: lat(y + 1) };
}

/** Kept clear of the simplified border, so a tile it calls inside is inside the real one. */
const BORDER_MARGIN_METRES = BOUNDARY_TOLERANCE_METRES + 10;

/** Whether the tile lies wholly inside Hamburg, with BORDER_MARGIN_METRES to spare. */
export function isInsideHamburg(key: TileKey): boolean {
  const tile = degreeBounds(key);
  const marginLat = BORDER_MARGIN_METRES / 111_000;
  const marginLon = marginLat / Math.cos((tile.north * Math.PI) / 180);
  const box = {
    west: tile.west - marginLon,
    east: tile.east + marginLon,
    south: tile.south - marginLat,
    north: tile.north + marginLat,
  };
  const rings = [...HAMBURG_OUTER_RINGS, ...HAMBURG_HOLES];
  // Inside when no part of the border passes through the box and one corner is inside.
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      if (segmentMeetsBox(ring[i]!, ring[i + 1]!, box)) return false;
    }
  }
  const corner: [number, number] = [box.west, box.south];
  return rings.filter((ring) => ringContains(ring, corner)).length % 2 === 1;
}

type Box = { west: number; east: number; south: number; north: number };

/** Liang–Barsky: whether any part of the segment lies in the box. */
function segmentMeetsBox([x0, y0]: [number, number], [x1, y1]: [number, number], box: Box): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, x0 - box.west],
    [dx, box.east - x0],
    [-dy, y0 - box.south],
    [dy, box.north - y0],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** Even-odd ray casting. */
function ringContains(ring: Ring, [x, y]: [number, number]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Files looked at at once while counting what the cache holds. */
const STATS_AT_ONCE = 64;

/**
 * Tiles on disk under a size limit, oldest written first out. Tiles are read straight from
 * disk; what the cache holds is counted once, in the background, so tiles kept before a restart
 * count towards the limit without the first request waiting for a million files to be looked at.
 */
function tileCache(cacheDir: string, maxBytes: number, logError: (line: string, error: unknown) => void) {
  const dir = resolve(cacheDir);
  // In order of writing, oldest first; a Map keeps insertion order.
  const sizes = new Map<string, number>();
  let total = 0;
  let counting: Promise<void> | undefined;

  async function countTiles(): Promise<void> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
    const found: { path: string; size: number; written: number }[] = [];
    const files = entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
    for (let i = 0; i < files.length; i += STATS_AT_ONCE) {
      await Promise.all(
        files.slice(i, i + STATS_AT_ONCE).map(async (full) => {
          // A part file left by a write that never finished.
          if (!full.endsWith(".jpg")) return rm(full, { force: true }).catch(() => {});
          const info = await stat(full).catch(() => undefined);
          if (info) found.push({ path: relative(dir, full), size: info.size, written: info.mtimeMs });
        }),
      );
    }
    found.sort((a, b) => a.written - b.written);
    for (const { path, size } of found) {
      // A tile written while counting is already in, as the newest.
      if (sizes.has(path)) continue;
      sizes.set(path, size);
      total += size;
    }
  }

  const counted = () =>
    (counting ??= countTiles().catch((error: unknown) => logError(`[dop] could not count the tiles in ${dir}:`, error)));

  async function evict(): Promise<void> {
    for (const [path, size] of sizes) {
      if (total <= maxBytes) break;
      sizes.delete(path);
      total -= size;
      await rm(join(dir, path), { force: true }).catch((error: unknown) => logError(`[dop] could not evict ${path}:`, error));
    }
  }

  return {
    async read(path: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
      void counted();
      return readFile(join(dir, path)).then(
        (buffer) => new Uint8Array(buffer),
        () => undefined,
      );
    },
    /** Keeps the tile; a full disk costs the cache the tile, not the user their answer. */
    async write(path: string, bytes: Uint8Array): Promise<void> {
      try {
        await writeWhole(join(dir, path), bytes);
      } catch (error) {
        logError(`[dop] could not cache ${path}:`, error);
        return;
      }
      await counted();
      total += bytes.length - (sizes.get(path) ?? 0);
      sizes.delete(path);
      sizes.set(path, bytes.length);
      await evict();
    },
  };
}
