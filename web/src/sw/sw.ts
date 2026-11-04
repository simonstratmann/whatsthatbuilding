import { shellCachePolicy } from "../shell-cache-policy.ts";

/**
 * The service worker: keeps the app shell (the page, its scripts, styles and icons) so the
 * installed app starts without the network. Candidates, Footprints, Aerial Photos and map
 * tiles always come from the network; see shellCachePolicy.
 */
declare const self: ServiceWorkerGlobalScope;
/** Set by the build, so each build gets a fresh cache and the old one, with its stale assets, goes. */
declare const __BUILD_ID__: string;

const CACHE = `app-shell-${__BUILD_ID__}`;
const scope = self.registration.scope;

self.addEventListener("install", (event) => {
  event.waitUntil(storeShell().then(() => self.skipWaiting()));
});

/**
 * Stores the page and the hashed assets it names. The first visit loads them before this worker
 * is in control, so without this an installed app opened offline straight away would lack them.
 */
async function storeShell(): Promise<void> {
  const cache = await caches.open(CACHE);
  const page = await fetch(scope);
  if (!page.ok) throw new Error(`The app page answered ${page.status}`);
  const html = await page.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((match) => scope + match[1]);
  await cache.put(scope, page);
  await cache.addAll(assets);
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const policy = shellCachePolicy(request, scope);
  if (policy === "bypass") return;
  // Every page of the app is the same document, which reads its mode from the query string.
  const key = request.mode === "navigate" ? scope : request;
  event.respondWith(policy === "cache-first" ? cacheFirst(request, key) : networkFirst(request, key));
});

async function cacheFirst(request: Request, key: RequestInfo): Promise<Response> {
  return (await caches.match(key)) ?? fetchAndStore(request, key);
}

async function networkFirst(request: Request, key: RequestInfo): Promise<Response> {
  try {
    return await fetchAndStore(request, key);
  } catch (error) {
    const stored = await caches.match(key);
    if (stored) return stored;
    throw error;
  }
}

async function fetchAndStore(request: Request, key: RequestInfo): Promise<Response> {
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    void caches.open(CACHE).then((cache) => cache.put(key, copy));
  }
  return response;
}
