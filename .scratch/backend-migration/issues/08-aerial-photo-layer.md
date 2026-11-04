# 08: Aerial Photo layer

**What to build:** The user can switch the mini-map between the street map and Aerial Photos. The server serves `GET /api/dop/{z}/{x}/{y}` as 256 px tiles in EPSG:3857, requesting each from the Hamburg WMS (`wms_dop_zeitreihe_unbelaubt` on geodienste.hamburg.de) for tiles inside Hamburg and from the LGLN WMS (`dop_wms`, layer `ni_dop20`) otherwise, including tiles that cross the border. Tiles are cached on disk under a size limit (start at 20 GB, configurable), oldest out first. Failed upstream requests are logged. The credits for the shown imagery appear on the mini-map. See the spec (DOP proxy, Credits).

**Blocked by:** 02 (Identify on the server)

**Status:** ready-for-human

- [x] A tile inside Hamburg is fetched from the Hamburg WMS, any other tile from LGLN (tested with upstream faked)
- [x] A second request for the same tile is served from the cache (tested)
- [x] The cache stays under its configured size limit, evicting the oldest tiles first
- [x] Upstream failures are logged and return an error status, not a broken image cached as a tile
- [x] The cache lives on a persistent volume in Compose
- [x] The mini-map has a toggle between street map and Aerial Photos, and shows the matching credits
- [ ] Checked by hand in dev mode in Hamburg and in Niedersachsen

## Comments

**2026-11-04 (agent):** Implemented in `server/src/dop-proxy.ts` (`GET /api/dop/{z}/{x}/{y}`), with Hamburg's border from OSM relation 62782 in `server/src/hamburg-boundary.ts`. A tile counts as inside Hamburg only if it clears the simplified border by 30 m. Settings: `DOP_CACHE_DIR`, `DOP_CACHE_MAX_GB` (default 20). In Compose, app and app-dev each have their own cache volume, so up to 40 GB together. Checked against the real WMS: a Rathausmarkt tile came from Hamburg, Kröpcke from LGLN, a border tile from LGLN, and repeats were served from the cache. Left for a human: the mini-map toggle and credits in the browser (no browser tool was available), in Hamburg and in Niedersachsen. Tiles on Hamburg's Schleswig-Holstein border go to LGLN as well, which probably leaves the Schleswig-Holstein side blank.
