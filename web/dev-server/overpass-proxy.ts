import type { ProxyOptions } from "vite";
import { OVERPASS_PATH } from "../src/overpass.ts";

/** Used when OVERPASS_URL is unset or empty. docker/write-overpass-proxy.sh has the same default. */
export const PUBLIC_OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * The dev and preview servers' proxy rule: the app's own OVERPASS_PATH is forwarded to the
 * Overpass interpreter at `overpassUrl`, so the browser never talks to Overpass itself.
 */
export function overpassProxy(overpassUrl: string | undefined): Record<string, ProxyOptions> {
  const upstream = new URL(overpassUrl || PUBLIC_OVERPASS_URL);
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
    throw new Error(`OVERPASS_URL must be an http(s) URL, not ${JSON.stringify(overpassUrl)}`);
  }
  return {
    [OVERPASS_PATH]: {
      target: upstream.origin,
      changeOrigin: true,
      rewrite: () => upstream.pathname + upstream.search,
    },
  };
}
