import { dopProxy } from "./dop-proxy.ts";
import { lod2Store } from "./lod2-store.ts";
import { niedersachsenLoader } from "./niedersachsen-loader.ts";
import { overpassLabelSource, PUBLIC_OVERPASS_URL } from "./overpass-labels.ts";
import type { AppOptions } from "./server.ts";

/**
 * The server's settings from its environment: DATABASE_URL (the PostGIS database holding the
 * LoD2 building model), LOD2_CACHE_DIR (where downloaded GML is kept), OVERPASS_URL (the
 * Overpass interpreter building names come from; empty uses the public server), DOP_CACHE_DIR
 * and DOP_CACHE_MAX_GB (where Aerial Photo tiles are kept, and up to how much; 20 GB when
 * empty) and REQUEST_LOG_DIR (keep the request log there; empty keeps none).
 */
export function appOptionsFromEnv(env: Partial<Record<string, string>>): Omit<AppOptions, "webRoot"> {
  const store = lod2Store(databaseUrlFromEnv(env));
  return {
    // Niedersachsen's tiles load the first time a Snapshot needs them; Hamburg's are imported.
    footprintSource: niedersachsenLoader({ store, cacheDir: lod2CacheDirFromEnv(env) }).source,
    labelSource: overpassLabelSource({ url: overpassUrlFromEnv(env) }),
    dop: dopProxy({ cacheDir: dopCacheDirFromEnv(env), maxCacheBytes: dopCacheMaxBytesFromEnv(env) }),
    ...(env.REQUEST_LOG_DIR ? { requestLogDir: env.REQUEST_LOG_DIR } : {}),
  };
}

/** DATABASE_URL, e.g. postgres://building:secret@postgis:5432/building. */
export function databaseUrlFromEnv(env: Partial<Record<string, string>>): string {
  const url = env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    throw new Error(`DATABASE_URL must name the PostGIS database as postgres://…, not ${JSON.stringify(url ?? "")}`);
  }
  return url;
}

/** LOD2_CACHE_DIR: where downloaded LoD2 GML files are kept. */
export function lod2CacheDirFromEnv(env: Partial<Record<string, string>>): string {
  if (!env.LOD2_CACHE_DIR) throw new Error("LOD2_CACHE_DIR must name the folder that keeps the downloaded GML files");
  return env.LOD2_CACHE_DIR;
}

/** DOP_CACHE_DIR: where Aerial Photo tiles are kept. */
export function dopCacheDirFromEnv(env: Partial<Record<string, string>>): string {
  if (!env.DOP_CACHE_DIR) throw new Error("DOP_CACHE_DIR must name the folder that keeps the Aerial Photo tiles");
  return env.DOP_CACHE_DIR;
}

/** DOP_CACHE_MAX_GB: the Aerial Photo cache's size limit in gigabytes; empty is 20. */
export function dopCacheMaxBytesFromEnv(env: Partial<Record<string, string>>): number {
  const gigabytes = Number(env.DOP_CACHE_MAX_GB || 20);
  if (!Number.isFinite(gigabytes) || gigabytes <= 0) {
    throw new Error(`DOP_CACHE_MAX_GB must be a positive number of gigabytes, not ${JSON.stringify(env.DOP_CACHE_MAX_GB)}`);
  }
  return gigabytes * 1e9;
}

/** OVERPASS_URL: the Overpass interpreter building names come from; empty uses the public server. */
export function overpassUrlFromEnv(env: Partial<Record<string, string>>): string {
  const url = URL.parse(env.OVERPASS_URL || PUBLIC_OVERPASS_URL);
  if (url?.protocol !== "http:" && url?.protocol !== "https:") {
    throw new Error(`OVERPASS_URL must be an http(s) URL, not ${JSON.stringify(env.OVERPASS_URL)}`);
  }
  return url.href;
}
