import { overpassFootprintSource, PUBLIC_OVERPASS_URL } from "./overpass.ts";
import type { AppOptions } from "./server.ts";

/**
 * The server's settings from its environment: OVERPASS_URL (the Overpass interpreter; empty
 * uses the public server) and REQUEST_LOG_DIR (keep the request log there; empty keeps none).
 */
export function appOptionsFromEnv(env: Partial<Record<string, string>>): Omit<AppOptions, "webRoot"> {
  const url = new URL(env.OVERPASS_URL || PUBLIC_OVERPASS_URL);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`OVERPASS_URL must be an http(s) URL, not ${JSON.stringify(env.OVERPASS_URL)}`);
  }
  return {
    footprintSource: (fetchFn) => overpassFootprintSource({ url: url.href, fetchFn }),
    ...(env.REQUEST_LOG_DIR ? { requestLogDir: env.REQUEST_LOG_DIR } : {}),
  };
}
