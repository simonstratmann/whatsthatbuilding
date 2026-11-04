# 06: Installable app

**What to build:** I can add the app to my Android home screen; it opens full-screen like an app, and when I come back from the maps app I land on the viewfinder.

**Blocked by:** 04

**Status:** ready-for-human

- [x] Web app manifest with name, icon, standalone display, portrait orientation
- [x] Service worker caches the app shell (not Footprints)
- [ ] Returning from the maps app shows the viewfinder

## Comments

**2026-11-04 (agent):**
- `web/public/manifest.webmanifest` with standalone display, portrait orientation and icons (192 and 512 px PNGs, also as maskable, rendered from `web/public/icon.svg`: a building under a Crosshair).
- The service worker (`web/src/sw/sw.ts`, built to `dist/sw.js`) decides per request with `shellCachePolicy`: `/api/*` (Candidates, Aerial Photos, choices), other origins (street-map tiles) and anything but GET go straight to the network. Opening the app is network-first, so an update shows at once. Hashed assets are cache-first. On install it stores the page and the assets the page names, so the app opens offline right after the first visit. Each build gets its own cache, and the old one is deleted. The worker is registered only in production builds; the Vite dev server has none.
- The server sends `/sw.js` with `Cache-Control: no-cache` so updates aren't held back.
- After a Candidate is chosen, the page waits to be hidden and shown again (the trip to the maps app), then shows the viewfinder. If the maps app never opens, the Candidate screen stays.
- Checked in headless Chrome against the production build: the worker takes control, Chrome reports no manifest or installability errors, only the shell is cached, and `/` and `/?dev` load with the server stopped after a single visit.
- Open for a human: install on the Android phone from Chrome's menu, check it opens full-screen in portrait with the icon, and that coming back from the maps app lands on the viewfinder.
