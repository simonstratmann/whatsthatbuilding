import { lod2Store } from "./lod2-store.ts";
import type { AppOptions } from "./server.ts";

/**
 * The server's settings from its environment: DATABASE_URL (the PostGIS database holding the
 * LoD2 building model) and REQUEST_LOG_DIR (keep the request log there; empty keeps none).
 */
export function appOptionsFromEnv(env: Partial<Record<string, string>>): Omit<AppOptions, "webRoot"> {
  return {
    footprintSource: lod2Store(databaseUrlFromEnv(env)),
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
