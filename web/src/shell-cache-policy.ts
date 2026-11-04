/** The parts of a request the service worker decides on. */
export interface ShellRequest {
  url: string;
  method: string;
}

/**
 * How the service worker treats a request:
 * - `bypass`: straight to the network, never stored.
 * - `network-first`: the network, falling back to the stored copy when offline.
 * - `cache-first`: the stored copy if there is one.
 */
export type ShellCachePolicy = "bypass" | "network-first" | "cache-first";

/**
 * Which requests belong to the app shell, given the service worker's scope (a URL ending in "/").
 * It lives outside src/sw so the web tests pick up its test; tsconfig.sw.json includes it.
 */
export function shellCachePolicy(request: ShellRequest, scope: string): ShellCachePolicy {
  if (request.method !== "GET" || !request.url.startsWith(scope)) return "bypass";
  if (request.url.startsWith(`${scope}api/`)) return "bypass";
  if (request.url.startsWith(`${scope}assets/`)) return "cache-first";
  return "network-first";
}
